-- ============================================================
-- MyCloud Platform - Database Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) NOT NULL UNIQUE,
  description     TEXT,
  status          VARCHAR(50)  NOT NULL DEFAULT 'CREATED',
  -- CREATED | ANALYZING | BUILDING | STARTING | RUNNING | STOPPED | FAILED | DELETING
  runtime         VARCHAR(100),   -- nodejs | python | java | php
  runtime_version VARCHAR(50),
  framework       VARCHAR(100),   -- react | vite | express | fastapi | django | flask | spring | laravel
  project_type    VARCHAR(50),    -- BACKEND | STATIC_FRONTEND | FULLSTACK
  source_path     TEXT,           -- projects/project-{id}/
  assigned_port   INTEGER,
  process_pid     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPLOYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS deployments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  version       INTEGER NOT NULL DEFAULT 1,
  status        VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  -- PENDING | ZIP_UPLOAD | EXTRACTION | ANALYSIS | DEPENDENCY_INSTALL
  -- DATABASE_PROVISIONING | BUILD | PORT_ALLOCATION | PROCESS_START | HEALTH_CHECK | RUNNING | FAILED
  current_stage VARCHAR(100),
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPLOYMENT STAGES (pipeline tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS deployment_stages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  stage         VARCHAR(100) NOT NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
  -- PENDING | RUNNING | SUCCESS | FAILED | SKIPPED
  logs          TEXT,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPLOYMENT LOGS (real-time streaming logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS deployment_logs (
  id            BIGSERIAL PRIMARY KEY,
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level         VARCHAR(20)  NOT NULL DEFAULT 'INFO',  -- INFO | WARN | ERROR | DEBUG
  stage         VARCHAR(100),
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROCESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS processes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pid         INTEGER,
  command     TEXT NOT NULL,
  args        JSONB NOT NULL DEFAULT '[]',
  working_dir TEXT NOT NULL,
  env_vars    JSONB NOT NULL DEFAULT '{}',
  status      VARCHAR(50) NOT NULL DEFAULT 'STARTING',
  -- STARTING | RUNNING | STOPPED | CRASHED | KILLED
  exit_code   INTEGER,
  exit_signal TEXT,
  started_at  TIMESTAMPTZ,
  stopped_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS ports (
  id           SERIAL PRIMARY KEY,
  port_number  INTEGER NOT NULL UNIQUE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  allocated_at TIMESTAMPTZ,
  released_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SERVICES (optional microservices within a project)
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(50)  NOT NULL,  -- web | worker | scheduler
  status      VARCHAR(50)  NOT NULL DEFAULT 'STOPPED',
  port        INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DATABASE CREDENTIALS (per-project provisioned databases)
-- ============================================================
CREATE TABLE IF NOT EXISTS database_credentials (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  db_type      VARCHAR(50) NOT NULL,  -- postgresql | mysql | sqlite
  db_host      VARCHAR(255) NOT NULL DEFAULT 'localhost',
  db_port      INTEGER NOT NULL,
  db_name      VARCHAR(255) NOT NULL,
  db_user      VARCHAR(255) NOT NULL,
  db_password  TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ENVIRONMENT VARIABLES (per-project)
-- ============================================================
CREATE TABLE IF NOT EXISTS environment_variables (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         VARCHAR(255) NOT NULL,
  value       TEXT NOT NULL,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, key)
);

-- ============================================================
-- PROJECT FILES (metadata about uploaded files)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path   TEXT NOT NULL,
  file_size     BIGINT,
  mime_type     VARCHAR(100),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SYSTEM METRICS (resource usage snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_metrics (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  cpu_percent NUMERIC(5,2),
  mem_mb      NUMERIC(10,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOG (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   UUID,
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_projects_user_id      ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status       ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_slug         ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_deployments_project   ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status    ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_dep_logs_deployment   ON deployment_logs(deployment_id);
CREATE INDEX IF NOT EXISTS idx_dep_logs_project      ON deployment_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_dep_stages_deployment ON deployment_stages(deployment_id);
CREATE INDEX IF NOT EXISTS idx_processes_project     ON processes(project_id);
CREATE INDEX IF NOT EXISTS idx_ports_active          ON ports(is_active);
CREATE INDEX IF NOT EXISTS idx_ports_project         ON ports(project_id);
CREATE INDEX IF NOT EXISTS idx_env_vars_project      ON environment_variables(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_user         ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_project      ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_metrics_project       ON system_metrics(project_id);

-- ============================================================
-- UPDATED_AT trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_deployments_updated
  BEFORE UPDATE ON deployments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_processes_updated
  BEFORE UPDATE ON processes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_db_creds_updated
  BEFORE UPDATE ON database_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_env_vars_updated
  BEFORE UPDATE ON environment_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
