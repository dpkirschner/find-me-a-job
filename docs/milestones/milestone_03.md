### Milestone 3 — First Real Tool & Background Job

Goal: Make the `researcher` agent do something useful and time-consuming (web scraping) without freezing the UI. Introduce asynchronous tasks and vector memory via ChromaDB.

Builds on Milestones 1–2
- Reuse the FastAPI backend, LangGraph agent, and Next.js UI with streaming.
- Keep SQLite persistence for agents/messages from Milestone 2.
- Add: Crawl4AI scrape tool, background jobs, and ChromaDB storage for scraped content.

Scope
- Included: Crawl4AI web scraper (LLM-optimized), FastAPI BackgroundTasks, job status endpoints, ChromaDB persistence of scraped page text, basic UI to trigger a job and view results.
- Excluded: Full retrieval/QA tool, multi-step orchestration, Celery/Redis, advanced error handling.

Acceptance Criteria (Definition of Done)
- From the UI, you can request: "Research this page: <URL>" (or use a small form) and it starts a background scrape job.
- The chat remains responsive while the job runs.
- After completion, the page content is processed by Crawl4AI into clean markdown, stored in ChromaDB (persisted locally) and visible in a simple "Research Notes" list for the agent.
- A job status endpoint returns pending/running/success/failure.

Dependencies and Setup [20–30m]
- Update `pyproject.toml` dependencies:
  - `crawl4ai` (replaces playwright + beautifulsoup4)
  - `chromadb`
  - `sentence-transformers` (enables embeddings for Chroma)
- Install new deps: `pip install -e .`
- Setup Crawl4AI: `crawl4ai-setup` (installs browser dependencies)
- Verify installation: `crawl4ai-doctor`
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

Backend Tasks (FastAPI) [1.5–2h]
1) Chroma client
- Create `backend/chroma_client.py` with a helper to get a persistent client:
  - Use `chromadb.PersistentClient(path="memory/chroma")`
  - Provide `get_agent_collection(agent_id: int)` → collection name like `agent_{id}_research`

2) Crawl4AI scrape tool
- Create `agents/tools.py` with function `crawl4ai_scrape(url: str) -> dict`:
  - Use `from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode`
  - Configure with clean content settings (exclude nav/footer, word threshold)
  - Return LLM-ready markdown content with metadata
  - Return `{ "url": url, "text": <clean_markdown>, "title": <title>, "success": bool, "error": <optional> }`

3) Background job runner
- Create `backend/background.py` with `run_scrape_job(job_id: str, agent_id: int, url: str)`:
  - Update `background_jobs.status = 'running'`
  - Call `crawl4ai_scrape(url)` (already returns clean markdown)
  - Push content to Chroma:
    - Use `get_agent_collection(agent_id)`, `collection.add(ids=[uuid], documents=[clean_markdown], metadatas=[{"agent_id": agent_id, "url": url, "title": title}])`
  - Insert a row in `research_notes` with `agent_id`, `vector_id` (uuid), `source_url`, and `content` (truncated if extremely large)
  - Update job status to `'success'` and store metadata in `result`
  - On exceptions, store error in `result` and set status `'failure'`

4) Endpoints (extend `backend/app.py`)
- `POST /agents/{id}/execute-tool`
  - Body: `{ tool: "crawl4ai_scrape", url: string }`
  - Validate `id` exists and `url` is http/https
  - Create `background_jobs` row with status `pending`, generate `job_id` (UUID)
  - Use `BackgroundTasks` to schedule `run_scrape_job(job_id, id, url)`
  - Return `202 Accepted` with `{ job_id }`
- `GET /jobs/{id}` → `{ status, result }`
- `GET /agents/{id}/research` → list of `research_notes` for that agent (latest first)

5) Security and reliability basics
- Timeouts: Crawl4AI has built-in timeout handling (~30s default)
- URL validation: allow only `http(s)://`
- Size caps: truncate stored content at e.g. 100k chars to avoid DB bloat
- Content filtering: Crawl4AI automatically handles clean content extraction
- Rate limiting: Consider adding delays between scrapes to be respectful

