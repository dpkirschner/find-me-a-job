### Milestone 3 — First Real Tool & Background Job

Goal: Make the `researcher` agent do something useful and time-consuming (web scraping) without freezing the UI. Introduce asynchronous tasks and vector memory via ChromaDB.

Builds on Milestones 1–2
- Reuse the FastAPI backend, LangGraph agent, and Next.js UI with streaming.
- Keep SQLite persistence for agents/messages from Milestone 2.
- Add: Playwright scrape tool, background jobs, and ChromaDB storage for scraped content.

Scope
- Included: Python Playwright scraper tool, FastAPI BackgroundTasks, job status endpoints, ChromaDB persistence of scraped page text, basic UI to trigger a job and view results.
- Excluded: Full retrieval/QA tool, multi-step orchestration, Celery/Redis, advanced error handling.

Acceptance Criteria (Definition of Done)
- From the UI, you can request: “Research this page: <URL>” (or use a small form) and it starts a background scrape job.
- The chat remains responsive while the job runs.
- After completion, the page text is stored in ChromaDB (persisted locally) and visible in a simple “Research Notes” list for the agent.
- A job status endpoint returns pending/running/success/failure.

Dependencies and Setup [30–45m]
- Update `requirements.txt` (append):
  - `playwright`
  - `chromadb`
  - `sentence-transformers` (enables embeddings for Chroma)
  - `beautifulsoup4` (optional: cleaner HTML-to-text)
- Install new deps: `pip install -r requirements.txt`
- Install Playwright browsers: `python -m playwright install chromium`
- Create local directories (if missing): `memory/`, `memory/chroma/`, `sql/`

Database Migration [~30m]
- Add `sql/0002_research_and_jobs.sql` to extend the schema (compatible with `docs/database.md`).

```sql
-- sql/0002_research_and_jobs.sql
PRAGMA foreign_keys = ON;

-- research notes for scraped content
CREATE TABLE IF NOT EXISTS research_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER,              -- keep NULL for now; we are agent-centric in M3
  agent_id INTEGER NOT NULL,
  vector_id TEXT UNIQUE,               -- ID in Chroma
  source_url TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_notes_agent ON research_notes(agent_id);
CREATE INDEX IF NOT EXISTS idx_research_notes_vector ON research_notes(vector_id);

-- background jobs for async tasks
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,                 -- UUID
  agent_id INTEGER,                    -- job is agent-scoped in M3
  task_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','success','failure')),
  payload TEXT,                        -- JSON string
  result TEXT,                         -- JSON string
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_background_jobs_agent ON background_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
```

- On startup, run `0002_research_and_jobs.sql` after `0001_init.sql`.

Backend Tasks (FastAPI) [2–3h]
1) Chroma client
- Create `server/chroma_client.py` with a helper to get a persistent client:
  - Use `chromadb.PersistentClient(path="memory/chroma")`
  - Provide `get_agent_collection(agent_id: int)` → collection name like `agent_{id}_research`

2) Playwright scrape tool
- Create `agents/tools.py` with function `playwright_scrape(url: str) -> dict`:
  - Use `from playwright.sync_api import sync_playwright`
  - Launch Chromium headless, set a reasonable timeout (e.g., 20s)
  - Navigate to the URL, grab `page.content()`
  - Optionally clean HTML with BeautifulSoup to extract text
  - Return `{ "url": url, "text": <extracted_text>, "title": <optional> }`

3) Background job runner
- Create `server/background.py` with `run_scrape_job(job_id: str, agent_id: int, url: str)`:
  - Update `background_jobs.status = 'running'`
  - Call `playwright_scrape(url)`
  - Push content to Chroma:
    - Use `get_agent_collection(agent_id)`, `collection.add(ids=[uuid], documents=[text], metadatas=[{"agent_id": agent_id, "url": url, "title": title}])`
  - Insert a row in `research_notes` with `agent_id`, `vector_id` (uuid), `source_url`, and `content` (truncated if extremely large)
  - Update job status to `'success'` and store any metadata in `result`
  - On exceptions, store error in `result` and set status `'failure'`

