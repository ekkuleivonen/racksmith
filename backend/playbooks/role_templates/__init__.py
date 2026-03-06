"""Role template package exports."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.role_templates.catalog import ROLE_TEMPLATE_SPECS

__all__ = [
    "BUILTIN_ROLE_PREFIX",
    "ROLE_TEMPLATE_SPECS",
    "RoleTemplateSpec",
]
