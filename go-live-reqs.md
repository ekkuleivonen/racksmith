# Beta launch ready?

## Ensure schema is rock solid

- we should already be able to tell whats relevant and whats not
- will it be impossible to migrate if still for some reason we want to change this (esp. when users have their stuff in their repos)?
- are these the best places to store data?

## Config location

- ensure all racksmith managed assest are under single root .racksmith (yes also the ansible ones)
- add to onboarding a step:
  - does your repo have ansible resources you'd like to import?
  - when yes, prompt for ANSIBLE*HOSTS_IMPORT_PATH, ANSIBLE*\*..IMPORT_PATH
  - grab ansible from there ans then write to the approriate location under .racksmith

## Upgrade tools

- when something a breakig change is introduced, how are client supposed to upgrade and migrate?
- any spread across backwards compatiblity stuff should be eliminated and moved under a single spot that handles upgrades and ensuring that all structures match current version, when to run this?
- when version of the app is old (how to detect this?) we should show a banner for user on the UI to upgrade their app

## Unit tests

- each module should have at least the essentials covered with unit tests

## Code cleanup

- are there any bugs?
- any unused code?
- any code in wrong places?
- is the code clean?
- is the code readable?
- could anything be simplified by refactoring?
- are the api's restful (some tiny exepctions can be OK)
- no hardcoded constants spread across, all should be in settings.py

## Logging

- An essential amount of logs should cover the whole codebase
- Use structured logging (e.g. see \_utils.logging in /backend)

## Docs

- Are the apis well documented?
- Is there documentation about deployment of the backend, frontend, and the registry?
- Documentation on the scema versioning process: How to handle breaking changes?

---

1. Schema Solidity
   Verdict: Needs work

The good:

racks/schemas.py has proper constraints (min_length, max_length, ge/le)
repos/schemas.py has min_length/max_length on owner/repo
playbooks/schemas.py and roles/schemas.py have field constraints
Path traversal protection exists via safe_relative_path in code operations
Action YAML files have a consistent format across 14 actions
The concerning:

HostInput has no validation on ip_address (no IP/hostname format check), ssh_port (not bounded to 1-65535), or name length
code/schemas.py has no validation on path, content, or message fields
github/schemas.py — owner, repo, path, content, title, message are all unvalidated
groups/schemas.py — GroupInput.name has no length limit
registry/schemas.py — RegistryVersion.platforms and inputs use list[Any] (untyped)
RoleCreateRequest — become_password has no length/format constraint
Action YAML files have no shared JSON Schema for validation; they're parsed ad-hoc
On the question of "will it be impossible to migrate?" — the action YAML files live in user repos under .racksmith/, so changing their schema later means existing user repos would have stale configs. You'll want a schema_version field in those YAMLs early, so you can version and migrate them later.

2. Upgrade Tools
   Verdict: Nothing exists yet

No version field in action YAML files or .racksmith/ config
No polling mechanism for detecting outdated client versions
No registry version check on startup
The registry service has no concept of "minimum compatible client version"
You'll want at minimum:

A version field in the .racksmith/ directory config (so the backend can detect old layouts)
A /api/version or similar endpoint the frontend can check on startup
A strategy for action YAML schema evolution (version field + migration script) 3. Unit Tests
Verdict: Only ansible module is tested

Tests exist only in backend/ansible/tests/ (7 test files covering config, devices, extensions, inventory, playbooks, racks, roles). Every other module is untested:

Untested modules
code, github, groups, hosts, playbooks, racks, registry, repos, roles, ssh, schema, worker, \_utils
There are also zero frontend tests — no .test.tsx or .spec.tsx files.

4. Code Cleanup
   Verdict: Generally clean, a few issues

Bugs/issues found:

HomePage.tsx imports a missing component — @/components/home-dashboard (HomeDashboard) does not exist. This will crash the home page at runtime.
main.py defines logger = get_logger(**name**) but never uses it
Unused code:

frontend/src/components/racks/rack-edit-panel.tsx (RackEditPanel) — not imported anywhere
frontend/src/components/racks/server-rack.tsx (ServerRack) — not imported anywhere
Three empty stub directories in the backend: actions/, nodes/, stacks/
REST API design:

Most routers are RESTful with proper collection/resource patterns and status codes
repos/router.py is the biggest deviation — /repos, /local-repos, POST /repos/select, POST /local-repos/activate, GET /repo (singular) are custom-shaped
code/router.py uses query params for identity (GET /file?path=..., DELETE /file with query-param path) instead of path params — acceptable for file paths but non-standard
Code organization follows your conventions well. The ansible, schema, worker, and \_utils modules reasonably deviate since they serve different purposes.

No TODO, FIXME, HACK, or XXX comments found anywhere.

5. Logging
   Verdict: Almost entirely missing

Structured logging infrastructure is well-built in \_utils/logging.py (structlog with JSON processors, ISO timestamps, stack info). But only \_utils/ansible.py actually uses it. Every router, every manager, the worker, and all other utils have zero log calls.

6. Docs
   Verdict: Almost nonexistent

FastAPI auto-docs are available at /docs and /redoc (default config), which is good
schema/router.py has a custom GET /api/schema/docs endpoint for Ansible schema docs
Most individual endpoints lack docstrings (only get_schema_docs and create_role_from_yaml have them)
No project README at root
frontend/README.md is empty
No deployment documentation — docker-compose files exist but nothing explaining how to actually deploy
No registry documentation 7. Additional Items You Should Consider
Security
No rate limiting on any endpoint — critical for SSH, auth, and registry operations
Session cookie flags — no explicit Secure, HttpOnly, or SameSite attributes visible in session setup
SSH_DISABLE_HOST_KEY_CHECK defaults to True — make sure this is False in production
No CSRF protection beyond CORS (mitigated by cookie + single-origin CORS, but worth noting)
Data & Migrations
Backend SQLite has no migration tooling — schema is created via CREATE TABLE IF NOT EXISTS in init_db(). Any column additions or changes require manual DB manipulation. Consider adding Alembic (like the registry already has) or at least a version table.
Registry deps have no version pins — pyproject.toml lists packages with no version constraints at all (e.g. bare fastapi[standard], sqlalchemy[asyncio], alembic)
Reliability
No health check endpoint on the main backend — docker-compose.prod.yml has health checks for registry but you'd want one for the main app too
No graceful shutdown handling for WebSocket connections (SSH terminal, playbook/role run streaming)
Worker error handling — if Arq jobs fail, is there retry logic or dead-letter handling?
Frontend
No error boundaries beyond the top-level one in App.tsx — a single component crash takes down the whole app
No loading/error states audit — some catch blocks swallow errors without user feedback (} catch { with no toast)
No offline/network-down handling
Monitoring & Observability
No health metrics or Prometheus-style endpoint
No request tracing (correlation IDs across services)
No error tracking service integration (Sentry, etc.)
CI/CD
.github/workflows/build.yml builds and pushes images but runs no tests as part of CI
No linting step in CI
Summary Priority Matrix
Priority Item Status
High Fix HomePage.tsx missing import (it will crash) Broken
High Add logging across all modules Missing
High Add unit tests beyond ansible 1/14 modules covered
High Add input validation to schemas (hosts, code, github, groups) Weak
High Backend migration strategy (SQLite has none) Missing
High Add version field to .racksmith/ config for upgrade path Missing
Medium Add rate limiting Missing
Medium Add deployment docs Missing
Medium Add endpoint docstrings for OpenAPI Sparse
Medium Add project README Missing
Medium Pin registry Python deps Unpinned
Medium Add tests to CI pipeline Missing
Medium Add health check endpoint to main backend Missing
Low Clean up unused frontend components 2 components
Low Clean up empty backend stubs (actions/, nodes/, stacks/) Cosmetic
Low Normalize repos/code router REST patterns Stylistic
Low Session cookie security flags Review needed
Low Error tracking integration (Sentry etc.) Nice to have
