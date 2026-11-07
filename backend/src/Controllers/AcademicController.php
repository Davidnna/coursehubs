<?php

declare(strict_types=1);

final class AcademicController
{
    private const LEVELS = [100, 200, 300, 400, 500, 600];
    private const SEMESTERS = ['First', 'Second'];
    private const COURSE_TYPES = ['Compulsory', 'Elective'];

    public static function publicStructure(): void
    {
        $db = Database::connection();
        $faculties = $db->query("SELECT id, name, code FROM faculties WHERE is_active IS TRUE ORDER BY name")->fetchAll();
        $departments = $db->query("SELECT id, faculty_id, name, code FROM departments WHERE is_active IS TRUE ORDER BY name")->fetchAll();
        $programmes = $db->query("SELECT id, department_id, name, code, award, duration_years FROM programmes WHERE is_active IS TRUE ORDER BY name")->fetchAll();
        $levels = $db->query('SELECT level, label FROM academic_levels WHERE is_active IS TRUE ORDER BY sort_order')->fetchAll();
        $sessions = $db->query('SELECT id, name, CASE WHEN is_current IS TRUE THEN 1 ELSE 0 END AS is_current FROM academic_sessions ORDER BY name DESC')->fetchAll();

        Response::json([
            'faculties' => $faculties,
            'departments' => $departments,
            'programmes' => $programmes,
            'levels' => $levels,
            'semesters' => self::SEMESTERS,
            'sessions' => $sessions,
        ]);
    }

    public static function overview(): void
    {
        Auth::requireAdmin();
        $db = Database::connection();
        $counts = [];
        foreach ([
            'faculties' => 'SELECT COUNT(*) FROM faculties WHERE is_active IS TRUE',
            'departments' => 'SELECT COUNT(*) FROM departments WHERE is_active IS TRUE',
            'programmes' => 'SELECT COUNT(*) FROM programmes WHERE is_active IS TRUE',
            'courses' => 'SELECT COUNT(*) FROM courses WHERE is_active IS TRUE AND deleted_at IS NULL',
            'offerings' => 'SELECT COUNT(*) FROM course_offerings WHERE deleted_at IS NULL',
            'sessions' => 'SELECT COUNT(*) FROM academic_sessions',
        ] as $key => $sql) {
            $counts[$key] = (int) $db->query($sql)->fetchColumn();
        }
        $current = $db->query('SELECT id, name, 1 AS is_current FROM academic_sessions WHERE is_current IS TRUE LIMIT 1')->fetch() ?: null;
        Response::json(['counts' => $counts, 'current_session' => $current]);
    }

    public static function adminStructure(): void
    {
        Auth::requireAdmin();
        $db = Database::connection();
        $faculties = $db->query(
            'SELECT f.id, f.name, f.code, f.description, CASE WHEN f.is_active IS TRUE THEN 1 ELSE 0 END AS is_active, f.created_at, f.updated_at, COUNT(DISTINCT d.id) AS department_count
             FROM faculties f LEFT JOIN departments d ON d.faculty_id = f.id
             GROUP BY f.id ORDER BY f.name'
        )->fetchAll();
        $departments = $db->query(
            'SELECT d.id, d.faculty_id, d.name, d.code, d.description, CASE WHEN d.is_active IS TRUE THEN 1 ELSE 0 END AS is_active, d.created_at, d.updated_at, f.name AS faculty_name, COUNT(DISTINCT p.id) AS programme_count
             FROM departments d JOIN faculties f ON f.id = d.faculty_id
             LEFT JOIN programmes p ON p.department_id = d.id
             GROUP BY d.id, f.name ORDER BY f.name, d.name'
        )->fetchAll();
        $programmes = $db->query(
            'SELECT p.id, p.department_id, p.name, p.code, p.award, p.duration_years, p.description, CASE WHEN p.is_active IS TRUE THEN 1 ELSE 0 END AS is_active, p.created_at, p.updated_at, d.name AS department_name, f.name AS faculty_name
             FROM programmes p JOIN departments d ON d.id = p.department_id
             JOIN faculties f ON f.id = d.faculty_id ORDER BY f.name, d.name, p.name'
        )->fetchAll();
        Response::json(['faculties' => $faculties, 'departments' => $departments, 'programmes' => $programmes]);
    }

    public static function sessions(): void
    {
        Auth::requireAdmin();
        $stmt = Database::connection()->query(
            'SELECT id, name, CASE WHEN is_current IS TRUE THEN 1 ELSE 0 END AS is_current, started_at, ended_at, created_at
             FROM academic_sessions ORDER BY name DESC'
        );
        Response::json(['sessions' => $stmt->fetchAll()]);
    }

    public static function createSession(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        $name = trim((string) ($body['name'] ?? ''));
        if (!self::validSessionName($name)) {
            Response::error('Enter an academic session in the format YYYY/YYYY, for example 2026/2027.', 422, ['fields' => ['name' => 'Enter a valid academic session.']]);
        }
        $db = Database::connection();
        try {
            $stmt = $db->prepare('INSERT INTO academic_sessions (name, is_current) VALUES (?, FALSE) RETURNING id, name, is_current, started_at, ended_at');
            $stmt->execute([$name]);
            $session = $stmt->fetch();
            self::audit($db, (int) $admin['id'], 'academic_session_created', 'academic_session', (int) $session['id'], 'Created academic session ' . $name . '.');
            Response::json(['message' => 'Academic session created.', 'session' => $session], 201);
        } catch (PDOException $exception) {
            self::databaseConflict($exception, 'That academic session already exists.');
        }
    }

