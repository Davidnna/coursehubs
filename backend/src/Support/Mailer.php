<?php

declare(strict_types=1);

/**
 * Nylas transactional email adapter.
 * Verification and password-reset messages use distinct sender identities.
 * Email delivery is intentionally non-fatal to account/database operations.
 */
final class Mailer
{
    public static function sendVerificationEmail(string $toEmail, string $firstName, string $token): bool
    {
        $url = self::actionUrl('/verify-email', $token);
        if ($url === null) {
            return false;
        }

        $safeName = self::escape($firstName);
        $html = self::emailLayout(
            'Verify your email address to activate your CourseHubs account.',
            'Verify your email address',
            '<p style="margin:0 0 16px">Hello ' . $safeName . ',</p>'
                . '<p style="margin:0 0 16px">Welcome to CourseHubs. Confirm that this email address belongs to you to activate your account.</p>',
            'Verify my email address',
            $url,
            'This verification link expires in 24 hours.',
            'If you did not create a CourseHubs account, you can safely ignore this email.',
            '#2457C5'
        );

        return self::send(
            'verification',
            $toEmail,
            $firstName,
            'Verify your CourseHubs email address',
            $html
        );
    }

    public static function sendPasswordResetEmail(string $toEmail, string $firstName, string $token): bool
    {
        $url = self::actionUrl('/reset-password', $token);
        if ($url === null) {
            return false;
        }

        $safeName = self::escape($firstName);
        $html = self::emailLayout(
            'A password reset was requested for your CourseHubs account.',
            'Reset your password',
            '<p style="margin:0 0 16px">Hello ' . $safeName . ',</p>'
                . '<p style="margin:0 0 16px">We received a request to reset the password for your CourseHubs account. Use the button below to choose a new password.</p>',
            'Reset my password',
            $url,
            'This password-reset link expires in one hour and can only be used once.',
            'If you did not request a password reset, do not use the link. Your password will remain unchanged.',
            '#9A3412'
        );

        return self::send(
            'password_reset',
            $toEmail,
            $firstName,
            'Reset your CourseHubs password',
            $html
        );
    }

    private static function send(
        string $purpose,
        string $toEmail,
        string $recipientName,
        string $subject,
        string $htmlBody
    ): bool {
        $apiKey = trim((string) Config::get('NYLAS_API_KEY', ''));
        $apiUri = rtrim(trim((string) Config::get('NYLAS_API_URI', 'https://api.us.nylas.com')), '/');
        $domain = strtolower(trim((string) Config::get('NYLAS_DOMAIN', '')));

        if ($apiKey === '' || $domain === '' || filter_var($domain, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
            error_log('Nylas email not sent: NYLAS_API_KEY or a valid NYLAS_DOMAIN is missing.');
            return false;
        }

        $apiParts = parse_url($apiUri);
        if (!is_array($apiParts) || ($apiParts['scheme'] ?? '') !== 'https' || empty($apiParts['host'])) {
            error_log('Nylas email not sent: NYLAS_API_URI must be a valid HTTPS URL.');
            return false;
        }

        $sender = self::senderFor($purpose, $domain);
        if ($sender === null) {
            error_log('Nylas email not sent: the configured sender must be a valid address on NYLAS_DOMAIN.');
            return false;
        }
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            error_log('Nylas email not sent: recipient address is invalid.');
            return false;
        }
        if (!function_exists('curl_init')) {
            error_log('Nylas email not sent: PHP cURL extension is unavailable.');
            return false;
        }

        try {
            if (!EmailQuota::hasRoomFor(1)) {
                error_log('Nylas email not sent: the application daily email limit has been reached.');
                return false;
            }
        } catch (Throwable $e) {
            error_log('Nylas email quota check failed: ' . $e->getMessage());
            return false;
        }

        $payload = [
            'to' => [[
                'name' => trim($recipientName),
                'email' => $toEmail,
            ]],
            'from' => [
                'name' => $sender['name'],
                'email' => $sender['email'],
            ],
            'subject' => $subject,
            'body' => $htmlBody,
        ];

        try {
            $encodedPayload = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $idempotencyKey = bin2hex(random_bytes(16));
        } catch (Throwable $e) {
            error_log('Nylas email not sent: request preparation failed. ' . $e->getMessage());
            return false;
        }

        $endpoint = $apiUri . '/v3/domains/' . rawurlencode($domain) . '/messages/send';
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
                'Idempotency-Key: ' . $idempotencyKey,
            ],
            CURLOPT_POSTFIELDS => $encodedPayload,
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $success = $response !== false && $status >= 200 && $status < 300;
        if (!$success) {
            $providerMessage = '';
            if (is_string($response) && $response !== '') {
                $decoded = json_decode($response, true);
                if (is_array($decoded)) {
                    $messageValue = $decoded['message'] ?? $decoded['error'] ?? '';
                    if (is_string($messageValue)) {
                        $providerMessage = $messageValue;
                    } elseif (is_array($messageValue)) {
                        $nestedMessage = $messageValue['message'] ?? $messageValue['detail'] ?? '';
                        $providerMessage = is_string($nestedMessage) ? $nestedMessage : '';
                    }
                }
            }
            $providerMessage = trim(preg_replace('/\s+/', ' ', $providerMessage) ?? '');
            if (strlen($providerMessage) > 240) {
                $providerMessage = substr($providerMessage, 0, 240);
            }

            error_log(
                'Nylas transactional email failed. HTTP ' . $status
                . ($curlError !== '' ? ': ' . $curlError : '')
                . ($providerMessage !== '' ? ' — ' . $providerMessage : '')
            );
            return false;
        }

