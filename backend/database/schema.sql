-- =====================================================================
-- Centralized Course Materials with Past Questions and Model Answers
-- Repository System — Database Schema
-- Ebonyi State University (EBSU), Department of Computer Science
-- David Ugochukwu Nnadozie — EBSU/2022/0114831
-- Engine: MySQL 8+, InnoDB, utf8mb4
--
-- SCOPE: single department (Computer Science). Faculty/department are
-- fixed labels stored in admin_settings, not relational tables — the
-- system is not multi-department/multi-faculty.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. ACADEMIC SESSIONS
-- =====================================================================

CREATE TABLE academic_sessions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(20) NOT NULL,          -- e.g. "2025/2026"
    is_current  TINYINT(1) NOT NULL DEFAULT 0,
    started_at  DATETIME NULL,                 -- set when admin activates it
    ended_at    DATETIME NULL,                 -- set when admin closes it
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_academic_sessions_name (name)
) ENGINE=InnoDB;

-- Enforce "exactly one is_current session" at the application layer
-- (admin action flips the previous current session off before setting
-- the new one) — see build notes.

-- APPLICATION-LAYER GUARD (not a DB constraint): the last remaining
-- active is_super_admin=1 account must be blocked from being
-- suspended, deleted by another admin, OR deleting its own account
-- (self-deletion) — otherwise the system can lock itself out of admin
-- management entirely, since only a super admin can promote another
-- admin/super admin.

-- =====================================================================
-- 2. USERS, ROLE REQUESTS, ROLE ASSIGNMENTS
-- =====================================================================

CREATE TABLE users (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name                  VARCHAR(80) NOT NULL,
    surname                     VARCHAR(80) NOT NULL,
    middle_name                 VARCHAR(80) NULL,
    email                       VARCHAR(190) NOT NULL,
    password_hash               VARCHAR(255) NOT NULL,
    phone                       VARCHAR(30) NOT NULL,
    reg_no                       VARCHAR(50) NULL,                -- students only
    staff_no                     VARCHAR(50) NULL,                -- staff only
    account_type                ENUM('student','staff') NOT NULL,
    level                       SMALLINT UNSIGNED NULL,          -- students only
    expected_graduation_session_id INT UNSIGNED NULL,            -- students only
    profile_picture_path        VARCHAR(255) NULL,               -- optional for all
    is_admin                    TINYINT(1) NOT NULL DEFAULT 0,
    is_super_admin              TINYINT(1) NOT NULL DEFAULT 0,   -- can manage other admins; regular admins cannot
    is_verified                 TINYINT(1) NOT NULL DEFAULT 0,   -- email verification
    email_notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
    status                      ENUM('active','suspended','suspended_indefinite') NOT NULL DEFAULT 'active',
    suspension_count            INT UNSIGNED NOT NULL DEFAULT 0,
    failed_login_attempts       INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until                DATETIME NULL,
    deleted_at                  DATETIME NULL,                   -- self-account deletion (soft)
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- soft-delete-aware uniqueness: only active accounts must be unique,
    -- freeing the email/reg-no for reuse once an account is deleted
    email_active                VARCHAR(190) GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED,
    regno_active                VARCHAR(50) GENERATED ALWAYS AS (IF(deleted_at IS NULL, reg_no, NULL)) STORED,
    staffno_active              VARCHAR(50) GENERATED ALWAYS AS (IF(deleted_at IS NULL, staff_no, NULL)) STORED,
    UNIQUE KEY uq_users_email_active (email_active),
    UNIQUE KEY uq_users_regno_active (regno_active),
    UNIQUE KEY uq_users_staffno_active (staffno_active),
    CONSTRAINT fk_users_grad_session FOREIGN KEY (expected_graduation_session_id) REFERENCES academic_sessions(id),
    CONSTRAINT chk_users_student_fields CHECK (
        account_type <> 'student' OR (level IS NOT NULL AND expected_graduation_session_id IS NOT NULL AND reg_no IS NOT NULL AND staff_no IS NULL)
    ),
    CONSTRAINT chk_users_staff_fields CHECK (
        account_type <> 'staff' OR (level IS NULL AND expected_graduation_session_id IS NULL AND staff_no IS NOT NULL AND reg_no IS NULL)
    )
) ENGINE=InnoDB;

