<?php

declare(strict_types=1);

final class AdminManagementController
{
    public static function index(): void
    {
        $actor = Auth::requireAdministratorDelegation();
        $db = Database::connection();
        $sql = "SELECT s.id AS scope_assignment_id, s.user_id, s.scope_type, s.scope_id, s.role,
                       u.first_name, u.surname, u.middle_name, u.email,
                       f.name AS faculty_name, d.name AS department_name,
                       (
                           (
                               (s.scope_type = 'institution' AND EXISTS (
                                   SELECT 1 FROM administrator_scopes scoped
                                   WHERE scoped.user_id = s.user_id AND scoped.scope_type <> 'institution'
                               ))
                               OR
                               (s.scope_type <> 'institution' AND EXISTS (
                                   SELECT 1 FROM administrator_scopes institution
                                   WHERE institution.user_id = s.user_id AND institution.scope_type = 'institution'
                               ))
                           )::int
                       ) AS has_scope_hierarchy_conflict
                FROM administrator_scopes s
                JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
                LEFT JOIN faculties f ON s.scope_type = 'faculty' AND f.id = s.scope_id
                LEFT JOIN departments d ON s.scope_type = 'department' AND d.id = s.scope_id
                ORDER BY s.scope_type, f.name, d.name, u.surname, u.first_name";
        $rows = $db->query($sql)->fetchAll();
        $rows = array_values(array_filter($rows, static function (array $row) use ($actor): bool {
            return Auth::canManageScope($actor, (string) $row['scope_type'], $row['scope_id'] === null ? null : (int) $row['scope_id'], true);
        }));
        foreach ($rows as &$row) {
            $row['has_scope_hierarchy_conflict'] = (int) ($row['has_scope_hierarchy_conflict'] ?? 0) === 1;
        }
        unset($row);

        Response::json(['administrators' => $rows]);
    }

    public static function searchAccounts(): void
    {
        $actor = Auth::requireAdministratorDelegation();
        $email = strtolower(trim((string) ($_GET['email'] ?? '')));
        if (strlen($email) < 4 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['accounts' => []]);
        }
        $stmt = Database::connection()->prepare(
            "SELECT id, first_name, surname, middle_name, email, account_type
             FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
               AND status = 'active' AND is_verified IS TRUE LIMIT 1"
        );
        $stmt->execute([$email]);
        $accounts = $stmt->fetchAll();

        $assignmentQuery = Database::connection()->prepare(
            "SELECT s.scope_type, s.scope_id, s.role,
                    f.name AS faculty_name, d.name AS department_name
             FROM administrator_scopes s
             LEFT JOIN faculties f ON s.scope_type = 'faculty' AND f.id = s.scope_id
             LEFT JOIN departments d ON s.scope_type = 'department' AND d.id = s.scope_id
             WHERE s.user_id = ?
             ORDER BY s.scope_type, f.name, d.name"
        );
        $flagsQuery = Database::connection()->prepare(
            "SELECT
                CASE WHEN EXISTS (
                    SELECT 1 FROM administrator_scopes
                    WHERE user_id = ? AND scope_type = 'institution'
                ) THEN 1 ELSE 0 END AS has_institution_assignment,
                CASE WHEN EXISTS (
                    SELECT 1 FROM administrator_scopes
                    WHERE user_id = ? AND scope_type <> 'institution'
                ) THEN 1 ELSE 0 END AS has_scoped_assignments"
        );

        foreach ($accounts as &$account) {
            $assignmentQuery->execute([(int) $account['id']]);
            $assignments = $assignmentQuery->fetchAll();
            $account['administrator_assignments'] = array_values(array_filter(
                $assignments,
                static fn (array $assignment): bool => Auth::canManageScope(
                    $actor,
                    (string) $assignment['scope_type'],
                    $assignment['scope_id'] === null ? null : (int) $assignment['scope_id'],
                    true
                )
            ));

            $flagsQuery->execute([(int) $account['id'], (int) $account['id']]);
            $flags = $flagsQuery->fetch();
            $account['has_institution_assignment'] = (int) ($flags['has_institution_assignment'] ?? 0) === 1;
            $account['has_scoped_assignments'] = (int) ($flags['has_scoped_assignments'] ?? 0) === 1;
        }
        unset($account);

