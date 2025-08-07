### Database Specification (SQLite) — Reference for Coding Models

This document is the single source of truth for the relational data model used by the project. It prioritizes unambiguous definitions, ready-to-run DDL, indexes, and canonical query shapes that coding models can copy and adapt.

- Primary DB target: SQLite 3
- Secondary target (easy port): PostgreSQL ≥ 14

### Conventions
- IDs: `INTEGER PRIMARY KEY AUTOINCREMENT` in SQLite (maps to 64-bit signed integer). In Postgres, use `BIGSERIAL PRIMARY KEY`.
- Timestamps: `CURRENT_TIMESTAMP` (UTC). Column type is `TIMESTAMP` in SQLite (affinity NUMERIC). Store in UTC only.
- Foreign keys: Explicit with `ON DELETE` actions. Always `PRAGMA foreign_keys = ON` at connection start.
- String enums: Enforced via `CHECK` constraints.
- JSON: Store as `TEXT` (stringified JSON). Postgres variant should use `JSONB`.
- Files and vectors: Store paths/IDs, not blobs; let external systems hold binary/vector data.

### DDL: SQLite (authoritative)
Copy-paste runnable. Includes indexes and triggers.

```sql
-- Required at application startup
PRAGMA foreign_keys = ON;          -- enforce FK constraints
PRAGMA journal_mode = WAL;         -- recommended for concurrency
PRAGMA synchronous = NORMAL;       -- perf/consistency balance

-- 1) applications: central hub for a job opportunity lifecycle
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_url TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'identified' CHECK(status IN (
        'identified', 'researching', 'drafting', 'applied', 'interviewing', 'archived'
    )),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Keep updated_at fresh on any row update
CREATE TRIGGER IF NOT EXISTS trg_applications_set_updated_at
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
    UPDATE applications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_name);

-- 2) agents: personas/roles that perform tasks or converse
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,   -- e.g., 'orchestrator', 'researcher', 'writer'
    goal TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3) conversations: a thread of messages tied to an application and agent
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

-- 4) messages: atomic chat messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- 5) research_notes: structured research artifacts + link to vector embedding
CREATE TABLE IF NOT EXISTS research_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    vector_id TEXT UNIQUE,     -- ID in the vector store (e.g., Chroma)
    source_url TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_notes_application ON research_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_research_notes_vector ON research_notes(vector_id);

-- 6) generated_documents: track files produced by the writer agent (path, not blob)
CREATE TABLE IF NOT EXISTS generated_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    document_type TEXT NOT NULL,     -- 'resume', 'cover_letter', etc.
    file_path TEXT NOT NULL,         -- local filesystem path
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- One document type may have multiple versions per application
CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_documents_app_type_version
    ON generated_documents(application_id, document_type, version);

CREATE INDEX IF NOT EXISTS idx_generated_documents_application
    ON generated_documents(application_id);

-- 7) background_jobs: async task log for visibility and debugging
CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY,             -- UUID recommended
    application_id INTEGER,          -- may be NULL for system-wide jobs
    task_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'running', 'success', 'failure'
    )),
    payload TEXT,                    -- JSON string
    result TEXT,                     -- JSON string
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_application ON background_jobs(application_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
```

### String Enums (authoritative values)
- applications.status: `identified`, `researching`, `drafting`, `applied`, `interviewing`, `archived`
- messages.role: `user`, `assistant`, `system`, `tool`
- background_jobs.status: `pending`, `running`, `success`, `failure`

### Canonical Query Shapes
Copy and adapt. Use parameter binding in application code.

- Insert a new application
```sql
INSERT INTO applications (company_name, job_title, job_url)
VALUES (:company, :title, :url);
```

- Advance application status
```sql
UPDATE applications
SET status = :next_status
WHERE id = :application_id;
```