-- Application to become a course rep, course adviser, or a verified
-- lecturer. Submitted from an EXISTING account (not a fresh signup).
CREATE TABLE role_requests (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    requested_role      ENUM('course_rep','course_adviser','lecturer') NOT NULL,
    level_applying_for  SMALLINT UNSIGNED NULL,     -- course_adviser only
    expected_graduation_session_id INT UNSIGNED NULL, -- course_adviser only: for the cohort they'd oversee
    id_document_path    VARCHAR(255) NULL,          -- admin-only visibility
    status              ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    decision_note       TEXT NULL,                   -- explains a rejection (or approval context) to the applicant
    reviewed_by          BIGINT UNSIGNED NULL,
    reviewed_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rolereq_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_rolereq_gradsession FOREIGN KEY (expected_graduation_session_id) REFERENCES academic_sessions(id),
    CONSTRAINT fk_rolereq_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Course rep assignment: level is NOT stored — it is derived live from
-- the rep's own users.level, since it increments automatically with
-- normal student progression, same as any student.
CREATE TABLE level_reps (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    rep_type            ENUM('primary','assistant') NOT NULL,
    academic_session_id INT UNSIGNED NOT NULL,        -- session first approved in
    status              ENUM('active','revoked') NOT NULL DEFAULT 'active',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_levelreps_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_levelreps_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id)
) ENGINE=InnoDB;
-- App-level rule (not a DB constraint, since level isn't stored here):
-- at most one ACTIVE primary + one ACTIVE assistant per level, where
-- "level" is looked up live via users.level of each active rep.

-- Course adviser assignment: follows their cohort automatically.
-- current_level auto-increments each "new session started" action,
-- except when the new session matches expected_graduation_session_id
-- (given at application time), in which case status becomes 'completed'
-- instead — mirrors the student graduation check exactly.
CREATE TABLE level_advisers (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,       -- a staff/lecturer account
    current_level       SMALLINT UNSIGNED NOT NULL,
    academic_session_id INT UNSIGNED NOT NULL,          -- session last updated in
    expected_graduation_session_id INT UNSIGNED NOT NULL, -- for this specific cohort
    status              ENUM('active','completed','revoked') NOT NULL DEFAULT 'active',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_leveladvisers_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_leveladvisers_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id),
    CONSTRAINT fk_leveladvisers_gradsession FOREIGN KEY (expected_graduation_session_id) REFERENCES academic_sessions(id)
) ENGINE=InnoDB;

-- Account suspension history (separate from role-specific revocation).
CREATE TABLE account_suspensions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    suspended_by        BIGINT UNSIGNED NOT NULL,
    reason              TEXT NOT NULL,
    started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at             DATETIME NULL,          -- NULL = indefinite
    reactivated_at      DATETIME NULL,
    reactivation_type   ENUM('auto','manual') NULL,
    CONSTRAINT fk_suspensions_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_suspensions_admin FOREIGN KEY (suspended_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- =====================================================================
-- 3. COURSES, OFFERINGS, SEMESTER LIFECYCLE
-- =====================================================================

CREATE TABLE courses (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    current_code    VARCHAR(20) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    status          ENUM('active','pending_review') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    code_active     VARCHAR(20) GENERATED ALWAYS AS (IF(deleted_at IS NULL, current_code, NULL)) STORED,
    UNIQUE KEY uq_courses_code_active (code_active)
) ENGINE=InnoDB;

CREATE TABLE course_code_history (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id               BIGINT UNSIGNED NOT NULL,
    old_code                VARCHAR(20) NOT NULL,
    active_from_session_id  INT UNSIGNED NULL,
    active_to_session_id    INT UNSIGNED NULL,
    CONSTRAINT fk_codehist_course FOREIGN KEY (course_id) REFERENCES courses(id),
    INDEX idx_codehist_oldcode (old_code)
) ENGINE=InnoDB;

CREATE TABLE course_offerings (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id           BIGINT UNSIGNED NOT NULL,
    level               SMALLINT UNSIGNED NOT NULL,
    academic_session_id INT UNSIGNED NOT NULL,
    semester            ENUM('First','Second') NOT NULL,
    code_used           VARCHAR(20) NOT NULL,        -- course code as known that term
    course_type         ENUM('Compulsory','Elective') NOT NULL,
    credit_units        TINYINT UNSIGNED NOT NULL,
    exam_date           DATE NULL,                   -- filled in later, not at semester start
    status              ENUM('carried_forward','confirmed') NOT NULL DEFAULT 'carried_forward',
    created_by          BIGINT UNSIGNED NOT NULL,
    updated_by          BIGINT UNSIGNED NOT NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_offerings_course FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT fk_offerings_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id),
    CONSTRAINT fk_offerings_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_offerings_updater FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE KEY uq_offering_identity (course_id, level, academic_session_id, semester)
) ENGINE=InnoDB;

