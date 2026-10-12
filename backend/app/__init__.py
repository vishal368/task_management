from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

from app.config import DATABASE_URL

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)
    CORS(app)

    app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # Import models and routes after db.init_app to avoid circular imports
    from app.models.user import User
    from app.models.task import Task
    from app.routes.auth import auth_bp
    from app.routes.tasks import tasks_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(tasks_bp)

    with app.app_context():
        db.create_all()

    @app.route("/")
    def home():
        return {"message": "Task Management API is running"}

    @app.route("/api/health")
    def health():
        return {"status": "UP", "service": "task-management-backend"}

    @app.route("/api/db-health")
    def db_health():
        try:
            db.session.execute(db.text("SELECT 1"))
            return {
                "status": "UP",
                "database": "PostgreSQL",
                "message": "Database connection successful",
            }
        except Exception as e:
            return {"status": "DOWN", "database": "PostgreSQL", "error": str(e)}, 500

    return app