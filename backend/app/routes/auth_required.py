from functools import wraps

import jwt
from flask import request, jsonify

from app.config import SECRET_KEY


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"message": "Authorization header is required"}), 401

        try:
            parts = auth_header.split(" ")
            if len(parts) != 2 or parts[0] != "Bearer":
                return jsonify({"message": "Invalid authorization format"}), 401

            decoded = jwt.decode(parts[1], SECRET_KEY, algorithms=["HS256"])
            request.user_id = decoded["user_id"]

        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid token"}), 401

        return f(*args, **kwargs)

    return decorated
