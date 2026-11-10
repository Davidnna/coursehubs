<?php

declare(strict_types=1);

final class StaffManagementController
{
    private const LEVELS = [100, 200, 300, 400, 500, 600];
    private const REP_TYPES = ['primary', 'assistant'];

    public static function index(): void
    {
        $admin = Auth::requireAdministrator();
        $db = Database::connection();
        $staffScope = Auth::departmentScopeFilter($admin, 'u.department_id');
        $historyScope = Auth::departmentScopeFilter($admin, 'assigned.department_id');
        $departmentScope = Auth::departmentScopeFilter($admin, 'd.id');
        $offeringScope = Auth::departmentScopeFilter($admin, 'COALESCE(p.department_id, c.department_id)');
        $lecturerCountScope = Auth::departmentScopeFilter($admin, 'COALESCE(p_count.department_id, c_count.department_id)');
        $adviserCountScope = Auth::departmentScopeFilter($admin, 'p_adviser.department_id');

        $staffStmt = $db->prepare(
            "SELECT u.id, u.first_name, u.middle_name, u.surname, u.staff_no, u.email,
                    u.department_id, d.name AS department_name,
                    (SELECT COUNT(*) FROM course_offering_lecturers col
                     JOIN course_offerings co ON co.id = col.course_offering_id
                     JOIN courses c_count ON c_count.id = co.course_id
                     LEFT JOIN programmes p_count ON p_count.id = co.programme_id
                     WHERE col.lecturer_user_id = u.id AND co.deleted_at IS NULL
                       AND {$lecturerCountScope['sql']}) AS lecturer_course_count,
                    (SELECT COUNT(*) FROM level_advisers la
                     LEFT JOIN programmes p_adviser ON p_adviser.id = la.programme_id
                     WHERE la.user_id = u.id AND la.status = 'active'
                       AND {$adviserCountScope['sql']}) AS active_adviser_count
             FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.account_type = 'staff' AND u.is_verified IS TRUE
               AND u.status = 'active' AND u.deleted_at IS NULL
               AND {$staffScope['sql']}
             ORDER BY u.surname, u.first_name
             LIMIT 500"
        );
        $staffStmt->execute(array_merge(
            $lecturerCountScope['params'],
            $adviserCountScope['params'],
            $staffScope['params']
        ));

        $programmeStmt = $db->prepare(
            "SELECT p.id, p.name, p.code, p.department_id, d.name AS department_name,
                    f.name AS faculty_name
             FROM programmes p
             JOIN departments d ON d.id = p.department_id
             JOIN faculties f ON f.id = d.faculty_id
             WHERE p.is_active IS TRUE AND d.is_active IS TRUE AND f.is_active IS TRUE
               AND {$departmentScope['sql']}
             ORDER BY f.name, d.name, p.name"
        );
        $programmeStmt->execute($departmentScope['params']);

        $sessions = $db->query(
            "SELECT id, name, CASE WHEN is_current IS TRUE THEN 1 ELSE 0 END AS is_current,
                    ended_at
             FROM academic_sessions
             ORDER BY is_current DESC, name DESC"
        )->fetchAll();

        $offeringStmt = $db->prepare(
            "SELECT co.id, co.course_id, co.programme_id, co.level, co.semester,
                    co.academic_session_id, co.course_type, c.current_code AS course_code,
                    c.title AS course_title, p.name AS programme_name,
                    s.name AS session_name, s.is_current
             FROM course_offerings co
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             JOIN academic_sessions s ON s.id = co.academic_session_id
             WHERE co.deleted_at IS NULL AND c.deleted_at IS NULL
               AND c.is_active IS TRUE AND c.status = 'active'
               AND s.ended_at IS NULL AND {$offeringScope['sql']}
             ORDER BY s.is_current DESC, s.name DESC, p.name, co.level, co.semester, c.current_code
             LIMIT 1000"
        );
        $offeringStmt->execute($offeringScope['params']);

        $lecturerStmt = $db->prepare(
            "SELECT col.id AS assignment_id, col.course_offering_id, col.lecturer_user_id,
                    col.lecturer_name, u.staff_no, u.email,
                    co.level, co.semester, s.name AS session_name,
                    c.current_code AS course_code, c.title AS course_title,
                    p.name AS programme_name
             FROM course_offering_lecturers col
             JOIN course_offerings co ON co.id = col.course_offering_id AND co.deleted_at IS NULL
             JOIN courses c ON c.id = co.course_id
             JOIN academic_sessions s ON s.id = co.academic_session_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             LEFT JOIN users u ON u.id = col.lecturer_user_id
             WHERE col.lecturer_user_id IS NOT NULL AND {$offeringScope['sql']}
             ORDER BY s.name DESC, p.name, co.level, c.current_code, col.lecturer_name
             LIMIT 1500"
        );
        $lecturerStmt->execute($offeringScope['params']);

        $representativeStmt = $db->prepare(
            "SELECT lr.id AS assignment_id, lr.user_id, lr.rep_type, lr.academic_session_id,
                    lr.status, lr.created_at,
                    u.first_name, u.middle_name, u.surname, u.reg_no, u.email, u.level,
                    u.programme_id, p.name AS programme_name, d.name AS department_name,
                    s.name AS session_name
             FROM level_reps lr
             JOIN users u ON u.id = lr.user_id
             LEFT JOIN programmes p ON p.id = u.programme_id
             LEFT JOIN departments d ON d.id = u.department_id
             JOIN academic_sessions s ON s.id = lr.academic_session_id
             WHERE {$staffScope['sql']}
             ORDER BY CASE lr.status WHEN 'active' THEN 0 ELSE 1 END,
                      p.name, u.level, lr.rep_type, lr.created_at DESC
             LIMIT 500"
        );
        $representativeStmt->execute($staffScope['params']);

        $adviserStmt = $db->prepare(
            "SELECT la.id AS assignment_id, la.user_id, la.programme_id,
                    la.current_level, la.academic_session_id,
                    la.expected_graduation_session_id, la.status, la.created_at,
                    u.first_name, u.middle_name, u.surname, u.staff_no, u.email,
                    p.name AS programme_name, d.name AS department_name,
                    s.name AS session_name, gs.name AS graduation_session_name
             FROM level_advisers la
             JOIN users u ON u.id = la.user_id
             LEFT JOIN programmes p ON p.id = la.programme_id
             LEFT JOIN departments d ON d.id = p.department_id
             JOIN academic_sessions s ON s.id = la.academic_session_id
             JOIN academic_sessions gs ON gs.id = la.expected_graduation_session_id
             WHERE {$departmentScope['sql']}
             ORDER BY CASE WHEN la.status = 'active' THEN 0 ELSE 1 END,
                      p.name, la.current_level, u.surname, u.first_name
             LIMIT 500"
        );
        $adviserStmt->execute($departmentScope['params']);

        $historyStmt = $db->prepare(
            "SELECT h.id, h.assignment_type, h.assignment_id, h.action, h.details, h.created_at,
                    CONCAT(assigned.first_name, ' ', assigned.surname) AS assigned_name,
                    CONCAT(actor.first_name, ' ', actor.surname) AS changed_by_name
             FROM academic_staff_assignment_history h
             JOIN users assigned ON assigned.id = h.assigned_user_id
             JOIN users actor ON actor.id = h.changed_by
             WHERE {$historyScope['sql']}
             ORDER BY h.created_at DESC, h.id DESC
             LIMIT 250"
        );
        $historyStmt->execute($historyScope['params']);

        Response::json([
            'staff' => $staffStmt->fetchAll(),
            'programmes' => $programmeStmt->fetchAll(),
            'sessions' => $sessions,
            'offerings' => $offeringStmt->fetchAll(),
            'lecturer_assignments' => $lecturerStmt->fetchAll(),
            'representatives' => $representativeStmt->fetchAll(),
            'advisers' => $adviserStmt->fetchAll(),
            'history' => $historyStmt->fetchAll(),
        ]);
    }