        Response::json(['accounts' => $accounts]);
    }

    public static function assign(): void
    {
        $actor = Auth::requireAdministratorDelegation();
        $body = self::input();
        $userId = self::positiveId($body['user_id'] ?? null);
        if ($userId === (int) $actor['id']) {
            Response::error('You cannot expand your own administrator scope.', 403, ['code' => 'SELF_SCOPE_EXPANSION_FORBIDDEN']);
        }

        $scopeType = strtolower(trim((string) ($body['scope_type'] ?? '')));
        $scopeId = ($body['scope_id'] ?? null) === null || $body['scope_id'] === '' ? null : self::positiveId($body['scope_id']);
        $role = strtolower(trim((string) ($body['role'] ?? 'admin')));

        if (!in_array($scopeType, ['institution', 'faculty', 'department'], true)
            || !in_array($role, ['admin', 'super_admin'], true)
            || ($scopeType === 'institution' && $scopeId !== null)
            || ($scopeType !== 'institution' && $scopeId === null)) {
            Response::error('Provide a valid administrator scope and role.', 422);
        }

        // Only a Super Administrator in the relevant scope, or an Institution
        // Super Administrator, may make an appointment within that scope.
        if ($scopeType === 'institution') {
            if (!Auth::canManageScope($actor, 'institution', null, true)) {
                Response::error('Only the Institution Super Admin can appoint institution administrators.', 403, ['code' => 'ADMIN_APPOINTMENT_FORBIDDEN']);
            }
        } elseif (!Auth::canManageScope($actor, $scopeType, $scopeId, true)) {
            Response::error('You cannot appoint administrators outside your own authority.', 403, ['code' => 'ADMIN_APPOINTMENT_FORBIDDEN']);
        }

        $db = Database::connection();

        if ($scopeType === 'faculty') {
            $check = $db->prepare('SELECT id FROM faculties WHERE id = ? AND is_active IS TRUE');
            $check->execute([$scopeId]);
        } elseif ($scopeType === 'department') {
            $check = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
            $check->execute([$scopeId]);
        }
        if (isset($check) && !$check->fetchColumn()) {
            Response::error('Choose an active academic scope.', 422);
        }

        $db->beginTransaction();
        try {
            // Serialise appointments for the same account to prevent concurrent
            // requests from creating conflicting institutional and scoped access.
            $target = $db->prepare(
                "SELECT id FROM users
                 WHERE id = ? AND deleted_at IS NULL AND status = 'active' AND is_verified IS TRUE
                 FOR UPDATE"
            );
            $target->execute([$userId]);
            if (!$target->fetchColumn()) {
                $db->rollBack();
                Response::error('Choose an active, verified account.', 404);
            }

            $existingQuery = $db->prepare(
                'SELECT id, scope_type, scope_id, role
                 FROM administrator_scopes
                 WHERE user_id = ?
                 ORDER BY scope_type, scope_id
                 FOR UPDATE'
            );
            $existingQuery->execute([$userId]);
            $existingScopes = $existingQuery->fetchAll();

            $institutionAssignment = null;
            $scopedAssignments = [];
            $matchingAssignment = null;

            foreach ($existingScopes as $existing) {
                if ($existing['scope_type'] === 'institution') {
                    $institutionAssignment = $existing;
                } else {
                    $scopedAssignments[] = $existing;
                }

                $sameScope = $existing['scope_type'] === $scopeType
                    && (($existing['scope_id'] === null && $scopeId === null)
                        || ($existing['scope_id'] !== null && $scopeId !== null && (int) $existing['scope_id'] === $scopeId));
                if ($sameScope) {
                    $matchingAssignment = $existing;
                }
            }

            // Institution-wide authority replaces subordinate appointments;
            // it must never coexist with faculty or department assignments.
            if ($scopeType === 'institution' && $scopedAssignments !== []) {
                $db->rollBack();
                Response::error(
                    'This account already has faculty or department administrator appointments. Review those appointments before assigning institution-wide access.',
                    409,
                    ['code' => 'ADMIN_SCOPE_HIERARCHY_CONFLICT']
                );
            }

            if ($scopeType !== 'institution' && $institutionAssignment !== null) {
                $db->rollBack();
                Response::error(
                    'This account already has institution-wide administrator access and cannot receive an additional faculty or department appointment.',
                    409,
                    ['code' => 'ADMIN_SCOPE_HIERARCHY_CONFLICT']
                );
            }

            if ($matchingAssignment !== null) {
                if ($matchingAssignment['role'] === $role) {
                    $db->rollBack();
                    Response::error('This account already has that administrator assignment.', 409, ['code' => 'ADMIN_ASSIGNMENT_EXISTS']);
                }

                $action = $matchingAssignment['role'] === 'admin' && $role === 'super_admin'
                    ? 'promoted'
                    : 'demoted';

                $update = $db->prepare(
                    'UPDATE administrator_scopes
                     SET role = ?, assigned_by = ?
                     WHERE id = ?
                     RETURNING id'
                );
                $update->execute([$role, (int) $actor['id'], (int) $matchingAssignment['id']]);
                $assignmentId = $update->fetchColumn();

                $db->prepare(
                    'INSERT INTO administrator_scope_history (user_id, scope_type, scope_id, role, action, changed_by)
                     VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([$userId, $scopeType, $scopeId, $role, $action, (int) $actor['id']]);

                self::syncLegacyFlags($db, $userId);
                $db->commit();

                Response::json([
                    'message' => $action === 'promoted'
                        ? 'Administrator access has been promoted.'
                        : 'Administrator access has been changed.',
                    'assignment_id' => (int) $assignmentId,
                    'action' => $action,
                ]);
            }

            $insert = $db->prepare(
                'INSERT INTO administrator_scopes (user_id, scope_type, scope_id, role, assigned_by)
                 VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id'
            );
            $insert->execute([$userId, $scopeType, $scopeId, $role, (int) $actor['id']]);
            $assignmentId = $insert->fetchColumn();
            if (!$assignmentId) {
                $db->rollBack();
                Response::error('This account already has that administrator assignment.', 409, ['code' => 'ADMIN_ASSIGNMENT_EXISTS']);
            }

            $db->prepare(
                'INSERT INTO administrator_scope_history (user_id, scope_type, scope_id, role, action, changed_by)
                 VALUES (?, ?, ?, ?, \'assigned\', ?)'
            )->execute([$userId, $scopeType, $scopeId, $role, (int) $actor['id']]);

            self::syncLegacyFlags($db, $userId);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        Response::json(['message' => 'Administrator access assigned.', 'assignment_id' => (int) $assignmentId], 201);
    }

    private static function syncLegacyFlags(PDO $db, int $userId): void
    {
        $db->prepare(
            "UPDATE users SET is_admin = TRUE,
             is_super_admin = EXISTS (
                 SELECT 1 FROM administrator_scopes
                 WHERE user_id = ? AND scope_type = 'institution' AND role = 'super_admin'
             )
             WHERE id = ?"
        )->execute([$userId, $userId]);
    }

    public static function revoke(array $params): void
    {
        $actor = Auth::requireAdministratorDelegation();
        $assignmentId = self::positiveId($params['id'] ?? null);
        $db = Database::connection();
        $db->beginTransaction();
        $find = $db->prepare('SELECT * FROM administrator_scopes WHERE id = ? FOR UPDATE');
        $find->execute([$assignmentId]);
        $assignment = $find->fetch();
        if (!$assignment) { $db->rollBack(); Response::error('The administrator assignment could not be found.', 404); }

        $scopeId = $assignment['scope_id'] === null ? null : (int) $assignment['scope_id'];
        if (!Auth::canManageScope($actor, (string) $assignment['scope_type'], $scopeId, true)) {
            $db->rollBack();
            Response::error('You cannot revoke administrator access outside your own authority.', 403, ['code' => 'ADMIN_REVOCATION_FORBIDDEN']);
        }
        if ((int) $assignment['user_id'] === (int) $actor['id']) {
            $db->rollBack();
            Response::error('You cannot revoke your own administrator assignment.', 409);
        }
        if ($assignment['role'] === 'super_admin') {
            $last = $db->prepare(
                "SELECT COUNT(*) FROM administrator_scopes
                 WHERE scope_type = ? AND scope_id IS NOT DISTINCT FROM ?
                   AND role = 'super_admin' AND id <> ?"
            );
            $last->execute([$assignment['scope_type'], $scopeId, $assignmentId]);
            if ((int) $last->fetchColumn() === 0) {
                $db->rollBack();
                Response::error('The last Super Administrator for this scope cannot be removed.', 409, ['code' => 'LAST_SCOPE_SUPER_ADMIN']);
            }
        }

        try {
            $db->prepare('DELETE FROM administrator_scopes WHERE id = ?')->execute([$assignmentId]);
            $db->prepare(
                'INSERT INTO administrator_scope_history (user_id, scope_type, scope_id, role, action, changed_by)
                 VALUES (?, ?, ?, ?, \'revoked\', ?)'
            )->execute([(int) $assignment['user_id'], $assignment['scope_type'], $scopeId, $assignment['role'], (int) $actor['id']]);
            $remaining = $db->prepare('SELECT COUNT(*) FROM administrator_scopes WHERE user_id = ?');
            $remaining->execute([(int) $assignment['user_id']]);
            if ((int) $remaining->fetchColumn() === 0) {
                $db->prepare('UPDATE users SET is_admin = FALSE, is_super_admin = FALSE WHERE id = ?')
                    ->execute([(int) $assignment['user_id']]);
            } else {
                $db->prepare(
                    "UPDATE users SET is_admin = TRUE,
                     is_super_admin = EXISTS (SELECT 1 FROM administrator_scopes WHERE user_id = ? AND scope_type = 'institution' AND role = 'super_admin')
                     WHERE id = ?"
                )->execute([(int) $assignment['user_id'], (int) $assignment['user_id']]);
            }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }
        Response::json(['message' => 'Administrator access revoked.']);
    }

    private static function input(): array
    {
        try {
            $value = json_decode((string) file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            Response::error('Request body must contain valid JSON.', 400);
        }
        if (!is_array($value)) Response::error('Request body must contain a JSON object.', 400);
        return $value;
    }

    private static function positiveId(mixed $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) Response::error('Provide a valid account or assignment.', 422);
        return $id;
    }
}
