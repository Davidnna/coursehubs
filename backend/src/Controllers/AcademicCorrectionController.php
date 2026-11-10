<?php

declare(strict_types=1);

/**
 * Student-submitted academic affiliation corrections with administrator review.
 * Students cannot directly edit department, programme or level on their account.
 */
final class AcademicCorrectionController
{
    private const LEVELS = [100, 200, 300, 400, 500, 600];

    public static function mine(): void
    {
        $user = Auth::requireUser();
        self::requireStudent($user);
        $db = Database::connection();

        $profileStmt = $db->prepare(
            'SELECT u.id, u.account_type, u.department_id, u.programme_id, u.level,
                    d.name AS department_name, f.name AS faculty_name, p.name AS programme_name
             FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             LEFT JOIN faculties f ON f.id = d.faculty_id
             LEFT JOIN programmes p ON p.id = u.programme_id
             WHERE u.id = ? AND u.deleted_at IS NULL
             LIMIT 1'
        );
        $profileStmt->execute([(int) $user['id']]);
        $profile = $profileStmt->fetch();
        if (!$profile) Response::error('Your account could not be found.', 404);

        $historyStmt = $db->prepare(
            'SELECT r.id, r.current_department_id, r.current_programme_id, r.current_level,
                    r.requested_department_id, r.requested_department_name,
                    r.requested_programme_id, r.requested_programme_name, r.requested_level,
                    r.reason, r.status, r.decision_note, r.approved_level,
                    r.created_at, r.reviewed_at,
                    current_d.name AS current_department_name,
                    current_p.name AS current_programme_name,
                    requested_d.name AS requested_department_label,
                    requested_p.name AS requested_programme_label,
                    approved_d.name AS approved_department_name,
                    approved_p.name AS approved_programme_name,
                    reviewer.first_name AS reviewer_first_name,
                    reviewer.surname AS reviewer_surname
             FROM academic_information_correction_requests r
             LEFT JOIN departments current_d ON current_d.id = r.current_department_id
             LEFT JOIN programmes current_p ON current_p.id = r.current_programme_id
             LEFT JOIN departments requested_d ON requested_d.id = r.requested_department_id
             LEFT JOIN programmes requested_p ON requested_p.id = r.requested_programme_id
             LEFT JOIN departments approved_d ON approved_d.id = r.approved_department_id
             LEFT JOIN programmes approved_p ON approved_p.id = r.approved_programme_id
             LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
             WHERE r.user_id = ?
             ORDER BY r.created_at DESC
             LIMIT 50'
        );
        $historyStmt->execute([(int) $user['id']]);

        Response::json([
            'profile' => [
                'department_id' => $profile['department_id'] !== null ? (int) $profile['department_id'] : null,
                'department_name' => $profile['department_name'],
                'faculty_name' => $profile['faculty_name'],
                'programme_id' => $profile['programme_id'] !== null ? (int) $profile['programme_id'] : null,
                'programme_name' => $profile['programme_name'],
                'level' => $profile['level'] !== null ? (int) $profile['level'] : null,
            ],
            'requests' => array_map([self::class, 'requestPayload'], $historyStmt->fetchAll()),
        ]);
    }

