### Milestone 6 — Polish & Scale

Goal: Harden the system, improve the UX, and prepare for heavier use. Upgrade background job handling, add a basic `email_hunter` agent to enrich applications, and refine the UI with better feedback.

Builds on Milestones 1–5
- Replace FastAPI `BackgroundTasks` with Celery + Redis for robust async processing.
- Add `email_hunter` agent to populate application contacts.
- Improve UI with status indicators, progress bars, notifications, and better error messaging.
- Make tools more resilient (timeouts, retries, input validation).

Scope
- Included: Celery/Redis, job retries/visibility, email contacts discovery, UI polish, tooling robustness.
- Excluded: Auth, multi-tenant, deployment to cloud, full observability stack (Sentry/Prometheus optional).

Acceptance Criteria (Definition of Done)
- Background tasks run via Celery + Redis with retry support; job status is queryable via API and visible in the UI.
- `email_hunter` can discover and save at least one email contact for a subset of applications given a company site or job URL.
- UI shows job progress/state, surfacing success/failure with clear messages.
- Scraper and writer tools have improved error handling (timeouts, size limits, polite user-agent) and do not crash the app.

Directory Layout (additions)
- `server/celery_app.py` — Celery app factory and configuration
- `server/tasks/` — Celery task modules (`orchestrate.py`, `scrape.py`, `email_hunter.py`)
- `sql/0005_jobs_and_contacts.sql` — DB changes for Celery and contacts table
- `agents/email_hunter.py` — logic to find contacts (simple approach)
- `ui/components/` — reusable `JobStatus`, `Toast`, and `ProgressBar` components
- `docker-compose.yml` (optional) — Redis service for local dev

Dependencies & Setup [30–60m]
- Update `requirements.txt` (append):
  - `celery[redis]`
  - `redis`
  - `python-dotenv` (optional config)
  - `tenacity` (optional robust retries in functions)
- Install deps: `pip install -r requirements.txt`
- Redis options:
  - macOS: `brew install redis && brew services start redis`
  - or Docker: add `docker-compose.yml` with a `redis:7` service

```yaml
# docker-compose.yml (optional)
version: '3.9'
services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

Database Changes [~30m]
- Extend `background_jobs` for Celery linkage + retry metadata.
- Add `email_contacts` table to store discovered contacts.

```sql
-- sql/0005_jobs_and_contacts.sql
PRAGMA foreign_keys = ON;

-- Link jobs to Celery task ids and basic retry info
ALTER TABLE background_jobs ADD COLUMN celery_task_id TEXT;          -- nullable
ALTER TABLE background_jobs ADD COLUMN attempts INTEGER DEFAULT 0;   -- retry count
ALTER TABLE background_jobs ADD COLUMN last_error TEXT;              -- JSON/text

-- Email contacts discovered per application
CREATE TABLE IF NOT EXISTS email_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  name TEXT,               -- may be unknown
  email TEXT NOT NULL,
  source_url TEXT,
  confidence REAL,         -- 0..1
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_contacts_app ON email_contacts(application_id);
CREATE INDEX IF NOT EXISTS idx_email_contacts_email ON email_contacts(email);
```

Celery Integration [1.5–2h]
1) Create `server/celery_app.py`
- Configure with Redis broker and backend (or keep result backend in DB only):
  - `CELERY_BROKER_URL=redis://localhost:6379/0`
  - `CELERY_RESULT_BACKEND=redis://localhost:6379/1`
- Autodiscover tasks from `server/tasks`.

2) Convert existing background operations to Celery tasks
- Move logic from FastAPI `BackgroundTasks` into Celery tasks in `server/tasks/`:
  - `scrape.py`: wraps previous `run_scrape_job`
  - `orchestrate.py`: wraps previous `run_orchestration`
- Each task should:
  - Mark `background_jobs.status='running'`, `attempts=attempts+1`
  - On success: set `status='success'`, set `result`, `completed_at`
  - On failure: set `status='failure'`, `last_error` with message/trace
  - Use Celery `autoretry_for=(Exception,)`, `retry_backoff=True`, `max_retries=3` where reasonable

