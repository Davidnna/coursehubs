-- Enforce the administrator appointment hierarchy and record role changes.
-- Existing appointments are preserved; conflicting legacy combinations are
-- surfaced in the administrator management screen for authorised review.

ALTER TABLE administrator_scope_history
    DROP CONSTRAINT IF EXISTS administrator_scope_history_action_check;

ALTER TABLE administrator_scope_history
    ADD CONSTRAINT chk_administrator_scope_history_action
    CHECK (action IN ('assigned', 'revoked', 'promoted', 'demoted'));

CREATE OR REPLACE FUNCTION enforce_administrator_scope_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    -- Serialise scope changes for a single account, including direct database
    -- writes that do not pass through the application controller.
    PERFORM id
    FROM users
    WHERE id = NEW.user_id
    FOR UPDATE;

    IF NEW.scope_type = 'institution' THEN
        IF EXISTS (
            SELECT 1
            FROM administrator_scopes
            WHERE user_id = NEW.user_id
              AND scope_type <> 'institution'
              AND id IS DISTINCT FROM NEW.id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'Institution-wide administrator access cannot be combined with faculty or department assignments.';
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1
            FROM administrator_scopes
            WHERE user_id = NEW.user_id
              AND scope_type = 'institution'
              AND id IS DISTINCT FROM NEW.id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'Faculty or department administrator access cannot be combined with institution-wide access.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_administrator_scope_hierarchy ON administrator_scopes;

CREATE TRIGGER trg_administrator_scope_hierarchy
BEFORE INSERT OR UPDATE ON administrator_scopes
FOR EACH ROW
EXECUTE FUNCTION enforce_administrator_scope_hierarchy();
