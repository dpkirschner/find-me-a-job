### Milestone 5 — True Multi-Agent Collaboration

Goal: Enable the `orchestrator` to delegate work to other agents (at least `researcher` and `writer`) and complete a multi-step workflow per application: research the company/job and then draft a tailored cover letter.

Builds on Milestones 1–4
- Keep app-scoped chat with the `orchestrator` from Milestone 4.
- Reuse research capabilities and background jobs from Milestone 3.
- Persist outputs as documents linked to the application.

Scope
- Included: Orchestrated flow (research → write), `writer` agent, file I/O tools (read base resume, write drafts), saving outputs to disk and DB, basic progress feedback in UI.
- Excluded: Celery/Redis, advanced prompt engineering, complex document templates, automatic application submission.

Acceptance Criteria (Definition of Done)
- In an application’s detail view, you can tell the orchestrator: "Research this company and then draft a cover letter." The system:
  1) Triggers/ensures research notes exist for the application.
  2) Uses those notes plus a base resume to generate a tailored cover letter.
  3) Saves the draft to disk and records it in the database as a `generated_documents` entry.
- The chat remains responsive; progress is visible (pending → running → success/failure).
- A link or quick access to the generated document is shown in the UI after success.

Directory Layout (additions)
- `sql/0004_generated_documents.sql` — `generated_documents` table (if not already present)
- `agents/writer.py` — writer agent functions using ChatOllama
- `agents/prompts/writer_cover_letter.txt` — prompt template for cover letters
- `server/orchestrate.py` — orchestration runner invoked via background jobs
- `content/resume/base_resume.md` — your base resume text (developer-provided)
- `content/applications/<app_id>/cover_letters/` — output folder for drafts

Database Changes [~20–30m]
If you followed `docs/database.md`, `generated_documents` is already defined. If not, add it now.

```sql
-- sql/0004_generated_documents.sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS generated_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,     -- 'resume', 'cover_letter', etc.
  file_path TEXT NOT NULL,         -- local filesystem path
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_documents_app_type_version
  ON generated_documents(application_id, document_type, version);

CREATE INDEX IF NOT EXISTS idx_generated_documents_application
  ON generated_documents(application_id);
```

Notes
- `research_notes` already include `application_id` from Milestone 3; for M5, ensure new research is stored with the correct `application_id`.

Backend Tasks (FastAPI) [3–4h]
1) Writer agent
- Create `agents/writer.py` with a function `draft_cover_letter(company_name: str, job_title: str, research_text: str, base_resume_text: str) -> str` using ChatOllama.
- Load prompt from `agents/prompts/writer_cover_letter.txt` and format with inputs.
- Keep generation temperature low-moderate (e.g., 0.3–0.5) for determinism.

2) Orchestration runner
- Create `server/orchestrate.py` with `run_orchestration(job_id: str, application_id: int, params: dict)` that:
  - Updates job to `running`.
  - Loads application details (company_name, job_title).
  - Ensures research for this application:
    - If `params.url` provided and no recent note, call the existing M3 background scrape pipeline synchronously (or reuse the logic) and insert a `research_notes` row.
    - Else, aggregate existing `research_notes` for the application.
  - Read `content/resume/base_resume.md` (fail gracefully if missing; instruct the developer to add it).
  - Call `draft_cover_letter(...)` to generate the draft text.
  - Determine next document version: `SELECT COALESCE(MAX(version), 0) + 1 FROM generated_documents WHERE application_id = :id AND document_type = 'cover_letter'`.
  - Write the file to `content/applications/<app_id>/cover_letters/cover_letter_v{n}.md`.
  - Insert a `generated_documents` row with the path and version.
  - Update job to `success` with `result` containing `{ document_type, version, file_path }`.
  - On error, set status `failure` with error info.

3) Endpoints
- Extend `server/app.py` or add `server/orchestrations.py`:
  - `POST /applications/{id}/orchestrate` → body: `{ action: 'research_then_write', url?: string }`
    - Create a `background_jobs` row and schedule `run_orchestration(job_id, id, params)` via `BackgroundTasks`.
    - Return `{ job_id }` (202).
  - `GET /orchestrations/{job_id}` → proxy `GET /jobs/{job_id}` or return job status/result.
  - `GET /applications/{id}/documents?type=cover_letter` → list generated documents for the app (latest first).

4) Orchestrator chat behavior
- When the user sends a command like "Research this company and then draft a cover letter.", the chat handler should:
  - Respond immediately in the conversation: “Starting research and drafting. I will update you when done.”
  - Internally call `POST /applications/{id}/orchestrate` with `action='research_then_write'` and an optional URL extracted from the message.
  - Continue normal chat while the job runs in the background.

Frontend Tasks (Next.js) [2–3h]
1) Application detail page additions
- Add a small panel “Automations” with a button: “Research + Draft Cover Letter”.
- Optional input for a URL to guide research.
- On click, POST to `/applications/{id}/orchestrate` and store `job_id`.
- Start a small poller (2–5s) to `/orchestrations/{job_id}` until success/failure.

2) Show outputs
- After success, fetch `GET /applications/{id}/documents?type=cover_letter` and show the latest draft with a link to the file path.
- Optionally render a preview (read-only) by hitting a simple backend file-serving endpoint or reading file content (security: keep local only for dev).

3) Chat integration
- When you detect the user’s message includes "research" and "draft", optionally show a CTA to run the orchestration.
- Ensure chat remains functional during orchestration.

Prompts [writer]
Create `agents/prompts/writer_cover_letter.txt`:
```
You are a helpful writing assistant. Write a concise, professional cover letter tailored to the following job, using the provided research and resume background.

Company: {{company_name}}
Job Title: {{job_title}}

Research Notes:
{{research_text}}

Resume Background:
{{base_resume_text}}

Requirements:
- Keep it to 3–6 short paragraphs.
- Use clear, confident tone; avoid over-claiming.
- Highlight relevant experience and alignment to the role.
- End with a polite call to action.
```

Manual QA [45–60m]
- Start services and open an application detail.
- Click “Research + Draft Cover Letter” with a valid URL (or leave blank to reuse existing notes).
- Confirm job transitions to success and a new document appears.
- Open the document link and read the generated cover letter.
- From chat, issue the instruction "Research this company and then draft a cover letter." and confirm the background job starts and completes.

Detailed Checklist
- [ ] `generated_documents` table present (via `0004_generated_documents.sql` if needed)
- [ ] `agents/writer.py` implemented with ChatOllama usage
- [ ] Prompt template added under `agents/prompts/writer_cover_letter.txt`
- [ ] `server/orchestrate.py` orchestration runner implemented
- [ ] `POST /applications/{id}/orchestrate` and `GET /orchestrations/{job_id}` added
- [ ] Orchestrator chat triggers orchestration on command
- [ ] Files written to `content/applications/<id>/cover_letters/`
- [ ] `generated_documents` rows created with correct versioning
- [ ] UI shows job progress and lists the latest cover letter

Common Pitfalls (and fixes)
- Missing base resume file → add `content/resume/base_resume.md` with reasonable content
- Overly long research text → truncate before sending to the model (e.g., first 5–10k chars)
- SQLite concurrency → keep operations small; single connection per request; write once per step
- File permissions/paths → ensure directories exist before writing; handle errors gracefully
- Prompt too vague → iterate on prompt template to improve output quality

Time Estimate
- 1.5–2 days for a junior engineer

What to Demo
- From the application detail page, run the orchestration and show the generated cover letter
- Show chat-driven orchestration and that the chat remains responsive
- Display the stored document in the dashboard as part of the application’s artifacts 