CREATE TABLE course_offering_lecturers (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_offering_id  BIGINT UNSIGNED NOT NULL,
    lecturer_name        VARCHAR(160) NOT NULL,        -- always captured, even if linked
    lecturer_user_id     BIGINT UNSIGNED NULL,          -- linked once a matching account exists
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_offlect_offering FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id),
    CONSTRAINT fk_offlect_user FOREIGN KEY (lecturer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Full audit trail of every edit made to a course_offering (reps,
-- assistant reps, and advisers can all touch the same record).
CREATE TABLE course_offering_history (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_offering_id  BIGINT UNSIGNED NOT NULL,
    changed_by          BIGINT UNSIGNED NOT NULL,
    change_summary      TEXT NOT NULL,
    changed_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_offhist_offering FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id),
    CONSTRAINT fk_offhist_user FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. STUDENT LEVEL PROGRESSION
-- =====================================================================

CREATE TABLE level_correction_requests (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,
    requested_level SMALLINT UNSIGNED NOT NULL,
    reason          TEXT NOT NULL,
    status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    decision_note   TEXT NULL,
    reviewed_by      BIGINT UNSIGNED NULL,
    reviewed_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_levelcorr_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_levelcorr_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. UPLOADS (COURSE MATERIALS, PAST QUESTIONS, MODEL ANSWERS)
-- =====================================================================

CREATE TABLE uploads (
    id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id            BIGINT UNSIGNED NOT NULL,      -- canonical course
    academic_session_id  INT UNSIGNED NULL,             -- which session this material/PQ/answer belongs to
    uploader_id          BIGINT UNSIGNED NOT NULL,
    type                 ENUM('material','past_question','model_answer') NOT NULL,
    title                VARCHAR(200) NOT NULL,
    original_file_path   VARCHAR(255) NOT NULL,         -- immutable once uploaded
    viewable_file_path   VARCHAR(255) NULL,             -- what the inline viewer renders; NULL = "preview unavailable" fallback (e.g. DOCX conversion failed)
    extracted_text       LONGTEXT NULL,                 -- for full-text search indexing
    file_size            INT UNSIGNED NOT NULL,          -- bytes; capped at 5MB (5242880)
    answer_to_upload_id  BIGINT UNSIGNED NULL,           -- model answers link to their past question
    replaces_upload_id   BIGINT UNSIGNED NULL,           -- links a corrected re-upload back to the original (e.g. after an extraction failure)
    deleted_at           DATETIME NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uploads_course FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT fk_uploads_session FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id),
    CONSTRAINT fk_uploads_uploader FOREIGN KEY (uploader_id) REFERENCES users(id),
    CONSTRAINT fk_uploads_answerto FOREIGN KEY (answer_to_upload_id) REFERENCES uploads(id),
    CONSTRAINT fk_uploads_replaces FOREIGN KEY (replaces_upload_id) REFERENCES uploads(id),
    FULLTEXT INDEX ftx_uploads_search (title, extracted_text)
) ENGINE=InnoDB;

CREATE TABLE download_logs (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    upload_id     BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NULL,        -- NULL only if guest downloads are ever allowed; currently download requires login
    downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dl_upload FOREIGN KEY (upload_id) REFERENCES uploads(id),
    CONSTRAINT fk_dl_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. FLAGGING / REPORTING (uploads AND course offerings)
-- =====================================================================

CREATE TABLE flags (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    flaggable_type   ENUM('upload','course_offering') NOT NULL,
    flaggable_id     BIGINT UNSIGNED NOT NULL,
    reported_by      BIGINT UNSIGNED NOT NULL,
    reason           TEXT NOT NULL,
    status           ENUM('open','resolved') NOT NULL DEFAULT 'open',
    resolved_by      BIGINT UNSIGNED NULL,
    resolved_at      DATETIME NULL,
    resolution_note  TEXT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_flags_reporter FOREIGN KEY (reported_by) REFERENCES users(id),
    CONSTRAINT fk_flags_resolver FOREIGN KEY (resolved_by) REFERENCES users(id),
    INDEX idx_flags_target (flaggable_type, flaggable_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 7. NOTIFICATIONS, AUTH SUPPORT
-- =====================================================================

CREATE TABLE notifications (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(50) NOT NULL,     -- e.g. account_created, role_approved, new_upload, semester_reminder, flag_resolved
    message     VARCHAR(500) NOT NULL,
    related_id  BIGINT UNSIGNED NULL,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    token       VARCHAR(255) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_pwreset_token (token)
) ENGINE=InnoDB;

CREATE TABLE email_verifications (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    token       VARCHAR(255) NOT NULL,
    expires_at  DATETIME NOT NULL,
    verified_at DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_emailverif_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_emailverif_token (token)
) ENGINE=InnoDB;

-- =====================================================================
-- 8. ADMIN TASKS + ACTIVITY LOG (audit trail)
-- =====================================================================

CREATE TABLE admin_tasks (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_type       VARCHAR(60) NOT NULL,
    description     VARCHAR(500) NOT NULL,
    related_id      BIGINT UNSIGNED NULL,
    status          ENUM('pending','done') NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME NULL,
    completed_by    BIGINT UNSIGNED NULL,
    CONSTRAINT fk_admintasks_completer FOREIGN KEY (completed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Immutable audit trail — application layer must never expose an
-- update or delete operation against this table, for any role,
-- including admin.
CREATE TABLE activity_log (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT UNSIGNED NOT NULL,
    action_type  VARCHAR(60) NOT NULL,
    target_type  VARCHAR(60) NOT NULL,
    target_id    BIGINT UNSIGNED NULL,
    description  VARCHAR(500) NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activitylog_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- =====================================================================
-- 9. ADMIN-CONFIGURABLE SETTINGS (grace periods, rate limits, etc.)
-- =====================================================================

CREATE TABLE admin_settings (
    setting_key     VARCHAR(80) PRIMARY KEY,
    setting_value   VARCHAR(255) NOT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO admin_settings (setting_key, setting_value) VALUES
    ('department_name', 'Computer Science'),
    ('faculty_name', 'Science'),
    ('institution_name', 'Ebonyi State University'),
    ('exam_date_grace_period_days', '3'),
    ('flag_rate_limit_per_window', '5'),
    ('flag_rate_limit_window_hours', '24'),
    ('login_lockout_threshold', '5'),
    ('login_lockout_cooldown_minutes', '15'),
    ('storage_warning_threshold_percent', '80'),
    ('max_file_size_bytes', '5242880'),
    ('brevo_daily_quota', '300');

-- =====================================================================
-- 10. EMAIL QUOTA TRACKING
-- =====================================================================

-- Counts emails sent against a given calendar date (WAT), so a batch
-- send can check remaining quota before firing. If a batch would
-- exceed what's left for today, the whole batch's email is skipped
-- (not sent to a partial subset) and in-app notification stands alone
-- for that batch.
CREATE TABLE email_send_log (
    send_date   DATE PRIMARY KEY,
    sent_count  INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