- Fetch a complete application bundle (conversations + latest documents)
```sql
SELECT a.*
FROM applications a
WHERE a.id = :application_id;

SELECT c.*
FROM conversations c
WHERE c.application_id = :application_id
ORDER BY c.created_at ASC;

SELECT m.*
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE c.application_id = :application_id
ORDER BY m.created_at ASC, m.id ASC;

-- latest version per document_type
SELECT gd.*
FROM generated_documents gd
JOIN (
  SELECT document_type, MAX(version) AS max_version
  FROM generated_documents
  WHERE application_id = :application_id
  GROUP BY document_type
) latest ON latest.document_type = gd.document_type
        AND latest.max_version = gd.version
WHERE gd.application_id = :application_id;
```

- Start and complete a background job
```sql
-- Start
INSERT INTO background_jobs (id, application_id, task_name, status, payload)
VALUES (:job_id, :application_id, :task_name, 'pending', :payload_json);

UPDATE background_jobs
SET status = 'running'
WHERE id = :job_id;

-- Complete (success)
UPDATE background_jobs
SET status = 'success', result = :result_json, completed_at = CURRENT_TIMESTAMP
WHERE id = :job_id;

-- Complete (failure)
UPDATE background_jobs
SET status = 'failure', result = :error_json, completed_at = CURRENT_TIMESTAMP
WHERE id = :job_id;
```

- Create a conversation and append messages
```sql
INSERT INTO conversations (application_id, agent_id, summary)
VALUES (:application_id, :agent_id, :summary);

INSERT INTO messages (conversation_id, role, content)
VALUES (:conversation_id, :role, :content);
```

- Persist a research note with optional vector linkage (upsert by vector_id)
```sql
-- If vector_id is present and may repeat, use UPSERT
INSERT INTO research_notes (application_id, vector_id, source_url, content)
VALUES (:application_id, :vector_id, :source_url, :content)
ON CONFLICT(vector_id) DO UPDATE SET
  application_id = excluded.application_id,
  source_url = excluded.source_url,
  content = excluded.content;
```

- Add a new document version
```sql
INSERT INTO generated_documents (application_id, document_type, file_path, version)
VALUES (:application_id, :document_type, :file_path, :version);
```

- Archive an application (soft close)
```sql
UPDATE applications SET status = 'archived' WHERE id = :application_id;
```

- Hard-delete an application and all dependent rows
```sql
DELETE FROM applications WHERE id = :application_id; -- cascades
```

### Data Access Guarantees and Invariants
- Deleting an `application` cascades to `conversations`, `messages`, `research_notes`, `generated_documents`. Associated `background_jobs` are retained but their `application_id` becomes `NULL`.
- `applications.updated_at` always reflects the last mutation to the row (via trigger).
- `generated_documents` uniqueness across `(application_id, document_type, version)` prevents accidental overwrites.
- `messages` are immutable after insert (no `updated_at`, no triggers). Edit by appending a correction.
- `job_url` uniquely identifies a posting when known.

### Minimal Seed Example
```sql
INSERT INTO agents (name, goal) VALUES
  ('orchestrator', 'Coordinate multi-agent workflow'),
  ('researcher',   'Collect and summarize company/job info'),
  ('writer',       'Generate resumes and cover letters');
```

### Porting Notes (PostgreSQL)
- Replace `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`.
- Replace `TEXT` JSON fields with `JSONB`.
- Replace timestamp defaults with `TIMESTAMPTZ DEFAULT now()`.
- Use `GENERATED ALWAYS AS IDENTITY` as a modern alternative to serial.
- Replace the `applications` update trigger with a `BEFORE UPDATE` trigger that sets `NEW.updated_at = now()`.

### Operational Notes
- Always enable `PRAGMA foreign_keys = ON` per connection for SQLite.
- Prefer parameterized statements. Never concatenate user input into SQL.
- Back up the SQLite file before schema migrations. Apply migrations under a transaction.

This spec is stable. If you need to extend it, add new tables/columns rather than modifying enums in place; prefer additive changes and backfill scripts.