3) Submitting jobs from the API
- Update endpoints to enqueue Celery tasks instead of using `BackgroundTasks`.
- Store `celery_task_id` on the `background_jobs` row when submitting.
- `GET /jobs/{id}` remains the same (DB is source of truth), optionally add `?include_celery=true` to query Celery when needed.

Email Hunter Agent [1–2h]
- Purpose: given an application with a `company_name` and/or `job_url`, try to discover an email contact (e.g., careers page, about page) and save it.
- Create `agents/email_hunter.py`:
  - Input: `application_id`, `company_name`, optional `seed_url`
  - Strategy (simple):
    1) Start with `job_url` or attempt to guess homepage from domain in `job_url`.
    2) Fetch 1–3 likely pages (home, contact, careers). Use `requests` + `BeautifulSoup`.
    3) Extract emails via regex. Deduplicate and filter out generic catch-alls if you wish (e.g., `info@`).
    4) Insert into `email_contacts` with a basic `confidence` (0.5 default; boost if page path contains "careers", "jobs", or "contact").
  - Rate limit politely (sleep 0.5–1s between requests) and set a user-agent.
- Create Celery task `server/tasks/email_hunter.py` that calls the above and logs inserts.
- Add endpoint `POST /applications/{id}/discover-contacts` to create a `background_jobs` row and enqueue the task.

UI/UX Refinements [1.5–2h]
1) Job Status UI
- Create `JobStatus` component showing states: `pending`, `running`, `success`, `failure` with icons/colors.
- Add progress bar when possible (e.g., for multi-step orchestration you can emulate staged progress 0/100/…/100).
- Add toast notifications for job completion or failure.

2) Error Surfacing
- Standardize error payloads from API: `{ error: { code, message, details? } }`.
- In the UI, show a friendly message and optionally an expandable “details” for devs.

3) Polish
- Loading states for list/detail pages
- Disable form buttons during submission
- Minor layout and spacing improvements

Tooling Robustness [1–2h]
- Scraper (`playwright_scrape`):
  - Enforce max page size / text length (e.g., 100k chars)
  - Timeouts for navigation and content extraction
  - Polite user-agent and simple retry (once)
- Writer:
  - Truncate overly long research input
  - Save drafts atomically (write temp file then move)
- DB:
  - Wrap multi-step writes in transactions to avoid partial states

Runbook / Dev Commands
- Start Redis: `redis-server` (or `docker compose up -d redis`)
- Start Celery worker: `celery -A server.celery_app:app worker --loglevel=INFO`
- Optional scheduler (if you add periodic tasks): `celery -A server.celery_app:app beat --loglevel=INFO`
- Start API/UI like previous milestones

Manual QA [45–60m]
- Submit a scrape/orchestration job and verify it runs via Celery (check worker logs).
- Submit a failing job (bad URL) and observe retries and final failure state with `last_error`.
- Run `discover-contacts` on at least one application; verify an email appears in the UI under contacts.
- Confirm UI shows toasts and status chips; errors are readable.

Detailed Checklist
- [ ] Redis running locally (brew or Docker)
- [ ] `celery_app.py` configured for Redis broker/backend
- [ ] Existing background flows converted to Celery tasks
- [ ] API enqueues Celery tasks and records `celery_task_id`
- [ ] `sql/0005_jobs_and_contacts.sql` executed on startup
- [ ] `email_contacts` endpoint added; task implemented
- [ ] UI components for job status, progress, and toasts added and wired
- [ ] Scraper and writer improved with timeouts, truncation, and retries

Common Pitfalls (and fixes)
- Celery cannot connect to Redis → verify `CELERY_BROKER_URL`, port 6379, and service running
- Duplicate emails → unique handling in app logic (skip inserting duplicates for same application)
- Large pages → enforce text length and skip binary assets
- Race conditions updating jobs → update by `id` within a transaction

Time Estimate
- 2–3 days for a junior engineer

What to Demo
- A job lifecycle through Celery (submission, retry, completion)
- Discovering contacts for an application and showing them in the UI
- Improved UI feedback for jobs and errors 