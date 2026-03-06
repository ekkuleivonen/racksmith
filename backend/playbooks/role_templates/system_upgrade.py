"""System upgrade role: upgrade packages on common Linux distros."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="system_upgrade",
        name="System upgrade",
        description="Upgrade packages on common Linux distributions. Requires become.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}system_upgrade",
    files={
        "tasks/main.yml": """---
- name: Gather setup facts
  ansible.builtin.setup:

- name: Upgrade Debian packages
  ansible.builtin.apt:
    update_cache: true
    upgrade: dist
  when: ansible_facts['pkg_mgr'] == 'apt'

- name: Upgrade DNF packages
  ansible.builtin.dnf:
    name: '*'
    state: latest
    update_cache: true
  when: ansible_facts['pkg_mgr'] == 'dnf'

- name: Upgrade YUM packages
  ansible.builtin.yum:
    name: '*'
    state: latest
    update_cache: true
  when: ansible_facts['pkg_mgr'] == 'yum'

- name: Report unsupported package manager
  ansible.builtin.debug:
    msg: "Package manager {{ ansible_facts['pkg_mgr'] }} is not yet handled by this role."
  when: ansible_facts['pkg_mgr'] not in ['apt', 'dnf', 'yum']
""",
    },
)
