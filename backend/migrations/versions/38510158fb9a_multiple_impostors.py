"""multiple impostors

Revision ID: 38510158fb9a
Revises: 25d2fab68a20
Create Date: 2026-10-06 09:31:46.293702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38510158fb9a'
down_revision: Union[str, Sequence[str], None] = '25d2fab68a20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD_OUTCOMES = "('group_wins', 'impostor_escaped', 'impostor_guessed_word')"
NEW_OUTCOMES = "('group_wins', 'impostors_win', 'split')"


def upgrade() -> None:
    """Move rounds' single impostor/suspect into link tables so a round can have several."""
    op.create_table(
        "round_impostors",
        sa.Column("round_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("guessed_word", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["game_players.id"],
            name=op.f("fk_round_impostors_player_id_game_players"),
        ),
        sa.ForeignKeyConstraint(
            ["round_id"],
            ["rounds.id"],
            name=op.f("fk_round_impostors_round_id_rounds"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("round_id", "player_id", name=op.f("pk_round_impostors")),
    )
    op.create_index(
        op.f("ix_round_impostors_player_id"), "round_impostors", ["player_id"], unique=False
    )
    op.create_table(
        "round_suspects",
        sa.Column("round_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["game_players.id"],
            name=op.f("fk_round_suspects_player_id_game_players"),
        ),
        sa.ForeignKeyConstraint(
            ["round_id"],
            ["rounds.id"],
            name=op.f("fk_round_suspects_round_id_rounds"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("round_id", "player_id", name=op.f("pk_round_suspects")),
    )
    op.add_column(
        "games", sa.Column("impostor_count", sa.Integer(), server_default="1", nullable=False)
    )
    op.create_check_constraint(
        op.f("ck_games_impostor_count_positive"), "games", "impostor_count > 0"
    )

    # Copy existing rounds into the link tables.
    op.execute(
        "INSERT INTO round_impostors (round_id, player_id, guessed_word) "
        "SELECT id, impostor_id, CASE WHEN impostor_caught THEN final_guess_correct END "
        "FROM rounds"
    )
    op.execute(
        "INSERT INTO round_suspects (round_id, player_id) "
        "SELECT id, suspect_id FROM rounds WHERE suspect_id IS NOT NULL"
    )

    # Outcomes now summarise the round rather than a single Impostor.
    op.drop_constraint(op.f("ck_rounds_outcome_valid"), "rounds", type_="check")
    op.execute(
        "UPDATE rounds SET outcome = 'impostors_win' "
        "WHERE outcome IN ('impostor_escaped', 'impostor_guessed_word')"
    )
    op.create_check_constraint(
        op.f("ck_rounds_outcome_valid"), "rounds", f"outcome IS NULL OR outcome IN {NEW_OUTCOMES}"
    )

    op.drop_index(op.f("ix_rounds_impostor_id"), table_name="rounds")
    op.drop_constraint(op.f("fk_rounds_suspect_id_game_players"), "rounds", type_="foreignkey")
    op.drop_constraint(op.f("fk_rounds_impostor_id_game_players"), "rounds", type_="foreignkey")
    op.drop_column("rounds", "impostor_caught")
    op.drop_column("rounds", "final_guess_correct")
    op.drop_column("rounds", "suspect_id")
    op.drop_column("rounds", "impostor_id")


def downgrade() -> None:
    """Back to one Impostor per round (keeps the lowest player id when there were several)."""
    op.add_column("rounds", sa.Column("impostor_id", sa.Integer(), nullable=True))
    op.add_column("rounds", sa.Column("suspect_id", sa.Integer(), nullable=True))
    op.add_column("rounds", sa.Column("final_guess_correct", sa.Boolean(), nullable=True))
    op.add_column("rounds", sa.Column("impostor_caught", sa.Boolean(), nullable=True))

    op.execute(
        "UPDATE rounds SET "
        "impostor_id = (SELECT min(player_id) FROM round_impostors ri WHERE ri.round_id = rounds.id), "
        "suspect_id = (SELECT min(player_id) FROM round_suspects rs WHERE rs.round_id = rounds.id)"
    )
    op.execute(
        "UPDATE rounds SET "
        "impostor_caught = CASE WHEN suspect_id IS NULL THEN NULL "
        "ELSE suspect_id = impostor_id END, "
        "final_guess_correct = (SELECT guessed_word FROM round_impostors ri "
        "WHERE ri.round_id = rounds.id AND ri.player_id = rounds.impostor_id)"
    )
    op.drop_constraint(op.f("ck_rounds_outcome_valid"), "rounds", type_="check")
    op.execute(
        "UPDATE rounds SET outcome = CASE "
        "WHEN NOT impostor_caught THEN 'impostor_escaped' "
        "WHEN final_guess_correct THEN 'impostor_guessed_word' "
        "ELSE 'group_wins' END "
        "WHERE outcome IS NOT NULL"
    )
    op.create_check_constraint(
        op.f("ck_rounds_outcome_valid"), "rounds", f"outcome IS NULL OR outcome IN {OLD_OUTCOMES}"
    )
    op.alter_column("rounds", "impostor_id", nullable=False)
    op.create_foreign_key(
        op.f("fk_rounds_impostor_id_game_players"),
        "rounds",
        "game_players",
        ["impostor_id"],
        ["id"],
    )
    op.create_foreign_key(
        op.f("fk_rounds_suspect_id_game_players"),
        "rounds",
        "game_players",
        ["suspect_id"],
        ["id"],
    )
    op.create_index(op.f("ix_rounds_impostor_id"), "rounds", ["impostor_id"], unique=False)

    op.drop_constraint(op.f("ck_games_impostor_count_positive"), "games", type_="check")
    op.drop_column("games", "impostor_count")
    op.drop_index(op.f("ix_round_impostors_player_id"), table_name="round_impostors")
    op.drop_table("round_suspects")
    op.drop_table("round_impostors")
