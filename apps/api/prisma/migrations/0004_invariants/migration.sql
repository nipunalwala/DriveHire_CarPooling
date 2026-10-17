-- Milestone02 Task4: SQL resource protections and runtime grants.
-- Forward-only, migration identity. Separate partial GiST exclusions per
-- resource over unreleased half-open intervals; deferred typed
-- source/parent consistency; seat capacity/sum guards; append-only grants.
-- Dictionary: docs/specification/07-database-design.md.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Unreleased half-open driver/vehicle holds never overlap per resource.
ALTER TABLE resource_reservations
  ADD CONSTRAINT resource_reservations_driver_no_overlap
  EXCLUDE USING gist (driver_id WITH =, reserved_range WITH &&)
  WHERE (released_at IS NULL AND driver_id IS NOT NULL);
ALTER TABLE resource_reservations
  ADD CONSTRAINT resource_reservations_vehicle_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, reserved_range WITH &&)
  WHERE (released_at IS NULL AND vehicle_id IS NOT NULL);
CREATE INDEX resource_reservations_driver_idx ON resource_reservations (driver_id);
CREATE INDEX resource_reservations_vehicle_idx ON resource_reservations (vehicle_id);

-- Deferred typed source consistency: the held resource must equal the
-- source aggregate's resource. Checked at COMMIT so multi-statement
-- service transactions validate as a whole.
CREATE OR REPLACE FUNCTION reservation_source_consistency() RETURNS trigger AS $$
DECLARE
  src_driver uuid;
  src_vehicle uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT driver_id, vehicle_id INTO src_driver, src_vehicle
      FROM bookings WHERE id = NEW.booking_id;
  ELSIF NEW.carpool_id IS NOT NULL THEN
    SELECT driver_id, vehicle_id INTO src_driver, src_vehicle
      FROM carpools WHERE id = NEW.carpool_id;
  ELSIF NEW.availability_block_id IS NOT NULL THEN
    SELECT driver_id, vehicle_id INTO src_driver, src_vehicle
      FROM availability_windows WHERE id = NEW.availability_block_id;
  END IF;
  IF src_driver IS NULL AND src_vehicle IS NULL AND
     (NEW.booking_id IS NOT NULL OR NEW.carpool_id IS NOT NULL OR NEW.availability_block_id IS NOT NULL) THEN
    RAISE EXCEPTION 'reservation source does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.availability_block_id IS NOT NULL THEN
    -- A block holds exactly one resource; the hold must equal it exactly.
    IF NEW.driver_id IS DISTINCT FROM src_driver OR NEW.vehicle_id IS DISTINCT FROM src_vehicle THEN
      RAISE EXCEPTION 'reservation resource must match its source aggregate' USING ERRCODE = '23503';
    END IF;
  ELSE
    -- Booking/carpool sources carry both resources; each held side must match.
    IF (NEW.driver_id IS NOT NULL AND NEW.driver_id <> src_driver)
       OR (NEW.vehicle_id IS NOT NULL AND NEW.vehicle_id <> src_vehicle) THEN
      RAISE EXCEPTION 'reservation resource must match its source aggregate' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER resource_reservations_source_consistency_trg
  AFTER INSERT OR UPDATE ON resource_reservations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION reservation_source_consistency();

-- Deferred trip parent consistency: trip resources equal the parent's.
CREATE OR REPLACE FUNCTION trip_parent_consistency() RETURNS trigger AS $$
DECLARE
  parent_driver uuid;
  parent_vehicle uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT driver_id, vehicle_id INTO parent_driver, parent_vehicle
      FROM bookings WHERE id = NEW.booking_id;
  ELSIF NEW.carpool_id IS NOT NULL THEN
    SELECT driver_id, vehicle_id INTO parent_driver, parent_vehicle
      FROM carpools WHERE id = NEW.carpool_id;
  END IF;
  IF parent_driver IS NULL AND parent_vehicle IS NULL THEN
    RAISE EXCEPTION 'trip parent does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.driver_id <> parent_driver OR NEW.vehicle_id <> parent_vehicle THEN
    RAISE EXCEPTION 'trip resource must match its parent aggregate' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trips_parent_consistency_trg
  AFTER INSERT OR UPDATE ON trips
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trip_parent_consistency();

