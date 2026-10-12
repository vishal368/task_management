import os

# Read from environment variables; the fallbacks are for local development only.
SECRET_KEY = os.getenv("JWT_SECRET", "my-secret-key")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://taskuser:taskpassword@localhost:5432/task_management",
)