    public static function updateSession(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        $lookup = $db->prepare('SELECT id, name, CASE WHEN is_current IS TRUE THEN 1 ELSE 0 END AS is_current FROM academic_sessions WHERE id = ? LIMIT 1');
        $lookup->execute([$id]);
        $existing = $lookup->fetch();
        if (!$existing) Response::error('The academic session could not be found.', 404);

        $name = array_key_exists('name', $body) ? trim((string) $body['name']) : (string) $existing['name'];
        if (!self::validSessionName($name)) {
            Response::error('Enter a valid academic session.', 422, ['fields' => ['name' => 'Use the format YYYY/YYYY.']]);
        }
        $makeCurrent = filter_var($body['is_current'] ?? $existing['is_current'], FILTER_VALIDATE_BOOLEAN);
        $db->beginTransaction();
        try {
            if ($makeCurrent) {
                $db->exec('UPDATE academic_sessions SET is_current = FALSE, ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP) WHERE is_current IS TRUE AND id <> ' . $id);
                $stmt = $db->prepare('UPDATE academic_sessions SET name = ?, is_current = TRUE, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), ended_at = NULL WHERE id = ?');
                $stmt->execute([$name, $id]);
            } else {
                $stmt = $db->prepare('UPDATE academic_sessions SET name = ?, is_current = FALSE, ended_at = CASE WHEN is_current IS TRUE THEN COALESCE(ended_at, CURRENT_TIMESTAMP) ELSE ended_at END WHERE id = ?');
                $stmt->execute([$name, $id]);
            }
            self::audit($db, (int) $admin['id'], 'academic_session_updated', 'academic_session', $id, 'Updated academic session ' . $name . '.');
            $db->commit();
        } catch (PDOException $exception) {
            if ($db->inTransaction()) $db->rollBack();
            self::databaseConflict($exception, 'That academic session name is already in use.');
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }
        $stmt = $db->prepare('SELECT id, name, is_current, started_at, ended_at FROM academic_sessions WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['message' => 'Academic session updated.', 'session' => $stmt->fetch()]);
    }

    public static function createFaculty(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        [$name, $code, $description] = self::validateNamedRecord($body, 'faculty');
        $db = Database::connection();
        try {
            $stmt = $db->prepare('INSERT INTO faculties (name, code, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([$name, $code, $description, (int) $admin['id'], (int) $admin['id']]);
            $id = (int) $stmt->fetchColumn();
            self::audit($db, (int) $admin['id'], 'faculty_created', 'faculty', $id, 'Created faculty ' . $name . '.');
            Response::json(['message' => 'Faculty created.', 'id' => $id], 201);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'A faculty with that name or code already exists.'); }
    }

    public static function updateFaculty(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        $exists = self::exists($db, 'faculties', $id);
        if (!$exists) Response::error('The faculty could not be found.', 404);
        $active = array_key_exists('is_active', $body) ? self::boolean($body['is_active']) : null;
        if ($active === false) {
            $check = $db->prepare('SELECT COUNT(*) FROM departments WHERE faculty_id = ? AND is_active IS TRUE');
            $check->execute([$id]);
            if ((int) $check->fetchColumn() > 0) Response::error('Archive the faculty departments before archiving this faculty.', 409);
        }
        [$name, $code, $description] = self::validateNamedRecord($body, 'faculty', true);
        $sql = 'UPDATE faculties SET name = ?, code = ?, description = ?, updated_by = ?';
        $values = [$name, $code, $description, (int) $admin['id']];
        if ($active !== null) { $sql .= ', is_active = ?'; $values[] = $active; }
        $sql .= ' WHERE id = ?'; $values[] = $id;
        try {
            $stmt = $db->prepare($sql); $stmt->execute($values);
            self::audit($db, (int) $admin['id'], 'faculty_updated', 'faculty', $id, 'Updated faculty ' . $name . '.');
            Response::json(['message' => 'Faculty updated.']);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'A faculty with that name or code already exists.'); }
    }

    public static function createDepartment(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        $facultyId = self::positiveId($body['faculty_id'] ?? null);
        [$name, $code, $description] = self::validateNamedRecord($body, 'department');
        $db = Database::connection();
        $faculty = $db->prepare('SELECT id FROM faculties WHERE id = ? AND is_active IS TRUE');
        $faculty->execute([$facultyId]);
        if (!$faculty->fetchColumn()) Response::error('Choose an active faculty.', 422, ['fields' => ['faculty_id' => 'Choose an active faculty.']]);
        try {
            $stmt = $db->prepare('INSERT INTO departments (faculty_id, name, code, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([$facultyId, $name, $code, $description, (int) $admin['id'], (int) $admin['id']]);
            $id = (int) $stmt->fetchColumn();
            self::audit($db, (int) $admin['id'], 'department_created', 'department', $id, 'Created department ' . $name . '.');
            Response::json(['message' => 'Department created.', 'id' => $id], 201);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'That department name or code already exists in the selected faculty.'); }
    }

