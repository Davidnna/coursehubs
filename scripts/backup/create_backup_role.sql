-- Run once in the CourseHubs production database using an owner-level account.
-- Replace the placeholder with a strong, unique password before execution.
-- Store the resulting read-only connection string only as a GitHub Actions secret.

CREATE ROLE coursehubs_backup
    WITH LOGIN
    PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD'
    CONNECTION LIMIT 3;

GRANT pg_read_all_data TO coursehubs_backup;
ALTER ROLE coursehubs_backup SET default_transaction_read_only = on;

DO $$
BEGIN
    EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO coursehubs_backup',
        current_database()
    );
END
$$;
