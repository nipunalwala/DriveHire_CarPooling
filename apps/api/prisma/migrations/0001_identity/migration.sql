-- Milestone02 Task1: identity, session, auth-email, outbox, rate-limit, policy, leases.
-- Forward-only. Runs as the migration identity (table owner). Runtime role
-- receives only the minimal grants below; it cannot run DDL.
-- Dictionary: docs/specification/07-database-design.md.
-- NOTE: cities.timezone IANA membership is enforced at the service layer
-- once curated city seeds exist; no city rows are invented here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reusable mutable-row trigger (used by users here, later mutable tables).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  region varchar(80) NOT NULL,
  country char(2) NOT NULL,
  timezone varchar(60) NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 60),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cities_name_unique UNIQUE (country, region, name)
);
CREATE INDEX cities_active_name_idx ON cities (active, name);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL CHECK (email = lower(trim(email))),
  display_name varchar(80) NOT NULL CHECK (char_length(display_name) >= 2),
  phone varchar(16) UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  suspended_at timestamptz,
  suspension_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);
CREATE INDEX users_status_created_idx ON users (status, created_at DESC);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  role varchar(16) NOT NULL CHECK (role IN ('PASSENGER', 'DRIVER', 'ADMIN')),
  granted_by uuid REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role)
);
CREATE INDEX user_roles_role_user_idx ON user_roles (role, user_id);

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason varchar(80),
  user_agent_digest char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_sessions_expiry_ck CHECK (absolute_expires_at <= created_at + interval '30 days')
);
CREATE INDEX refresh_sessions_user_revoked_idx ON refresh_sessions (user_id, revoked_at);
CREATE INDEX refresh_sessions_absolute_expires_idx ON refresh_sessions (absolute_expires_at);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES refresh_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  token_hash char(64) NOT NULL UNIQUE,
  parent_token_id uuid UNIQUE REFERENCES refresh_tokens (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens (session_id);
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at);

-- Partial live-challenge uniqueness (one unconsumed, uninvalidated challenge
-- per user+purpose) needs a trigger; a plain UNIQUE would also block the
-- legitimate sequential challenges after consume/invalidate.
CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  purpose varchar(24) NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  secret_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  resend_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth_challenges_single_live() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth_challenges
    WHERE user_id = NEW.user_id AND purpose = NEW.purpose
      AND consumed_at IS NULL AND invalidated_at IS NULL
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'duplicate live challenge for user and purpose' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER auth_challenges_single_live_trg
  BEFORE INSERT OR UPDATE ON auth_challenges
  FOR EACH ROW EXECUTE FUNCTION auth_challenges_single_live();
CREATE INDEX auth_challenges_expires_idx ON auth_challenges (expires_at);
CREATE INDEX auth_challenges_user_purpose_created_idx ON auth_challenges (user_id, purpose, created_at DESC);

-- Auth-only outbox (AUTH_VERIFY_EMAIL / AUTH_RESET_PASSWORD jobs only).
-- No product-event enqueue; worker retries SMTP under a durable lease.
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(80) NOT NULL CHECK (event_type IN ('AUTH_VERIFY_EMAIL', 'AUTH_RESET_PASSWORD')),
  aggregate_type varchar(40) NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 1),
  payload jsonb NOT NULL,
  sensitive_payload_ciphertext text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  processed_at timestamptz,
  dead_letter_at timestamptz,
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_identity_unique UNIQUE (aggregate_type, aggregate_id, event_type, aggregate_version)
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at, occurred_at)
  WHERE processed_at IS NULL AND dead_letter_at IS NULL;

CREATE TABLE rate_limit_buckets (
  key_hash char(64) NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  expires_at timestamptz NOT NULL,
  CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (key_hash, window_start)
);
CREATE INDEX rate_limit_buckets_expires_idx ON rate_limit_buckets (expires_at);

CREATE TABLE admin_policy (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
INSERT INTO admin_policy (id, version) VALUES (1, 1);

CREATE TABLE job_leases (
  name varchar(100) PRIMARY KEY,
  owner varchar(100) NOT NULL,
  lease_until timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL
);
CREATE INDEX job_leases_lease_until_idx ON job_leases (lease_until);

-- Minimal runtime grants. Both known environment roles are covered when they
-- exist; a NOTICE names any role absent at deploy time (production wiring
-- must create its runtime role before migrate deploy).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['drivehire_runtime', 'drivehire_test_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON cities TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON users TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON user_roles TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_sessions TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON auth_challenges TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON outbox_events TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO %I', r);
      EXECUTE format('GRANT SELECT ON admin_policy TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON job_leases TO %I', r);
    ELSE
      RAISE NOTICE 'runtime role % absent; skipping grants', r;
    END IF;
  END LOOP;
END;
$$;
