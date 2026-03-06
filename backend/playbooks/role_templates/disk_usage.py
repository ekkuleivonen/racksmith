"""Disk usage role: show root filesystem usage."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="disk_usage",
        name="Disk usage",
        description="Show root filesystem usage for selected hosts.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}disk_usage",
    files={
        "tasks/main.yml": """---
- name: Collect root filesystem usage
  ansible.builtin.command: df -h /
  register: racksmith_disk_usage_result
  changed_when: false

- name: Print root filesystem usage
  ansible.builtin.debug:
    var: racksmith_disk_usage_result.stdout_lines
""",
    },
)