    public static function updateDepartment(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        if (!self::exists($db, 'departments', $id)) Response::error('The department could not be found.', 404);
        $facultyId = self::positiveId($body['faculty_id'] ?? null);
        $faculty = $db->prepare('SELECT id FROM faculties WHERE id = ? AND is_active IS TRUE');
        $faculty->execute([$facultyId]);
        if (!$faculty->fetchColumn()) Response::error('Choose an active faculty.', 422, ['fields' => ['faculty_id' => 'Choose an active faculty.']]);
        $active = array_key_exists('is_active', $body) ? self::boolean($body['is_active']) : null;
        if ($active === false) {
            $check = $db->prepare('SELECT COUNT(*) FROM programmes WHERE department_id = ? AND is_active IS TRUE');
            $check->execute([$id]);
            if ((int) $check->fetchColumn() > 0) Response::error('Archive the department programmes before archiving this department.', 409);
            $courseCheck = $db->prepare('SELECT COUNT(*) FROM courses WHERE department_id = ? AND is_active IS TRUE AND deleted_at IS NULL');
            $courseCheck->execute([$id]);
            if ((int) $courseCheck->fetchColumn() > 0) Response::error('Archive or move the department courses before archiving this department.', 409);
        }
        [$name, $code, $description] = self::validateNamedRecord($body, 'department', true);
        $sql = 'UPDATE departments SET faculty_id = ?, name = ?, code = ?, description = ?, updated_by = ?';
        $values = [$facultyId, $name, $code, $description, (int) $admin['id']];
        if ($active !== null) { $sql .= ', is_active = ?'; $values[] = $active; }
        $sql .= ' WHERE id = ?'; $values[] = $id;
        try {
            $stmt = $db->prepare($sql); $stmt->execute($values);
            self::audit($db, (int) $admin['id'], 'department_updated', 'department', $id, 'Updated department ' . $name . '.');
            Response::json(['message' => 'Department updated.']);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'That department name or code already exists in the selected faculty.'); }
    }

    public static function createProgramme(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        $departmentId = self::positiveId($body['department_id'] ?? null);
        [$name, $code, $description] = self::validateNamedRecord($body, 'programme');
        $award = trim((string) ($body['award'] ?? 'Bachelor of Science'));
        $duration = filter_var($body['duration_years'] ?? 4, FILTER_VALIDATE_INT);
        if ($award === '' || strlen($award) > 80 || $duration === false || $duration < 1 || $duration > 10) {
            Response::error('Review the programme details.', 422, ['fields' => ['duration_years' => 'Programme duration must be between 1 and 10 years.']]);
        }
        $db = Database::connection();
        $department = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
        $department->execute([$departmentId]);
        if (!$department->fetchColumn()) Response::error('Choose an active department.', 422, ['fields' => ['department_id' => 'Choose an active department.']]);
        try {
            $stmt = $db->prepare('INSERT INTO programmes (department_id, name, code, award, duration_years, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
            $stmt->execute([$departmentId, $name, $code, $award, $duration, $description, (int) $admin['id'], (int) $admin['id']]);
            $id = (int) $stmt->fetchColumn();
            self::audit($db, (int) $admin['id'], 'programme_created', 'programme', $id, 'Created programme ' . $name . '.');
            Response::json(['message' => 'Programme created.', 'id' => $id], 201);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'That programme name or code already exists in the selected department.'); }
    }

    public static function updateProgramme(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        if (!self::exists($db, 'programmes', $id)) Response::error('The programme could not be found.', 404);
        $departmentId = self::positiveId($body['department_id'] ?? null);
        $department = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
        $department->execute([$departmentId]);
        if (!$department->fetchColumn()) Response::error('Choose an active department.', 422, ['fields' => ['department_id' => 'Choose an active department.']]);
        [$name, $code, $description] = self::validateNamedRecord($body, 'programme', true);
        $award = trim((string) ($body['award'] ?? 'Bachelor of Science'));
        $duration = filter_var($body['duration_years'] ?? 4, FILTER_VALIDATE_INT);
        if ($award === '' || strlen($award) > 80 || $duration === false || $duration < 1 || $duration > 10) Response::error('Review the programme details.', 422);
        $active = array_key_exists('is_active', $body) ? self::boolean($body['is_active']) : null;
        $existingDepartment = $db->prepare('SELECT department_id FROM programmes WHERE id = ?');
        $existingDepartment->execute([$id]);
        $oldDepartmentId = (int) $existingDepartment->fetchColumn();
        $offeringCheck = $db->prepare('SELECT COUNT(*) FROM course_offerings WHERE programme_id = ? AND deleted_at IS NULL');
        $offeringCheck->execute([$id]);
        $existingOfferings = (int) $offeringCheck->fetchColumn();
        if ($active === false && $existingOfferings > 0) Response::error('This programme has course offerings. Archive or move those offerings before archiving the programme.', 409);
        if ($oldDepartmentId !== $departmentId && $existingOfferings > 0) Response::error("Move or archive this programme's course offerings before changing its department.", 409);
        $sql = 'UPDATE programmes SET department_id = ?, name = ?, code = ?, award = ?, duration_years = ?, description = ?, updated_by = ?';
        $values = [$departmentId, $name, $code, $award, $duration, $description, (int) $admin['id']];
        if ($active !== null) { $sql .= ', is_active = ?'; $values[] = $active; }
        $sql .= ' WHERE id = ?'; $values[] = $id;
        try {
            $stmt = $db->prepare($sql); $stmt->execute($values);
            self::audit($db, (int) $admin['id'], 'programme_updated', 'programme', $id, 'Updated programme ' . $name . '.');
            Response::json(['message' => 'Programme updated.']);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'That programme name or code already exists in the selected department.'); }
    }

    public static function adminCourses(): void
    {
        Auth::requireAdmin();
        $stmt = Database::connection()->query(
            'SELECT c.id, c.current_code, c.title, c.description, CASE WHEN c.is_active IS TRUE THEN 1 ELSE 0 END AS is_active, CASE WHEN c.is_university_wide IS TRUE THEN 1 ELSE 0 END AS is_university_wide, c.created_at,
                    d.id AS department_id, d.name AS department_name, f.name AS faculty_name,
                    COUNT(DISTINCT co.id) FILTER (WHERE co.deleted_at IS NULL) AS offering_count
             FROM courses c LEFT JOIN departments d ON d.id = c.department_id
             LEFT JOIN faculties f ON f.id = d.faculty_id
             LEFT JOIN course_offerings co ON co.course_id = c.id
             WHERE c.deleted_at IS NULL
             GROUP BY c.id, d.id, d.name, f.name
             ORDER BY c.current_code'
        );
        Response::json(['courses' => $stmt->fetchAll()]);
    }

    public static function createCourse(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        $code = self::courseCode($body['current_code'] ?? '');
        $title = trim((string) ($body['title'] ?? ''));
        $description = self::description($body['description'] ?? '');
        $isUniversityWide = self::boolean($body['is_university_wide'] ?? false);
        $departmentId = $isUniversityWide ? null : self::positiveId($body['department_id'] ?? null);
        if ($code === null) Response::error('Enter a valid course code.', 422, ['fields' => ['current_code' => 'Use 2–20 letters, numbers, spaces, dots or hyphens.']]);
        if ($title === '' || strlen($title) > 200) Response::error('Enter a course title of no more than 200 characters.', 422, ['fields' => ['title' => 'Enter a valid course title.']]);
        if (!$isUniversityWide && $departmentId < 1) Response::error('Choose a department or mark this as a university-wide course.', 422, ['fields' => ['department_id' => 'Choose a department.']]);
        $db = Database::connection();
        if ($departmentId !== null) {
            $department = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
            $department->execute([$departmentId]);
            if (!$department->fetchColumn()) Response::error('Choose an active department.', 422, ['fields' => ['department_id' => 'Choose an active department.']]);
        }
        try {
            $stmt = $db->prepare("INSERT INTO courses (current_code, title, status, department_id, description, is_active, is_university_wide, created_by, updated_by) VALUES (?, ?, 'active', ?, ?, TRUE, ?, ?, ?) RETURNING id");
            $stmt->execute([$code, $title, $departmentId, $description, $isUniversityWide, (int) $admin['id'], (int) $admin['id']]);
            $id = (int) $stmt->fetchColumn();
            self::audit($db, (int) $admin['id'], 'course_created', 'course', $id, 'Created course ' . $code . ' — ' . $title . '.');
            Response::json(['message' => 'Course created.', 'id' => $id], 201);
        } catch (PDOException $exception) { self::databaseConflict($exception, 'That course code is already in use.'); }
    }

    public static function updateCourse(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        $find = $db->prepare('SELECT id, current_code, department_id, CASE WHEN is_university_wide IS TRUE THEN 1 ELSE 0 END AS is_university_wide, CASE WHEN is_active IS TRUE THEN 1 ELSE 0 END AS is_active FROM courses WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $find->execute([$id]);
        $existing = $find->fetch();
        if (!$existing) Response::error('The course could not be found.', 404);
        $code = self::courseCode($body['current_code'] ?? $existing['current_code']);
        $title = trim((string) ($body['title'] ?? ''));
        $description = self::description($body['description'] ?? '');
        $isUniversityWide = self::boolean($body['is_university_wide'] ?? false);
        $departmentId = $isUniversityWide ? null : self::positiveId($body['department_id'] ?? null);
        if ($code === null || $title === '' || strlen($title) > 200) Response::error('Review the course details.', 422);
        if (!$isUniversityWide && $departmentId < 1) Response::error('Choose a department or mark this as a university-wide course.', 422);
        if ($departmentId !== null) {
            $department = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
            $department->execute([$departmentId]);
            if (!$department->fetchColumn()) Response::error('Choose an active department.', 422, ['fields' => ['department_id' => 'Choose an active department.']]);
        }
        $active = array_key_exists('is_active', $body) ? self::boolean($body['is_active']) : (int) $existing['is_active'] === 1;
        $oldDepartmentId = $existing['department_id'] === null ? null : (int) $existing['department_id'];
        $oldUniversityWide = (int) $existing['is_university_wide'] === 1;
        $offeringCheck = $db->prepare('SELECT COUNT(*) FROM course_offerings WHERE course_id = ? AND deleted_at IS NULL');
        $offeringCheck->execute([$id]);
        $existingOfferings = (int) $offeringCheck->fetchColumn();
        if (!$active && $existingOfferings > 0) Response::error('This course has active offerings. Archive its offerings before archiving the course.', 409);
        if (($oldDepartmentId !== $departmentId || $oldUniversityWide !== $isUniversityWide) && $existingOfferings > 0) Response::error("Archive this course's offerings before changing its academic scope.", 409);
        $db->beginTransaction();
        try {
            if (strcasecmp((string) $existing['current_code'], $code) !== 0) {
                $db->prepare('INSERT INTO course_code_history (course_id, old_code, active_to_session_id) VALUES (?, ?, (SELECT id FROM academic_sessions WHERE is_current IS TRUE LIMIT 1))')
                    ->execute([$id, $existing['current_code']]);
            }
            $stmt = $db->prepare('UPDATE courses SET current_code = ?, title = ?, department_id = ?, description = ?, is_active = ?, is_university_wide = ?, updated_by = ? WHERE id = ?');
            $stmt->execute([$code, $title, $departmentId, $description, $active, $isUniversityWide, (int) $admin['id'], $id]);
            self::audit($db, (int) $admin['id'], 'course_updated', 'course', $id, 'Updated course ' . $code . '.');
            $db->commit();
            Response::json(['message' => 'Course updated.']);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) $db->rollBack();
            self::databaseConflict($exception, 'That course code is already in use.');
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }
    }

    public static function adminOfferings(): void
    {
        Auth::requireAdmin();
        $db = Database::connection();
        $stmt = $db->query(
            'SELECT co.id, co.course_id, co.programme_id, co.level, co.academic_session_id,
                    co.semester, co.course_type, co.credit_units, co.exam_date, co.status,
                    c.current_code, c.title AS course_title, p.name AS programme_name,
                    d.name AS department_name, s.name AS session_name, s.ended_at AS session_ended_at
             FROM course_offerings co JOIN courses c ON c.id = co.course_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             LEFT JOIN departments d ON d.id = COALESCE(p.department_id, c.department_id)
             JOIN academic_sessions s ON s.id = co.academic_session_id
             WHERE co.deleted_at IS NULL AND c.deleted_at IS NULL
             ORDER BY s.name DESC, co.level, co.semester, c.current_code'
        );
        $offerings = $stmt->fetchAll();
        self::attachLecturers($db, $offerings);
        Response::json(['offerings' => $offerings]);
    }

    public static function createOffering(): void
    {
        $admin = Auth::requireAdmin();
        $body = self::input();
        [$values, $lecturers] = self::validateOffering($body);
        $db = Database::connection();
        try {
            $db->beginTransaction();
            $stmt = $db->prepare(
                'INSERT INTO course_offerings
                    (course_id, programme_id, level, academic_session_id, semester, code_used,
                     course_type, credit_units, exam_date, status, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, (SELECT current_code FROM courses WHERE id = ?), ?, ?, ?, \'confirmed\', ?, ?)
                 RETURNING id'
            );
            $stmt->execute([
                $values['course_id'], $values['programme_id'], $values['level'], $values['academic_session_id'],
                $values['semester'], $values['course_id'], $values['course_type'], $values['credit_units'],
                $values['exam_date'], (int) $admin['id'], (int) $admin['id'],
            ]);
            $id = (int) $stmt->fetchColumn();
            self::saveLecturers($db, $id, $lecturers);
            $db->prepare('INSERT INTO course_offering_history (course_offering_id, changed_by, change_summary) VALUES (?, ?, ?)')->execute([$id, (int) $admin['id'], 'Created course offering.']);
            self::audit($db, (int) $admin['id'], 'course_offering_created', 'course_offering', $id, 'Created a course offering.');
            $db->commit();
            Response::json(['message' => 'Course offering created.', 'id' => $id], 201);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) $db->rollBack();
            self::databaseConflict($exception, 'That course already has an offering for the selected programme, level, session and semester.');
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }
    }

    public static function updateOffering(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::input();
        $db = Database::connection();
        $exists = $db->prepare('SELECT id FROM course_offerings WHERE id = ? AND deleted_at IS NULL');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) Response::error('The course offering could not be found.', 404);
        [$values, $lecturers] = self::validateOffering($body);
        try {
            $db->beginTransaction();
            $stmt = $db->prepare(
                'UPDATE course_offerings SET course_id = ?, programme_id = ?, level = ?, academic_session_id = ?,
                    semester = ?, code_used = (SELECT current_code FROM courses WHERE id = ?), course_type = ?,
                    credit_units = ?, exam_date = ?, status = \'confirmed\', updated_by = ? WHERE id = ?'
            );
            $stmt->execute([
                $values['course_id'], $values['programme_id'], $values['level'], $values['academic_session_id'],
                $values['semester'], $values['course_id'], $values['course_type'], $values['credit_units'],
                $values['exam_date'], (int) $admin['id'], $id,
            ]);
            $db->prepare('DELETE FROM course_offering_lecturers WHERE course_offering_id = ?')->execute([$id]);
            self::saveLecturers($db, $id, $lecturers);
            $db->prepare('INSERT INTO course_offering_history (course_offering_id, changed_by, change_summary) VALUES (?, ?, ?)')->execute([$id, (int) $admin['id'], 'Updated course offering and lecturer assignments.']);
            self::audit($db, (int) $admin['id'], 'course_offering_updated', 'course_offering', $id, 'Updated a course offering.');
            $db->commit();
            Response::json(['message' => 'Course offering updated.']);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) $db->rollBack();
            self::databaseConflict($exception, 'That course already has an offering for the selected programme, level, session and semester.');
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }
    }

    public static function archiveOffering(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $db = Database::connection();
        $stmt = $db->prepare('UPDATE course_offerings SET deleted_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([(int) $admin['id'], $id]);
        if ($stmt->rowCount() !== 1) Response::error('The course offering could not be found.', 404);
        $db->prepare('INSERT INTO course_offering_history (course_offering_id, changed_by, change_summary) VALUES (?, ?, ?)')->execute([$id, (int) $admin['id'], 'Archived course offering.']);
        self::audit($db, (int) $admin['id'], 'course_offering_archived', 'course_offering', $id, 'Archived a course offering.');
        Response::json(['message' => 'Course offering archived.']);
    }

    public static function staff(): void
    {
        Auth::requireAdmin();
        $stmt = Database::connection()->query(
            "SELECT id, first_name, middle_name, surname, staff_no, email
             FROM users WHERE account_type = 'staff' AND is_verified IS TRUE
               AND status = 'active' AND deleted_at IS NULL
             ORDER BY surname, first_name"
        );
        Response::json(['staff' => $stmt->fetchAll()]);
    }

    public static function catalog(): void
    {
        Auth::requireUser();
        $db = Database::connection();
        $sessionId = isset($_GET['session_id']) && ctype_digit((string) $_GET['session_id']) ? (int) $_GET['session_id'] : null;
        if ($sessionId === null) {
            $sessionId = $db->query('SELECT id FROM academic_sessions WHERE is_current IS TRUE LIMIT 1')->fetchColumn();
            if ($sessionId === false) $sessionId = null;
        }
        if ($sessionId === null) {
            Response::json(['courses' => [], 'session' => null]);
        }
        $sessionStmt = $db->prepare('SELECT id, name, CASE WHEN is_current IS TRUE THEN 1 ELSE 0 END AS is_current FROM academic_sessions WHERE id = ? LIMIT 1');
        $sessionStmt->execute([$sessionId]);
        $session = $sessionStmt->fetch();
        if (!$session) Response::error('The selected academic session could not be found.', 404);

        $where = ['c.is_active IS TRUE', "c.status = 'active'", 'c.deleted_at IS NULL', 'co.deleted_at IS NULL', 'co.academic_session_id = ?'];
        $params = [$sessionId];
        $search = trim((string) ($_GET['q'] ?? ''));
        if ($search !== '') {
            $where[] = '(c.current_code ILIKE ? OR c.title ILIKE ? OR COALESCE(c.description, \'\') ILIKE ?)';
            $term = '%' . substr($search, 0, 80) . '%';
            array_push($params, $term, $term, $term);
        }
        if (isset($_GET['level']) && in_array((int) $_GET['level'], self::LEVELS, true)) { $where[] = 'co.level = ?'; $params[] = (int) $_GET['level']; }
        if (isset($_GET['semester']) && in_array($_GET['semester'], self::SEMESTERS, true)) { $where[] = 'co.semester = ?'; $params[] = $_GET['semester']; }
        if (isset($_GET['department_id']) && ctype_digit((string) $_GET['department_id'])) { $where[] = 'COALESCE(p.department_id, c.department_id) = ?'; $params[] = (int) $_GET['department_id']; }
        if (isset($_GET['programme_id']) && ctype_digit((string) $_GET['programme_id'])) { $where[] = 'co.programme_id = ?'; $params[] = (int) $_GET['programme_id']; }

        $sql = 'SELECT co.id AS offering_id, c.id, c.current_code AS code, c.title, c.description,
                       co.level, co.semester, co.course_type AS type, co.credit_units,
                       co.academic_session_id, s.name AS session_name, p.id AS programme_id,
                       p.name AS programme_name, d.id AS department_id, d.name AS department_name,
                       f.name AS faculty_name
                FROM course_offerings co JOIN courses c ON c.id = co.course_id
                JOIN academic_sessions s ON s.id = co.academic_session_id
                LEFT JOIN programmes p ON p.id = co.programme_id
                LEFT JOIN departments d ON d.id = COALESCE(p.department_id, c.department_id)
                LEFT JOIN faculties f ON f.id = d.faculty_id
                WHERE ' . implode(' AND ', $where) . '\n                ORDER BY co.level, co.semester, c.current_code LIMIT 250';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        Response::json(['courses' => $stmt->fetchAll(), 'session' => $session]);
    }

    public static function courseDetail(array $params): void
    {
        Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        $db = Database::connection();
        $stmt = $db->prepare(
            "SELECT c.id, c.current_code AS code, c.title, c.description, CASE WHEN c.is_university_wide IS TRUE THEN 1 ELSE 0 END AS is_university_wide, d.name AS department_name,
                    f.name AS faculty_name
             FROM courses c LEFT JOIN departments d ON d.id = c.department_id
             LEFT JOIN faculties f ON f.id = d.faculty_id
             WHERE c.id = ? AND c.deleted_at IS NULL AND c.is_active IS TRUE AND c.status = 'active' LIMIT 1"
        );
        $stmt->execute([$id]);
        $course = $stmt->fetch();
        if (!$course) Response::error('The course could not be found.', 404);

        $offeringsStmt = $db->prepare(
            'SELECT co.id AS offering_id, co.level, co.semester, co.course_type AS type,
                    co.credit_units, co.exam_date, co.academic_session_id, s.name AS session_name,
                    p.id AS programme_id, p.name AS programme_name
             FROM course_offerings co JOIN academic_sessions s ON s.id = co.academic_session_id
             LEFT JOIN programmes p ON p.id = co.programme_id
             WHERE co.course_id = ? AND co.deleted_at IS NULL
             ORDER BY s.name DESC, co.level, co.semester'
        );
        $offeringsStmt->execute([$id]);
        $offerings = $offeringsStmt->fetchAll();
        self::attachLecturers($db, $offerings);
        Response::json(['course' => $course, 'offerings' => $offerings]);
    }

    private static function validateOffering(array $body): array
    {
        $courseId = self::positiveId($body['course_id'] ?? null);
        $programmeId = self::positiveId($body['programme_id'] ?? null);
        $level = filter_var($body['level'] ?? null, FILTER_VALIDATE_INT);
        $sessionId = self::positiveId($body['academic_session_id'] ?? null);
        $semester = (string) ($body['semester'] ?? '');
        $courseType = (string) ($body['course_type'] ?? '');
        $creditUnits = filter_var($body['credit_units'] ?? null, FILTER_VALIDATE_INT);
        $examDate = trim((string) ($body['exam_date'] ?? ''));
        if ($courseId < 1 || $programmeId < 1 || $sessionId < 1) Response::error('Choose a course, programme and academic session.', 422);
        if (!in_array($level, self::LEVELS, true)) Response::error('Choose a valid academic level.', 422, ['fields' => ['level' => 'Choose a valid academic level.']]);
        if (!in_array($semester, self::SEMESTERS, true)) Response::error('Choose a valid semester.', 422, ['fields' => ['semester' => 'Choose First or Second semester.']]);
        if (!in_array($courseType, self::COURSE_TYPES, true)) Response::error('Choose a valid course type.', 422, ['fields' => ['course_type' => 'Choose Compulsory or Elective.']]);
        if ($creditUnits === false || $creditUnits < 1 || $creditUnits > 30) Response::error('Enter course credit units between 1 and 30.', 422, ['fields' => ['credit_units' => 'Enter a value from 1 to 30.']]);
        if ($examDate !== '') {
            $parsedExamDate = DateTimeImmutable::createFromFormat('!Y-m-d', $examDate);
            if (!$parsedExamDate || $parsedExamDate->format('Y-m-d') !== $examDate) Response::error('Enter a valid examination date.', 422);
        }

        $db = Database::connection();
        $check = $db->prepare(
            'SELECT c.id, CASE WHEN c.is_active IS TRUE THEN 1 ELSE 0 END AS is_active, c.status,
                    CASE WHEN p.is_active IS TRUE THEN 1 ELSE 0 END AS programme_active, s.ended_at
             FROM courses c CROSS JOIN programmes p CROSS JOIN academic_sessions s
             WHERE c.id = ? AND p.id = ? AND s.id = ? AND c.deleted_at IS NULL'
        );
        $check->execute([$courseId, $programmeId, $sessionId]);
        $related = $check->fetch();
        if (!$related || (int) $related['is_active'] !== 1 || $related['status'] !== 'active' || (int) $related['programme_active'] !== 1) Response::error('Choose an active course, programme and academic session.', 422);
        // Cross-department service and ancillary courses are valid programme offerings.
        if ($related['ended_at'] !== null) Response::error('You cannot add offerings to a closed academic session.', 409);

        $lecturers = $body['lecturers'] ?? [];
        if (!is_array($lecturers) || count($lecturers) > 10) Response::error('Choose no more than 10 lecturers.', 422);
        $normalised = [];
        $seen = [];
        foreach ($lecturers as $lecturer) {
            if (!is_array($lecturer)) continue;
            $userId = isset($lecturer['user_id']) && ctype_digit((string) $lecturer['user_id']) ? (int) $lecturer['user_id'] : null;
            $name = trim((string) ($lecturer['name'] ?? ''));
            if ($userId !== null) {
                $staff = $db->prepare("SELECT id, first_name, middle_name, surname FROM users WHERE id = ? AND account_type = 'staff' AND is_verified IS TRUE AND status = 'active' AND deleted_at IS NULL");
                $staff->execute([$userId]);
                $person = $staff->fetch();
                if (!$person) Response::error('One of the selected lecturer accounts is unavailable.', 422);
                $name = trim(implode(' ', array_filter([$person['first_name'], $person['middle_name'], $person['surname']])));
            }
            if ($name === '' || strlen($name) > 160) continue;
            $key = strtolower($name);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $normalised[] = ['name' => $name, 'user_id' => $userId];
        }
        return [[
            'course_id' => $courseId,
            'programme_id' => $programmeId,
            'level' => $level,
            'academic_session_id' => $sessionId,
            'semester' => $semester,
            'course_type' => $courseType,
            'credit_units' => $creditUnits,
            'exam_date' => $examDate === '' ? null : $examDate,
        ], $normalised];
    }

    private static function saveLecturers(PDO $db, int $offeringId, array $lecturers): void
    {
        if ($lecturers === []) return;
        $stmt = $db->prepare('INSERT INTO course_offering_lecturers (course_offering_id, lecturer_name, lecturer_user_id) VALUES (?, ?, ?)');
        foreach ($lecturers as $lecturer) $stmt->execute([$offeringId, $lecturer['name'], $lecturer['user_id']]);
    }

    private static function attachLecturers(PDO $db, array &$offerings): void
    {
        if ($offerings === []) return;
        $ids = array_values(array_filter(array_map(static fn(array $item): int => (int) ($item['offering_id'] ?? 0), $offerings)));
        if ($ids === []) return;
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $db->prepare("SELECT course_offering_id, lecturer_name, lecturer_user_id FROM course_offering_lecturers WHERE course_offering_id IN ({$placeholders}) ORDER BY lecturer_name");
        $stmt->execute($ids);
        $map = [];
        foreach ($stmt->fetchAll() as $lecturer) $map[(int) $lecturer['course_offering_id']][] = $lecturer;
        foreach ($offerings as &$offering) $offering['lecturers'] = $map[(int) $offering['offering_id']] ?? [];
        unset($offering);
    }

    private static function validateNamedRecord(array $body, string $kind, bool $update = false): array
    {
        $name = trim((string) ($body['name'] ?? ''));
        $code = self::code($body['code'] ?? '');
        $description = self::description($body['description'] ?? '');
        $max = $kind === 'programme' ? 160 : 160;
        if ($name === '' || strlen($name) > $max) Response::error('Enter a valid ' . $kind . ' name.', 422, ['fields' => ['name' => 'Enter a name of no more than 160 characters.']]);
        if ($code === null) Response::error('Enter a valid ' . $kind . ' code.', 422, ['fields' => ['code' => 'Use 2–24 letters, numbers, dots or hyphens.']]);
        return [$name, $code, $description];
    }

    private static function validSessionName(string $name): bool
    {
        if (!preg_match('/^(19|20|21)\d{2}\/(19|20|21)\d{2}$/', $name)) return false;
        [$start, $end] = array_map('intval', explode('/', $name));
        return $end === $start + 1;
    }

    private static function courseCode(mixed $value): ?string
    {
        $code = strtoupper(preg_replace('/\s+/', ' ', trim((string) $value)) ?? '');
        if (strlen($code) < 2 || strlen($code) > 20) return null;
        return preg_match('/^[A-Z0-9]+(?:[ .-][A-Z0-9]+)*$/', $code) ? $code : null;
    }

    private static function code(mixed $value, int $maxLength = 24): ?string
    {
        $code = strtoupper(trim((string) $value));
        if (strlen($code) < 2 || strlen($code) > $maxLength) return null;
        return preg_match('/^[A-Z0-9][A-Z0-9._-]+$/', $code) ? $code : null;
    }

    private static function description(mixed $value): ?string
    {
        $description = trim((string) $value);
        if ($description === '') return null;
        return substr($description, 0, 1200);
    }

    private static function positiveId(mixed $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);
        return $id !== false && $id > 0 ? (int) $id : 0;
    }

    private static function boolean(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private static function exists(PDO $db, string $table, int $id): bool
    {
        $allowed = ['faculties', 'departments', 'programmes'];
        if (!in_array($table, $allowed, true)) return false;
        $stmt = $db->prepare("SELECT id FROM {$table} WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        return (bool) $stmt->fetchColumn();
    }

    private static function audit(PDO $db, int $actorId, string $action, string $target, ?int $targetId, string $description): void
    {
        $stmt = $db->prepare('INSERT INTO activity_log (actor_user_id, action_type, target_type, target_id, description) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$actorId, $action, $target, $targetId, substr($description, 0, 500)]);
    }

    private static function input(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') return [];
        try { $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { Response::error('Request body must contain valid information.', 400); }
        if (!is_array($data)) Response::error('Request body must contain valid information.', 400);
        return $data;
    }

    private static function databaseConflict(PDOException $exception, string $duplicateMessage): never
    {
        if ((string) $exception->getCode() === '23505') Response::error($duplicateMessage, 409);
        if ((string) $exception->getCode() === '23503') Response::error('This record is being used by another academic record and cannot be changed yet.', 409);
        throw $exception;
    }
}
