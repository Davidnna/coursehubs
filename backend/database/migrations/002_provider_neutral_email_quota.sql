-- Rename the legacy provider-specific quota setting without changing its value.
-- Safe to run more than once; existing send logs remain intact.
INSERT INTO admin_settings (setting_key, setting_value)
SELECT 'email_daily_quota', setting_value
FROM admin_settings
WHERE setting_key = 'brevo_daily_quota'
ON CONFLICT (setting_key) DO NOTHING;
