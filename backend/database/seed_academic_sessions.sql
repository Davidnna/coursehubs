-- =====================================================================
-- Seed data: Academic sessions
--
-- Covers both the old 4-year and new 5-year Computer Science cohorts
-- (see project notes: the programme transitioned from 4 to 5 years,
-- so current upper levels still graduate on the old timeline while
-- lower levels are on the new one — expected_graduation_session_id
-- handles this per student/adviser, not this table).
--
-- Adjust which session is_current=1 to match whenever this is run.
-- =====================================================================

INSERT INTO academic_sessions (name, is_current) VALUES
    ('2022/2023', 0),
    ('2023/2024', 0),
    ('2024/2025', 0),
    ('2025/2026', 1),
    ('2026/2027', 0),
    ('2027/2028', 0),
    ('2028/2029', 0),
    ('2029/2030', 0),
    ('2030/2031', 0);
