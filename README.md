Application development:

### Architecture

                 User
                  |
                  v
          Kubernetes Ingress
                  |
        +---------+---------+
        v                   v
   Frontend (React)    Backend (Flask API)
                            |
              +-------------+-------------+
              v                           v
         PostgreSQL                 Observability
              |                (Prometheus / Loki / Jaeger -> Grafana)
         PVC -> PV


| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create a user |
| POST | `/api/auth/login` | No | Get a JWT |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/tasks` | Yes | List my tasks |
| POST | `/api/tasks` | Yes | Create a task |
| GET | `/api/tasks/<id>` | Yes | Get one task |
| PUT | `/api/tasks/<id>` | Yes | Update a task |
| DELETE | `/api/tasks/<id>` | Yes | Delete a task |
| GET | `/api/health` | No | Liveness check |
| GET | `/api/db-health` | No | Database check |

### Database


users                          tasks
-----                          -----
id (PK)                        id (PK)
name                           title
email (unique)                 description
password (hashed)              priority
created_at                     status
                               due_date
one user -> many tasks         user_id (FK -> users.id)
                               created_at
                               updated_at


---

## 2. Roadmap and current status

| Phase | What | Status |
|---|---|---|
| 1 | Application: React + Flask + PostgreSQL | Done |
| 2 | Docker: Dockerfiles + Docker Compose | Images built and pushed to Docker Hub (`v2`). Dockerfiles are not in your notes. |
| 3 | CI/CD: GitHub + Jenkins | Planned |
| 4 | GCP: GKE cluster | Done (cluster is running) |
| 5 | Kubernetes: Deployment, Service, ConfigMap, Secret, PV/PVC, Ingress | Deployed with `kubectl`; Helm migration in progress |
| 6 | Observability: Prometheus, Grafana, Loki, Jaeger | Planned |
| 7 | Final CI/CD: Jenkins → Docker → GKE | Planned |

### Target project structure

```
task-management/
├── frontend/
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── models/
│   │   ├── database/
│   │   └── config/
│   ├── requirements.txt
│   ├── run.py
│   └── Dockerfile
├── database/init/
├── docker-compose.yml
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── backend-deployment.yaml
│   ├── backend-service.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   ├── postgres-deployment.yaml
│   ├── postgres-service.yaml
│   ├── postgres-pvc.yaml
│   └── ingress.yaml
├── monitoring/{prometheus,grafana,loki,jaeger}/
├── Jenkinsfile
└── README.md
```

---

## 3. Phase 1 — Application development

### Step 1 — Check your tools

```bash
docker --version
docker compose version
git --version
python3 --version
node --version
npm --version
gcloud --version
```

### Step 2 — Create the project folders

```bash
mkdir -p ~/task-management
cd ~/task-management

mkdir frontend backend database
mkdir -p backend/app/{routes,models,database,config}

touch backend/run.py
touch backend/app/__init__.py
touch backend/app/{routes,models,database,config}/__init__.py
```

### Step 3 — Start PostgreSQL with Docker Compose

Create `~/task-management/docker-compose.yml`:

services:
  postgres:
    image: postgres:16
    container_name: task-management-db
    environment:
      POSTGRES_DB: task_management
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: taskpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:

Start it and check:

docker compose up -d
docker compose ps
docker logs task-management-db      # optional

### Step 4 — Set up the Flask environment

cd ~/task-management/backend
python3 -m venv venv
source venv/bin/activate

pip install Flask Flask-CORS Flask-SQLAlchemy psycopg2-binary PyJWT
pip freeze > requirements.txt
```

### Step 5 — Configuration

Create: backend/app/config/__init__.py

import os

# Read from environment variables; the fallbacks are for local development only.
SECRET_KEY = os.getenv("JWT_SECRET", "my-secret-key")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://taskuser:taskpassword@localhost:5432/task_management",
)

### Step 6 — Models

backend/app/models/user.py

from datetime import datetime
from app import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    tasks = db.relationship(
        "Task",
        backref="user",
        lazy=True,
        cascade="all, delete-orphan",
    )

backend/app/models/task.py

from datetime import datetime
from app import db


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    priority = db.Column(db.String(20), nullable=False, default="MEDIUM")
    status = db.Column(db.String(20), nullable=False, default="TODO")
    due_date = db.Column(db.DateTime, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

### Step 7 — Flask application factory

backend/app/__init__.py


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

backend/run.py

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)


