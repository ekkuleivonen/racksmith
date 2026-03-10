"""Add access_level CHECK constraint.

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "check_access_level",
        "users",
        "access_level IN ('user', 'admin', 'system')",
    )


def downgrade() -> None:
    op.drop_constraint("check_access_level", "users", type_="check")
