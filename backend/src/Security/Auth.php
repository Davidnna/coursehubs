<?php

declare(strict_types=1);

final class Auth
{
    public static function requireUser(): array
    {
        $token = self::bearerToken();
        if ($token === null) {
            Response::error('Please sign in to continue.', 401, ['code' => 'UNAUTHENTICATED']);
        }

        try {
            $claims = Jwt::verify($token);
        } catch (Throwable $e) {
            error_log('JWT verification configuration error: ' . $e->getMessage());
            Response::error('Authentication is temporarily unavailable.', 500);
        }

        if ($claims === null) {
            Response::error('Your session has expired. Please sign in again.', 401, ['code' => 'INVALID_TOKEN']);
        }

        $stmt = Database::connection()->prepare(
            'SELECT id, first_name, surname, middle_name, email, account_type, level,
                    CASE WHEN is_admin IS TRUE THEN 1 ELSE 0 END AS is_admin,
                    CASE WHEN is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin,
                    CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified, status, auth_token_version
             FROM users
             WHERE id = ? AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([(int) $claims['sub']]);
        $user = $stmt->fetch();

        if (!$user
            || (int) $user['auth_token_version'] !== (int) $claims['ver']
            || (int) $user['is_verified'] !== 1
            || $user['status'] !== 'active') {
            Response::error('Your session is no longer valid. Please sign in again.', 401, ['code' => 'SESSION_INVALID']);
        }

        return $user;
    }

    public static function requireAdmin(): array
    {
        $user = self::requireUser();
        if (!filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            Response::error('You do not have permission to manage academic records.', 403, ['code' => 'ADMIN_ACCESS_REQUIRED']);
        }
        return $user;
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($header === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                if (strtolower($name) === 'authorization') {
                    $header = $value;
                    break;
                }
            }
        }

        if (preg_match('/^Bearer\s+(.+)$/i', trim($header), $matches)) {
            return trim($matches[1]);
        }

        return null;
    }
}
