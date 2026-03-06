"""Memory usage role: show memory usage summary."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="memory_usage",
        name="Memory usage",
        description="Show memory usage with a human-readable summary.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}memory_usage",
    files={
        "tasks/main.yml": """---
- name: Collect memory usage
  ansible.builtin.command: free -h
  register: racksmith_memory_usage_result
  changed_when: false

- name: Print memory usage
  ansible.builtin.debug:
    var: racksmith_memory_usage_result.stdout_lines
""",
    },
)
