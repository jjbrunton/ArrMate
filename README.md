<p align="center">
  <h1 align="center">ArrMate</h1>
  <p align="center">
    Self-hosted monitoring and auto-healing for Sonarr, Radarr, and Overseerr
    <br />
    <em>Detect download issues. Fix them automatically. Stay in control.</em>
  </p>
</p>

<p align="center">
  <a href="https://github.com/jjbrunton/ArrMate/actions/workflows/docker-publish.yml">
    <img src="https://github.com/jjbrunton/ArrMate/actions/workflows/docker-publish.yml/badge.svg" alt="Docker Publish" />
  </a>
  <a href="https://github.com/jjbrunton/ArrMate/pkgs/container/arrmate">
    <img src="https://img.shields.io/badge/ghcr.io-arrmate-blue?logo=docker&logoColor=white" alt="GHCR" />
  </a>
  <img src="https://img.shields.io/badge/platform-amd64%20%7C%20arm64-lightgrey?logo=linux&logoColor=white" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/next.js-16-black?logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/tests-212%20passing-brightgreen?logo=vitest&logoColor=white" alt="Tests" />
</p>

---

## What is ArrMate?

ArrMate is a lightweight, self-hosted dashboard that connects to your [Sonarr](https://sonarr.tv), [Radarr](https://radarr.video), and [Overseerr](https://overseerr.dev) instances, continuously monitors their download queues, detects problems, and can automatically fix them — all from a single Docker container with zero external dependencies.

**Stop manually babysitting your downloads.** ArrMate watches for stalled, failed, duplicate, and blocked downloads, then either alerts you with a suggested fix or resolves the issue automatically.

### Key Features

- **Intelligent Issue Detection** — 7 built-in detection rules catch failed, stalled, duplicate, import-blocked, missing-file, import-pending, and slow downloads
- **Auto-Fix** — Opt-in per instance. ArrMate can automatically remove-and-blocklist, retry, re-grab, or re-import problem downloads
- **Quality Management** — Track cutoff-unmet items across your library and batch upgrade searches with a 24-hour cooldown to avoid hammering indexers
- **Overseerr Integration** — Import and display request status and requester metadata alongside your Arr data
- **Single Container** — SQLite embedded database. No Postgres, no Redis, no message queue. Just one Docker image
- **Multi-Architecture** — Pre-built for `linux/amd64` and `linux/arm64` (Raspberry Pi, Synology, etc.)
- **Secure by Default** — API keys encrypted at rest (AES-256-GCM), scrypt-hashed passwords, server-side sessions, CSRF protection, brute-force throttling
- **First-Run Onboarding** — Guided setup creates your admin account and first instance in one step

---

## Quick Start

### Docker Compose (Recommended)

```yaml
services:
  arrmate:
    image: ghcr.io/jjbrunton/arrmate:latest
    ports:
      - "3000:3000"
    environment:
      DB_PATH: /app/data/arrmate.db
    volumes:
      - arrmate-data:/app/data
    restart: unless-stopped

volumes:
  arrmate-data:
```

```bash
docker compose up -d
```

### Docker CLI

```bash
docker run -d \
  --name arrmate \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DB_PATH=/app/data/arrmate.db \
  -v arrmate-data:/app/data \
  ghcr.io/jjbrunton/arrmate:latest
```

Then open **http://localhost:3000** — you'll be guided through creating your admin account and adding your first instance.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         ArrMate                                 │
│                                                                 │
│  ┌───────────┐   ┌──────────────┐   ┌────────────────────────┐ │
│  │ Scheduler │──▶│ Issue Engine  │──▶│ Auto-Fix / Dashboard   │ │
│  │ (cron)    │   │ (7 rules)    │   │                        │ │
│  └─────┬─────┘   └──────────────┘   └────────────────────────┘ │
│        │                                                        │
│        ▼                                                        │
│  ┌───────────────────────────────┐                              │
│  │ SQLite (WAL mode, encrypted)  │                              │
│  └───────────────────────────────┘                              │
└────────┬────────────────────┬──────────────────┬────────────────┘
         │                    │                  │
         ▼                    ▼                  ▼
    ┌─────────┐         ┌──────────┐      ┌────────────┐
    │ Sonarr  │         │ Radarr   │      │ Overseerr  │
    └─────────┘         └──────────┘      └────────────┘
```

### Scheduled Jobs

| Job | Frequency | What it does |
|-----|-----------|-------------|
| **Queue Poll** | Configurable (default 60s) | Fetches queue, syncs to DB, runs detection, auto-fixes if enabled |
| **Quality Check** | Every 5 min | Finds cutoff-unmet items, queues upgrade searches with 24h cooldown |
| **Media Sync** | Configurable | Caches library data locally for enrichment and quality tracking |
| **Request Sync** | Configurable | Imports Overseerr requests with resolved titles |
| **Health Check** | Every 5 min | Tests API connectivity, updates instance health status |

### Detection Rules

Issues are detected by a prioritized rule engine — highest priority match wins, one issue per queue item:

| Rule | Priority | Severity | Detects |
|------|:--------:|:--------:|---------|
| Failed | 100 | Critical | Failed or failed-pending download state |
| Stalled | 90 | Warning | No connections, not seeded, zero progress for 60+ min |
| Duplicate | 80 | Warning | Already exists or already imported |
| Import Blocked | 75 | Critical | Import blocked state, multi-movie disambiguation |
| Missing Files | 70 | Critical | No video files found, sample-only releases |
| Import Pending | 60 | Warning | Stuck in import-pending for 30+ minutes |
| Slow Download | 30 | Info | Estimated completion > 24 hours |

### Available Fix Actions

| Action | Description | Auto |
|--------|-------------|:----:|
| Remove & Blocklist | Delete queue item and blocklist the release | Yes |
| Retry Download | Remove and trigger re-search | Yes |
| Grab Release | Re-download the same release | Yes |
| Select Movie Import | Resolve multi-movie conflicts automatically | Yes |
| Remove (Keep Files) | Delete queue item but keep downloaded files | No |
| Force Import | Directs user to handle manually in the Arr UI | No |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/app/data/arrmate.db` | Path to the SQLite database file |
| `ENCRYPTION_KEY` | Auto-generated | 64-char hex key for API key encryption. Auto-generated and persisted if not set |
| `AUTH_SESSION_SECRET` | Auto-generated | 64-char hex key for session signing. Auto-generated and persisted if not set |

> **Note:** ArrMate auto-generates and persists encryption keys and session secrets on first launch. You only need to set these explicitly if you want to control them yourself.

### Instance Settings

Each Sonarr/Radarr instance can be individually configured:

- **Poll interval** — How often to check the download queue
- **Auto-fix** — Enable/disable automatic issue resolution
- **Quality check batch size** — Max items per upgrade search batch (default 50)

Overseerr instances support:

- **Request sync interval** — How often to import requests

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | [TypeScript](https://typescriptlang.org) |
| UI | [React 19](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com), [Radix UI](https://radix-ui.com) |
| Database | [SQLite](https://sqlite.org) via [Drizzle ORM](https://orm.drizzle.team) + [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Scheduling | [node-cron](https://github.com/node-cron/node-cron) |
| Validation | [Zod v4](https://zod.dev) |
| Data Fetching | [TanStack Query](https://tanstack.com/query) |
| Logging | [Pino](https://getpino.io) |
| Testing | [Vitest](https://vitest.dev) with [v8 coverage](https://v8.dev/blog/javascript-code-coverage) |
| Container | [Docker](https://docker.com) (Alpine, multi-stage, standalone output) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) → [GHCR](https://ghcr.io) |

---

## Development

### Prerequisites

- Node.js >= 20
- npm

### Setup

```bash
git clone https://github.com/jjbrunton/ArrMate.git
cd ArrMate
npm install
npm run dev
```

The dev server starts at **http://localhost:3000**.

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply pending migrations |

### Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # REST API endpoints
│   ├── dashboard/          # Main dashboard
│   ├── instances/          # Instance management & detail views
│   ├── issues/             # Issue browser
│   ├── logs/               # Audit log viewer
│   ├── login/              # Authentication
│   └── onboarding/         # First-run setup
├── components/             # React components
│   ├── layout/             # Shell, sidebar, headers
│   └── ui/                 # Reusable Radix-based primitives
└── lib/                    # Core business logic
    ├── arr-client/         # Sonarr/Radarr API client
    ├── auth/               # Session & cookie management
    ├── crypto/             # AES-256-GCM encryption
    ├── db/                 # Database schema & connection
    ├── instances/          # Instance type registry
    ├── issues/             # Detection engine & rules
    ├── overseerr-client/   # Overseerr API client
    ├── scheduler/          # Cron job orchestration
    ├── services/           # Data access layer
    └── utils/              # Shared helpers
```

---

## API Reference

All endpoints are under `/api/`. Protected routes require an authenticated session cookie.

<details>
<summary><strong>Authentication</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/setup` | First-run onboarding |
| POST | `/api/auth/login` | Login with credentials |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/auth/account` | Get admin username |
| POST | `/api/auth/account` | Change password |

</details>

<details>
<summary><strong>Instances</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/instances` | List all instances |
| POST | `/api/instances` | Add new instance |
| POST | `/api/instances/verify` | Test connection |
| GET | `/api/instances/[id]` | Get instance details |
| PUT | `/api/instances/[id]` | Update instance |
| DELETE | `/api/instances/[id]` | Remove instance |
| POST | `/api/instances/[id]/poll` | Trigger queue poll |
| POST | `/api/instances/[id]/quality-check` | Trigger quality check |
| POST | `/api/instances/[id]/sync-media` | Trigger media sync |
| POST | `/api/instances/[id]/sync-requests` | Trigger request sync |
| GET | `/api/instances/[id]/requests` | List imported requests |
| GET | `/api/instances/[id]/job-status` | Running job status |
| GET | `/api/instances/[id]/cutoff` | Quality/cutoff data |
| POST | `/api/instances/[id]/cutoff/search` | Batch upgrade search |

</details>

<details>
<summary><strong>Issues & Queue</strong></summary>

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/issues` | List detected issues |
| POST | `/api/issues/[id]/dismiss` | Dismiss an issue |
| POST | `/api/issues/[id]/fix` | Execute a fix |
| POST | `/api/issues/accept-all` | Fix all active issues |
| POST | `/api/issues/dismiss-all` | Dismiss all for instance |
| GET | `/api/queue` | List queue items |
| GET | `/api/logs` | Audit log |
| GET | `/api/health` | Health check & stats |

</details>

---

## Security

ArrMate is designed for self-hosted environments with a single administrator:

- **Encryption at rest** — API keys stored with AES-256-GCM and per-value random IVs
- **Password hashing** — scrypt with secure parameters
- **Server-side sessions** — Opaque tokens, only HMAC hashes stored in DB
- **CSRF protection** — Same-origin validation on all mutations
- **Brute-force throttling** — Per-IP lockout after 5 failed attempts (persisted across restarts)
- **Non-root container** — Runs as `nextjs:nodejs` (UID 1001)
- **Cookie security** — `HttpOnly`, `SameSite=Strict`, `__Host-` prefix in production

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Read the relevant docs in `docs/` before making changes
4. Write tests for new functionality
5. Ensure `npm test` passes (212 tests across 34 files)
6. Submit a pull request

See [`AGENTS.md`](AGENTS.md) for detailed development conventions and architecture documentation.

---

## License

MIT

---

<p align="center">
  Built for the <a href="https://wiki.servarr.com">*arr</a> community
</p>
