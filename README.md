# TaskFlow - Team Task Management System

A full-stack task management application with Kanban board, role-based access control, deadline tracking, and PDF reporting.

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Recharts, @hello-pangea/dnd |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 15 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| PDF | PDFKit |
| Deployment | Docker + Docker Compose |

## 📋 Features

- **Role-Based Access Control** — Admin & User roles with separate permissions
- **Kanban Board** — Drag-and-drop tasks by status or by user
- **Deadline Tracking** — Color-coded indicators (green/orange/red)
- **Extension Requests** — Users request, admins approve/reject
- **PDF Reports** — Filter by status, user, date range
- **Activity Logs** — Full audit trail for every task action
- **Dashboard Analytics** — Charts and stats overview

## 🔐 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@taskflow.com | Admin@123 |

## 🐳 Quick Start with Docker

```bash
# Clone and start
git clone <repo>
cd taskflow
docker-compose up -d

# Access
Frontend: http://localhost:3000
Backend API: http://localhost:5000/api
```

## 💻 Local Development

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
npm install
npm run dev
# Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

## 🗄️ Database Schema

The app auto-creates tables on first start:

- **users** — User accounts with roles
- **tasks** — Task data with status tracking
- **task_history** — Full audit log
- **deadline_extensions** — Extension requests and approvals

## 📡 API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user
- `PUT /api/auth/change-password` — Change password

### Tasks
- `GET /api/tasks` — List tasks (with filters: status, assigned_to, search, page)
- `POST /api/tasks` — Create task
- `GET /api/tasks/:id` — Get task with history and extensions
- `PUT /api/tasks/:id` — Update task
- `PUT /api/tasks/:id/complete` — Mark complete
- `PUT /api/tasks/:id/confirm` — Admin confirm completion
- `POST /api/tasks/:id/extension` — Request extension
- `PUT /api/tasks/extensions/:id` — Admin approve/reject extension
- `DELETE /api/tasks/:id` — Delete task (admin)

### Users (Admin)
- `GET /api/users` — List users
- `POST /api/users` — Create user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Deactivate user

### Reports (Admin)
- `GET /api/reports/stats` — Dashboard statistics
- `GET /api/reports/pdf` — Download PDF report

## 🎨 UI Pages

| Page | Route | Access |
|------|-------|--------|
| Dashboard | /dashboard | All |
| My Tasks | /tasks | All |
| Kanban Board | /kanban | All |
| All Tasks | /admin/tasks | Admin |
| Extensions | /admin/extensions | Admin |
| Users | /admin/users | Admin |
| Reports | /admin/reports | Admin |
| Profile | /profile | All |

## 🔧 Environment Variables

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskflow_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_strong_secret
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@taskflow.com
ADMIN_PASSWORD=Admin@123
```
