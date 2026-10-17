-- Milestone02 Task2: driver/vehicle qualification and private evidence.
-- Forward-only, migration identity. Personal owned vehicles only: no rental
-- marketplace columns, no owner_profiles table, no OWNER role.
-- Dictionary: docs/specification/07-database-design.md; enums per
-- docs/api/openapi.json (category, transmission, fuel, verification status).

CREATE TABLE driver_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  license_number_ciphertext text,
  license_number_digest char(64),
  license_country char(2),
  license_expires_on date,
  city_id uuid REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  hourly_rate_minor integer CHECK (hourly_rate_minor IS NULL OR (hourly_rate_minor BETWEEN 1 AND 100000000)),
  verification_status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (verification_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  current_verification_id uuid,
  accepting_bookings boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_profiles_license_digest_unique UNIQUE (license_country, license_number_digest),
  CONSTRAINT driver_profiles_approved_fields_ck CHECK (
    verification_status <> 'APPROVED' OR (
      license_number_digest IS NOT NULL AND license_country IS NOT NULL
      AND license_expires_on IS NOT NULL AND city_id IS NOT NULL
      AND hourly_rate_minor IS NOT NULL
    )
  )
);
CREATE INDEX driver_profiles_city_status_accepting_idx
  ON driver_profiles (city_id, verification_status, accepting_bookings);
CREATE INDEX driver_profiles_license_expires_idx ON driver_profiles (license_expires_on);
CREATE TRIGGER driver_profiles_set_updated_at BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION driver_profiles_owner_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'driver profile owner is immutable' USING ERRCODE = '25001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER driver_profiles_owner_immutable_trg
  BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION driver_profiles_owner_immutable();

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  registration_number_ciphertext text NOT NULL,
  registration_number_digest char(64) NOT NULL UNIQUE,
  make varchar(60) NOT NULL,
  model varchar(60) NOT NULL,
  year smallint NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  category varchar(20) NOT NULL CHECK (category IN ('HATCHBACK', 'SEDAN', 'SUV', 'VAN')),
  seats smallint NOT NULL CHECK (seats BETWEEN 2 AND 12),
  transmission varchar(16) NOT NULL CHECK (transmission IN ('MANUAL', 'AUTOMATIC')),
  fuel_type varchar(16) NOT NULL CHECK (fuel_type IN ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID')),
  city_id uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  description text,
  verification_status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (verification_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  current_verification_id uuid,
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_owner_archived_idx ON vehicles (owner_id, archived_at);
CREATE INDEX vehicles_owner_verification_idx ON vehicles (owner_id, verification_status);
CREATE INDEX vehicles_current_verification_idx ON vehicles (current_verification_id);
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION vehicles_owner_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.owner_id <> OLD.owner_id THEN
    RAISE EXCEPTION 'vehicle owner is immutable' USING ERRCODE = '25001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER vehicles_owner_immutable_trg
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION vehicles_owner_immutable();

-- Private evidence: binary stays outside public static storage; rows only.
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  driver_id uuid REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind varchar(20) NOT NULL CHECK (kind IN ('LICENSE', 'REGISTRATION', 'INSURANCE')),
  object_key text NOT NULL UNIQUE,
  content_type varchar(80) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 char(64) NOT NULL,
  scan_status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (scan_status IN ('PENDING', 'CLEAN', 'REJECTED')),
  expires_on date,
  retired_at timestamptz,
  encryption_key_version varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_single_subject_ck CHECK (
    (driver_id IS NULL)::int + (vehicle_id IS NULL)::int = 1
  )
);
CREATE INDEX documents_driver_kind_idx ON documents (driver_id, kind);
CREATE INDEX documents_vehicle_kind_idx ON documents (vehicle_id, kind);
CREATE INDEX documents_scan_created_idx ON documents (scan_status, created_at);
CREATE OR REPLACE FUNCTION documents_subject_kind() RETURNS trigger AS $$
BEGIN
  IF NEW.kind = 'LICENSE' AND (NEW.driver_id IS NULL OR NEW.vehicle_id IS NOT NULL) THEN
    RAISE EXCEPTION 'LICENSE documents belong to a driver subject' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind IN ('REGISTRATION', 'INSURANCE')
     AND (NEW.vehicle_id IS NULL OR NEW.driver_id IS NOT NULL) THEN
    RAISE EXCEPTION 'vehicle documents belong to a vehicle subject' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER documents_subject_kind_trg
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_subject_kind();

CREATE TABLE verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  subject_version integer NOT NULL CHECK (subject_version >= 1),
  status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  submitted_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  decided_by uuid REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  submitted_at timestamptz NOT NULL,
  decided_at timestamptz,
  reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_requests_single_subject_ck CHECK (
    (driver_id IS NULL)::int + (vehicle_id IS NULL)::int = 1
  ),
  CONSTRAINT verification_requests_driver_revision_unique UNIQUE (driver_id, revision),
  CONSTRAINT verification_requests_vehicle_revision_unique UNIQUE (vehicle_id, revision),
  CONSTRAINT verification_requests_decider_ck CHECK (decided_by IS NULL OR decided_by <> submitted_by)
);
CREATE UNIQUE INDEX verification_requests_driver_pending_unique ON verification_requests (driver_id)
  WHERE status = 'PENDING' AND driver_id IS NOT NULL;
