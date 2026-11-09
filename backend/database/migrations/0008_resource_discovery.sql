-- CourseHubs resource discovery: bookmarks and recently accessed resources.
-- Reports reuse the existing polymorphic flags table.

CREATE TABLE IF NOT EXISTS resource_bookmarks (
    user_id BIGINT NOT NULL REFERENCES users(id),
    upload_id BIGINT NOT NULL REFERENCES uploads(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_bookmarks_user_created
    ON resource_bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resource_views (
    user_id BIGINT NOT NULL REFERENCES users(id),
    upload_id BIGINT NOT NULL REFERENCES uploads(id),
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count > 0),
    PRIMARY KEY (user_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_views_user_recent
    ON resource_views (user_id, last_viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_resource_views_upload
    ON resource_views (upload_id, last_viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_flags_upload_reports
    ON flags (status, created_at DESC)
    WHERE flaggable_type = 'upload';
