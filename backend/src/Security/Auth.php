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

    /** Existing institution-wide routes remain institution-only until scoped. */
    public static function requireAdmin(): array
    {
        $user = self::requireAdministrator();
        if (!self::canManageScope($user, 'institution', null)) {
            Response::error('You do not have institution-wide administrator access.', 403, ['code' => 'INSTITUTION_ADMIN_ACCESS_REQUIRED']);
        }
        return $user;
    }

    public static function requireAdministrator(): array
    {
        $user = self::requireUser();
        $user['admin_scopes'] = self::scopesFor((int) $user['id']);
        if ($user['admin_scopes'] === [] && !filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            Response::error('You do not have permission to manage academic records.', 403, ['code' => 'ADMIN_ACCESS_REQUIRED']);
        }
        return $user;
    }

    public static function requireAdministratorDelegation(): array
    {
        $user = self::requireAdministrator();

        if (!self::canManageAdministratorAssignments($user)) {
            Response::error('You do not have permission to manage administrator assignments.', 403, ['code' => 'ADMIN_DELEGATION_ACCESS_REQUIRED']);
        }

        return $user;
    }

    public static function canManageAdministratorAssignments(array $user): bool
    {
        $scopes = $user['admin_scopes'] ?? self::scopesFor((int) $user['id']);

        foreach ($scopes as $scope) {
            if (($scope['role'] ?? null) === 'super_admin') {
                return true;
            }
        }

        return $scopes === []
            && filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN)
            && filter_var($user['is_super_admin'] ?? false, FILTER_VALIDATE_BOOLEAN);
    }

    public static function scopesFor(int $userId): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT scope_type, scope_id, role FROM administrator_scopes WHERE user_id = ? ORDER BY scope_type, scope_id'
        );
        $stmt->execute([$userId]);
        return array_map(static fn (array $row): array => [
            'scope_type' => (string) $row['scope_type'],
            'scope_id' => $row['scope_id'] === null ? null : (int) $row['scope_id'],
            'role' => (string) $row['role'],
        ], $stmt->fetchAll());
    }

    public static function canManageScope(array $user, string $scopeType, ?int $scopeId = null, bool $superAdminOnly = false): bool
    {
        $requiredRole = $superAdminOnly ? 'super_admin' : null;
        foreach (($user['admin_scopes'] ?? self::scopesFor((int) $user['id'])) as $scope) {
            if ($scope['scope_type'] === 'institution') {
                if ($requiredRole !== null && $scope['role'] !== $requiredRole) continue;
                return true;
            }
            if ($requiredRole !== null && $scope['role'] !== $requiredRole) continue;
            if ($scope['scope_type'] === $scopeType && $scopeId !== null && (int) $scope['scope_id'] === $scopeId) return true;
            if ($scopeType === 'department' && $scope['scope_type'] === 'faculty' && $scopeId !== null) {
                $faculty = Database::connection()->prepare('SELECT faculty_id FROM departments WHERE id = ?');
                $faculty->execute([$scopeId]);
                if ((int) $faculty->fetchColumn() === (int) $scope['scope_id']) return true;
            }
        }
        if (empty($user['admin_scopes']) && filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return !$superAdminOnly || filter_var($user['is_super_admin'] ?? false, FILTER_VALIDATE_BOOLEAN);
        }
        return false;
    }

    public static function requireScope(string $scopeType, ?int $scopeId = null, bool $superAdminOnly = false): array
    {
        $user = self::requireAdministrator();
        if (!self::canManageScope($user, $scopeType, $scopeId, $superAdminOnly)) {
            Response::error('You do not have permission to manage records in this academic scope.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
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