CREATE UNIQUE INDEX verification_requests_vehicle_pending_unique ON verification_requests (vehicle_id)
  WHERE status = 'PENDING' AND vehicle_id IS NOT NULL;
CREATE INDEX verification_requests_status_submitted_idx ON verification_requests (status, submitted_at);
CREATE INDEX verification_requests_driver_revision_idx ON verification_requests (driver_id, revision DESC);
CREATE INDEX verification_requests_vehicle_revision_idx ON verification_requests (vehicle_id, revision DESC);
-- Snapshot immutability: only decision/status columns may change.
CREATE OR REPLACE FUNCTION verification_requests_snapshot_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification snapshots are append-only' USING ERRCODE = '25001';
  END IF;
  IF NEW.id <> OLD.id OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.revision <> OLD.revision OR NEW.subject_version <> OLD.subject_version
     OR NEW.submitted_by <> OLD.submitted_by OR NEW.submitted_at <> OLD.submitted_at
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'verification snapshot fields are immutable' USING ERRCODE = '25001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER verification_requests_snapshot_immutable_trg
  BEFORE UPDATE OR DELETE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION verification_requests_snapshot_immutable();

-- Current-revision links, added after both sides exist.
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_current_verification_fk
  FOREIGN KEY (current_verification_id) REFERENCES verification_requests (id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_current_verification_fk
  FOREIGN KEY (current_verification_id) REFERENCES verification_requests (id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE verification_documents (
  verification_id uuid NOT NULL REFERENCES verification_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT verification_documents_pkey PRIMARY KEY (verification_id, document_id)
);
CREATE INDEX verification_documents_document_idx ON verification_documents (document_id);
CREATE OR REPLACE FUNCTION verification_documents_same_subject() RETURNS trigger AS $$
DECLARE
  req_driver uuid;
  req_vehicle uuid;
  doc_driver uuid;
  doc_vehicle uuid;
BEGIN
  SELECT driver_id, vehicle_id INTO req_driver, req_vehicle
    FROM verification_requests WHERE id = NEW.verification_id;
  SELECT driver_id, vehicle_id INTO doc_driver, doc_vehicle
    FROM documents WHERE id = NEW.document_id;
  IF req_driver IS DISTINCT FROM doc_driver OR req_vehicle IS DISTINCT FROM doc_vehicle THEN
    RAISE EXCEPTION 'verification document subject must match the request subject'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER verification_documents_same_subject_trg
  BEFORE INSERT OR UPDATE ON verification_documents
  FOR EACH ROW EXECUTE FUNCTION verification_documents_same_subject();

-- Minimal runtime grants for qualification tables.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['drivehire_runtime', 'drivehire_test_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON driver_profiles TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON vehicles TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON documents TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON verification_requests TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT ON verification_documents TO %I', r);
    ELSE
      RAISE NOTICE 'runtime role % absent; skipping grants', r;
    END IF;
  END LOOP;
END;
$$;
