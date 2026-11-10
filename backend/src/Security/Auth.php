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
            "SELECT s.scope_type, s.scope_id, s.role,
                    CASE
                        WHEN s.scope_type = 'faculty' THEN f.name
                        WHEN s.scope_type = 'department' THEN d.name
                        ELSE NULL
                    END AS scope_name,
                    CASE WHEN s.scope_type = 'department' THEN f.name ELSE NULL END AS faculty_name
             FROM administrator_scopes s
             LEFT JOIN faculties f
                ON f.id = CASE
                    WHEN s.scope_type = 'faculty' THEN s.scope_id
                    WHEN s.scope_type = 'department' THEN (
                        SELECT department.faculty_id
                        FROM departments department
                        WHERE department.id = s.scope_id
                    )
                    ELSE NULL
                END
             LEFT JOIN departments d
                ON s.scope_type = 'department' AND d.id = s.scope_id
             WHERE s.user_id = ?
             ORDER BY s.scope_type, s.scope_id"
        );
        $stmt->execute([$userId]);
        return array_map(static fn (array $row): array => [
            'scope_type' => (string) $row['scope_type'],
            'scope_id' => $row['scope_id'] === null ? null : (int) $row['scope_id'],
            'role' => (string) $row['role'],
            'scope_name' => $row['scope_name'] !== null ? (string) $row['scope_name'] : null,
            'faculty_name' => $row['faculty_name'] !== null ? (string) $row['faculty_name'] : null,
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

    public static function hasInstitutionScope(array $user, bool $superAdminOnly = false): bool
    {
        $scopes = $user['admin_scopes'] ?? self::scopesFor((int) $user['id']);
        foreach ($scopes as $scope) {
            if ($scope['scope_type'] === 'institution'
                && (!$superAdminOnly || $scope['role'] === 'super_admin')) {
                return true;
            }
        }

        return $scopes === []
            && filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN)
            && (!$superAdminOnly || filter_var($user['is_super_admin'] ?? false, FILTER_VALIDATE_BOOLEAN));
    }

    public static function canManageDepartment(array $user, int $departmentId, bool $superAdminOnly = false): bool
    {
        return self::canManageScope($user, 'department', $departmentId, $superAdminOnly);
    }

    public static function canManageFaculty(array $user, int $facultyId, bool $superAdminOnly = false): bool
    {
        return self::canManageScope($user, 'faculty', $facultyId, $superAdminOnly);
    }


    public static function canManageCourse(array $user, int $courseId, bool $superAdminOnly = false): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT department_id FROM courses WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$courseId]);
        $departmentId = $stmt->fetchColumn();

        if ($departmentId === false) {
            return false;
        }

        if ($departmentId === null) {
            return self::canManageScope($user, 'institution', null, $superAdminOnly);
        }

        return self::canManageDepartment($user, (int) $departmentId, $superAdminOnly);
    }

    public static function canManageOffering(array $user, int $offeringId, bool $superAdminOnly = false): bool
    {
        $stmt = Database::connection()->prepare(
            'SELECT COALESCE(p.department_id, c.department_id) AS department_id
             FROM course_offerings co
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             WHERE co.id = ? AND co.deleted_at IS NULL AND c.deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([$offeringId]);
        $departmentId = $stmt->fetchColumn();

        if ($departmentId === false) {
            return false;
        }

        if ($departmentId === null) {
            return self::canManageScope($user, 'institution', null, $superAdminOnly);
        }

        return self::canManageDepartment($user, (int) $departmentId, $superAdminOnly);
    }

    public static function departmentScopeFilter(array $user, string $departmentExpression): array
    {
        if (self::hasInstitutionScope($user)) {
            return ['sql' => '1 = 1', 'params' => []];
        }

        $conditions = [];
        $params = [];
        foreach (($user['admin_scopes'] ?? self::scopesFor((int) $user['id'])) as $scope) {
            if ($scope['scope_type'] === 'faculty') {
                $conditions[] = $departmentExpression . ' IN (SELECT id FROM departments WHERE faculty_id = ?)';
                $params[] = (int) $scope['scope_id'];
            } elseif ($scope['scope_type'] === 'department') {
                $conditions[] = $departmentExpression . ' = ?';
                $params[] = (int) $scope['scope_id'];
            }
        }

        return [
            'sql' => $conditions === [] ? '1 = 0' : '(' . implode(' OR ', $conditions) . ')',
            'params' => $params,
        ];
    }

    public static function facultyScopeFilter(array $user, string $facultyExpression): array
    {
        if (self::hasInstitutionScope($user)) {
            return ['sql' => '1 = 1', 'params' => []];
        }

        $conditions = [];
        $params = [];
        foreach (($user['admin_scopes'] ?? self::scopesFor((int) $user['id'])) as $scope) {
            if ($scope['scope_type'] === 'faculty') {
                $conditions[] = $facultyExpression . ' = ?';
                $params[] = (int) $scope['scope_id'];
            } elseif ($scope['scope_type'] === 'department') {
                $conditions[] = $facultyExpression . ' = (SELECT faculty_id FROM departments WHERE id = ?)';
                $params[] = (int) $scope['scope_id'];
            }
        }

        return [
            'sql' => $conditions === [] ? '1 = 0' : '(' . implode(' OR ', $conditions) . ')',
            'params' => $params,
        ];
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