4) Endpoints (extend `server/app.py`)
- `POST /agents/{id}/execute-tool`
  - Body: `{ tool: "playwright_scrape", url: string }`
  - Validate `id` exists and `url` is http/https
  - Create `background_jobs` row with status `pending`, generate `job_id` (UUID)
  - Use `BackgroundTasks` to schedule `run_scrape_job(job_id, id, url)`
  - Return `202 Accepted` with `{ job_id }`
- `GET /jobs/{id}` → `{ status, result }`
- `GET /agents/{id}/research` → list of `research_notes` for that agent (latest first)

5) Security and reliability basics
- Timeouts: page navigation/read limited to ~20–30s
- URL validation: allow only `http(s)://`
- Size caps: truncate stored content at e.g. 100k chars to avoid DB bloat
- User-agent header: set a polite UA string; respect robots.txt in future milestones

Agent Graph (Researcher) [~45m]
- Keep generation behavior the same for normal chat.
- Add simple intent detection (server-side) for “Research this page: <URL>” or any message containing a URL.
  - Strategy A (simplest): when `POST /chat` receives a message and detects a URL, respond with a friendly message like:
    - “Starting background research for <URL>. I’ll share notes when it’s done.”
    - Then call `/agents/{id}/execute-tool` internally (same process as the UI form) to kick off the job.
  - Strategy B (optional): add a decision node to the researcher graph to decide to call the tool; still schedule it via BackgroundTasks.

Frontend Tasks (Next.js) [2–3h]
1) Triggering jobs
- Add a small input field and button labeled “Research URL”.
- On submit, call `POST /agents/{activeAgentId}/execute-tool` with `{ tool: 'playwright_scrape', url }`.
- On success, show a small notice with the returned `job_id`.

2) Job status (simple)
- Add a minimal status poller (every 2–5s) for the last started job to show `pending → running → success/failure`.
- Stop polling after success/failure.

3) Research notes list
- Add a section below the chat that calls `GET /agents/{activeAgentId}/research` and lists note items with `source_url`, `created_at`, and a short preview of `content`.
- Provide a refresh button to re-fetch notes.

Manual QA [30–45m]
- Start Ollama, backend, and frontend.
- Use the UI to run a scrape on a public URL (e.g., a docs page with text content).
- Confirm:
  - Job transitions from pending → running → success
  - Notes appear under the agent after completion
  - Chat remains usable during the job
- Test failure case with an invalid URL and see `failure` status with error info.

Detailed Checklist
- [ ] Requirements updated and Playwright installed (`python -m playwright install chromium`)
- [ ] `sql/0002_research_and_jobs.sql` added and executed on startup
- [ ] `server/chroma_client.py` persistent client + per-agent collection
- [ ] `agents/tools.py` with `playwright_scrape(url)` implemented
- [ ] `server/background.py` with `run_scrape_job(...)` implemented
- [ ] `POST /agents/{id}/execute-tool` endpoint returns `202` with `job_id`
- [ ] `GET /jobs/{id}` exposes job status and result
- [ ] `GET /agents/{id}/research` lists notes
- [ ] UI can start a job, see status, and view notes
- [ ] Chat remains responsive while jobs run

Common Pitfalls (and fixes)
- Playwright missing browsers → run `python -m playwright install chromium`
- Chroma embeddings errors → ensure `sentence-transformers` is installed; retry adding docs
- Huge HTML → clean with BeautifulSoup and/or enforce max content size
- Concurrency with SQLite → keep writes small; use per-request connections
- Cross-origin requests → keep CORS enabled for `http://localhost:3000`

Time Estimate
- 1.5–2 days for a junior engineer

What to Demo
- Kick off a scrape for a URL and show live job status
- After success, display new research notes for the agent
- Continue chatting while the job runs 