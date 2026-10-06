"""similar word mode, player changes, round points

Revision ID: e842be7dad5a
Revises: 929eda6cd7ca
Create Date: 2026-10-06 10:33:12.812617

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e842be7dad5a'
down_revision: Union[str, Sequence[str], None] = '929eda6cd7ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Similar Word mode, players joining/leaving between rounds, per-round saved points."""
    op.add_column("words", sa.Column("similar_word", sa.String(length=80), nullable=True))
    op.add_column(
        "games",
        sa.Column("impostor_mode", sa.String(length=20), server_default="classic", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_games_impostor_mode_valid"),
        "games",
        "impostor_mode IN ('classic', 'similar_word')",
    )
    op.add_column(
        "game_players",
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column("rounds", sa.Column("impostor_word", sa.String(length=80), nullable=True))
    op.add_column(
        "rounds",
        sa.Column("points", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    _backfill_round_points()

    # Deleting a game must be able to delete its players: let player links cascade.
    op.drop_constraint(op.f("fk_rounds_starting_player_id_game_players"), "rounds", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_rounds_starting_player_id_game_players"), "rounds", "game_players", ["starting_player_id"], ["id"], ondelete="CASCADE"
    )
    op.drop_constraint(op.f("fk_round_impostors_player_id_game_players"), "round_impostors", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_round_impostors_player_id_game_players"), "round_impostors", "game_players", ["player_id"], ["id"], ondelete="CASCADE"
    )
    op.drop_constraint(op.f("fk_round_suspects_player_id_game_players"), "round_suspects", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_round_suspects_player_id_game_players"), "round_suspects", "game_players", ["player_id"], ["id"], ondelete="CASCADE"
    )


def _backfill_round_points() -> None:
    """Save points for rounds finished before points were stored.

    Until now every player took part in every round, so each round's participants are all of
    its game's players. Same rules as app.game.scoring (inlined so this migration never changes
    when the app code does): escaped Impostor +2; caught Impostor who guessed +1; for each
    caught Impostor who missed, every non-Impostor +1.
    """
    conn = op.get_bind()
    rounds = conn.execute(
        sa.text("SELECT id, game_id FROM rounds WHERE outcome IS NOT NULL AND points IS NULL")
    ).all()
    for round_id, game_id in rounds:
        players = conn.execute(
            sa.text("SELECT id FROM game_players WHERE game_id = :g"), {"g": game_id}
        ).scalars().all()
        suspects = set(
            conn.execute(
                sa.text("SELECT player_id FROM round_suspects WHERE round_id = :r"),
                {"r": round_id},
            ).scalars()
        )
        impostors = conn.execute(
            sa.text("SELECT player_id, guessed_word FROM round_impostors WHERE round_id = :r"),
            {"r": round_id},
        ).all()
        impostor_ids = {pid for pid, _ in impostors}
        points = dict.fromkeys(players, 0)
        for pid, guessed in impostors:
            if pid not in suspects:
                points[pid] += 2
            elif guessed:
                points[pid] += 1
            else:
                for crew in players:
                    if crew not in impostor_ids:
                        points[crew] += 1
        conn.execute(
            sa.text("UPDATE rounds SET points = CAST(:p AS JSONB) WHERE id = :r"),
            {"p": json.dumps({str(k): v for k, v in points.items()}), "r": round_id},
        )


def downgrade() -> None:
    """Drop the new columns (players who left become active again)."""
    # Back to plain foreign keys.
    op.drop_constraint(op.f("fk_rounds_starting_player_id_game_players"), "rounds", type_="foreignkey")
    op.create_foreign_key(op.f("fk_rounds_starting_player_id_game_players"), "rounds", "game_players", ["starting_player_id"], ["id"])
    op.drop_constraint(op.f("fk_round_impostors_player_id_game_players"), "round_impostors", type_="foreignkey")
    op.create_foreign_key(op.f("fk_round_impostors_player_id_game_players"), "round_impostors", "game_players", ["player_id"], ["id"])
    op.drop_constraint(op.f("fk_round_suspects_player_id_game_players"), "round_suspects", type_="foreignkey")
    op.create_foreign_key(op.f("fk_round_suspects_player_id_game_players"), "round_suspects", "game_players", ["player_id"], ["id"])
    op.drop_column("rounds", "points")
    op.drop_column("rounds", "impostor_word")
    op.drop_column("game_players", "active")
    op.drop_constraint(op.f("ck_games_impostor_mode_valid"), "games", type_="check")
    op.drop_column("games", "impostor_mode")
    op.drop_column("words", "similar_word")
