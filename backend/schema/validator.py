"""Validate .racksmith/ YAML files against schema registry."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import ValidationError

from schema.registry import SCHEMA_REGISTRY


def validate_repo(racksmith_dir: Path) -> list[dict]:
    """Walk .racksmith/, match each file to its schema, collect validation errors."""
    errors: list[dict] = []
    racksmith = racksmith_dir if racksmith_dir.name == ".racksmith" else racksmith_dir / ".racksmith"
    if not racksmith.is_dir():
        return errors

    for glob_pattern, model in SCHEMA_REGISTRY.items():
        dir_name = glob_pattern.split("/")[0]
        dir_path = racksmith / dir_name
        if not dir_path.is_dir():
            continue
        pattern = glob_pattern.split("/", 1)[1]
        for path in sorted(dir_path.glob(pattern)):
            if not path.is_file():
                continue
            try:
                payload = yaml.safe_load(path.read_text(encoding="utf-8"))
                if payload is None:
                    payload = {}
                model.model_validate(payload)
            except ValidationError as exc:
                errors.append({"file": str(path), "errors": exc.errors()})
            except (yaml.YAMLError, OSError) as exc:
                errors.append({"file": str(path), "errors": [{"msg": str(exc)}]})
    return errors
