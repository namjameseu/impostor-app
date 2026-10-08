"""add word hint column

Revision ID: 16fe9d68b371
Revises: 9823778829d0
Create Date: 2026-10-08 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '16fe9d68b371'
down_revision: Union[str, Sequence[str], None] = '9823778829d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('words', sa.Column('hint', sa.String(length=40), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('words', 'hint')
