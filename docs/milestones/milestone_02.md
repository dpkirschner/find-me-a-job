### Milestone 2 — Persistence & State

Goal: Give the agent memory so conversations persist between reloads, and support multiple agents via a simple UI switch.

Builds on Milestone 1
- Reuse the existing FastAPI backend, minimal LangGraph agent, and Next.js UI.
- Keep streaming responses as-is.
- Add SQLite storage and simple endpoints to load and save history by agent.

Scope
- Included: SQLite database, schema creation, seeding a few agents, loading/saving messages, UI tabs for agents.
- Excluded: Vector DB, tools, background jobs, multi-application dashboard, auth.

Acceptance Criteria (Definition of Done)
- On page load, the UI shows tabs for at least two agents (e.g., Researcher, Writer). A third agent is a plus.
- Switching tabs swaps the visible conversation.
- Sending a message saves both the user message and the assistant response to the database, tied to the selected agent.
- Refreshing the page preserves and reloads the full message history for the selected agent.
- Works locally with previously set up Ollama model (`llama3.1:8b`).

Directory Layout (additions)
- `memory/db.sqlite` — SQLite database file (auto-created on first run)
- `sql/0001_init.sql` — schema for `agents` and `messages` (optional but recommended)
- `server/db.py` — connection + simple data access helpers

Schema (minimal for Milestone 2)
- Use a minimal schema that matches the milestone text. If you want to align with the broader spec in `docs/database.md`, you can later extend to `conversations`. For now, keep it simple:

```sql
-- sql/0001_init.sql (minimal)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
```

Seed Data
- Insert a few default agents on first run if table is empty:
  - `Researcher`
  - `Writer`
  - (Optional) `Orchestrator` (unused for now, but fine to seed)

Backend Tasks (FastAPI) [2–3h]
1) Dependencies
- Continue using the venv from Milestone 1.
- No extra package required to use SQLite (`sqlite3` is built-in). If preferred, you may add `SQLAlchemy` later.

2) Create `server/db.py`
- Provide: `get_connection()` that opens a SQLite connection to `memory/db.sqlite` with `check_same_thread=False`.
- On startup, ensure `memory/` exists and run the SQL in `sql/0001_init.sql`.
- Add helpers:
  - `list_agents()` → `[ { id, name } ]`
  - `ensure_seed_agents(names: list[str])` → inserts defaults if empty
  - `list_messages(agent_id: int, limit: int = 1000)` → returns ordered by `created_at ASC, id ASC`
  - `insert_message(agent_id: int, role: str, content: str)`

3) New/updated endpoints
- `GET /agents` → returns the seeded agents list
- `GET /agents/{id}/messages` → returns full message history for that agent
- `POST /chat` → body: `{ agent_id: number, message: string }`
  - Load prior messages for that `agent_id`
  - Build the prompt for your minimal agent (user/system + prior assistant messages)
  - Stream assistant tokens back to the client
  - Persist the user message first, then persist the assistant message as it completes
  - Return `[DONE]` at the end
- Keep `/healthz`

4) Error handling
- If `agent_id` does not exist → 404 JSON error
- If Ollama is unavailable → 503 JSON error with helpful message
- Validate input: reject empty `message`

Agent Graph (LangGraph) [~30m]
- Reuse Milestone 1 graph. It remains stateless.
- The backend constructs the context from DB history prior to calling the graph.

Frontend Tasks (Next.js) [2–3h]
1) Fetch agents on load
- On the chat page, load `GET /agents` and render tabs/buttons for each agent.
- Keep an `activeAgentId` in component state.

2) Load message history when active agent changes
- Call `GET /agents/{id}/messages` and display messages in the chat area.
- Keep the UI timeline simple: show role labels (`user`, `assistant`) and the text.

3) Send messages for the active agent
- The submit handler posts to `/chat` with `{ agent_id, message }`.
- Display the user message immediately (optimistic).
- Start consuming the stream of assistant tokens and append them live.
- After `[DONE]`, finalize the assistant message in the UI.

4) Refresh behavior
- Reloading the page should restore tabs and the full history for the selected agent.

Manual QA [30–45m]
- Start services as in Milestone 1.
- Confirm `GET /agents` returns your seed agents.
- Confirm switching tabs swaps visible conversations.
- Send a message for Researcher; get a streamed reply; refresh: history is still present.
- Repeat for Writer; histories are independent.

Detailed Checklist
- [ ] Create `memory/` directory and `sql/0001_init.sql`
- [ ] Implement `server/db.py` with connection, init, and helpers
- [ ] Seed default agents on startup if none exist
- [ ] `GET /agents` endpoint returns agent list
- [ ] `GET /agents/{id}/messages` returns ordered messages
- [ ] `POST /chat` accepts `{ agent_id, message }` and streams a reply
- [ ] Persist user message and assistant reply for each chat
- [ ] UI tabs toggle `activeAgentId` and trigger history fetch
- [ ] UI shows persisted history after refresh
- [ ] Graceful errors for missing agent and model unavailability

Common Pitfalls (and fixes)
- Writing to the DB from multiple threads → Use a single connection per request or enable `check_same_thread=False` and guard access.
- History order issues → Always order by `created_at ASC, id ASC`.
- CORS errors → Keep CORS config in FastAPI for `http://localhost:3000`.
- Large histories → Cap loaded messages (e.g., last 1000) for performance.
- Stream completion → Save assistant message after the stream completes; buffer the text.

Time Estimate
- 1–1.5 days for a junior engineer

What to Demo
- Show the agents list in the UI
- Switch between Researcher and Writer tabs and see different histories
- Send a message, get a streamed reply, refresh, and see messages persisted 