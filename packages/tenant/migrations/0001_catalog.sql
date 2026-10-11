CREATE SCHEMA IF NOT EXISTS coltandb_catalog;

CREATE TABLE IF NOT EXISTS coltandb_catalog.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.memberships (
  organization_id uuid NOT NULL REFERENCES coltandb_catalog.organizations(id),
  user_id uuid NOT NULL REFERENCES coltandb_catalog.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.projects (
  tenant_id text PRIMARY KEY CHECK (tenant_id ~ '^tnt_[a-z2-7]{12}$'),
  organization_id uuid REFERENCES coltandb_catalog.organizations(id),
  owner_id uuid NOT NULL REFERENCES coltandb_catalog.users(id),
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('provisioning', 'active', 'read_only', 'suspended', 'deleting', 'deleted')),
  limits_profile text NOT NULL DEFAULT 'alpha',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.placements (
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  backend text NOT NULL CHECK (backend IN ('neon', 'supabase', 'mongodb', 'firestore', 'redis', 'r2', 'blob', 'd1')),
  isolation text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'failed', 'deleting')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, backend)
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.collections (
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  name text NOT NULL,
  definition_colt text NOT NULL,
  compiled_json jsonb NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  backend text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  version integer NOT NULL,
  source_colt text NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'applied', 'failed', 'rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  prefix text NOT NULL,
  secret_hash text NOT NULL,
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.limits_profiles (
  name text PRIMARY KEY,
  storage_bytes bigint NOT NULL CHECK (storage_bytes > 0),
  row_count bigint NOT NULL CHECK (row_count > 0),
  requests_per_day bigint NOT NULL CHECK (requests_per_day > 0),
  max_file_bytes bigint NOT NULL CHECK (max_file_bytes > 0),
  max_connections integer NOT NULL CHECK (max_connections > 0),
  functions_enabled boolean NOT NULL DEFAULT false
);

INSERT INTO coltandb_catalog.limits_profiles (
  name, storage_bytes, row_count, requests_per_day, max_file_bytes, max_connections, functions_enabled
) VALUES ('alpha', 52428800, 10000, 10000, 5242880, 5, false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS coltandb_catalog.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  backend text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('storage_bytes', 'row_count', 'request', 'job')),
  amount bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text REFERENCES coltandb_catalog.projects(tenant_id),
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'failed', 'complete')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'failed', 'complete')),
  object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES coltandb_catalog.projects(tenant_id),
  status text NOT NULL CHECK (status IN ('grace_period', 'purging', 'verifying', 'complete', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz,
  verification_report jsonb
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text REFERENCES coltandb_catalog.projects(tenant_id),
  actor_id uuid REFERENCES coltandb_catalog.users(id),
  action text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.operator_roles (
  user_id uuid PRIMARY KEY REFERENCES coltandb_catalog.users(id),
  role text NOT NULL CHECK (role IN ('operator')),
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES coltandb_catalog.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coltandb_catalog.waitlist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
