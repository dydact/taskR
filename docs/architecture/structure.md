# Repository Structure

Use this document to orient new contributors.

```
platform/taskR/
├── apps/               # Front-end applications (Next.js/Vite)
│   └── web/            # Workspace web client scaffold
├── docs/               # Planning, runbooks, design notes
├── packages/           # Shared python packages (events, auth, etc.)
│   └── common_events/
├── services/           # Backend services (FastAPI, workers, etc.)
│   └── api/            # Core REST API for taskR
├── scripts/            # Repo-level automation (migrations, tooling)
├── docker-compose.yml  # Local dev environment
├── Makefile            # Common tasks (install, lint, test)
└── .gitignore
```

The layout mirrors the conventions used in `platform/vNdydact` to make cross-repo contributions straightforward.
