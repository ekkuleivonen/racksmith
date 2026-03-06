"""Get info role: gather facts and print system summary."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="get_info",
        name="Get info",
        description="Gather facts and print a short system summary.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}get_info",
    files={
        "tasks/main.yml": """---
- name: Gather setup facts
  ansible.builtin.setup:

- name: Print host summary
  ansible.builtin.debug:
    msg:
      - "Host: {{ inventory_hostname }}"
      - "OS: {{ ansible_facts['distribution'] }} {{ ansible_facts['distribution_version'] }}"
      - "Kernel: {{ ansible_facts['kernel'] }}"
      - "Arch: {{ ansible_facts['architecture'] }}"
""",
    },
)
