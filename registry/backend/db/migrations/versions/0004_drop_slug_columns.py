"""drop slug columns from registry_roles and registry_playbooks

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-21 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0004'
down_revision: str | Sequence[str] | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint('registry_roles_slug_key', 'registry_roles', type_='unique')
    op.drop_column('registry_roles', 'slug')
    op.drop_constraint('registry_playbooks_slug_key', 'registry_playbooks', type_='unique')
    op.drop_column('registry_playbooks', 'slug')


def downgrade() -> None:
    op.add_column('registry_playbooks', sa.Column('slug', sa.Text(), nullable=True))
    op.create_unique_constraint('registry_playbooks_slug_key', 'registry_playbooks', ['slug'])
    op.add_column('registry_roles', sa.Column('slug', sa.Text(), nullable=True))
    op.create_unique_constraint('registry_roles_slug_key', 'registry_roles', ['slug'])
