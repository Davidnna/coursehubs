<?php

/**
 * Tracks emails sent per calendar day (WAT) against the Brevo free
 * tier's daily quota, read from admin_settings. Used to decide, for a
 * batch send, whether to send at all — a batch that would exceed the
 * remaining quota is skipped entirely rather than delivered to only
 * part of the recipients.
 */
final class EmailQuota
{
    public static function remainingToday(): int
    {
        $db = Database::connection();
        $today = (new DateTime())->format('Y-m-d');

        $quotaStmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'brevo_daily_quota'");
        $quotaStmt->execute();
        $quota = (int) ($quotaStmt->fetchColumn() ?: 300);

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