    public static function searchStudents(): void
    {
        $admin = Auth::requireAdministrator();
        $query = trim((string) ($_GET['q'] ?? ''));
        if (self::length($query) < 2) {
            Response::json(['students' => []]);
        }

        $term = '%' . (function_exists('mb_substr') ? mb_substr($query, 0, 80, 'UTF-8') : substr($query, 0, 80)) . '%';
        $scope = Auth::departmentScopeFilter($admin, 'u.department_id');
        $stmt = Database::connection()->prepare(
            "SELECT u.id, u.first_name, u.middle_name, u.surname, u.reg_no,
                    u.email, u.level, u.programme_id, p.name AS programme_name,
                    u.department_id, d.name AS department_name
             FROM users u
             LEFT JOIN programmes p ON p.id = u.programme_id
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.account_type = 'student' AND u.is_verified IS TRUE
               AND u.status = 'active' AND u.deleted_at IS NULL
               AND u.programme_id IS NOT NULL AND u.department_id IS NOT NULL
               AND u.level IS NOT NULL AND {$scope['sql']}
               AND (u.first_name ILIKE ? OR u.surname ILIKE ?
                    OR COALESCE(u.middle_name, '') ILIKE ?
                    OR u.reg_no ILIKE ? OR u.email ILIKE ?)
             ORDER BY u.surname, u.first_name
             LIMIT 40"
        );
        $stmt->execute(array_merge($scope['params'], [$term, $term, $term, $term, $term]));
        Response::json(['students' => $stmt->fetchAll()]);
    }

