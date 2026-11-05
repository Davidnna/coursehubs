<?php

declare(strict_types=1);

/** Brevo transactional mail adapter. Email delivery never rolls back an account action. */
final class Mailer
{
    public static function sendVerificationEmail(string $toEmail, string $firstName, string $token): bool
    {
        $url = rtrim((string) Config::get('FRONTEND_ORIGIN', ''), '/') . '/verify-email?token=' . rawurlencode($token);
        $safeName = htmlspecialchars($firstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeUrl = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return self::send(
            $toEmail,
            'Verify your CourseHubs account',
            "Hi {$firstName},\n\nVerify your CourseHubs account using this link:\n{$url}\n\nThis link expires in 24 hours.",
            "<p>Hi {$safeName},</p><p>Welcome to CourseHubs. Confirm your email address to activate your account.</p><p><a href=\"{$safeUrl}\">Verify my email address</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this message.</p>"
        );
    }

    public static function sendPasswordResetEmail(string $toEmail, string $firstName, string $token): bool
    {
        $url = rtrim((string) Config::get('FRONTEND_ORIGIN', ''), '/') . '/reset-password?token=' . rawurlencode($token);
        $safeName = htmlspecialchars($firstName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeUrl = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return self::send(
            $toEmail,
            'Reset your CourseHubs password',
            "Hi {$firstName},\n\nUse this link to reset your CourseHubs password:\n{$url}\n\nThis link expires in one hour. If you did not request this, ignore this message.",
            "<p>Hi {$safeName},</p><p>A password reset was requested for your CourseHubs account.</p><p><a href=\"{$safeUrl}\">Reset my password</a></p><p>This link expires in one hour. If you did not request this, ignore this message.</p>"
        );
    }

    private static function send(string $toEmail, string $subject, string $textBody, string $htmlBody): bool
    {
        $apiKey = (string) Config::get('BREVO_API_KEY', '');
        $fromEmail = (string) Config::get('MAIL_FROM', '');
        $fromName = (string) Config::get('MAIL_FROM_NAME', 'CourseHubs');

        if ($apiKey === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL) || str_ends_with(strtolower($fromEmail), '.local')) {
            return false;
        }
        if (!function_exists('curl_init')) {
            error_log('Brevo email not sent: PHP cURL extension is unavailable.');
            return false;
        }

        try {
            if (!EmailQuota::hasRoomFor(1)) {
                return false;
            }
        } catch (Throwable $e) {
            error_log('Brevo quota check failed: ' . $e->getMessage());
            return false;
        }

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_HTTPHEADER => [
                'api-key: ' . $apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'sender' => ['name' => $fromName, 'email' => $fromEmail],
                'to' => [['email' => $toEmail]],
                'subject' => $subject,
                'textContent' => $textBody,
                'htmlContent' => $htmlBody,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        $success = $response !== false && $status >= 200 && $status < 300;
        if (!$success) {
            error_log('Brevo email delivery failed. HTTP ' . $status . ($error !== '' ? ': ' . $error : ''));
            return false;
        }

        try {
            EmailQuota::recordSent(1);
        } catch (Throwable $e) {
            error_log('Email sent but quota record failed: ' . $e->getMessage());
        }

        return true;
    }
}
