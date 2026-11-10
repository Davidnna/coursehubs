-- Support scoped administrator queues and staff assignment lookups.
-- Index-only migration; existing academic and administrator records are unchanged.

CREATE INDEX IF NOT EXISTS idx_academic_correction_current_scope_status
    ON academic_information_correction_requests (current_department_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academic_correction_requested_scope_status
    ON academic_information_correction_requests (requested_department_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_offering_lecturer_user_offering
    ON course_offering_lecturers (lecturer_user_id, course_offering_id)
    WHERE lecturer_user_id IS NOT NULL;
