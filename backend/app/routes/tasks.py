from datetime import datetime

from flask import Blueprint, request, jsonify

from app import db
from app.models.task import Task
from app.routes.auth_required import token_required

tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")


def task_to_dict(task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "user_id": task.user_id,
    }


def parse_due_date(value):
    """Return (datetime | None, error_response | None)."""
    if not value:
        return None, None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")), None
    except ValueError:
        return None, (jsonify({"message": "Invalid due_date format"}), 400)


def get_user_task(task_id):
    # Users can only touch their own tasks
    return Task.query.filter_by(id=task_id, user_id=request.user_id).first()


# CREATE
@tasks_bp.route("", methods=["POST"])
@token_required
def create_task():
    data = request.get_json()

    if not data.get("title"):
        return jsonify({"message": "Title is required"}), 400

    due_date, error = parse_due_date(data.get("due_date"))
    if error:
        return error

    task = Task(
        title=data["title"],
        description=data.get("description"),
        priority=data.get("priority", "MEDIUM"),
        status=data.get("status", "TODO"),
        due_date=due_date,
        user_id=request.user_id,
    )
    db.session.add(task)
    db.session.commit()

    return jsonify({
        "message": "Task created successfully",
        "task": task_to_dict(task),
    }), 201


# READ ALL
@tasks_bp.route("", methods=["GET"])
@token_required
def get_tasks():
    tasks = Task.query.filter_by(user_id=request.user_id).all()
    return jsonify({"tasks": [task_to_dict(t) for t in tasks]}), 200


# READ ONE
@tasks_bp.route("/<int:task_id>", methods=["GET"])
@token_required
def get_task(task_id):
    task = get_user_task(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404
    return jsonify({"task": task_to_dict(task)}), 200


# UPDATE
@tasks_bp.route("/<int:task_id>", methods=["PUT"])
@token_required
def update_task(task_id):
    task = get_user_task(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404

    data = request.get_json()

    for field in ("title", "description", "priority", "status"):
        if field in data:
            setattr(task, field, data[field])

    if "due_date" in data:
        due_date, error = parse_due_date(data["due_date"])
        if error:
            return error
        task.due_date = due_date

    db.session.commit()

    return jsonify({
        "message": "Task updated successfully",
        "task": task_to_dict(task),
    }), 200


# DELETE
@tasks_bp.route("/<int:task_id>", methods=["DELETE"])
@token_required
def delete_task(task_id):
    task = get_user_task(task_id)
    if not task:
        return jsonify({"message": "Task not found"}), 404

    db.session.delete(task)
    db.session.commit()

    return jsonify({"message": "Task deleted successfully"}), 200
