taskR Platform (Dev)

Overview
- FastAPI backend with multi-tenant work management and analytics
- React/Vite frontend using Plane-inspired shell and dashboard widgets
- Event-driven architecture with optional ToolFront integrations

Dashboard Widgets
- Status Donut: task counts by status
- Workload Bar: tasks per assignee with minutes overlay
- Velocity Line: daily completions
- Burn-down: planned vs completed vs remaining (space-level planning)
- Cycle Efficiency: avg cycle/active/wait hours and efficiency%
- Throughput Histogram: weekly completions
- Overdue Gauge: overdue/severe/due-soon
- Metric Cards: quick summary (active, blocked, completed 7d, overdue, etc.)

Usage
1) Backend
   - Create venv, install, start services
     - make install && make up
   - Apply migrations (includes analytics objects)
     - make migrate
   - Optional: refresh analytics views after bulk changes
     - make refresh-analytics

2) Frontend
   - cd apps/web && npm install && npm run dev
   - Set Vite env vars:
     - VITE_TASKR_API=http://localhost:8000
     - VITE_TENANT_ID=demo
     - VITE_TASKR_USER_ID=demo-user
   - Open http://localhost:5173

3) Dashboard
   - Switch to Dashboard view from the command bar or press 4
   - Edit Layout: drag-and-drop widgets, then Save; Cancel/Reset available
   - Command Palette shortcuts (Cmd/Ctrl+K):
     - Refresh analytics (R), Edit/Exit (E), Save layout (S)

New Analytics Endpoints
- /analytics/spaces/{space}/status-summary
- /analytics/spaces/{space}/workload
- /analytics/spaces/{space}/velocity?days=30
- /analytics/spaces/{space}/burn-down?days=14
- /analytics/spaces/{space}/cycle-efficiency?days=30
- /analytics/spaces/{space}/throughput?weeks=12
- /analytics/spaces/{space}/overdue
- /analytics/spaces/{space}/summary

Notes
- All analytics requests require x-tenant-id header
- Cache TTL: ~45s server-side; client caches results for 30s within the session