### Step 8 — Authentication API

backend/app/routes/auth.py

from datetime import datetime, timedelta

import jwt
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

from app import db
from app.config import SECRET_KEY
from app.models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({"message": "Name, email and password are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    user = User(
        name=name,
        email=email,
        password=generate_password_hash(password),
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "User registered successfully",
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"message": "Invalid email or password"}), 401

    token = jwt.encode(
        {"user_id": user.id, "exp": datetime.utcnow() + timedelta(hours=24)},
        SECRET_KEY,
        algorithm="HS256",
    )

    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }), 200


@auth_bp.route("/me", methods=["GET"])
def me():
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return jsonify({"message": "Authorization header is required"}), 401

    try:
        token = auth_header.split(" ")[1]
        decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = User.query.get(decoded["user_id"])

        if not user:
            return jsonify({"message": "User not found"}), 404

        return jsonify({"id": user.id, "name": user.name, "email": user.email}), 200
    except Exception:
        return jsonify({"message": "Invalid or expired token"}), 401

### Step 9 — JWT decorator for protected routes

backend/app/routes/auth_required.py

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

### Step 10 — Task CRUD API (with due date)

backend/app/routes/tasks.py

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
    tasks = Tascurl http://localhost:5000/k.query.filter_by(user_id=request.user_id).all()
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


### Step 11 — Run the backend

PostgreSQL must be running first.

cd ~/task-management/backend
source venv/bin/activate
python -m py_compile app/routes/tasks.py   # no output = syntax OK
python run.py

If an old `app.py` is still there from the first draft, delete it once `run.py` works: `rm app.py`.

### Step 12 — Test the backend with curl

Open a second terminal.

**1. Health checks**

```bash
curl http://localhost:5000/
curl http://localhost:5000/api/health
curl http://localhost:5000/api/db-health
```

Expected for `db-health`:

```json
{ "database": "PostgreSQL", "message": "Database connection successful", "status": "UP" }
```

**2. Check the tables**

```bash
docker exec -it task-management-db psql -U taskuser -d task_management
```

```
\dt        -- should list: tasks, users
\d users
\d tasks
\q
```

**3. Register**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Vishal", "email": "vishal@example.com", "password": "Password123"}'
```

Verify the password is hashed in the database:

```sql
SELECT id, name, email, password FROM users;   -- password starts with pbkdf2:sha256:...
```

**4. Login and save the token**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "vishal@example.com", "password": "Password123"}'

TOKEN="paste_the_full_token_here"
echo $TOKEN        # must not be empty, or every call returns "Invalid token"
```curl http://localhost:5000/

**5. Protected route**

```bash
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"   # returns your user
curl http://localhost:5000/api/auth/me                                    # "Authorization header is required"
```

**6. Task CRUD**

```bash
# Create
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Learn Kubernetes",
    "description": "Complete Kubernetes hands-on practice",
    "priority": "HIGH",
    "status": "TODO",
    "due_date": "2026-10-01"
  }'

# List
curl http://localhost:5000/api/tasks -H "Authorization: Bearer $TOKEN"

# Get one
curl http://localhost:5000/api/tasks/1 -H "Authorization: Bearer $TOKEN"

# Update
curl -X PUT http://localhost:5000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "IN_PROGRESS", "priority": "MEDIUM"}'

# Delete
curl -X DELETE http://localhost:5000/api/tasks/1 -H "Authorization: Bearer $TOKEN"
```

Common mistake: a missing comma in the JSON body (for example after `"status": "TODO"`) makes the request fail.

**Backend checklist**

- [x] Register, Login, JWT, protected routes
- [x] Create, list, get, update, delete tasks
- [x] Due date support
- [x] PostgreSQL tables created automatically

---

### Step 13 — Create the React frontend

```bash
cd ~/task-management/frontend
npm create vite@latest . -- --template react
npm install
npm install react-router-dom
mkdir -p src/pages
npm run dev          # http://localhost:5173
```

Create `frontend/.env` so the API address is not hard-coded:

```
VITE_API_URL=http://localhost:5000
```

`frontend/src/config.js`

```js
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
```

Final structure:

```
frontend/src/
├── App.jsx
├── main.jsx          (leave unchanged)
├── config.js
└── pages/
    ├── Login.jsx
    ├── Register.jsx
    └── Dashboard.jsx
```

