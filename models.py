from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Score(db.Model):
    """Recorde por jogo: um registro por usuário logado OU por sessão anônima."""
    __tablename__ = "scores"
    __table_args__ = (
        db.UniqueConstraint("game", "user_id", name="uq_score_game_user"),
        db.UniqueConstraint("game", "session_key", name="uq_score_game_session"),
    )
    id = db.Column(db.Integer, primary_key=True)
    game = db.Column(db.String(32), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    session_key = db.Column(db.String(64), nullable=True)
    best = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
