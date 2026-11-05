-- CourseHubs authentication migration.
-- Apply once to the existing Neon PostgreSQL database before deploying
-- the authentication-enabled backend. Safe to re-run.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_created
    ON public.email_verifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_created
    ON public.password_resets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_resets_active_token
    ON public.password_resets (token, expires_at)
    WHERE used_at IS NULL;