-- Seat capacity: offered seats fit the vehicle (driver occupies one seat).
CREATE OR REPLACE FUNCTION carpool_capacity_guard() RETURNS trigger AS $$
DECLARE
  rec record;
  v_seats smallint;
BEGIN
  IF TG_TABLE_NAME = 'vehicles' THEN
    SELECT seats INTO v_seats FROM vehicles WHERE id = NEW.id;
    FOR rec IN SELECT id, seats_offered FROM carpools WHERE vehicle_id = NEW.id LOOP
      IF rec.seats_offered > v_seats - 1 THEN
        RAISE EXCEPTION 'offered seats exceed vehicle capacity' USING ERRCODE = '23514';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  SELECT seats INTO v_seats FROM vehicles WHERE id = NEW.vehicle_id;
  IF NOT FOUND OR NEW.seats_offered > v_seats - 1 THEN
    RAISE EXCEPTION 'offered seats exceed vehicle capacity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER carpools_capacity_trg
  AFTER INSERT OR UPDATE ON carpools
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION carpool_capacity_guard();
CREATE CONSTRAINT TRIGGER vehicles_capacity_trg
  AFTER UPDATE ON vehicles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION carpool_capacity_guard();

-- Seat sum equality: confirmed seats always equal live ACCEPTED sum.
CREATE OR REPLACE FUNCTION carpool_seat_sum_guard() RETURNS trigger AS $$
DECLARE
  target uuid;
  confirmed smallint;
  live_sum bigint;
BEGIN
  IF TG_TABLE_NAME = 'seat_requests' THEN
    target := COALESCE(NEW.carpool_id, OLD.carpool_id);
  ELSE
    target := COALESCE(NEW.id, OLD.id);
  END IF;
  SELECT confirmed_seats INTO confirmed FROM carpools WHERE id = target;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT COALESCE(SUM(seats), 0) INTO live_sum FROM seat_requests
    WHERE carpool_id = target AND status = 'ACCEPTED';
  IF confirmed <> live_sum THEN
    RAISE EXCEPTION 'confirmed seats must equal accepted seat sum' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER carpools_seat_sum_trg
  AFTER INSERT OR UPDATE ON carpools
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION carpool_seat_sum_guard();
CREATE CONSTRAINT TRIGGER seat_requests_seat_sum_trg
  AFTER INSERT OR UPDATE OR DELETE ON seat_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION carpool_seat_sum_guard();

-- Append-only runtime posture: quotes, histories and audit cannot be
-- rewritten; verification links stay insert-only; deletes are withdrawn
-- everywhere except idempotency reclaim and expirable auth/rate buckets.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['drivehire_runtime', 'drivehire_test_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON booking_quotes FROM %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE ON trip_status_history FROM %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE ON audit_logs FROM %I', r);
      EXECUTE format('REVOKE DELETE ON verification_requests FROM %I', r);
      EXECUTE format('REVOKE UPDATE, DELETE ON verification_documents FROM %I', r);
      EXECUTE format('REVOKE DELETE ON users FROM %I', r);
      EXECUTE format('REVOKE DELETE ON user_roles FROM %I', r);
      EXECUTE format('REVOKE DELETE ON driver_profiles FROM %I', r);
      EXECUTE format('REVOKE DELETE ON vehicles FROM %I', r);
      EXECUTE format('REVOKE DELETE ON documents FROM %I', r);
      EXECUTE format('REVOKE DELETE ON availability_windows FROM %I', r);
      EXECUTE format('REVOKE DELETE ON bookings FROM %I', r);
      EXECUTE format('REVOKE DELETE ON booking_decisions FROM %I', r);
      EXECUTE format('REVOKE DELETE ON carpools FROM %I', r);
      EXECUTE format('REVOKE DELETE ON seat_requests FROM %I', r);
      EXECUTE format('REVOKE DELETE ON trips FROM %I', r);
      EXECUTE format('REVOKE DELETE ON resource_reservations FROM %I', r);
      EXECUTE format('REVOKE DELETE ON outbox_events FROM %I', r);
      EXECUTE format('REVOKE DELETE ON job_leases FROM %I', r);
    ELSE
      RAISE NOTICE 'runtime role % absent; skipping grant tightening', r;
    END IF;
  END LOOP;
END;
$$;
