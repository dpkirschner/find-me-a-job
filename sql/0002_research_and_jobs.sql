-- sql/0002_research_and_jobs.sql (Crawl4AI optimized)
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