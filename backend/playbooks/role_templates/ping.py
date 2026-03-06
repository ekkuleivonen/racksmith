"""Ping role: verify Ansible can connect to hosts."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="ping",
        name="Ping",
        description="Verify that Ansible can connect to the selected hosts.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}ping",
    files={
        "tasks/main.yml": """---
- name: Ping target
  ansible.builtin.ping:
""",
    },
)
