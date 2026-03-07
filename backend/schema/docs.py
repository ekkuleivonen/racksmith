"""Generate markdown documentation from schema models."""

from __future__ import annotations

from schema.models import ActionConfig, ActionInputConfig, GroupConfig, NodeConfig, RackConfig


def _model_to_markdown(name: str, model: type) -> str:
    lines = [f"## {name}", ""]
    for field_name, field_info in model.model_fields.items():
        desc = field_info.description or ""
        default = field_info.default
        default_str = (
            f" (default: `{default}`)" if default not in (None, "", [], {}) else ""
        )
        if (
            hasattr(field_info, "default_factory")
            and field_info.default_factory is not None
        ):
            default_str = (
                " (default: `[]` or `{}`)"
                if callable(field_info.default_factory)
                else ""
            )
        annotation = field_info.annotation
        type_str = str(annotation) if annotation is not None else "any"
        lines.append(f"- **{field_name}** (`{type_str}`){default_str}: {desc}")
    lines.append("")
    return "\n".join(lines)


def generate_docs() -> str:
    """Generate markdown documentation for .racksmith/ YAML format."""
    sections = [
        "# .racksmith/ Schema Reference",
        "",
        "This document describes the YAML schema for files under `.racksmith/`.",
        "",
        _model_to_markdown("Node (nodes/<slug>.yaml)", NodeConfig),
        _model_to_markdown("Group (groups/<slug>.yaml)", GroupConfig),
        _model_to_markdown("Rack (racks/<slug>.yaml)", RackConfig),
        _model_to_markdown("Action (actions/<slug>/action.yaml)", ActionConfig),
        _model_to_markdown("Action Input", ActionInputConfig),
    ]
    return "\n".join(sections)
