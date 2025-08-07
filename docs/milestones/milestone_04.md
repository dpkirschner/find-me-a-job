### Milestone 4 — Application Dashboard

Goal: Shift from an agent-centric view to an application-centric one. Introduce a central `applications` table and a dashboard UI. Add an `orchestrator` agent chat bound to a specific application.

Builds on Milestones 1–3
- Keep existing chat and persistence from Milestones 1–2.
- Keep researcher tool + notes from Milestone 3 (optional to surface on detail view later).
- Add: `applications` state, dashboard UI, orchestrator agent with an application-scoped conversation.

Scope
- Included: DB evolution to add `applications` and `conversations`, simple CRUD for applications, UI dashboard list, application detail view with orchestrator chat.
- Excluded: Multi-agent delegation, Kanban polish, advanced filters/search, auth.

Acceptance Criteria (Definition of Done)
- A dashboard page lists all applications with `company_name`, `job_title`, and `status`.
- You can add a new application from the dashboard.
- Clicking an application opens a detail page showing its info and a chat box linked to the `orchestrator` agent for that specific application.
- Messages sent on the detail page persist in the database and reload after refresh.
- You can change an application’s status (e.g., `identified`, `researching`, `applied`) on the detail page.

Directory Layout (additions)
- `sql/0003_applications_and_conversations.sql` — adds `applications`, `conversations`, and message linkage used by orchestrator chat
- `server/applications.py` — endpoints for applications (list/create/update)
- `server/conversations.py` — endpoints for creating/fetching conversations and messages per application
- `ui/app/applications/` (or `ui/pages/applications/`) — dashboard list page
- `ui/app/applications/[id]/` — application detail page with orchestrator chat

Database Changes [~45–60m]
Note: To minimize disruption to earlier milestones, we introduce new tables for the orchestrator flow. You don’t need to migrate old agent-centric messages.

```sql
-- sql/0003_applications_and_conversations.sql
PRAGMA foreign_keys = ON;

-- Central applications table
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'identified' CHECK(status IN (
    'identified','researching','drafting','applied','interviewing','archived'
  )),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_applications_set_updated_at
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
  UPDATE applications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_name);

-- Conversations for application-scoped chats (e.g., orchestrator)
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_application ON conversations(application_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

-- Messages bound to a conversation (separate from earlier agent-only messages)
CREATE TABLE IF NOT EXISTS messages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_v2_conversation ON messages_v2(conversation_id);
```

Seeding
- Ensure the `orchestrator` agent exists in `agents` (insert if missing).
- No initial applications required; creating via UI is fine.

Backend Tasks (FastAPI) [2–3h]
1) App startup
- Execute `0003_applications_and_conversations.sql` after existing migrations.
- Ensure an `orchestrator` agent row exists.

2) Application endpoints in `server/applications.py`
- `GET /applications` → list all applications (most recent first)
- `POST /applications` → create an application `{ company_name, job_title, job_url? }`
- `GET /applications/{id}` → return a single application
- `PATCH /applications/{id}` → update `status` only (validate enum)

3) Conversation and chat endpoints in `server/conversations.py`
- `POST /applications/{id}/conversations` → create a conversation for `agent_id = orchestrator.id` (if none exists, you may auto-create one when visiting the detail page)
- `GET /applications/{id}/conversations/latest` → return the latest orchestrator conversation (create if missing)
- `GET /conversations/{conversation_id}/messages` → list `messages_v2` ordered by `created_at ASC, id ASC`
- `POST /applications/{id}/chat` → body: `{ message: string }`
  - Resolve or create the orchestrator conversation for this application
  - Load prior `messages_v2` for the conversation
  - Call the existing stateless agent graph (orchestrator persona) with the history
  - Stream the assistant tokens back
  - Persist the user message immediately and the assistant reply after completion

4) Orchestrator persona
- Reuse your LangGraph minimal graph; set a simple system prompt in the server to act as an orchestrator (“You help manage this job application, suggest next steps, and keep track of status.”)
- Keep it tool-free for this milestone.

5) Cross-cutting
- Input validation: reject empty `company_name`, `job_title`, and chat `message`
- Error handling: 404 for missing application, 503 for LLM unavailable
- CORS remains enabled for `http://localhost:3000`

Frontend Tasks (Next.js) [2–3h]
1) Dashboard list page (`/applications`)
- Fetch `GET /applications` on load
- Render a table or simple list with `company_name`, `job_title`, `status`, `created_at`
- Add a small form to create a new application (company + title + optional URL)
- On submit, POST and then refresh the list
- Link each row to `/applications/[id]`

2) Application detail page (`/applications/[id]`)
- Fetch `GET /applications/{id}` to display application info
- Status control: dropdown to select a new status and PATCH back
- Conversation area:
  - On mount, call `GET /applications/{id}/conversations/latest` to get or create the orchestrator conversation
  - Fetch `GET /conversations/{conversation_id}/messages` and show the message history
  - Chat input posts to `POST /applications/{id}/chat` and streams the assistant reply, appending tokens live
- Optional: small sidebar linking to any `research_notes` for this application in future milestones

3) UX basics
- Loading and error states on all API calls
- Disable submit while posting
- Keep styles basic but readable

Manual QA [30–45m]
- Start Ollama, backend, and frontend
- Visit `/applications`, create two applications
- Click one, open detail view, send messages; refresh and verify history persists
- Change status and confirm it updates on the list page
- Confirm the other application has a separate conversation thread

Detailed Checklist
- [ ] Run `0003_applications_and_conversations.sql` at startup
- [ ] Ensure `orchestrator` agent is present in `agents`
- [ ] Implement `GET/POST /applications`, `GET /applications/{id}`, `PATCH /applications/{id}`
- [ ] Implement `POST /applications/{id}/conversations` and `GET /applications/{id}/conversations/latest`
- [ ] Implement `GET /conversations/{conversation_id}/messages`
- [ ] Implement `POST /applications/{id}/chat` to stream and persist via `messages_v2`
- [ ] Dashboard page lists applications and supports creation
- [ ] Detail page shows application info, status control, and orchestrator chat
- [ ] Separate conversations per application; messages reload properly after refresh

Common Pitfalls (and fixes)
- Conversation not created → auto-create latest orchestrator conversation when detail loads
- Status enum errors → validate against allowed values before PATCH
- Message ordering → always order by `created_at ASC, id ASC`
- Mixed schemas → it’s okay if Milestone 2 agent-centric chats use old endpoints; orchestrator uses the new conversation-based endpoints
- CORS/URLs → verify frontend base URLs match backend

Time Estimate
- 1–1.5 days for a junior engineer

What to Demo
- Dashboard listing with application creation
- Detail view with status update
- Orchestrator chat bound to the selected application, with persistent history 