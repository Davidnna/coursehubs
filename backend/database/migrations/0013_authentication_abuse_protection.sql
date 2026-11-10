-- Store short-lived authentication throttling counters without retaining
-- raw email addresses or client IP addresses. Bucket keys are HMAC digests.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key_hash CHAR(64) PRIMARY KEY,
    action VARCHAR(40) NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    blocked_until TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
    ON auth_rate_limits (updated_at);
