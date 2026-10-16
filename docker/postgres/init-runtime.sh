#!/bin/sh
set -eu
# Values are psql variables and quoted with PostgreSQL format(%I/%L), never shell SQL interpolation.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=runtime_user="$RUNTIME_DB_USER" --set=runtime_password="$RUNTIME_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'runtime_user', :'runtime_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user') \gexec
SQL
