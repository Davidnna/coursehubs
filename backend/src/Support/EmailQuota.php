<?php

/**
 * Tracks application-initiated transactional emails per calendar day (WAT).
 * The configurable limit is an application safeguard, not a Nylas plan limit.
 */
final class EmailQuota
{
    public static function remainingToday(): int
    {
        $db = Database::connection();
        $today = (new DateTime())->format('Y-m-d');

        $quotaStmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'email_daily_quota'");
        $quotaStmt->execute();
        $quotaValue = $quotaStmt->fetchColumn();

        // Backward compatibility for databases created before the provider-neutral setting was introduced.
        if ($quotaValue === false) {
            $legacyStmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'brevo_daily_quota'");
            $legacyStmt->execute();
            $quotaValue = $legacyStmt->fetchColumn();
        }

        $quota = (int) ($quotaValue ?: 300);
        $sentStmt = $db->prepare('SELECT sent_count FROM email_send_log WHERE send_date = ?');
        $sentStmt->execute([$today]);
        $sent = (int) ($sentStmt->fetchColumn() ?: 0);

        return max(0, $quota - $sent);
    }

    public static function hasRoomFor(int $count): bool
    {
        return self::remainingToday() >= $count;
    }

    public static function recordSent(int $count): void
    {
        $db = Database::connection();
        $today = (new DateTime())->format('Y-m-d');

        $db->prepare(
            'INSERT INTO email_send_log (send_date, sent_count) VALUES (?, ?)
             ON CONFLICT (send_date) DO UPDATE
             SET sent_count = email_send_log.sent_count + EXCLUDED.sent_count'
        )->execute([$today, $count]);
    }
}
