"""drop game tables, local-only engine

The game engine now runs on-device (frontend/src/game/) so it works offline; the backend
keeps only the word library and admin passcode. This drops the no-longer-used Game/Round
tables and DISCARDS any existing game rows — there is no migration path to bring old
server-side games onto a device, since they were never there. Confirm there's nothing
worth keeping (or export it via the old /api/stats first) before running this.

Revision ID: 9823778829d0
Revises: e842be7dad5a
Create Date: 2026-10-08 10:12:43.550565

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9823778829d0'
down_revision: Union[str, Sequence[str], None] = 'e842be7dad5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema. Tables dropped child-before-parent so FKs never dangle."""
    op.drop_index(op.f('ix_round_impostors_player_id'), table_name='round_impostors')
    op.drop_table('round_impostors')
    op.drop_table('round_suspects')
    op.drop_index(op.f('ix_rounds_category_id'), table_name='rounds')
    op.drop_index(op.f('ix_rounds_word_id'), table_name='rounds')
    op.drop_table('rounds')
    op.drop_index(op.f('ix_game_categories_category_id'), table_name='game_categories')
    op.drop_table('game_categories')
    op.drop_index(op.f('uq_game_players_game_name_lower'), table_name='game_players')
    op.drop_table('game_players')
    op.drop_index(op.f('ix_games_state'), table_name='games')
    op.drop_table('games')


def downgrade() -> None:
    """Downgrade schema. Tables created parent-before-child; data is NOT restored."""
    op.create_table('games',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('state', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('total_rounds', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('category_mode', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('impostor_hint', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('current_round_number', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('finished_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('impostor_count', sa.INTEGER(), server_default=sa.text('1'), autoincrement=False, nullable=False),
    sa.Column('impostors_know_each_other', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.Column('impostor_mode', sa.VARCHAR(length=20), server_default=sa.text("'classic'::character varying"), autoincrement=False, nullable=False),
    sa.CheckConstraint("category_mode::text = ANY (ARRAY['random'::character varying, 'specific'::character varying]::text[])", name=op.f('ck_games_category_mode_valid')),
    sa.CheckConstraint("impostor_hint::text = ANY (ARRAY['none'::character varying, 'category'::character varying]::text[])", name=op.f('ck_games_impostor_hint_valid')),
    sa.CheckConstraint("impostor_mode::text = ANY (ARRAY['classic'::character varying, 'similar_word'::character varying]::text[])", name=op.f('ck_games_impostor_mode_valid')),
    sa.CheckConstraint("state::text = ANY (ARRAY['SETUP'::character varying, 'ROLE_REVEAL'::character varying, 'READY'::character varying, 'CLUE_ROUND'::character varying, 'VOTING'::character varying, 'IMPOSTOR_REVEAL'::character varying, 'FINAL_GUESS'::character varying, 'ROUND_RESULTS'::character varying, 'GAME_RESULTS'::character varying]::text[])", name=op.f('ck_games_state_valid')),
    sa.CheckConstraint('impostor_count > 0', name=op.f('ck_games_impostor_count_positive')),
    sa.CheckConstraint('total_rounds > 0', name=op.f('ck_games_total_rounds_positive')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_games'))
    )
    op.create_index(op.f('ix_games_state'), 'games', ['state'], unique=False)

    op.create_table('game_players',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('game_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=30), autoincrement=False, nullable=False),
    sa.Column('score', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('order_index', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('active', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], name=op.f('fk_game_players_game_id_games'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_game_players')),
    sa.UniqueConstraint('game_id', 'order_index', name=op.f('uq_game_players_game_id'), postgresql_include=[], postgresql_nulls_not_distinct=False)
    )
    op.create_index(op.f('uq_game_players_game_name_lower'), 'game_players', ['game_id', sa.literal_column('lower(name::text)')], unique=True)

    op.create_table('game_categories',
    sa.Column('game_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('category_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_game_categories_category_id_categories'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], name=op.f('fk_game_categories_game_id_games'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('game_id', 'category_id', name=op.f('pk_game_categories'))
    )
    op.create_index(op.f('ix_game_categories_category_id'), 'game_categories', ['category_id'], unique=False)

    op.create_table('rounds',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('game_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('round_number', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('category_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('category_name', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('word_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('secret_word', sa.VARCHAR(length=80), autoincrement=False, nullable=False),
    sa.Column('starting_player_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('reveal_index', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('word_revealed', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('outcome', sa.VARCHAR(length=30), autoincrement=False, nullable=True),
    sa.Column('completed_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('impostor_word', sa.VARCHAR(length=80), autoincrement=False, nullable=True),
    sa.Column('points', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.CheckConstraint("outcome IS NULL OR (outcome::text = ANY (ARRAY['group_wins'::character varying, 'impostors_win'::character varying, 'split'::character varying]::text[]))", name=op.f('ck_rounds_outcome_valid')),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('fk_rounds_category_id_categories'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], name=op.f('fk_rounds_game_id_games'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['starting_player_id'], ['game_players.id'], name=op.f('fk_rounds_starting_player_id_game_players'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['word_id'], ['words.id'], name=op.f('fk_rounds_word_id_words'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_rounds')),
    sa.UniqueConstraint('game_id', 'round_number', name=op.f('uq_rounds_game_id'), postgresql_include=[], postgresql_nulls_not_distinct=False)
    )
    op.create_index(op.f('ix_rounds_word_id'), 'rounds', ['word_id'], unique=False)
    op.create_index(op.f('ix_rounds_category_id'), 'rounds', ['category_id'], unique=False)

    op.create_table('round_suspects',
    sa.Column('round_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('player_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['player_id'], ['game_players.id'], name=op.f('fk_round_suspects_player_id_game_players'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['round_id'], ['rounds.id'], name=op.f('fk_round_suspects_round_id_rounds'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('round_id', 'player_id', name=op.f('pk_round_suspects'))
    )

    op.create_table('round_impostors',
    sa.Column('round_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('player_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('guessed_word', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['player_id'], ['game_players.id'], name=op.f('fk_round_impostors_player_id_game_players'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['round_id'], ['rounds.id'], name=op.f('fk_round_impostors_round_id_rounds'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('round_id', 'player_id', name=op.f('pk_round_impostors'))
    )
    op.create_index(op.f('ix_round_impostors_player_id'), 'round_impostors', ['player_id'], unique=False)