Agent Graph (Researcher) [~45m]
- Keep generation behavior the same for normal chat.
- Add simple intent detection (server-side) for "Research this page: <URL>" or any message containing a URL.
  - Strategy A (simplest): when `POST /chat` receives a message and detects a URL, respond with a friendly message like:
    - "Starting background research for <URL>. I'll share notes when it's done."
    - Then call `/agents/{id}/execute-tool` internally (same process as the UI form) to kick off the job.
  - Strategy B (optional): add a decision node to the researcher graph to decide to call the tool; still schedule it via BackgroundTasks.

Frontend Tasks (Next.js) [2–3h]
1) Triggering jobs
- Add a small input field and button labeled "Research URL".
- On submit, call `POST /agents/{activeAgentId}/execute-tool` with `{ tool: 'crawl4ai_scrape', url }`.
- On success, show a small notice with the returned `job_id`.

2) Job status (simple)
- Add a minimal status poller (every 2–5s) for the last started job to show `pending → running → success/failure`.
- Stop polling after success/failure.

3) Research notes list
- Add a section below the chat that calls `GET /agents/{activeAgentId}/research` and lists note items with `source_url`, `created_at`, and a short preview of clean markdown `content`.
- Provide a refresh button to re-fetch notes.

Manual QA [30–45m]
- Start Ollama, backend, and frontend.
- Use the UI to run a scrape on a public URL (e.g., a docs page, news article, or job posting).
- Confirm:
  - Job transitions from pending → running → success
  - Clean markdown notes appear under the agent after completion
  - Chat remains usable during the job
  - Content is properly processed and readable
- Test failure case with an invalid URL and see `failure` status with error info.

Detailed Checklist
- [ ] Dependencies updated in `pyproject.toml` with `crawl4ai`, `chromadb`, `sentence-transformers`
- [ ] Crawl4AI setup completed (`crawl4ai-setup` and `crawl4ai-doctor`)
- [ ] `sql/0002_research_and_jobs.sql` added and executed on startup
- [ ] `backend/chroma_client.py` persistent client + per-agent collection
- [ ] `agents/tools.py` with `crawl4ai_scrape(url)` implemented
- [ ] `backend/background.py` with `run_scrape_job(...)` implemented
- [ ] `POST /agents/{id}/execute-tool` endpoint returns `202` with `job_id`
- [ ] `GET /jobs/{id}` exposes job status and result
- [ ] `GET /agents/{id}/research` lists notes with clean markdown content
- [ ] UI can start a job, see status, and view clean research notes
- [ ] Chat remains responsive while jobs run

Common Pitfalls (and fixes)
- Crawl4AI setup issues → run `crawl4ai-doctor` to diagnose; manually install with `python -m playwright install chromium`
- Chroma embeddings errors → ensure `sentence-transformers` is installed; retry adding docs
- Large content → Crawl4AI handles content cleaning; enforce max content size in storage
- Async/await issues → ensure all Crawl4AI calls use `await` and proper async context
- Memory usage → Crawl4AI is more efficient than Playwright; monitor with large sites
- Cross-origin requests → keep CORS enabled for `http://localhost:3000`

Time Estimate
- 1–1.5 days for a junior engineer (reduced due to Crawl4AI simplicity)

What to Demo
- Kick off a scrape for a URL (job posting, company page, etc.) and show live job status
- After success, display clean, LLM-ready research notes for the agent
- Continue chatting while the job runs in the background
- Show how scraped content is properly formatted and stored for future AI analysis

Key Advantages of Crawl4AI Approach
- **LLM-Optimized**: Content comes pre-processed as clean markdown, perfect for AI consumption
- **Simpler Implementation**: No need for BeautifulSoup or manual HTML cleaning
- **Better Performance**: More efficient than Playwright for pure content extraction
- **Async Native**: Built for async Python, integrates seamlessly with FastAPI
- **Job Search Ready**: Ideal for processing job postings, company pages, and research documents 