    public static function assignLecturer(): void
    {
        $admin = Auth::requireAdministrator();
        $body = self::body();
        $offeringId = self::id($body['course_offering_id'] ?? null);
        $staffId = self::id($body['staff_user_id'] ?? null);
        if ($offeringId < 1 || $staffId < 1) {
            Response::error('Choose a course and a staff lecturer.', 422);
        }

        $db = Database::connection();
        $staff = self::activeStaff($db, $staffId);
        $offering = $db->prepare(
            "SELECT co.id, co.course_id, c.current_code, s.name AS session_name,
                    COALESCE(p.department_id, c.department_id) AS department_id
             FROM course_offerings co
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             JOIN academic_sessions s ON s.id = co.academic_session_id
             WHERE co.id = ? AND co.deleted_at IS NULL
               AND c.deleted_at IS NULL AND c.is_active IS TRUE
               AND c.status = 'active' AND s.ended_at IS NULL"
        );
        $offering->execute([$offeringId]);
        $course = $offering->fetch();
        if (!$course) {
            Response::error('The selected course assignment is unavailable.', 404);
        }
        if (!Auth::canManageOffering($admin, $offeringId)) {
            Response::error('You do not have permission to manage lecturers for this course assignment.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }
        if ($staff['department_id'] === null
            ? !Auth::hasInstitutionScope($admin)
            : !Auth::canManageDepartment($admin, (int) $staff['department_id'])) {
            Response::error('You can only assign staff members within your administrative scope.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $duplicate = $db->prepare(
            'SELECT id FROM course_offering_lecturers
             WHERE course_offering_id = ? AND lecturer_user_id = ? LIMIT 1'
        );
        $duplicate->execute([$offeringId, $staffId]);
        if ($duplicate->fetchColumn()) {
            Response::error('This lecturer is already assigned to the selected course.', 409);
        }

        $fullName = self::fullName($staff);
        try {
            $db->beginTransaction();
            $db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['coursehub_lecturer:' . $offeringId . ':' . $staffId]);
            $duplicate = $db->prepare(
                'SELECT id FROM course_offering_lecturers
                 WHERE course_offering_id = ? AND lecturer_user_id = ? LIMIT 1'
            );
            $duplicate->execute([$offeringId, $staffId]);
            if ($duplicate->fetchColumn()) {
                $db->rollBack();
                Response::error('This lecturer is already assigned to the selected course.', 409);
            }

            $insert = $db->prepare(
                'INSERT INTO course_offering_lecturers (course_offering_id, lecturer_name, lecturer_user_id)
                 VALUES (?, ?, ?) RETURNING id'
            );
            $insert->execute([$offeringId, $fullName, $staffId]);
            $assignmentId = (int) $insert->fetchColumn();

            $db->prepare(
                'INSERT INTO course_offering_history (course_offering_id, changed_by, change_summary)
                 VALUES (?, ?, ?)'
            )->execute([$offeringId, (int) $admin['id'], 'Assigned lecturer ' . $fullName . '.']);

            self::history($db, 'lecturer', $assignmentId, $staffId, 'assigned', (int) $admin['id'], [
                'course_offering_id' => $offeringId,
                'course_code' => $course['current_code'],
                'session' => $course['session_name'],
            ]);
            self::audit($db, (int) $admin['id'], 'lecturer_assigned', 'course_offering_lecturer', $assignmentId, 'Assigned ' . $fullName . ' to ' . $course['current_code'] . '.');
            $db->commit();
            Response::json(['message' => 'Lecturer assigned to the course.', 'assignment_id' => $assignmentId], 201);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($exception->getCode() === '23505') {
                Response::error('This lecturer is already assigned to the selected course.', 409);
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function revokeLecturer(array $params): void
    {
        $admin = Auth::requireAdministrator();
        $assignmentId = self::id($params['id'] ?? null);
        $db = Database::connection();
        $lookup = $db->prepare(
            "SELECT col.id, col.course_offering_id, col.lecturer_user_id,
                    col.lecturer_name, co.course_id, c.current_code,
                    COALESCE(p.department_id, c.department_id) AS department_id
             FROM course_offering_lecturers col
             JOIN course_offerings co ON co.id = col.course_offering_id
             JOIN courses c ON c.id = co.course_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             WHERE col.id = ? AND col.lecturer_user_id IS NOT NULL"
        );
        $lookup->execute([$assignmentId]);
        $assignment = $lookup->fetch();
        if (!$assignment) {
            Response::error('The lecturer assignment could not be found.', 404);
        }
        if (!Auth::canManageOffering($admin, (int) $assignment['course_offering_id'])) {
            Response::error('You do not have permission to change this lecturer assignment.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM course_offering_lecturers WHERE id = ?')->execute([$assignmentId]);
            $db->prepare(
                'INSERT INTO course_offering_history (course_offering_id, changed_by, change_summary)
                 VALUES (?, ?, ?)'
            )->execute([$assignment['course_offering_id'], (int) $admin['id'], 'Removed lecturer ' . $assignment['lecturer_name'] . '.']);
            self::history($db, 'lecturer', $assignmentId, (int) $assignment['lecturer_user_id'], 'revoked', (int) $admin['id'], [
                'course_offering_id' => (int) $assignment['course_offering_id'],
                'course_code' => $assignment['current_code'],
            ]);
            self::audit($db, (int) $admin['id'], 'lecturer_assignment_revoked', 'course_offering_lecturer', $assignmentId, 'Removed ' . $assignment['lecturer_name'] . ' from ' . $assignment['current_code'] . '.');
            $db->commit();
            Response::json(['message' => 'Lecturer removed from the course.']);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function assignRepresentative(): void
    {
        $admin = Auth::requireAdministrator();
        $body = self::body();
        $studentId = self::id($body['student_user_id'] ?? null);
        $repType = trim((string) ($body['rep_type'] ?? ''));
        $sessionId = self::id($body['academic_session_id'] ?? null);
        if ($studentId < 1 || !in_array($repType, self::REP_TYPES, true) || $sessionId < 1) {
            Response::error('Choose a verified student, representative role and academic session.', 422);
        }

        $db = Database::connection();
        $studentStmt = $db->prepare(
            "SELECT u.id, u.first_name, u.middle_name, u.surname, u.level,
                    u.programme_id, u.department_id, p.name AS programme_name
             FROM users u
             JOIN programmes p ON p.id = u.programme_id
             JOIN departments d ON d.id = u.department_id AND d.id = p.department_id
             WHERE u.id = ? AND u.account_type = 'student'
               AND u.is_verified IS TRUE AND u.status = 'active'
               AND u.deleted_at IS NULL AND p.is_active IS TRUE AND d.is_active IS TRUE"
        );
        $studentStmt->execute([$studentId]);
        $student = $studentStmt->fetch();
        if (!$student || !in_array((int) $student['level'], self::LEVELS, true)) {
            Response::error('Choose an active student with a verified degree programme and academic level.', 422);
        }
        if (!Auth::canManageDepartment($admin, (int) $student['department_id'])) {
            Response::error('You do not have permission to manage representatives in this department.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $session = self::activeSession($db, $sessionId);
        $cohortLock = 'coursehub_rep:' . $student['programme_id'] . ':' . $student['level'] . ':' . $repType;
        try {
            $db->beginTransaction();
            $db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['coursehub_rep_user:' . $studentId]);
            $db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute([$cohortLock]);

            $alreadyRep = $db->prepare("SELECT id FROM level_reps WHERE user_id = ? AND status = 'active' LIMIT 1");
            $alreadyRep->execute([$studentId]);
            if ($alreadyRep->fetchColumn()) {
                $db->rollBack();
                Response::error('This student already has an active representative assignment.', 409);
            }

            $slot = $db->prepare(
                "SELECT lr.id
                 FROM level_reps lr
                 JOIN users u ON u.id = lr.user_id
                 WHERE lr.status = 'active' AND lr.rep_type = ?
                   AND u.programme_id = ? AND u.level = ?
                 LIMIT 1"
            );
            $slot->execute([$repType, $student['programme_id'], $student['level']]);
            if ($slot->fetchColumn()) {
                $db->rollBack();
                Response::error('This degree programme and level already has an active ' . $repType . ' representative. Revoke the existing assignment first.', 409);
            }

            $insert = $db->prepare(
                "INSERT INTO level_reps (user_id, rep_type, academic_session_id, status)
                 VALUES (?, ?, ?, 'active') RETURNING id"
            );
            $insert->execute([$studentId, $repType, $sessionId]);
            $assignmentId = (int) $insert->fetchColumn();
            self::history($db, 'course_rep', $assignmentId, $studentId, 'assigned', (int) $admin['id'], [
                'rep_type' => $repType,
                'programme_id' => (int) $student['programme_id'],
                'level' => (int) $student['level'],
                'academic_session_id' => $sessionId,
                'session' => $session['name'],
            ]);
            self::audit($db, (int) $admin['id'], 'course_representative_assigned', 'level_rep', $assignmentId, 'Assigned ' . self::fullName($student) . ' as ' . $repType . ' representative for ' . $student['programme_name'] . ', ' . $student['level'] . ' Level.');
            $db->commit();
            Response::json(['message' => 'Course representative assigned.', 'assignment_id' => $assignmentId], 201);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($exception->getCode() === '23505') {
                Response::error('This student already has an active representative assignment.', 409);
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function revokeRepresentative(array $params): void
    {
        $admin = Auth::requireAdministrator();
        $assignmentId = self::id($params['id'] ?? null);
        $db = Database::connection();
        $lookup = $db->prepare(
            "SELECT lr.id, lr.user_id, lr.rep_type, u.first_name, u.surname,
                    u.programme_id, u.level, u.department_id
             FROM level_reps lr
             JOIN users u ON u.id = lr.user_id
             WHERE lr.id = ? AND lr.status = 'active'"
        );
        $lookup->execute([$assignmentId]);
        $assignment = $lookup->fetch();
        if (!$assignment) {
            Response::error('The representative assignment could not be found.', 404);
        }
        if ($assignment['department_id'] === null
            ? !Auth::hasInstitutionScope($admin)
            : !Auth::canManageDepartment($admin, (int) $assignment['department_id'])) {
            Response::error('You do not have permission to revoke this representative assignment.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $db->beginTransaction();
        try {
            $db->prepare(
                "UPDATE level_reps SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )->execute([$assignmentId]);
            self::history($db, 'course_rep', $assignmentId, (int) $assignment['user_id'], 'revoked', (int) $admin['id'], [
                'rep_type' => $assignment['rep_type'],
                'programme_id' => (int) $assignment['programme_id'],
                'level' => (int) $assignment['level'],
            ]);
            self::audit($db, (int) $admin['id'], 'course_representative_revoked', 'level_rep', $assignmentId, 'Revoked the course representative assignment for ' . self::fullName($assignment) . '.');
            $db->commit();
            Response::json(['message' => 'Course representative assignment revoked.']);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function assignAdviser(): void
    {
        $admin = Auth::requireAdministrator();
        $body = self::body();
        $staffId = self::id($body['staff_user_id'] ?? null);
        $programmeId = self::id($body['programme_id'] ?? null);
        $level = filter_var($body['current_level'] ?? null, FILTER_VALIDATE_INT);
        $sessionId = self::id($body['academic_session_id'] ?? null);
        $graduationSessionId = self::id($body['expected_graduation_session_id'] ?? null);
        if ($staffId < 1 || $programmeId < 1 || $sessionId < 1 || $graduationSessionId < 1 || !in_array($level, self::LEVELS, true)) {
            Response::error('Choose a staff adviser, degree programme, level and both academic sessions.', 422);
        }

        $db = Database::connection();
        $staff = self::activeStaff($db, $staffId);
        $programmeStmt = $db->prepare(
            "SELECT p.id, p.name, p.department_id
             FROM programmes p
             JOIN departments d ON d.id = p.department_id
             WHERE p.id = ? AND p.is_active IS TRUE AND d.is_active IS TRUE"
        );
        $programmeStmt->execute([$programmeId]);
        $programme = $programmeStmt->fetch();
        if (!$programme) {
            Response::error('Choose an active degree programme.', 422);
        }
        if (!Auth::canManageDepartment($admin, (int) $programme['department_id'])) {
            Response::error('You do not have permission to manage advisers for this degree programme.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }
        if ($staff['department_id'] === null
            ? !Auth::hasInstitutionScope($admin)
            : !Auth::canManageDepartment($admin, (int) $staff['department_id'])) {
            Response::error('You can only assign staff advisers within your administrative scope.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $session = self::activeSession($db, $sessionId);
        $graduationSession = $db->prepare('SELECT id, name FROM academic_sessions WHERE id = ?');
        $graduationSession->execute([$graduationSessionId]);
        $graduation = $graduationSession->fetch();
        if (!$graduation) {
            Response::error('Choose a valid expected graduation session.', 422);
        }

        $assignmentStartYear = preg_match('/^(\d{4})\/\d{4}$/', (string) $session['name'], $sessionMatch)
            ? (int) $sessionMatch[1]
            : null;
        $graduationStartYear = preg_match('/^(\d{4})\/\d{4}$/', (string) $graduation['name'], $graduationMatch)
            ? (int) $graduationMatch[1]
            : null;
        if ($assignmentStartYear !== null && $graduationStartYear !== null && $graduationStartYear < $assignmentStartYear) {
            Response::error('The expected graduation session cannot be earlier than the adviser assignment session.', 422);
        }

        $duplicate = $db->prepare(
            "SELECT id FROM level_advisers
             WHERE user_id = ? AND programme_id = ? AND current_level = ?
               AND expected_graduation_session_id = ? AND status = 'active'
             LIMIT 1"
        );
        $duplicate->execute([$staffId, $programmeId, $level, $graduationSessionId]);
        if ($duplicate->fetchColumn()) {
            Response::error('This staff member is already assigned as adviser to that cohort.', 409);
        }

        $db->beginTransaction();
        try {
            $insert = $db->prepare(
                "INSERT INTO level_advisers
                    (user_id, programme_id, current_level, academic_session_id,
                     expected_graduation_session_id, status)
                 VALUES (?, ?, ?, ?, ?, 'active') RETURNING id"
            );
            $insert->execute([$staffId, $programmeId, $level, $sessionId, $graduationSessionId]);
            $assignmentId = (int) $insert->fetchColumn();
            self::history($db, 'course_adviser', $assignmentId, $staffId, 'assigned', (int) $admin['id'], [
                'programme_id' => $programmeId,
                'programme' => $programme['name'],
                'level' => $level,
                'academic_session_id' => $sessionId,
                'session' => $session['name'],
                'expected_graduation_session_id' => $graduationSessionId,
                'expected_graduation_session' => $graduation['name'],
            ]);
            self::audit($db, (int) $admin['id'], 'course_adviser_assigned', 'level_adviser', $assignmentId, 'Assigned ' . self::fullName($staff) . ' as course adviser for ' . $programme['name'] . ', ' . $level . ' Level.');
            $db->commit();
            Response::json(['message' => 'Course adviser assigned.', 'assignment_id' => $assignmentId], 201);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($exception->getCode() === '23505') {
                Response::error('This staff member already advises that cohort.', 409);
            }
            throw $exception;
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function revokeAdviser(array $params): void
    {
        $admin = Auth::requireAdministrator();
        $assignmentId = self::id($params['id'] ?? null);
        $db = Database::connection();
        $lookup = $db->prepare(
            "SELECT la.id, la.user_id, la.programme_id, la.current_level,
                    u.first_name, u.surname, p.name AS programme_name,
                    p.department_id
             FROM level_advisers la
             JOIN users u ON u.id = la.user_id
             LEFT JOIN programmes p ON p.id = la.programme_id
             WHERE la.id = ? AND la.status = 'active'"
        );
        $lookup->execute([$assignmentId]);
        $assignment = $lookup->fetch();
        if (!$assignment) {
            Response::error('The course adviser assignment could not be found.', 404);
        }
        if ($assignment['department_id'] === null
            ? !Auth::hasInstitutionScope($admin)
            : !Auth::canManageDepartment($admin, (int) $assignment['department_id'])) {
            Response::error('You do not have permission to revoke this adviser assignment.', 403, ['code' => 'ADMIN_SCOPE_ACCESS_REQUIRED']);
        }

        $db->beginTransaction();
        try {
            $db->prepare(
                "UPDATE level_advisers SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )->execute([$assignmentId]);
            self::history($db, 'course_adviser', $assignmentId, (int) $assignment['user_id'], 'revoked', (int) $admin['id'], [
                'programme_id' => $assignment['programme_id'],
                'programme' => $assignment['programme_name'],
                'level' => (int) $assignment['current_level'],
            ]);
            self::audit($db, (int) $admin['id'], 'course_adviser_revoked', 'level_adviser', $assignmentId, 'Revoked the course adviser assignment for ' . self::fullName($assignment) . '.');
            $db->commit();
            Response::json(['message' => 'Course adviser assignment revoked.']);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    private static function activeStaff(PDO $db, int $staffId): array
    {
        $stmt = $db->prepare(
            "SELECT id, first_name, middle_name, surname, staff_no, email, department_id
             FROM users
             WHERE id = ? AND account_type = 'staff'
               AND is_verified IS TRUE AND status = 'active' AND deleted_at IS NULL
             LIMIT 1"
        );
        $stmt->execute([$staffId]);
        $staff = $stmt->fetch();
        if (!$staff) Response::error('Choose a verified, active staff account.', 422);
        return $staff;
    }

    private static function activeSession(PDO $db, int $sessionId): array
    {
        $stmt = $db->prepare(
            'SELECT id, name, ended_at FROM academic_sessions WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$sessionId]);
        $session = $stmt->fetch();
        if (!$session || $session['ended_at'] !== null) {
            Response::error('Choose an open academic session.', 422);
        }
        return $session;
    }

    private static function body(): array
    {
        $decoded = json_decode((string) file_get_contents('php://input'), true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function id(mixed $value): int
    {
        if (is_int($value) && $value > 0) return $value;
        if (is_string($value) && ctype_digit($value) && (int) $value > 0) return (int) $value;
        return 0;
    }

    private static function fullName(array $user): string
    {
        return trim(implode(' ', array_filter([
            trim((string) ($user['first_name'] ?? '')),
            trim((string) ($user['middle_name'] ?? '')),
            trim((string) ($user['surname'] ?? '')),
        ])));
    }

    private static function length(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }

    private static function history(
        PDO $db,
        string $type,
        int $assignmentId,
        int $userId,
        string $action,
        int $adminId,
        array $details
    ): void {
        $stmt = $db->prepare(
            'INSERT INTO academic_staff_assignment_history
                (assignment_type, assignment_id, assigned_user_id, action, changed_by, details)
             VALUES (?, ?, ?, ?, ?, ?::jsonb)'
        );
        $stmt->execute([$type, $assignmentId, $userId, $action, $adminId, json_encode($details, JSON_THROW_ON_ERROR)]);
    }

    private static function audit(
        PDO $db,
        int $adminId,
        string $action,
        string $targetType,
        int $targetId,
        string $description
    ): void {
        $stmt = $db->prepare(
            'INSERT INTO activity_log (actor_user_id, action_type, target_type, target_id, description)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$adminId, $action, $targetType, $targetId, (function_exists('mb_substr') ? mb_substr($description, 0, 500, 'UTF-8') : substr($description, 0, 500))]);
    }
}
