"""Uptime role: run uptime command and print result."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="uptime",
        name="Uptime",
        description="Run the uptime command and print the result.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}uptime",
    files={
        "tasks/main.yml": """---
- name: Collect uptime
  ansible.builtin.command: uptime
  register: racksmith_uptime_result
  changed_when: false

- name: Print uptime
  ansible.builtin.debug:
    var: racksmith_uptime_result.stdout
""",
    },
)
