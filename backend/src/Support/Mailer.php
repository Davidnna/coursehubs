<?php

/**
 * Thin wrapper around Brevo's transactional email API. Until a real
 * BREVO_API_KEY is set in .env, sends are skipped rather than
 * failing — registration and other flows must never break just
 * because email isn't configured yet during early development.
 */
final class Mailer
{
    public static function sendVerificationEmail(string $toEmail, string $firstName, string $token): bool
    {
        $verifyUrl = rtrim(Config::get('FRONTEND_ORIGIN', ''), '/') . "/verify-email?token={$token}";

        return self::send(
            $toEmail,
            'Verify your CourseHubs account',
            "Hi {$firstName},\n\nPlease verify your account by visiting:\n{$verifyUrl}\n\nThis link expires in 24 hours."
        );
    }

    private static function send(string $toEmail, string $subject, string $textBody): bool
    {
        $apiKey = Config::get('BREVO_API_KEY', '');

        if ($apiKey === '') {
            // Not configured yet — treat as a no-op, not a failure.
            return false;
        }

        if (!EmailQuota::hasRoomFor(1)) {
            return false;
        }

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'api-key: ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'sender' => ['name' => 'CourseHubs', 'email' => Config::get('MAIL_FROM', 'no-reply@coursehubs.local')],
                'to' => [['email' => $toEmail]],
                'subject' => $subject,
                'textContent' => $textBody,
            ]),
        ]);

        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $success = $response !== false && $status >= 200 && $status < 300;

        if ($success) {
            EmailQuota::recordSent(1);
        }

        return $success;
    }
}
