"""Unit tests for ansible.playbooks."""

from pathlib import Path

import pytest

from core.playbooks import (
    PlaybookData,
    PlaybookRoleEntry,
    list_playbooks,
    read_playbook,
    remove_playbook,
    write_playbook,
)
from core.racksmith_meta import RacksmithMeta, write_meta


class TestReadPlaybook:
    """read_playbook(path, repo_path)."""

    def test_parses_basic_playbook(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "deploy.yml"
        path.write_text("""
- name: Deploy Application
  hosts: all
  gather_facts: true
  roles:
    - nginx
    - role: certbot
      vars:
        domain: example.com
""")
        pb = read_playbook(path, layout.repo_path)
        assert pb.id == "deploy"
        assert pb.name == "Deploy Application"
        assert pb.hosts == "all"
        assert pb.gather_facts is True
        assert len(pb.roles) == 2
        assert pb.roles[0].role == "nginx"
        assert pb.roles[0].vars == {}
        assert pb.roles[1].role == "certbot"
        assert pb.roles[1].vars == {"domain": "example.com"}

    def test_description_from_racksmith_meta(self, layout) -> None:
        """Description comes from .racksmith.yml, not play vars."""
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "x.yml"
        path.write_text("""
- name: X
  hosts: all
  roles: []
""")
        meta = RacksmithMeta()
        meta.playbooks["x"] = {"name": "X", "description": "Full web stack deployment"}
        write_meta(layout, meta)
        pbs = list_playbooks(layout)
        assert len(pbs) == 1
        assert pbs[0].description == "Full web stack deployment"

    def test_legacy_racksmith_description_in_vars(self, layout) -> None:
        """Legacy: racksmith_description in play vars is still read for migration compat."""
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "x.yml"
        path.write_text("""
- name: X
  hosts: all
  roles: []
  vars:
    racksmith_description: Legacy desc
""")
        pb = read_playbook(path, layout.repo_path)
        assert pb.description == "Legacy desc"

    def test_path_relative_to_repo(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "rel.yml"
        path.write_text("- name: R\n  hosts: all\n  roles: []\n")
        pb = read_playbook(path, layout.repo_path)
        assert "playbooks" in str(pb.path)
        assert pb.path.name == "rel.yml"

    def test_raises_on_invalid_format(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "bad.yml"
        path.write_text("not a list\n")
        with pytest.raises(ValueError, match="YAML list"):
            read_playbook(path)

    def test_parses_inline_role_vars(self, layout) -> None:
        """Ansible allows {role: foo, domain: x.com} without nested vars key."""
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "inline.yml"
        path.write_text("""
- name: Inline vars
  hosts: all
  roles:
    - role: certbot
      domain: example.com
      email: admin@example.com
""")
        pb = read_playbook(path, layout.repo_path)
        assert len(pb.roles) == 1
        assert pb.roles[0].role == "certbot"
        assert pb.roles[0].vars == {
            "domain": "example.com",
            "email": "admin@example.com",
        }

    def test_inline_role_vars_merge_with_vars_block(self, layout) -> None:
        """vars block overrides inline vars when both present."""
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "merge.yml"
        path.write_text("""
- name: Merge
  hosts: all
  roles:
    - role: certbot
      domain: old.com
      vars:
        domain: new.com
""")
        pb = read_playbook(path, layout.repo_path)
        assert pb.roles[0].vars["domain"] == "new.com"


class TestListPlaybooks:
    """list_playbooks(layout)."""

    def test_empty_when_no_dir(self, layout) -> None:
        assert list_playbooks(layout) == []

    def test_returns_yml_files(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "a.yml").write_text(
            "- name: A\n  hosts: all\n  roles: []\n"
        )
        (layout.playbooks_path / "b.yml").write_text(
            "- name: B\n  hosts: all\n  roles: []\n"
        )
        pbs = list_playbooks(layout)
        assert len(pbs) == 2
        assert {p.id for p in pbs} == {"a", "b"}

    def test_skips_invalid_files(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "valid.yml").write_text(
            "- name: V\n  hosts: all\n  roles: []\n"
        )
        (layout.playbooks_path / "invalid.yml").write_text("not: valid: playbook\n")
        pbs = list_playbooks(layout)
        assert len(pbs) == 1
        assert pbs[0].id == "valid"


class TestWritePlaybook:
    """write_playbook(layout, playbook)."""

    def test_creates_yml_file(self, layout) -> None:
        pb = PlaybookData(
            id="web",
            path=Path("playbooks/web.yml"),
            name="Web Stack",
            description="Deploy web",
            hosts="all",
            roles=[
                PlaybookRoleEntry("nginx"),
                PlaybookRoleEntry("certbot", vars={"domain": "x.com"}),
            ],
        )
        path = write_playbook(layout, pb)
        assert path.exists()
        content = path.read_text()
        assert "Web Stack" in content
        assert "nginx" in content
        assert "certbot" in content
        assert "domain" in content
        # racksmith_description no longer in the YAML file
        assert "racksmith_description" not in content

    def test_roundtrip(self, layout) -> None:
        original = PlaybookData(
            id="rt",
            path=Path("playbooks/rt.yml"),
            name="Roundtrip",
            description="Test desc",
            hosts="webservers",
            gather_facts=False,
            become=True,
            roles=[
                PlaybookRoleEntry("r1"),
                PlaybookRoleEntry("r2", vars={"k": "v"}),
            ],
        )
        write_playbook(layout, original)
        listed = list_playbooks(layout)
        assert len(listed) == 1
        pb = listed[0]
        assert pb.id == original.id
        assert pb.name == original.name
        assert pb.description == original.description
        assert pb.hosts == original.hosts
        assert pb.gather_facts == original.gather_facts
        assert pb.become == original.become
        assert len(pb.roles) == 2
        assert pb.roles[1].vars == {"k": "v"}

    def test_inline_role_vars_roundtrip(self, layout) -> None:
        """Inline role vars are preserved through read->write->read."""
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "inline.yml").write_text("""
- name: X
  hosts: all
  roles:
    - role: certbot
      domain: x.com
      email: a@x.com
""")
        pb = read_playbook(layout.playbooks_path / "inline.yml", layout.repo_path)
        write_playbook(layout, pb)
        pb2 = read_playbook(layout.playbooks_path / "inline.yml", layout.repo_path)
        assert pb2.roles[0].vars == {"domain": "x.com", "email": "a@x.com"}


class TestRemovePlaybook:
    """remove_playbook(layout, playbook_id)."""

    def test_deletes_yml_file(self, layout) -> None:
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        path = layout.playbooks_path / "gone.yml"
        path.write_text("- name: X\n  hosts: all\n  roles: []\n")
        assert path.exists()
        remove_playbook(layout, "gone")
        assert not path.exists()
