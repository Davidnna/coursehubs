-- =====================================================================
-- Seed data: Academic sessions
--
-- Covers both the old 4-year and new 5-year Computer Science cohorts
-- (see project notes: the programme transitioned from 4 to 5 years,
-- so current upper levels still graduate on the old timeline while
-- lower levels are on the new one — expected_graduation_session_id
-- handles this per student/adviser, not this table).
--
-- Adjust which session is_current=TRUE to match whenever this is run.
-- =====================================================================

INSERT INTO academic_sessions (name, is_current) VALUES
    ('2022/2023', FALSE),
    ('2023/2024', FALSE),
    ('2024/2025', FALSE),
    ('2025/2026', TRUE),
    ('2026/2027', FALSE),
    ('2027/2028', FALSE),
    ('2028/2029', FALSE),
    ('2029/2030', FALSE),
    ('2030/2031', FALSE)
ON CONFLICT (name) DO NOTHING;