        try {
            EmailQuota::recordSent(1);
        } catch (Throwable $e) {
            error_log('Nylas accepted the email but the application quota record failed: ' . $e->getMessage());
        }

        return true;
    }

    /** @return array{name:string,email:string}|null */
    private static function senderFor(string $purpose, string $domain): ?array
    {
        $configuration = match ($purpose) {
            'verification' => [
                'email_key' => 'NYLAS_VERIFY_FROM_EMAIL',
                'name_key' => 'NYLAS_VERIFY_FROM_NAME',
                'default_local_part' => 'verify',
                'default_name' => 'CourseHubs Verification',
            ],
            'password_reset' => [
                'email_key' => 'NYLAS_PASSWORD_RESET_FROM_EMAIL',
                'name_key' => 'NYLAS_PASSWORD_RESET_FROM_NAME',
                'default_local_part' => 'password-reset',
                'default_name' => 'CourseHubs Security',
            ],
            default => null,
        };

        if ($configuration === null) {
            return null;
        }

        $email = strtolower(trim((string) Config::get(
            $configuration['email_key'],
            $configuration['default_local_part'] . '@' . $domain
        )));
        $name = trim((string) Config::get($configuration['name_key'], $configuration['default_name']));
        $expectedSuffix = '@' . $domain;

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !str_ends_with($email, $expectedSuffix) || $name === '') {
            return null;
        }

        return ['name' => $name, 'email' => $email];
    }

    private static function actionUrl(string $path, string $token): ?string
    {
        $origin = rtrim(trim((string) Config::get('FRONTEND_ORIGIN', '')), '/');
        $parts = parse_url($origin);
        if (!is_array($parts) || !in_array(($parts['scheme'] ?? ''), ['https', 'http'], true) || empty($parts['host'])) {
            error_log('CourseHubs email not sent: FRONTEND_ORIGIN is missing or invalid.');
            return null;
        }

        return $origin . $path . '?token=' . rawurlencode($token);
    }

    private static function emailLayout(
        string $preheader,
        string $heading,
        string $introHtml,
        string $buttonLabel,
        string $url,
        string $expiryText,
        string $securityNote,
        string $accent
    ): string {
        $safePreheader = self::escape($preheader);
        $safeHeading = self::escape($heading);
        $safeButton = self::escape($buttonLabel);
        $safeUrl = self::escape($url);
        $safeExpiry = self::escape($expiryText);
        $safeNote = self::escape($securityNote);

        return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
            . '<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">'
            . '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . $safePreheader . '</div>'
            . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f9;padding:32px 12px"><tr><td align="center">'
            . '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e9f0;border-radius:14px;overflow:hidden">'
            . '<tr><td style="padding:24px 32px;background:#101b35;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.2px">CourseHubs</td></tr>'
            . '<tr><td style="padding:36px 32px 20px"><h1 style="margin:0 0 22px;font-size:25px;line-height:1.25;color:#172033">' . $safeHeading . '</h1>'
            . $introHtml
            . '<p style="margin:26px 0 24px"><a href="' . $safeUrl . '" style="display:inline-block;padding:14px 22px;border-radius:8px;background:' . self::escape($accent) . ';color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">' . $safeButton . '</a></p>'
            . '<p style="margin:0 0 12px;color:#596579;font-size:13px;line-height:1.6">' . $safeExpiry . '</p>'
            . '<p style="margin:0;color:#596579;font-size:13px;line-height:1.6">' . $safeNote . '</p>'
            . '</td></tr><tr><td style="padding:20px 32px;background:#f8f9fc;border-top:1px solid #e8ecf2;color:#7a8495;font-size:12px;line-height:1.6">This is an automated message from CourseHubs. Please do not share account verification or password-reset links with anyone.</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
