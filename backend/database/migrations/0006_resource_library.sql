-- CourseHubs resource library: private object storage, review workflow and file metadata.
ALTER TABLE uploads
    ADD COLUMN IF NOT EXISTS storage_key VARCHAR(512) NULL,
    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120) NULL,
    ADD COLUMN IF NOT EXISTS sha256 CHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS moderated_by BIGINT NULL REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS moderation_note TEXT NULL;

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS chk_uploads_status;
ALTER TABLE uploads ADD CONSTRAINT chk_uploads_status
    CHECK (status IN ('pending', 'approved', 'rejected'));

UPDATE uploads
SET storage_key = COALESCE(storage_key, original_file_path),
    original_filename = COALESCE(original_filename, 'resource'),
    mime_type = COALESCE(mime_type, 'application/octet-stream')
WHERE storage_key IS NULL OR original_filename IS NULL OR mime_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_course_resources
    ON uploads (course_id, type, created_at DESC)
    WHERE status = 'approved' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_moderation_queue
    ON uploads (status, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_uploader_submissions
    ON uploads (uploader_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_download_logs_upload_date
    ON download_logs (upload_id, downloaded_at DESC);
