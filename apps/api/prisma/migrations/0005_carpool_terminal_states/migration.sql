-- Forward-only extension of the approved carpool lifecycle; retain earlier history.
ALTER TABLE carpools DROP CONSTRAINT carpools_status_check;
ALTER TABLE carpools ADD CONSTRAINT carpools_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'FAILED'));
