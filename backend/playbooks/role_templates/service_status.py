"""Service status role: inspect systemd service state."""

from playbooks.role_templates._base import BUILTIN_ROLE_PREFIX, RoleTemplateSpec
from playbooks.schemas import RoleTemplate, RoleTemplateField

SPEC = RoleTemplateSpec(
    template=RoleTemplate(
        id="service_status",
        name="Service status",
        description="Inspect the active state of a systemd service.",
        fields=[
            RoleTemplateField(
                key="service_name",
                label="Service name",
                placeholder="ssh",
                default="ssh",
            )
        ],
    ),
    role_name=f"{BUILTIN_ROLE_PREFIX}service_status",
    files={
        "tasks/main.yml": """---
- name: Normalize requested service name
  ansible.builtin.set_fact:
    racksmith_service_name: "{{ service_name | default('ssh') }}"

- name: Gather service facts
  ansible.builtin.service_facts:

- name: Print requested service status
  ansible.builtin.debug:
    msg:
      - "Service: {{ racksmith_service_name }}"
      - "State: {{ ansible_facts.services[racksmith_service_name ~ '.service'].state if (racksmith_service_name ~ '.service') in ansible_facts.services else 'not found' }}"
      - "Status: {{ ansible_facts.services[racksmith_service_name ~ '.service'].status if (racksmith_service_name ~ '.service') in ansible_facts.services else 'not found' }}"
""",
    },
)
