-- Milestone02 Task3: booking, carpool and trip schema (no exclusions yet;
-- Task4 adds GiST exclusions, deferred triggers and tightened grants).
-- Forward-only, migration identity. Money is integer INR paise, at most
-- 100000000. Dictionary: docs/specification/07-database-design.md; service
-- and status enums per docs/api/openapi.json.

CREATE TABLE availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind varchar(16) NOT NULL CHECK (kind IN ('AVAILABLE', 'BLOCKED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  removed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_windows_single_resource_ck CHECK (
    (driver_id IS NULL)::int + (vehicle_id IS NULL)::int = 1
  )
);
CREATE INDEX availability_windows_driver_range_idx
  ON availability_windows (driver_id, starts_at, ends_at) WHERE removed_at IS NULL;
CREATE INDEX availability_windows_vehicle_range_idx
  ON availability_windows (vehicle_id, starts_at, ends_at) WHERE removed_at IS NULL;
CREATE TRIGGER availability_windows_set_updated_at BEFORE UPDATE ON availability_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  service varchar(24) NOT NULL CHECK (service = 'DRIVER_HIRE'),
  vehicle_id uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  driver_id uuid NOT NULL REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_version integer NOT NULL CHECK (vehicle_version >= 1),
  driver_version integer NOT NULL CHECK (driver_version >= 1),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  origin_city_id uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  destination_city_id uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  passengers smallint NOT NULL CHECK (passengers BETWEEN 1 AND 11),
  billable_hours integer NOT NULL CHECK (billable_hours >= 0),
  driver_rate_minor integer NOT NULL CHECK (driver_rate_minor BETWEEN 0 AND 100000000),
  driver_subtotal_minor bigint NOT NULL CHECK (driver_subtotal_minor BETWEEN 0 AND 100000000),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 0 AND 100000000),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_quotes_total_ck CHECK (total_minor = driver_subtotal_minor),
  CONSTRAINT booking_quotes_cities_ck CHECK (origin_city_id <> destination_city_id)
);
CREATE INDEX booking_quotes_requester_created_idx ON booking_quotes (requester_id, created_at DESC);
CREATE INDEX booking_quotes_expires_idx ON booking_quotes (expires_at);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL UNIQUE REFERENCES booking_quotes (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  passenger_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  driver_id uuid NOT NULL REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  service varchar(24) NOT NULL CHECK (service = 'DRIVER_HIRE'),
  status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 0 AND 100000000),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  expires_at timestamptz NOT NULL,
  cancel_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_passenger_created_idx ON bookings (passenger_id, created_at DESC);
CREATE INDEX bookings_driver_status_starts_idx ON bookings (driver_id, status, starts_at);
CREATE INDEX bookings_vehicle_status_starts_idx ON bookings (vehicle_id, status, starts_at);
CREATE INDEX bookings_status_expires_idx ON bookings (status, expires_at);
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  provider_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind varchar(16) NOT NULL CHECK (kind = 'DRIVER'),
  status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_decisions_provider_status_idx ON booking_decisions (provider_id, status);
CREATE INDEX booking_decisions_booking_idx ON booking_decisions (booking_id);

