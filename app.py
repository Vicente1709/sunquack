import os
import re
import secrets

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect, CSRFError
from sqlalchemy.exc import IntegrityError
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from models import Score, User, db

load_dotenv()

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")
GAMES = {"duck"}
MAX_SCORE = 1_000_000
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s]{2,}$")


def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)  # Render usa proxy

    uri = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
    if uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)

    app.config.update(
        SECRET_KEY=os.environ["SECRET_KEY"],
        SQLALCHEMY_DATABASE_URI=uri,
        SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True, "pool_recycle": 300},
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=not os.environ.get("DEV"),
        MAX_CONTENT_LENGTH=16 * 1024,
    )

    db.init_app(app)
    CSRFProtect(app)
    limiter = Limiter(get_remote_address, app=app, storage_uri="memory://")

    with app.app_context():
        db.create_all()

    @app.after_request
    def security_headers(resp):
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self' data:; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return resp

    def err(msg, code=400):
        return jsonify(ok=False, error=msg), code

    def clean(data, key):
        v = data.get(key, "")
        return v.strip() if isinstance(v, str) else ""

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.get("/api/me")
    def me():
        uid = session.get("uid")
        user = db.session.get(User, uid) if uid else None
        return jsonify(ok=True, user=user.username if user else None)

    @app.post("/api/register")
    @limiter.limit("5/minute")
    def register():
        data = request.get_json(silent=True) or {}
        username, email = clean(data, "username"), clean(data, "email").lower()
        password = data.get("password") if isinstance(data.get("password"), str) else ""

        if not USERNAME_RE.fullmatch(username):
            return err("Usuário: 3 a 20 caracteres (letras, números e _).")
        if len(email) > 254 or not EMAIL_RE.fullmatch(email):
            return err("E-mail inválido.")
        if not 8 <= len(password) <= 72:
            return err("A senha deve ter de 8 a 72 caracteres.")

        user = User(
            username=username,
            email=email,
            password_hash=generate_password_hash(password),
        )
        db.session.add(user)  # ORM = consulta parametrizada
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return err("Usuário ou e-mail já cadastrado.", 409)

        session.clear()
        session["uid"] = user.id
        return jsonify(ok=True, user=user.username), 201

    @app.post("/api/login")
    @limiter.limit("10/minute")
    def login():
        data = request.get_json(silent=True) or {}
        ident = clean(data, "identifier").lower()
        password = data.get("password") if isinstance(data.get("password"), str) else ""
        if not ident or not password or len(ident) > 254 or len(password) > 72:
            return err("Credenciais inválidas.", 401)

        user = User.query.filter(
            (db.func.lower(User.username) == ident) | (User.email == ident)
        ).first()
        if not user or not check_password_hash(user.password_hash, password):
            return err("Credenciais inválidas.", 401)

        session.clear()
        session["uid"] = user.id
        return jsonify(ok=True, user=user.username)

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.errorhandler(CSRFError)
    def csrf_error(_):
        return err("Sessão expirada. Recarregue a página.", 400)

    @app.errorhandler(429)
    def too_many(_):
        return err("Muitas tentativas. Aguarde um minuto.", 429)

    def score_owner():
        """Filtro do dono do recorde: usuário logado ou sessão anônima."""
        uid = session.get("uid")
        if uid:
            return {"user_id": uid}
        sid = session.get("sid")
        if not sid:
            sid = session["sid"] = secrets.token_hex(16)
        return {"session_key": sid}

    @app.get("/api/score/<game>")
    def get_score(game):
        if game not in GAMES:
            return err("Jogo inválido.", 404)
        row = Score.query.filter_by(game=game, **score_owner()).first()
        return jsonify(ok=True, best=row.best if row else 0)

    @app.post("/api/score")
    @limiter.limit("30/minute")
    def post_score():
        data = request.get_json(silent=True) or {}
        game, score = data.get("game"), data.get("score")
        if game not in GAMES:
            return err("Jogo inválido.")
        if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= MAX_SCORE:
            return err("Pontuação inválida.")

        owner = score_owner()
        for _ in range(2):  # 2ª tentativa cobre corrida na criação do registro
            row = Score.query.filter_by(game=game, **owner).first()
            if row is None:
                row = Score(game=game, best=score, **owner)
                db.session.add(row)
            elif score > row.best:
                row.best = score
            try:
                db.session.commit()
                return jsonify(ok=True, best=row.best)
            except IntegrityError:
                db.session.rollback()
        return err("Não foi possível salvar.", 500)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=bool(os.environ.get("DEV")))
