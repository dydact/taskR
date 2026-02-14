# TaskR - Task Management Platform

## Quick Start
```bash
# 1. Ensure Colima/Docker is running
docker context use colima

# 2. Start backend services
cd /Users/dydact/dev/platform/taskR.migrated
docker compose up -d

# 3. Seed database (first time only)
.venv/bin/python scripts/seed_demo.py --tenant demo --db "postgresql://taskr:taskr@localhost:5433/taskr"

# 4. Start frontend
cd apps/web && npm run dev
# Access at http://localhost:5173
```

## Project Overview
TaskR is a ClickUp/Motion-style task management platform that supports both standalone operation and integration with the Dydact unified console.

## Architecture

### Frontend (apps/web/)
- **Framework**: React 18 + TypeScript + Vite
- **State Management**: React Context (ShellContext)
- **Styling**: CSS with glass morphism design system (`--plane-*` variables)
- **Drag & Drop**: @dnd-kit library

### Backend (services/api/)
- **Framework**: FastAPI (Python 3.11)
- **Database**: PostgreSQL 16 (port 5433)
- **Cache**: Redis 7 (port 6379)
- **Messaging**: NATS 2.10 (port 14222, monitor: 18222)
- **Storage**: MinIO (ports 9100, 9101)

## Authentication & Tenancy

### Multi-Tenant Architecture
TaskR uses a multi-tenant architecture where all data is scoped by tenant. **Every API request must include tenant headers.**

### Required Headers
```
X-Tenant-ID: <tenant_slug>    # e.g., "demo"
X-User-Key: <user_email>      # e.g., "user@example.com" (optional for some endpoints)
```

### Database Tables
- `tr_tenant` - Tenant registry (tenant_id, slug, name, status)
- `tr_user` - Users per tenant
- All other tables have `tenant_id` foreign key

### Default Development Tenant
```
Tenant ID: 1a744020-98e9-57c5-ad93-d9d4dc4f8eb6
Slug: demo
Name: Demo
```

### Demo Users
| Email | Name |
|-------|------|
| cecilia.collins@example.com | Cecilia Collins |
| marco.igwe@example.com | Marco Igwe |
| avery.liang@example.com | Avery Liang |

## Development Setup

### Start Backend Services
```bash
cd /Users/dydact/dev/platform/taskR.migrated
docker compose up -d
```

### Seed Database (if empty)
```bash
.venv/bin/python scripts/seed_demo.py \
  --api http://localhost:8010 \
  --tenant demo \
  --db "postgresql://taskr:taskr@localhost:5433/taskr"
```

### Start Frontend
```bash
cd apps/web
npm run dev
# Access at http://localhost:5173
```

### Docker Services
| Service | Internal Port | External Port |
|---------|--------------|---------------|
| API | 8000 | 8010 |
| Postgres | 5432 | 5433 |
| Redis | 6379 | 6379 |
| NATS | 4222 | 14222 |
| NATS Monitor | 8222 | 18222 |
| MinIO | 9000/9001 | 9100/9101 |

## API Endpoints

### Core Resources
- `/spaces` - Workspace containers
- `/lists` - Task lists within spaces
- `/tasks` - Individual tasks
- `/folders` - List organization
- `/docs` - Documents attached to tasks

### User & Preferences
- `/preferences` - User preference state (theme, view mode, etc.)
- `/user-preferences` - Key-value user preferences
- `/profile` - User profile data

### AI & Automation
- `/ai/jobs` - AI job queue
- `/chat` - Chat sessions
- `/dedicated` - Dedicated AI agent streams (SSE)

### Analytics
- `/analytics/spaces/{id}/summary` - Space analytics
- `/analytics/spaces/{id}/velocity` - Velocity metrics

## AI Features

### Agent Workers (when AI enhanced)
Six AI agents available in sidebar:
- **Kairos** - Task orchestration
- **Sentinel** - Monitoring & alerts
- **Oracle** - Insights & predictions
- **Tempo** - Scheduling optimization
- **Nexus** - Integration coordination
- **Polaris** - Policy enforcement

### AI Toggle
AI features are gated by `aiEnhanced` preference in ShellContext. Use `useAIFeatures()` hook to check.

## Views & Components

### Available Views (apps/web/src/views/)
| View | Status | Description |
|------|--------|-------------|
| ListView | ✅ Working | Default task list view |
| BoardView | ✅ Working | Kanban board with drag & drop |
| CalendarView | ✅ Working | Calendar layout |
| DashboardView | ✅ Working | Modern dashboard with AI insights |
| GanttView | ⚠️ Partial | Timeline view, falls back to mock data |
| InboxView | ✅ Working | Notification inbox |
| GoalsView | ✅ Working | Goals tracking |
| DocsView | ✅ Working | Document management |
| DedicatedView | ✅ Working | AI agent dedicated interface |
| ClaimsView | ❌ Healthcare | Requires Scraiv backend |
| HRView | ❌ Healthcare | Requires HR service |