CREATE TABLE carpools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  driver_id uuid NOT NULL REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  origin_city_id uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  destination_city_id uuid NOT NULL REFERENCES cities (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  pickup_note varchar(300) NOT NULL,
  dropoff_note varchar(300) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  seats_offered smallint NOT NULL CHECK (seats_offered BETWEEN 1 AND 11),
  confirmed_seats smallint NOT NULL DEFAULT 0 CHECK (confirmed_seats >= 0),
  price_per_seat_minor integer NOT NULL CHECK (price_per_seat_minor BETWEEN 0 AND 100000000),
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  join_mode varchar(16) NOT NULL CHECK (join_mode = 'INSTANT'),
  status varchar(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carpools_cities_ck CHECK (origin_city_id <> destination_city_id),
  CONSTRAINT carpools_confirmed_capacity_ck CHECK (confirmed_seats <= seats_offered)
);
CREATE INDEX carpools_search_idx ON carpools (origin_city_id, destination_city_id, starts_at)
  WHERE status = 'PUBLISHED';
CREATE INDEX carpools_host_starts_idx ON carpools (host_id, starts_at DESC);
CREATE INDEX carpools_status_starts_idx ON carpools (status, starts_at);
CREATE TRIGGER carpools_set_updated_at BEFORE UPDATE ON carpools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id uuid NOT NULL REFERENCES carpools (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  passenger_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  seats smallint NOT NULL CHECK (seats BETWEEN 1 AND 11),
  status varchar(16) NOT NULL CHECK (status IN ('ACCEPTED', 'CANCELLED', 'EXPIRED')),
  price_per_seat_minor integer NOT NULL CHECK (price_per_seat_minor BETWEEN 0 AND 100000000),
  message varchar(500),
  reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX seat_requests_live_unique ON seat_requests (carpool_id, passenger_id)
  WHERE status = 'ACCEPTED';
CREATE INDEX seat_requests_passenger_created_idx ON seat_requests (passenger_id, created_at DESC);
CREATE INDEX seat_requests_carpool_status_idx ON seat_requests (carpool_id, status);
CREATE TRIGGER seat_requests_set_updated_at BEFORE UPDATE ON seat_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid UNIQUE REFERENCES bookings (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  carpool_id uuid UNIQUE REFERENCES carpools (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  driver_id uuid NOT NULL REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'ASSIGNED', 'STARTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  started_at timestamptz,
  completed_at timestamptz,
  incident_flag boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_single_parent_ck CHECK (
    (booking_id IS NULL)::int + (carpool_id IS NULL)::int = 1
  )
);
CREATE INDEX trips_driver_status_starts_idx ON trips (driver_id, status, starts_at);
CREATE INDEX trips_vehicle_status_starts_idx ON trips (vehicle_id, status, starts_at);
CREATE INDEX trips_status_ends_idx ON trips (status, ends_at);
CREATE TRIGGER trips_set_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reservations without GiST exclusions for now; Task4 adds them.
CREATE TABLE resource_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES driver_profiles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vehicle_id uuid REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  booking_id uuid REFERENCES bookings (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  carpool_id uuid REFERENCES carpools (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  availability_block_id uuid REFERENCES availability_windows (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  reserved_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_reservations_single_resource_ck CHECK (
    (driver_id IS NULL)::int + (vehicle_id IS NULL)::int = 1
  ),
  CONSTRAINT resource_reservations_single_source_ck CHECK (
    (booking_id IS NULL)::int + (carpool_id IS NULL)::int + (availability_block_id IS NULL)::int = 2
  )
);
CREATE INDEX resource_reservations_booking_idx ON resource_reservations (booking_id);
CREATE INDEX resource_reservations_carpool_idx ON resource_reservations (carpool_id);
CREATE INDEX resource_reservations_block_idx ON resource_reservations (availability_block_id);

CREATE TABLE trip_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  actor_id uuid REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('USER', 'WORKER')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  trip_version integer NOT NULL CHECK (trip_version >= 1),
  request_id varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_status_history_version_unique UNIQUE (trip_id, trip_version)
);
CREATE INDEX trip_status_history_trip_created_idx ON trip_status_history (trip_id, created_at, id);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operation varchar(80) NOT NULL,
  key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL,
  response_status smallint NOT NULL,
  response_body jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_operation_unique UNIQUE (user_id, operation, key)
);
CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('USER', 'WORKER', 'OPERATOR')),
  action varchar(100) NOT NULL,
  subject_type varchar(60) NOT NULL,
  subject_id uuid NOT NULL,
  reason text,
  request_id varchar(80) NOT NULL,
  before_safe jsonb,
  after_safe jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC, id);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX audit_logs_subject_created_idx ON audit_logs (subject_type, subject_id, created_at);

-- Minimal runtime grants for journey tables (append-only tables get no UPDATE/DELETE).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['drivehire_runtime', 'drivehire_test_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON availability_windows TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON booking_quotes TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON bookings TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON booking_decisions TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON carpools TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON seat_requests TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON trips TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON resource_reservations TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT ON trip_status_history TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT ON audit_logs TO %I', r);
    ELSE
      RAISE NOTICE 'runtime role % absent; skipping grants', r;
    END IF;
  END LOOP;
END;
$$;
