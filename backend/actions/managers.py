"""Action CRUD — create/list/delete user actions in .racksmith/actions/."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from github.misc import RACKSMITH_BRANCH, commit_and_push, run_git
from repos.managers import repos_manager
from schema.models.action import ActionConfig
from actions.schemas import ActionCreateRequest, ActionResponse

ACTIONS_DIR = Path(".racksmith/actions")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def _validate_slug(slug: str) -> None:
    if not SLUG_RE.match(slug):
        raise ValueError(
            "slug must be lowercase letters, numbers, hyphens, or underscores "
            "and must start with a letter or number"
        )


def _action_dir(repo_path: Path, slug: str) -> Path:
    return repo_path / ACTIONS_DIR / slug


def _read_action(action_dir: Path) -> ActionResponse | None:
    manifest = action_dir / "action.yaml"
    if not manifest.is_file():
        manifest = action_dir / "action.yml"
    if not manifest.is_file():
        return None
    try:
        data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
        cfg = ActionConfig.model_validate(data)
    except Exception:
        return None
    tasks_file = action_dir / "tasks" / "main.yml"
    return ActionResponse(
        slug=cfg.slug,
        name=cfg.name,
        description=cfg.description,
        source=cfg.source,
        inputs=[i.model_dump() for i in cfg.inputs],
        compatibility=cfg.compatibility.model_dump(),
        has_tasks=tasks_file.is_file(),
    )


class ActionManager:
    def list_actions(self, session) -> list[ActionResponse]:
        repo_path = repos_manager.active_repo_path(session)
        actions_dir = repo_path / ACTIONS_DIR
        if not actions_dir.is_dir():
            return []
        results: list[ActionResponse] = []
        for d in sorted(actions_dir.iterdir()):
            if not d.is_dir():
                continue
            action = _read_action(d)
            if action is not None:
                results.append(action)
        return results

    def get_action(self, session, slug: str) -> ActionResponse:
        repo_path = repos_manager.active_repo_path(session)
        action = _read_action(_action_dir(repo_path, slug))
        if action is None:
            raise FileNotFoundError(f"Action '{slug}' not found")
        return action

    def create_action(self, session, body: ActionCreateRequest) -> ActionResponse:
        _validate_slug(body.slug)
        repo_path = repos_manager.active_repo_path(session)
        dest = _action_dir(repo_path, body.slug)
        if dest.exists():
            raise ValueError(f"Action '{body.slug}' already exists")

        manifest_data = body.model_dump(exclude={"tasks"})
        manifest_data["source"] = "user"

        dest.mkdir(parents=True, exist_ok=True)
        (dest / "action.yaml").write_text(
            yaml.safe_dump(manifest_data, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

        tasks_dir = dest / "tasks"
        tasks_dir.mkdir(exist_ok=True)
        tasks_content = (
            yaml.safe_dump(body.tasks, sort_keys=False, allow_unicode=True)
            if body.tasks
            else "---\n# Add your Ansible tasks here\n"
        )
        (tasks_dir / "main.yml").write_text(tasks_content, encoding="utf-8")

        action = _read_action(dest)
        if action is None:
            raise RuntimeError("Action was written but could not be read back")

        self._commit_action(session, repo_path, dest, body.slug)
        return action

    def _commit_action(
        self, session, repo_path: Path, action_dir: Path, slug: str
    ) -> None:
        """Stage only this action's directory and push to the racksmith branch."""
        binding = repos_manager.current_repo(session)
        if not binding:
            return
        rel = action_dir.relative_to(repo_path)
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["add", str(rel)])
        result = run_git(
            repo_path,
            ["commit", "-m", f"Add action: {slug}"],
            check=False,
        )
        if result.returncode == 0:
            run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH], check=False)

    def delete_action(self, session, slug: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        dest = _action_dir(repo_path, slug)
        if not dest.exists():
            raise FileNotFoundError(f"Action '{slug}' not found")

        manifest = dest / "action.yaml"
        if not manifest.is_file():
            manifest = dest / "action.yml"
        if manifest.is_file():
            data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
            if data.get("source") == "builtin":
                raise ValueError("Cannot delete a built-in action")

        import shutil
        shutil.rmtree(dest)
        self._commit_removal(session, repo_path, dest, slug)

    def _commit_removal(
        self, session, repo_path: Path, action_dir: Path, slug: str
    ) -> None:
        binding = repos_manager.current_repo(session)
        if not binding:
            return
        rel = action_dir.relative_to(repo_path)
        remote_url = (
            f"https://x-access-token:{session.access_token}"
            f"@github.com/{binding.owner}/{binding.repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        run_git(repo_path, ["rm", "-r", "--cached", "--ignore-unmatch", str(rel)])
        result = run_git(
            repo_path,
            ["commit", "-m", f"Remove action: {slug}"],
            check=False,
        )
        if result.returncode == 0:
            run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH], check=False)


action_manager = ActionManager()
