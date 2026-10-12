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