"""Add last_seen and github_access_token_enc to users.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("github_access_token_enc", sa.Text, server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "github_access_token_enc")
    op.drop_column("users", "last_seen")