    public static function create(): void
    {
        $user = Auth::requireUser();
        self::requireStudent($user);
        $body = self::input();

        $departmentId = self::positiveIdOrNull($body['department_id'] ?? null);
        $departmentName = self::cleanOptionalName($body['department_name'] ?? null, 'department_name');
        $programmeId = self::positiveIdOrNull($body['programme_id'] ?? null);
        $programmeName = self::cleanOptionalName($body['programme_name'] ?? null, 'programme_name');
        $requestedLevel = filter_var($body['level'] ?? null, FILTER_VALIDATE_INT);
        $reasonRaw = $body['reason'] ?? '';
        if (!is_string($reasonRaw)) {
            Response::error('Enter a short explanation for the correction request.', 422);
        }
        $reason = trim($reasonRaw);

        if (($departmentId === null) === ($departmentName === null)) {
            Response::error('Choose a department or tell us which department is missing.', 422, [
                'fields' => ['department' => 'Select a listed department or enter the department name.'],
            ]);
        }
        if (($programmeId === null) === ($programmeName === null)) {
            Response::error('Choose a programme or tell us which programme is missing.', 422, [
                'fields' => ['programme' => 'Select a listed programme or enter the programme name.'],
            ]);
        }
        if (!in_array($requestedLevel, self::LEVELS, true)) {
            Response::error('Choose a valid academic level.', 422, [
                'fields' => ['level' => 'Choose a level from 100 to 600.'],
            ]);
        }
        if (self::characterLength($reason) < 10 || self::characterLength($reason) > 1500) {
            Response::error('Explain the correction in 10 to 1,500 characters.', 422, [
                'fields' => ['reason' => 'Explain the correction in 10 to 1,500 characters.'],
            ]);
        }

        $db = Database::connection();
        if ($departmentId !== null) {
            $department = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE LIMIT 1');
            $department->execute([$departmentId]);
            if (!$department->fetchColumn()) {
                Response::error('The selected department is no longer available. Refresh the page and choose another.', 422);
            }
        }

        if ($programmeId !== null) {
            if ($departmentId === null) {
                Response::error('Choose a listed department before selecting a listed programme.', 422);
            }
            $programme = $db->prepare(
                'SELECT id FROM programmes
                 WHERE id = ? AND department_id = ? AND is_active IS TRUE
                 LIMIT 1'
            );
            $programme->execute([$programmeId, $departmentId]);
            if (!$programme->fetchColumn()) {
                Response::error('The selected programme does not belong to the selected department.', 422);
            }
        }

        $levelCheck = $db->prepare('SELECT level FROM academic_levels WHERE level = ? AND is_active IS TRUE LIMIT 1');
        $levelCheck->execute([$requestedLevel]);
        if (!$levelCheck->fetchColumn()) {
            Response::error('The selected academic level is not currently available.', 422);
        }

        $db->beginTransaction();
        try {
            $currentStmt = $db->prepare(
                "SELECT department_id, programme_id, level
                 FROM users
                 WHERE id = ? AND account_type = 'student' AND deleted_at IS NULL
                 FOR UPDATE"
            );
            $currentStmt->execute([(int) $user['id']]);
            $current = $currentStmt->fetch();
            if (!$current) {
                $db->rollBack();
                Response::error('Your student account could not be found.', 404);
            }

            $pending = $db->prepare(
                "SELECT id FROM academic_information_correction_requests
                 WHERE user_id = ? AND status = 'pending'
                 LIMIT 1"
            );
            $pending->execute([(int) $user['id']]);
            if ($pending->fetchColumn()) {
                $db->rollBack();
                Response::error('You already have an academic information request awaiting review. You can submit another after it has been decided.', 409, ['code' => 'ACADEMIC_CORRECTION_PENDING']);
            }

            $sameDepartment = $departmentId !== null
                && (int) $departmentId === (int) ($current['department_id'] ?? 0);
            $sameProgramme = $programmeId !== null
                && (int) $programmeId === (int) ($current['programme_id'] ?? 0);
            $sameLevel = (int) $requestedLevel === (int) $current['level'];
            if ($sameDepartment && $sameProgramme && $sameLevel) {
                $db->rollBack();
                Response::error('The information you selected matches your current academic profile. Change at least one field before submitting.', 422);
            }

            $insert = $db->prepare(
                'INSERT INTO academic_information_correction_requests (
                    user_id, current_department_id, current_programme_id, current_level,
                    requested_department_id, requested_department_name,
                    requested_programme_id, requested_programme_name,
                    requested_level, reason
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id'
            );
            $insert->execute([
                (int) $user['id'],
                $current['department_id'],
                $current['programme_id'],
                $current['level'],
                $departmentId,
                $departmentName,
                $programmeId,
                $programmeName,
                (int) $requestedLevel,
                $reason,
            ]);
            $requestId = (int) $insert->fetchColumn();
            $db->prepare(
                'INSERT INTO activity_log (actor_user_id, action_type, target_type, target_id, description)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([
                (int) $user['id'],
                'academic_profile_correction_submitted',
                'academic_profile_correction',
                $requestId,
                'Student submitted an academic information correction request.',
            ]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        Response::json([
            'message' => 'Your academic information correction request has been submitted for administrator review.',
            'request_id' => $requestId,
        ], 201);
    }

    public static function adminIndex(): void
    {
        $admin = Auth::requireAdministrator();
        $status = strtolower(trim((string) ($_GET['status'] ?? 'pending')));
        if (!in_array($status, ['pending', 'approved', 'rejected', 'all'], true)) {
            $status = 'pending';
        }

        $currentScope = Auth::departmentScopeFilter($admin, 'r.current_department_id');
        $requestedScope = Auth::departmentScopeFilter($admin, 'r.requested_department_id');
        $scopeSql = '(' . $currentScope['sql'] . ' OR ' . $requestedScope['sql'] . ')';

        $sql = '
            SELECT r.id, r.user_id, r.current_department_id, r.current_programme_id, r.current_level,
                   r.requested_department_id, r.requested_department_name,
                   r.requested_programme_id, r.requested_programme_name, r.requested_level,
                   r.reason, r.status, r.decision_note, r.approved_department_id,
                   r.approved_programme_id, r.approved_level, r.created_at, r.reviewed_at,
                   u.first_name, u.surname, u.middle_name, u.email, u.reg_no,
                   current_d.name AS current_department_name,
                   current_p.name AS current_programme_name,
                   requested_d.name AS requested_department_label,
                   requested_p.name AS requested_programme_label,
                   approved_d.name AS approved_department_name,
                   approved_p.name AS approved_programme_name,
                   reviewer.first_name AS reviewer_first_name,
                   reviewer.surname AS reviewer_surname
            FROM academic_information_correction_requests r
            JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
            LEFT JOIN departments current_d ON current_d.id = r.current_department_id
            LEFT JOIN programmes current_p ON current_p.id = r.current_programme_id
            LEFT JOIN departments requested_d ON requested_d.id = r.requested_department_id
            LEFT JOIN programmes requested_p ON requested_p.id = r.requested_programme_id
            LEFT JOIN departments approved_d ON approved_d.id = r.approved_department_id
            LEFT JOIN programmes approved_p ON approved_p.id = r.approved_programme_id
            LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
            WHERE ' . $scopeSql;

        $params = array_merge($currentScope['params'], $requestedScope['params']);
        if ($status !== 'all') {
            $sql .= ' AND r.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY CASE WHEN r.status = \'pending\' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 250';

        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        $requests = array_map([self::class, 'requestPayload'], $stmt->fetchAll());

        Response::json(['requests' => $requests, 'status' => $status]);
    }

    public static function review(array $params): void
    {
        $admin = Auth::requireAdministrator();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $statusRaw = $body['status'] ?? '';
        $noteRaw = $body['decision_note'] ?? '';
        if (!is_string($statusRaw) || !is_string($noteRaw)) {
            Response::error('Provide a valid review decision and note.', 422);
        }
        $nextStatus = strtolower(trim($statusRaw));
        $decisionNote = trim($noteRaw);

        if (!in_array($nextStatus, ['approved', 'rejected'], true)) {
            Response::error('Choose whether to approve or reject this request.', 422);
        }
        if (self::characterLength($decisionNote) > 1500) {
            Response::error('The review note must not exceed 1,500 characters.', 422);
        }
        if ($nextStatus === 'rejected' && self::characterLength($decisionNote) < 10) {
            Response::error('Provide a reason of at least 10 characters when rejecting a request.', 422);
        }

        $db = Database::connection();
        $db->beginTransaction();
        try {
            $requestStmt = $db->prepare(
                'SELECT * FROM academic_information_correction_requests WHERE id = ? FOR UPDATE'
            );
            $requestStmt->execute([$id]);
            $request = $requestStmt->fetch();
            if (!$request) {
                $db->rollBack();
                Response::error('The academic correction request could not be found.', 404);
            }
            if ($request['status'] !== 'pending') {
                $db->rollBack();
                Response::error('This request has already been reviewed. Refresh the queue to see its latest status.', 409);
            }

            $currentDepartmentId = self::positiveIdOrNull($request['current_department_id']);
            $requestedDepartmentId = self::positiveIdOrNull($request['requested_department_id']);
            if ($nextStatus === 'rejected') {
                $canReviewCurrent = $currentDepartmentId !== null
                    && Auth::canManageDepartment($admin, $currentDepartmentId);
                $canReviewRequested = $requestedDepartmentId !== null
                    && Auth::canManageDepartment($admin, $requestedDepartmentId);
                if (!Auth::hasInstitutionScope($admin) && !$canReviewCurrent && !$canReviewRequested) {
                    $db->rollBack();
                    Response::error('You do not have permission to review this academic information request.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
                }
            }

            $approvedDepartmentId = null;
            $approvedProgrammeId = null;
            $approvedLevel = null;

            if ($nextStatus === 'approved') {
                $approvedDepartmentId = self::positiveIdOrNull($body['department_id'] ?? $request['requested_department_id']);
                $approvedProgrammeId = self::positiveIdOrNull($body['programme_id'] ?? $request['requested_programme_id']);
                $approvedLevel = (int) $request['requested_level'];

                if ($approvedDepartmentId === null || $approvedProgrammeId === null) {
                    $db->rollBack();
                    Response::error('Select an active department and programme before approving this request.', 422);
                }

                $requiredDepartments = array_values(array_unique(array_filter([
                    $currentDepartmentId,
                    $requestedDepartmentId,
                    $approvedDepartmentId,
                ])));
                foreach ($requiredDepartments as $requiredDepartmentId) {
                    if (!Auth::canManageDepartment($admin, $requiredDepartmentId)) {
                        $db->rollBack();
                        Response::error('You must have authority over both the current and requested departments to approve this change.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
                    }
                }

                $departmentStmt = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE LIMIT 1');
                $departmentStmt->execute([$approvedDepartmentId]);
                if (!$departmentStmt->fetchColumn()) {
                    $db->rollBack();
                    Response::error('The selected department is unavailable. Refresh the review form and choose another.', 422);
                }

                $programmeStmt = $db->prepare(
                    'SELECT id FROM programmes
                     WHERE id = ? AND department_id = ? AND is_active IS TRUE
                     LIMIT 1'
                );
                $programmeStmt->execute([$approvedProgrammeId, $approvedDepartmentId]);
                if (!$programmeStmt->fetchColumn()) {
                    $db->rollBack();
                    Response::error('The selected programme does not belong to the selected department.', 422);
                }

                $levelStmt = $db->prepare('SELECT level FROM academic_levels WHERE level = ? AND is_active IS TRUE LIMIT 1');
                $levelStmt->execute([$approvedLevel]);
                if (!$levelStmt->fetchColumn()) {
                    $db->rollBack();
                    Response::error('The requested academic level is no longer active. Ask the student to submit a new request.', 409);
                }

                $studentStmt = $db->prepare(
                    "SELECT department_id, programme_id, level
                     FROM users
                     WHERE id = ? AND account_type = 'student' AND deleted_at IS NULL
                     FOR UPDATE"
                );
                $studentStmt->execute([(int) $request['user_id']]);
                $student = $studentStmt->fetch();
                if (!$student) {
                    $db->rollBack();
                    Response::error('The student account is no longer available.', 404);
                }

                $snapshotMatches = self::sameNullableId($student['department_id'], $request['current_department_id'])
                    && self::sameNullableId($student['programme_id'], $request['current_programme_id'])
                    && self::sameNullableId($student['level'], $request['current_level']);
                if (!$snapshotMatches) {
                    $db->rollBack();
                    Response::error('The student academic profile has changed since this request was submitted. Ask the student to submit a fresh request before approving.', 409);
                }

                $updateStudent = $db->prepare(
                    'UPDATE users
                     SET department_id = ?, programme_id = ?, level = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND account_type = \'student\' AND deleted_at IS NULL'
                );
                $updateStudent->execute([
                    $approvedDepartmentId,
                    $approvedProgrammeId,
                    $approvedLevel,
                    (int) $request['user_id'],
                ]);
                if ($updateStudent->rowCount() !== 1) {
                    $db->rollBack();
                    Response::error('The student academic information could not be updated.', 409);
                }
            }

            $updateRequest = $db->prepare(
                'UPDATE academic_information_correction_requests
                 SET status = ?, decision_note = ?, approved_department_id = ?,
                     approved_programme_id = ?, approved_level = ?,
                     reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND status = \'pending\''
            );
            $updateRequest->execute([
                $nextStatus,
                $decisionNote !== '' ? $decisionNote : null,
                $approvedDepartmentId,
                $approvedProgrammeId,
                $approvedLevel,
                (int) $admin['id'],
                $id,
            ]);
            $db->prepare(
                'INSERT INTO activity_log (actor_user_id, action_type, target_type, target_id, description)
                 VALUES (?, ?, ?, ?, ?)'
            )->execute([
                (int) $admin['id'],
                'academic_profile_correction_' . $nextStatus,
                'academic_profile_correction',
                $id,
                'Administrator ' . $nextStatus . ' a student academic information correction request.',
            ]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        Response::json([
            'message' => $nextStatus === 'approved'
                ? 'The student academic information has been updated and the request approved.'
                : 'The request has been rejected. The student can see your review note.',
        ]);
    }

    private static function requestPayload(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'user_id' => isset($row['user_id']) ? (int) $row['user_id'] : null,
            'student_name' => trim(implode(' ', array_filter([
                $row['first_name'] ?? null,
                $row['middle_name'] ?? null,
                $row['surname'] ?? null,
            ]))),
            'email' => $row['email'] ?? null,
            'reg_no' => $row['reg_no'] ?? null,
            'current_department_id' => $row['current_department_id'] !== null ? (int) $row['current_department_id'] : null,
            'current_department_name' => $row['current_department_name'] ?? null,
            'current_programme_id' => $row['current_programme_id'] !== null ? (int) $row['current_programme_id'] : null,
            'current_programme_name' => $row['current_programme_name'] ?? null,
            'current_level' => $row['current_level'] !== null ? (int) $row['current_level'] : null,
            'requested_department_id' => $row['requested_department_id'] !== null ? (int) $row['requested_department_id'] : null,
            'requested_department_name' => $row['requested_department_name'] ?? null,
            'requested_department_label' => $row['requested_department_label'] ?? null,
            'requested_programme_id' => $row['requested_programme_id'] !== null ? (int) $row['requested_programme_id'] : null,
            'requested_programme_name' => $row['requested_programme_name'] ?? null,
            'requested_programme_label' => $row['requested_programme_label'] ?? null,
            'requested_level' => (int) $row['requested_level'],
            'reason' => $row['reason'],
            'status' => $row['status'],
            'decision_note' => $row['decision_note'],
            'approved_department_id' => isset($row['approved_department_id']) && $row['approved_department_id'] !== null ? (int) $row['approved_department_id'] : null,
            'approved_programme_id' => isset($row['approved_programme_id']) && $row['approved_programme_id'] !== null ? (int) $row['approved_programme_id'] : null,
            'approved_level' => isset($row['approved_level']) && $row['approved_level'] !== null ? (int) $row['approved_level'] : null,
            'approved_department_name' => $row['approved_department_name'] ?? null,
            'approved_programme_name' => $row['approved_programme_name'] ?? null,
            'created_at' => $row['created_at'],
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'reviewer_name' => trim(implode(' ', array_filter([
                $row['reviewer_first_name'] ?? null,
                $row['reviewer_surname'] ?? null,
            ]))),
        ];
    }

    private static function requireStudent(array $user): void
    {
        if (($user['account_type'] ?? '') !== 'student') {
            Response::error('Academic information correction requests are available to student accounts.', 403);
        }
    }

    private static function positiveIdOrNull(mixed $value): ?int
    {
        if ($value === null || $value === '') return null;
        $id = filter_var($value, FILTER_VALIDATE_INT);
        return $id !== false && $id > 0 ? (int) $id : null;
    }

    private static function positiveId(mixed $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) Response::error('The selected request is invalid.', 422);
        return (int) $id;
    }

    private static function cleanOptionalName(mixed $value, string $field): ?string
    {
        if ($value !== null && !is_string($value)) {
            Response::error('Enter a valid academic name.', 422, [
                'fields' => [$field => 'Enter a valid academic name.'],
            ]);
        }
        $name = trim((string) ($value ?? ''));
        if ($name === '') return null;
        if (self::characterLength($name) > 160) {
            Response::error('The entered academic name is too long.', 422, [
                'fields' => [$field => 'Use no more than 160 characters.'],
            ]);
        }
        return $name;
    }

    private static function sameNullableId(mixed $left, mixed $right): bool
    {
        if ($left === null || $right === null) return $left === $right;
        return (int) $left === (int) $right;
    }

    private static function characterLength(string $value): int
    {
        $matched = preg_match_all('/./us', $value, $characters);
        return $matched === false ? strlen($value) : $matched;
    }

    private static function input(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') return [];
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            Response::error('Request body must contain valid JSON.', 400);
        }
        if (!is_array($data)) Response::error('Request body must contain a JSON object.', 400);
        return $data;
    }
}
