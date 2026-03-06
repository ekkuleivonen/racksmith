"""Reboot if required role: reboot when system reports it is needed."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="reboot_if_required",
        name="Reboot if required",
        description="Reboot Debian or RedHat hosts only when the system reports it is needed. Requires become.",
        fields=[],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}reboot_if_required",
    files={
        "tasks/main.yml": """---
- name: Gather setup facts
  ansible.builtin.setup:

- name: Check Debian reboot-required flag
  ansible.builtin.stat:
    path: /var/run/reboot-required
  register: racksmith_reboot_required_debian
  when: ansible_facts['os_family'] == 'Debian'

- name: Check RedHat reboot requirement
  ansible.builtin.command: needs-restarting -r
  register: racksmith_reboot_required_redhat
  changed_when: false
  failed_when: false
  when: ansible_facts['os_family'] == 'RedHat'

- name: Set reboot-required fact
  ansible.builtin.set_fact:
    racksmith_reboot_required: "{{ (racksmith_reboot_required_debian.stat.exists if ansible_facts['os_family'] == 'Debian' else false) or (racksmith_reboot_required_redhat.rc == 1 if ansible_facts['os_family'] == 'RedHat' else false) }}"

- name: Reboot when required
  ansible.builtin.reboot:
    msg: Racksmith rebooting host after role requested reboot
    reboot_timeout: 900
  when: racksmith_reboot_required

- name: Print reboot decision
  ansible.builtin.debug:
    msg: "Reboot required: {{ racksmith_reboot_required }}"
""",
    },
)
