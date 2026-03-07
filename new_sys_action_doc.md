# Writing Racksmith Actions

An **action** is a reusable unit of automation — it wraps one Ansible role and
exposes a typed input schema so Racksmith can render a form and validate
arguments before running anything.

Actions live in `.racksmith/actions/<slug>/` inside your repo.

---

## Directory layout

```
.racksmith/actions/
└── install-docker/
    ├── action.yaml       ← metadata + input schema
    └── tasks/
        └── main.yml      ← Ansible task list (standard role tasks entry-point)
```

---

## action.yaml reference

```yaml
slug: install-docker           # unique ID; must match the directory name
name: Install Docker           # display name shown in the UI
description: >                 # freeform, shown as a tooltip / card description
  Installs Docker Engine on Debian/Ubuntu hosts.
executor: ansible              # only supported value right now
source: user                   # builtin | user | community
                               #   builtin  = shipped with Racksmith (never overwrite these)
                               #   user     = written by you
                               #   community = installed from a registry pack

compatibility:
  os_family: []                # empty = any OS
                               # examples: [debian]  [rhel]  [debian, rhel]

inputs: []                     # see "Inputs" section below
```

### Inputs

Each entry in `inputs` maps to one Ansible variable passed to the role.

```yaml
inputs:
  - key: docker_channel        # the Ansible variable name (--extra-vars)
    label: Release channel     # shown in the UI form
    type: select               # string | boolean | select | secret
    placeholder: stable        # hint text for string inputs
    default: stable            # pre-filled value
    required: true             # whether the user must provide a value
    options:                   # only for type: select
      - stable
      - test
    interactive: false         # set true for secrets that must NEVER be stored
                               # (e.g. become password, API tokens)
                               # interactive inputs are prompted at run-time only
```

#### Input types

| type | UI widget | Notes |
|---|---|---|
| `string` | text input | general purpose |
| `boolean` | checkbox | passes `true` / `false` to Ansible |
| `select` | dropdown | requires `options` list |
| `secret` | password input | value is redacted in logs |

Set `interactive: true` on any input that should **never be stored** — not in Git,
not in the database. The UI will prompt for it immediately before the run and pass
it via a temporary file that is deleted after Ansible exits.

---

## tasks/main.yml

Standard Ansible task file. Variables declared in `inputs` arrive as Ansible
variables — access them with `{{ variable_name }}`.

```yaml
---
- name: Install Docker
  ansible.builtin.apt:
    name: docker-ce
    state: present
    update_cache: true

- name: Enable Docker service
  ansible.builtin.service:
    name: docker
    state: started
    enabled: true
```

The task file is executed as an Ansible **role** (via `roles:` in the generated
playbook), so standard role conventions apply: handlers go in `handlers/main.yml`,
templates in `templates/`, files in `files/`, etc.

---

## Creating an action via the API

POST a single YAML document to `/api/actions/from-yaml`. The `tasks` key is
extracted and written to `tasks/main.yml`; everything else becomes `action.yaml`.

The files are **immediately committed and pushed** to your `racksmith` branch on
GitHub — no separate commit step needed. You must be logged in with GitHub OAuth
and have an active repo selected.


```yaml
slug: install-tailscale
name: Install Tailscale
description: Installs Tailscale and optionally registers with an auth key.
executor: ansible
source: user
compatibility:
  os_family: [debian]
inputs:
  - key: tailscale_auth_key
    label: Auth key
    type: secret
    interactive: true
    required: true
tasks:
  - name: Install Tailscale
    ansible.builtin.apt:
      name: tailscale
      state: present
      update_cache: true

  - name: Bring up Tailscale
    ansible.builtin.command:
      cmd: tailscale up --authkey {{ tailscale_auth_key }}
    when: tailscale_auth_key is defined and tailscale_auth_key != ""
```

There is also a browser UI at `/actions/new` (not linked in the sidebar) for
pasting the same YAML format directly.

### Other endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/actions` | List all actions in the active repo |
| `GET` | `/api/actions/:slug` | Get a single action |
| `POST` | `/api/actions` | Create from structured JSON |
| `POST` | `/api/actions/from-yaml` | Create from raw YAML text |
| `DELETE` | `/api/actions/:slug` | Delete a user action (builtin actions are protected) |

---

## Naming conventions

| Rule | Example |
|---|---|
| Slug: lowercase, hyphens, no spaces | `install-docker`, `setup-node-exporter` |
| Name: title case, short | `Install Docker`, `Setup Node Exporter` |
| One action = one concern | don't combine unrelated tasks in a single action |
| Prefix utility actions | `check-disk-space`, `check-memory` |

---

## Builtin actions

These are shipped with Racksmith and synced into `.racksmith/actions/` automatically.
Do **not** edit them — they will be overwritten on the next sync.
Create a new action with a different slug if you need custom behaviour.

| Slug | What it does |
|---|---|
| `ping` | Verify Ansible connectivity |
| `get-info` | Gather OS / hardware facts |
| `uptime` | Show system uptime |
| `disk-usage` | Show root filesystem usage |
| `memory-usage` | Show memory usage |
| `service-status` | Inspect a systemd service state |
| `system-upgrade` | Upgrade packages (apt / dnf / yum) |
| `reboot-if-required` | Reboot if the OS signals it is needed |
