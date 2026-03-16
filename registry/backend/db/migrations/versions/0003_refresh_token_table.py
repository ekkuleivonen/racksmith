"""add refresh_tokens table, drop users.refresh_token_hash

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-16 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: str | Sequence[str] | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'refresh_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.Text, unique=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_refresh_tokens_token_hash', 'refresh_tokens', ['token_hash'])
    op.drop_column('users', 'refresh_token_hash')


def downgrade() -> None:
    op.add_column('users', sa.Column('refresh_token_hash', sa.Text, nullable=True))
    op.drop_index('ix_refresh_tokens_token_hash', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
