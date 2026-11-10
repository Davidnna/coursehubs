<?php

declare(strict_types=1);

/**
 * Database-backed authentication throttling.
 *
 * Only keyed HMAC digests are stored. Email addresses and client IP addresses
 * are never written to the rate-limit table in plaintext.
 */
final class RateLimiter
{
    public static function clientIp(): string
    {
        $remoteAddress = self::normaliseIp((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        if ($remoteAddress === null) {
            return 'unknown';
        }

        $trustedProxies = self::trustedProxyCidrs();
        if (!self::isTrustedProxy($remoteAddress, $trustedProxies)) {
            return $remoteAddress;
        }

        $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
        if ($forwarded !== '') {
            $chain = [];

            foreach (explode(',', $forwarded) as $candidate) {
                $ip = self::normaliseIp($candidate);
                if ($ip !== null) {
                    $chain[] = $ip;
                }
            }

            $chain[] = $remoteAddress;

            for ($index = count($chain) - 1; $index >= 0; $index--) {
                if (!self::isTrustedProxy($chain[$index], $trustedProxies)) {
                    return $chain[$index];
                }
            }
        }

        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP'] as $header) {
            $candidate = self::normaliseIp((string) ($_SERVER[$header] ?? ''));
            if ($candidate !== null && !self::isTrustedProxy($candidate, $trustedProxies)) {
                return $candidate;
            }
        }

        return $remoteAddress;
    }

    /**
     * Consume one attempt from a fixed-window bucket.
     *
     * @return array{allowed: bool, retry_after: int}
     */
    public static function consume(
        PDO $db,
        string $action,
        string $subject,
        int $maximumAttempts,
        int $windowSeconds,
        int $blockSeconds
    ): array {
        if ($maximumAttempts < 1 || $windowSeconds < 1 || $blockSeconds < 1) {
            throw new InvalidArgumentException('Rate-limit settings must be positive integers.');
        }

        $keyHash = self::keyHash($action, $subject);
        $statement = $db->prepare(
            "INSERT INTO auth_rate_limits (
                key_hash, action, window_started_at, attempts, blocked_until, updated_at
             )
             VALUES (?, ?, NOW(), 1, NULL, NOW())
             ON CONFLICT (key_hash) DO UPDATE
             SET attempts = CASE
                    WHEN auth_rate_limits.blocked_until > NOW()
                        THEN auth_rate_limits.attempts
                    WHEN auth_rate_limits.window_started_at <= NOW() - (CAST(? AS INTEGER) * INTERVAL '1 second')
                        THEN 1
                    ELSE auth_rate_limits.attempts + 1
                 END,
                 window_started_at = CASE
                    WHEN auth_rate_limits.blocked_until > NOW()
                        THEN auth_rate_limits.window_started_at
                    WHEN auth_rate_limits.window_started_at <= NOW() - (CAST(? AS INTEGER) * INTERVAL '1 second')
                        THEN NOW()
                    ELSE auth_rate_limits.window_started_at
                 END,
                 blocked_until = CASE
                    WHEN auth_rate_limits.blocked_until > NOW()
                        THEN auth_rate_limits.blocked_until
                    WHEN auth_rate_limits.window_started_at <= NOW() - (CAST(? AS INTEGER) * INTERVAL '1 second')
                        THEN NULL
                    WHEN auth_rate_limits.attempts + 1 > ?
                        THEN NOW() + (CAST(? AS INTEGER) * INTERVAL '1 second')
                    ELSE NULL
                 END,
                 updated_at = NOW()
             RETURNING
                CASE
                    WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN TRUE
                    ELSE FALSE
                END AS is_blocked,
                CASE
                    WHEN blocked_until IS NOT NULL AND blocked_until > NOW()
                        THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (blocked_until - NOW()))))::INTEGER
                    ELSE 0
                END AS retry_after"
        );
        $statement->execute([
            $keyHash,
            $action,
            $windowSeconds,
            $windowSeconds,
            $windowSeconds,
            $maximumAttempts,
            $blockSeconds,
        ]);

        $result = $statement->fetch() ?: [];
        $blocked = in_array(
            strtolower((string) ($result['is_blocked'] ?? 'false')),
            ['1', 't', 'true', 'yes'],
            true
        );

        self::occasionallyCleanExpiredRecords($db);

        return [
            'allowed' => !$blocked,
            'retry_after' => max(0, (int) ($result['retry_after'] ?? 0)),
        ];
    }

    public static function enforce(
        PDO $db,
        string $action,
        string $subject,
        int $maximumAttempts,
        int $windowSeconds,
        int $blockSeconds,
        string $message = 'Too many attempts. Please wait a little while and try again.'
    ): void {
        self::rejectIfLimited(
            self::consume($db, $action, $subject, $maximumAttempts, $windowSeconds, $blockSeconds),
            $message
        );
    }

    /**
     * Respond with a consistent public error when a bucket is exhausted.
     *
     * @param array{allowed: bool, retry_after: int} $result
     */
    public static function rejectIfLimited(
        array $result,
        string $message = 'Too many attempts. Please wait a little while and try again.'
    ): void {
        if ($result['allowed']) {
            return;
        }

        if ($result['retry_after'] > 0) {
            header('Retry-After: ' . $result['retry_after']);
        }

        Response::error($message, 429, ['code' => 'AUTH_RATE_LIMITED']);
    }

    public static function clear(PDO $db, string $action, string $subject): void
    {
        $statement = $db->prepare('DELETE FROM auth_rate_limits WHERE key_hash = ?');
        $statement->execute([self::keyHash($action, $subject)]);
    }

    private static function occasionallyCleanExpiredRecords(PDO $db): void
    {
        try {
            if (random_int(1, 100) === 1) {
                $db->exec("DELETE FROM auth_rate_limits WHERE updated_at < NOW() - INTERVAL '7 days'");
            }
        } catch (Throwable $exception) {
            error_log('CourseHubs rate-limit cleanup failed: ' . $exception->getMessage());
        }
    }

    private static function trustedProxyCidrs(): array
    {
        $configured = (string) Config::get('TRUSTED_PROXY_CIDRS', '127.0.0.1/32,::1/128');
        if (trim($configured) === '') {
            return [];
        }

        return array_values(array_filter(
            array_map('trim', explode(',', $configured)),
            static fn (string $cidr): bool => $cidr !== ''
        ));
    }

    private static function isTrustedProxy(string $ip, array $trustedCidrs): bool
    {
        foreach ($trustedCidrs as $cidr) {
            if (self::ipMatchesCidr($ip, $cidr)) {
                return true;
            }
        }

        return false;
    }

    private static function ipMatchesCidr(string $ip, string $cidr): bool
    {
        $parts = explode('/', trim($cidr), 2);
        $network = self::normaliseIp($parts[0]);
        $packedIp = @inet_pton($ip);
        $packedNetwork = $network !== null ? @inet_pton($network) : false;

        if ($packedIp === false || $packedNetwork === false || strlen($packedIp) !== strlen($packedNetwork)) {
            return false;
        }

        $addressBits = strlen($packedIp) * 8;
        $prefixLength = isset($parts[1]) ? filter_var($parts[1], FILTER_VALIDATE_INT) : $addressBits;
        if ($prefixLength === false || $prefixLength < 0 || $prefixLength > $addressBits) {
            return false;
        }

        $wholeBytes = intdiv($prefixLength, 8);
        $remainingBits = $prefixLength % 8;

        if ($wholeBytes > 0 && substr($packedIp, 0, $wholeBytes) !== substr($packedNetwork, 0, $wholeBytes)) {
            return false;
        }

        if ($remainingBits === 0) {
            return true;
        }

        $mask = (0xff << (8 - $remainingBits)) & 0xff;
        return (ord($packedIp[$wholeBytes]) & $mask) === (ord($packedNetwork[$wholeBytes]) & $mask);
    }

    private static function keyHash(string $action, string $subject): string
    {
        $secret = Config::get('JWT_SECRET', '');
        if ($secret === null || strlen($secret) < 32) {
            throw new RuntimeException('Authentication rate limiting is not configured.');
        }

        return hash_hmac('sha256', $action . "\0" . trim($subject), $secret);
    }

    private static function normaliseIp(string $candidate): ?string
    {
        $candidate = trim($candidate);
        if ($candidate === '') {
            return null;
        }

        if (str_starts_with($candidate, '[') && str_contains($candidate, ']')) {
            $candidate = substr($candidate, 1, strpos($candidate, ']') - 1);
        }

        $packed = @inet_pton($candidate);
        if ($packed === false) {
            return null;
        }

        $normalised = inet_ntop($packed);
        return is_string($normalised) ? strtolower($normalised) : null;
    }
}
