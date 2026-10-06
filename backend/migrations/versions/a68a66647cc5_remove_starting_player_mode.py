"""remove starting player mode

Revision ID: a68a66647cc5
Revises: 59d0eba41bf0
Create Date: 2026-10-06 08:50:42.331353

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a68a66647cc5'
down_revision: Union[str, Sequence[str], None] = '59d0eba41bf0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Dropping the column also drops ck_games_starting_player_mode_valid.
    op.drop_column("games", "starting_player_mode")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "games",
        sa.Column(
            "starting_player_mode",
            sa.String(length=20),
            server_default="random",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_games_starting_player_mode_valid",
        "games",
        "starting_player_mode IN ('random', 'after_impostor')",
    )