### Key Components
- `Sidebar.tsx` - Navigation with spaces, lists, and AI agents
- `AgentWorkersSidebar.tsx` - AI agent list (when aiEnhanced=true)
- `TaskCard.tsx` - Draggable task card
- `TaskCardOverlay.tsx` - Drag preview overlay
- `TaskDrawer.tsx` - Task detail panel

## Vite Proxy Configuration
The frontend proxies these paths to the API (localhost:8010):
```
analytics, dashboards, spaces, tasks, lists, folders,
comments, user-preferences, subtasks, preferences,
docs, events, health, chat, summaries, hr
```

## Common Issues

### "Tenant not found" / 404 errors
- Database needs seeding: run `seed_demo.py`
- Missing tenant header in requests

### Docker connection errors
- Ensure Colima is running: `colima status`
- Set correct context: `docker context use colima`
- Restart if needed: `colima restart`

### Port conflicts
- NATS monitor uses 18222 (not 8222) to avoid conflict with global dydact-nats
- TaskR Postgres uses 5433 (not 5432)

## Platform Integration (Dydact)

### Genesis Protocol
TaskR integrates with the Dydact platform's Genesis Protocol for AI agent management:

- **Kairos** - ReAct loop agent executor, delegates to ToolFront
- **DeptX** - Department/team management, maps to `tr_deptx_department` and `tr_deptx_agent`
- **Polaris** - Policy enforcement and permissions
- **Exo** - Budget caps and token limits

### Gateway Integration
The unified Gateway service routes messages:
- Platform agent (Dydact) → Kairos System profile
- Sub-agents (e.g., ReputationBot) → Kairos Agent profile
- Tenant-scoped channel adapters for Slack, Discord, etc.

### Auth Flow
```
Client → Gateway (WS) → TenantHeaders validation → Agent routing
                     ↓
              X-Tenant-ID + X-Agent-ID headers
```

### MemPODS Integration
Every agent gets a unique `agent_id` mapped to a MemPODS Dossier for:
- Persistent "Social Profile"
- Memory stream
- Cross-session context

## Recent Changes (2026-02-04)

### Docker & Infrastructure Fixes
- **NATS port conflict resolved**: Changed default NATS monitor port from 8222 to 18222 in `docker-compose.yml` to avoid conflict with global `dydact-nats` container
- **Removed obsolete `version` attribute** from `docker-compose.yml` (Docker Compose v2+ ignores it)
- **Postgres timeout fix**: Increased startup timeout from 15s to 45s in `start-dydact.sh` (line ~435)
- **Docker context issues**: After Docker reinstall, context switches to `desktop-linux` - must run `docker context use colima`

### Frontend Fixes
- **Favicon fix**: Added symlink `public/favicon.ico → brand/taskr-favicon.png` to prevent 404 errors
- **Updated index.html**: Added SVG favicon fallback

### Database Seeding
Database was empty causing all 404 errors. Seeded with:
```bash
.venv/bin/python scripts/seed_demo.py --tenant demo --db "postgresql://taskr:taskr@localhost:5433/taskr"
```

Created:
- Tenant: `demo` (ID: `1a744020-98e9-57c5-ad93-d9d4dc4f8eb6`)
- 11 spaces (Automation Lab, Client Success, Workspace Hub, etc.)
- 3 demo users
- 7 sample tasks with worklogs
- Preference models and feedback

### Known Remaining Issues
These endpoints return 404 because they're healthcare-specific features not in standalone TaskR:
- `/claims` - Claims management (Scraiv/healthcare)
- `/timesheets` - HR timesheet tracking
- `/clearinghouse` - Healthcare clearinghouse config
- `/users` - 503 (HR service unavailable)

The `GanttView.tsx` error (`schedules.map is not a function`) occurs when the API returns non-array data - gracefully falls back to mock data.

### Colima Troubleshooting
If Docker commands fail with "Cannot connect to Docker daemon":
```bash
# Check status
colima status

# If shows "empty value" error, restart
colima restart

# Ensure correct context
docker context use colima
```

## File Structure
```
taskR.migrated/
├── apps/web/              # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── context/       # React contexts (ShellContext)
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # API clients
│   │   ├── types/         # TypeScript types
│   │   └── views/         # Page views
│   └── public/            # Static assets
├── services/api/          # FastAPI backend
│   └── src/app/
│       ├── models/        # SQLAlchemy models
│       ├── routes/        # API endpoints
│       ├── schemas/       # Pydantic schemas
│       └── services/      # Business logic
├── scripts/               # Utility scripts
│   ├── seed_demo.py       # Database seeder
│   └── dev_up.py          # Dev environment startup
└── docker-compose.yml     # Container orchestration
```
