<?php

declare(strict_types=1);

/** Minimal HS256 JWT implementation; tokens are short-lived and versioned. */
final class Jwt
{
    private const ISSUER = 'coursehubs-api';
    private const LIFETIME_SECONDS = 8 * 60 * 60;

    public static function issue(int $userId, int $tokenVersion): string
    {
        $secret = self::secret();
        $now = time();
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $payload = [
            'iss' => self::ISSUER,
            'sub' => $userId,
            'ver' => $tokenVersion,
            'iat' => $now,
            'exp' => $now + self::LIFETIME_SECONDS,
        ];

        $unsigned = self::encode(json_encode($header, JSON_THROW_ON_ERROR)) . '.'
            . self::encode(json_encode($payload, JSON_THROW_ON_ERROR));
        $signature = hash_hmac('sha256', $unsigned, $secret, true);

        return $unsigned . '.' . self::encode($signature);
    }

    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
        $headerJson = self::decode($encodedHeader);
        $payloadJson = self::decode($encodedPayload);
        $signature = self::decode($encodedSignature);

        if ($headerJson === false || $payloadJson === false || $signature === false) {
            return null;
        }

        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);
        if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256' || !is_array($payload)) {
            return null;
        }

        $unsigned = $encodedHeader . '.' . $encodedPayload;
        $expected = hash_hmac('sha256', $unsigned, self::secret(), true);
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        if (($payload['iss'] ?? null) !== self::ISSUER
            || !isset($payload['sub'], $payload['ver'], $payload['iat'], $payload['exp'])
            || !is_numeric($payload['sub'])
            || !is_numeric($payload['ver'])
            || !is_numeric($payload['iat'])
            || !is_numeric($payload['exp'])
            || (int) $payload['iat'] > time() + 60
            || (int) $payload['exp'] <= time()) {
            return null;
        }

        return $payload;
    }

    private static function secret(): string
    {
        $secret = Config::get('JWT_SECRET', '');
        if ($secret === null || strlen($secret) < 32) {
            throw new RuntimeException('JWT_SECRET must contain at least 32 characters.');
        }

        return $secret;
    }

    private static function encode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function decode(string $value): string|false
    {
        $padding = strlen($value) % 4;
        if ($padding !== 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode(strtr($value, '-_', '+/'), true);
    }
}