### Step 14 — Routing

`frontend/src/App.jsx`

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

function App() {
  const token = localStorage.getItem("token");

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={token ? "/dashboard" : "/login"} />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={token ? <Dashboard /> : <Navigate to="/login" />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

| URL | Page |
|---|---|
| `/` | Redirects to Dashboard (logged in) or Login |
| `/login` | Login |
| `/register` | Register |
| `/dashboard` | Dashboard (protected, needs a token) |

### Step 15 — Login page

`frontend/src/pages/Login.jsx`

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        navigate("/dashboard");
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Task Management</h1>
        <p>Login to your account</p>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>Login</button>
        </form>

        {message && <p>{message}</p>}

        <p>
          Don't have an account?{" "}
          <button onClick={() => navigate("/register")} style={styles.linkButton}>
            Register
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f6f8",
  },
  card: {
    width: "400px",
    padding: "40px",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "15px",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  linkButton: {
    border: "none",
    background: "none",
    color: "#2563eb",
    cursor: "pointer",
  },
};

export default Login;
```

### Step 16 — Register page

`frontend/src/pages/Register.jsx`

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      setMessage("All fields are required");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage("Registration successful!");
        setName("");
        setEmail("");
        setPassword("");
        setTimeout(() => navigate("/login"), 1000);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1>Task Management</h1>
        <p>Create your account</p>

        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>Register</button>
        </form>

        {message && <p style={styles.message}>{message}</p>}

        <p>
          Already have an account?{" "}
          <button onClick={() => navigate("/login")} style={styles.linkButton}>
            Login
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#c7ced7",
  },
  card: {
    width: "400px",
    padding: "40px",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "15px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "16px",
  },
  message: {
    padding: "10px",
    background: "#eef2ff",
    borderRadius: "6px",
    marginTop: "15px",
  },
  linkButton: {
    border: "none",
    background: "none",
    color: "#2563eb",
    cursor: "pointer",
    fontSize: "15px",
  },
};

export default Register;
```

### Step 17 — Dashboard (create, list, update status, delete, due date)

`frontend/src/pages/Dashboard.jsx`

```jsx
import { useEffect, useState } from "react";
import { API_URL } from "../config";

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [status, setStatus] = useState("TODO");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");

  const token = localStorage.getItem("token");
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // ---------- API calls ----------

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_URL}/api/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) setTasks(data.tasks);
      else setMessage(data.message);
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  const createTask = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/tasks`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          description,
          priority,
          status,
          due_date: dueDate || null,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage("Task created successfully!");
        setTitle("");
        setDescription("");
        setPriority("MEDIUM");
        setStatus("TODO");
        setDueDate("");
        fetchTasks();
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  // TODO -> IN_PROGRESS -> COMPLETED -> TODO
  const updateTask = async (taskId, currentStatus) => {
    const newStatus =
      currentStatus === "TODO"
        ? "IN_PROGRESS"
        : currentStatus === "IN_PROGRESS"
        ? "COMPLETED"
        : "TODO";

    try {
      const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();

      if (response.ok) {
        setMessage("Task status updated!");
        fetchTasks();
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    try {
      const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        setMessage("Task deleted successfully!");
        fetchTasks();
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Backend server is not reachable");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  useEffect(() => {
    if (token) fetchTasks();
  }, []);

  const formatDate = (date) =>
    date
      ? new Date(date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No due date";

  // ---------- UI ----------

  return (
    <div style={styles.container}>
      <div style={styles.dashboard}>
        <div style={styles.header}>
          <div>
            <h1>Task Management Dashboard</h1>
            <p>Manage your tasks</p>
          </div>
          <button onClick={logout} style={styles.logoutButton}>Logout</button>
        </div>

        <div style={styles.formCard}>
          <h2>Create New Task</h2>
          <form onSubmit={createTask}>
            <input
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
            />
            <textarea
              placeholder="Task description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={styles.textarea}
            />

            <label style={styles.label}>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={styles.input}
            >
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>

            <label style={styles.label}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={styles.input}
            >
              <option value="TODO">TODO</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>

            <button type="submit" style={styles.createButton}>Create Task</button>
          </form>
        </div>

        {message && <div style={styles.message}>{message}</div>}

        <h2>My Tasks</h2>

        {tasks.length === 0 ? (
          <p style={styles.noTasks}>No tasks found.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} style={styles.taskCard}>
              <h3>{task.title}</h3>
              <p>{task.description || "No description"}</p>
              <p><strong>Priority:</strong> {task.priority}</p>
              <p><strong>Status:</strong> {task.status}</p>
              <p><strong>Due Date:</strong> {formatDate(task.due_date)}</p>

              <div style={styles.actions}>
                <button
                  onClick={() => updateTask(task.id, task.status)}
                  style={styles.updateButton}
                >
                  Update Status
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  style={styles.deleteButton}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "#c7ced7",
    padding: "40px",
    boxSizing: "border-box",
  },
  dashboard: {
    maxWidth: "900px",
    margin: "auto",
    background: "white",
    padding: "30px",
    borderRadius: "12px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
  },
  formCard: {
    padding: "20px",
    border: "1px solid #1a1818",
    borderRadius: "10px",
    marginBottom: "30px",
  },
  label: { display: "block", marginBottom: "6px", fontWeight: "600" },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "12px",
    border: "1px solid #080606",
    borderRadius: "6px",
    boxSizing: "border-box",
    fontSize: "15px",
  },
  textarea: {
    width: "100%",
    height: "100px",
    padding: "12px",
    marginBottom: "12px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    boxSizing: "border-box",
    resize: "vertical",
    fontSize: "15px",
  },
  createButton: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "16px",
  },
  logoutButton: {
    padding: "10px 20px",
    background: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  message: {
    padding: "10px",
    background: "#eef2ff",
    borderRadius: "6px",
    marginBottom: "20px",
  },
  noTasks: { textAlign: "center", padding: "20px" },
  taskCard: {
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "15px",
  },
  actions: { display: "flex", gap: "10px", marginTop: "15px" },
  updateButton: {
    padding: "10px 15px",
    background: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  deleteButton: {
    padding: "10px 15px",
    background: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default Dashboard;
```

### Step 18 — Test the full flow in the browser

Run backend (`python run.py`) and frontend (`npm run dev`), then open `http://localhost:5173`.

1. Open `/register`, create a user, and confirm you land on Login.
2. Log in and confirm you reach `/dashboard`.
3. Check DevTools → Application → Local Storage for a `token`.
4. Create a task with a title, priority, status and due date, and confirm the card shows the due date.
5. Click **Update Status** three times: `TODO → IN_PROGRESS → COMPLETED → TODO`.
6. Click **Delete** and confirm the dialog removes the task.
7. Click **Logout**, then open `/dashboard` directly. It should redirect to `/login`.

**Phase 1 checklist**

- [x] Register, Login, Logout
- [x] Protected dashboard
- [x] Create, list, update status, delete
- [x] Priority, status, due date
- [ ] Search and filter (next feature)
- [ ] Dashboard statistics

---

## 4. Phase 2 — Docker

**Goal:** run the whole app in containers locally first, then reuse the same images on Kubernetes.

```
React   -> Docker container
Flask   -> Docker container
PostgreSQL -> Docker container
```

`docker compose up` runs all three, using Docker networking, volumes and environment variables.

Your notes show this workflow:

```
Local Ubuntu (source code)
   -> docker build
   -> Docker Hub
   -> GKE (deployed from Cloud Shell)
```

Images currently in use:

| Component | Image |
|---|---|
| Backend | `devoopsguru/task-management-backend:v2` |
| Frontend | `devoopsguru/task-management-frontend:v2` |
| Database | `postgres:16` |

Build and push pattern:

```bash
docker build -t devoopsguru/task-management-backend:v2 ./backend
docker build -t devoopsguru/task-management-frontend:v2 ./frontend

docker push devoopsguru/task-management-backend:v2
docker push devoopsguru/task-management-frontend:v2
```

### Backend Dockerfile (`backend/Dockerfile`)

```dockerfile
FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "run:app"]
```

`gunicorn` is included in `backend/requirements.txt`; it serves the Flask app without the development server.

### Frontend Dockerfile (`frontend/Dockerfile`)

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:5001
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
```

`frontend/nginx.conf` enables client-side route fallback so refreshing `/login` or `/dashboard` serves the React app:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Full Compose file (`docker-compose.yml`)

```yaml
services:
  postgres:
    image: postgres:16
    container_name: task-management-db
    environment:
      POSTGRES_DB: task_management
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: taskpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskuser -d task_management"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://taskuser:taskpassword@postgres:5432/task_management
      JWT_SECRET: local-development-secret
    ports:
      - "5001:5000"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_URL: ${VITE_API_URL:-http://localhost:5001}
    ports:
      - "5173:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

>> Run:    gcloud container clusters get-credentials <cluster-name> --zone <zone> --project <project-id>

>> Run: 
Step 1: Generate it into a separate file

KUBECONFIG=$HOME/gke-config gcloud container clusters get-credentials my-gke-cluster --zone asia-south1-a --project ecstatic-gantry-232512

Step 2: Check it has only one cluster

KUBECONFIG=$HOME/gke-config kubectl config get-contexts

Step 3: Test it

KUBECONFIG=$HOME/gke-config kubectl get nodes

Step 4: Upload to Jenkins
Manage Jenkins → Credentials → Global → Add Credentials

Kind: Secret file
File: ~/gke-config (from your laptop)
ID: gke-kubeconfig

---
cp ~/gke-config /tmp/gke-config
chmod 644 /tmp/gke-config
sudo -u jenkins -H env KUBECONFIG=/tmp/gke-config kubectl get nodes
rm /tmp/gke-config

---

## 5. Phase 4–5 — GKE and Kubernetes

### Kubernetes building blocks used

| Concept | Purpose | In this project |
|---|---|---|
| **ConfigMap** | Non-sensitive config | `backend-config`: `DB_HOST`, `DB_PORT`, `DB_NAME` (also planned: `BACKEND_URL`, `LOG_LEVEL`) |
| **Secret** | Sensitive values | `postgres-secret`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (planned: `JWT_SECRET`) |
| **PV / PVC** | Persistent database storage | `postgres-pvc`, 10Gi, `ReadWriteOnce`, class `standard-rwo` |
| **Deployment** | Runs and updates pods | `frontend`, `backend`, `postgres` |
| **Service** | Stable internal address | `frontend` (80), `backend` (5021), `postgres` (5432) |
| **Ingress** | External HTTP entry point | `task-management-ingress` |

Storage chain: `PostgreSQL → PersistentVolumeClaim → PersistentVolume → persistent disk`.

### Current deployed state (namespace `task-management`)

| Resource | Name | State |
|---|---|---|
| Pods | `backend`, `frontend`, `postgres` | All `1/1 Running` |
| Services | `backend` (ClusterIP, 5021), `frontend` (ClusterIP, 80), `postgres` (ClusterIP, 5432) | Active |
| Deployments | `backend`, `frontend`, `postgres` | 1/1 available |
| PVC | `postgres-pvc` | Bound, 10Gi |
| Ingress | `task-management-ingress` | Address `34.36.147.122`, port 80 |
| Secret / ConfigMap | `postgres-secret`, `backend-config` | Present |

These were created with `kubectl`, not Helm.

Health check commands:

```bash
kubectl get all -n task-management
kubectl get pvc -n task-management
kubectl get ingress -n task-management
```

---

## 6. Helm migration (in progress)

**Goal:** manage the existing `kubectl`-created resources as one Helm release without deleting anything. The Postgres PVC holds your data, so it must never be deleted or recreated.

Chart location (Cloud Shell): `~/helm/task-management`

### Done

**Step 1 — Validate the chart**

```bash
cd ~/helm/task-management
helm lint .
helm template task-management . --namespace task-management > rendered.yaml
grep -n "DATABASE_URL\|POSTGRES_PASSWORD\|image:" rendered.yaml
kubectl apply --dry-run=client -f rendered.yaml
helm list -n task-management
```

Results:

- `helm lint`: 1 chart linted, 0 failed.
- `helm template`: renders the secret, configmap, PVC, 3 services, 3 deployments and the ingress (10 resources).
- Dry-run: all 10 resources validate.
- `helm list`: empty, so no release exists yet.

**Step 2 — Do not run `helm install` yet**

The resources already exist but have no Helm ownership metadata, so Helm would refuse to take them over.

**Step 3 — Adopt the Secret first (test on one resource)**

```bash
kubectl label secret postgres-secret -n task-management \
  app.kubernetes.io/managed-by=Helm --overwrite

kubectl annotate secret postgres-secret -n task-management \
  meta.helm.sh/release-name=task-management \
  meta.helm.sh/release-namespace=task-management --overwrite

kubectl get secret postgres-secret -n task-management -o yaml   # verify label + annotations
```

### Next (proposed, not yet done in your notes)

**Step 4 — Adopt the remaining resources**, with the PVC last:

```bash
for r in configmap/backend-config \
         service/backend service/frontend service/postgres \
         deployment/backend deployment/frontend deployment/postgres \
         ingress/task-management-ingress \
         pvc/postgres-pvc; do
  kubectl label $r -n task-management app.kubernetes.io/managed-by=Helm --overwrite
  kubectl annotate $r -n task-management \
    meta.helm.sh/release-name=task-management \
    meta.helm.sh/release-namespace=task-management --overwrite
done
```

**Step 5 — Preview, then install**

```bash
helm upgrade --install task-management . -n task-management --dry-run
helm upgrade --install task-management . -n task-management
helm list -n task-management
kubectl get all -n task-management
```

**Step 6 — Verify**: pods still `Running`, PVC still `Bound`, and the app still loads at the ingress IP.

---

## 7. Phase 3 and 7 — CI/CD with Jenkins (planned)

```
Developer -> GitHub -> Jenkins
  -> Checkout code
  -> Run tests
  -> Build Docker image
  -> Scan Docker image
  -> Push image
  -> Deploy to GKE
  -> Kubernetes rollout
  -> Application running
```

| Stage | What it does |
|---|---|
| Checkout | Pull the repo from GitHub |
| Test | Run backend and frontend tests |
| Build | `docker build` for backend and frontend |
| Scan | Vulnerability scan on the images |
| Push | Push tagged images to the registry |
| Deploy | `helm upgrade --install` (or `kubectl apply`) on GKE |
| Rollout | `kubectl rollout status` to confirm the release |

The `Jenkinsfile` lives in the repository root.

---

## 8. Phase 6 — Observability (planned)

```
Observability
   ├── Metrics -> Prometheus -> Grafana
   ├── Logs    -> Loki       -> Grafana
   └── Traces  -> Jaeger
```

| Tool | Collects |
|---|---|
| **Prometheus** | CPU, memory, pod usage, request count, request latency, error rate |
| **Grafana** | Dashboards: app health, CPU, memory, requests/sec, HTTP 4xx, HTTP 5xx, response time, pod status |
| **Loki** | Application logs, for example `INFO Task created`, `INFO User logged in`, `ERROR Database connection failed` |
| **Jaeger** | Request path: User → React → Flask API → PostgreSQL |

---

## 9. Cleanup list and next steps

### Security and config fixes

| Issue | Where | Fix |
|---|---|---|
| JWT secret defaults to `my-secret-key` | `app/config/__init__.py` | Set `JWT_SECRET` from a Kubernetes Secret and remove the default in production. |
| DB password in plain text | `values.yaml` / rendered `postgres-secret` | Create the secret outside the chart or use a secrets manager. Do not commit real passwords. |
| `debug=True` in `run.py` | Backend | Use gunicorn in the container and turn debug off. |
| `localhost:5000` API URL | Frontend | Set `VITE_API_URL` at build time for the cluster (it is baked into the image). |
| Open CORS (`CORS(app)`) | Backend | Restrict to your frontend origin. |
| Token in `localStorage` | Frontend | Acceptable for learning; consider httpOnly cookies later. |
| `datetime.utcnow()` is deprecated | Models and auth | Use `datetime.now(timezone.utc)`. |
| `db.create_all()` at startup | Backend | Move to migrations (Flask-Migrate) once the schema changes. |

### Next steps in order

1. Finish the Helm migration (Section 6, Steps 4–6).
2. Add the Dockerfiles and a full `docker-compose.yml` to the repo.
3. Push the code to GitHub.
4. Build the Jenkins pipeline.
5. Add search, filter and dashboard stats to the frontend.
6. Add Prometheus, Grafana, Loki and Jaeger.

---

## Notes on this rewrite

- Your original file was a chat log mixed with terminal output. This guide keeps the working code and commands and drops the conversation, the repeated drafts and the error back-and-forth.
- Parts of the original code were cut off in the file (the `login` function and the end of `tasks.py`). I rebuilt them from the surrounding steps: the token expiry of 24 hours and the `Invalid email or password` message are my choices.
- I made three small changes: settings now come from environment variables (`app/config`), the task routes use shared helper functions, and the frontend reads `VITE_API_URL`. Behavior is the same as your original.
- Section 6 Steps 4–6 and Section 9 are suggestions, not things you have already run.