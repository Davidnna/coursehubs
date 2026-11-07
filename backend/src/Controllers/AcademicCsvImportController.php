<?php

declare(strict_types=1);

/**
 * Temporary, administrator-only CSV importer for initial CourseHubs academic setup.
 * Imports are previewed first, revalidated inside a transaction, and never overwrite
 * existing academic records. Remove this controller, route, frontend page and API
 * helper after the institution's initial data setup is complete.
 */
final class AcademicCsvImportController
{
    private const MAX_FILE_BYTES = 2_097_152;
    private const MAX_ROWS = 1000;
    private const TYPES = ['faculties', 'departments', 'programmes', 'sessions', 'courses', 'offerings'];

    private const REQUIRED_HEADERS = [
        'faculties' => ['faculty_name', 'faculty_code'],
        'departments' => ['faculty_code', 'faculty_name', 'department_name', 'department_code'],
        'programmes' => ['faculty_code', 'faculty_name', 'department_code', 'programme_name', 'programme_code'],
        'sessions' => ['session_name'],
        'courses' => ['course_code', 'course_title'],
        'offerings' => ['faculty_code', 'faculty_name', 'department_code', 'programme_code', 'course_code', 'academic_session', 'level', 'semester', 'course_type', 'credit_units'],
    ];

    private const ALLOWED_HEADERS = [
        'faculties' => ['faculty_name', 'faculty_code', 'description'],
        'departments' => ['faculty_code', 'faculty_name', 'department_name', 'department_code', 'description'],
        'programmes' => ['faculty_code', 'faculty_name', 'department_code', 'programme_name', 'programme_code', 'award', 'duration_years', 'description'],
        'sessions' => ['session_name'],
        'courses' => ['faculty_code', 'faculty_name', 'department_code', 'course_code', 'course_title', 'description', 'is_university_wide'],
        'offerings' => ['faculty_code', 'faculty_name', 'department_code', 'programme_code', 'course_code', 'academic_session', 'level', 'semester', 'course_type', 'credit_units', 'exam_date', 'lecturer_names'],
    ];

    public static function handle(): void
    {
        $admin = Auth::requireAdmin();
        $type = strtolower(trim((string) ($_POST['type'] ?? '')));
        $mode = strtolower(trim((string) ($_POST['mode'] ?? 'preview')));

        if (!in_array($type, self::TYPES, true)) {
            Response::error('Choose a supported academic data type.', 422);
        }
        if (!in_array($mode, ['preview', 'import'], true)) {
            Response::error('Choose whether to preview or import the CSV file.', 422);
        }

        [$rows, $headers] = self::readCsv();
        $db = Database::connection();

        if ($mode === 'preview') {
            $analysis = self::analyse($db, $type, $rows);
            Response::json([
                'type' => $type,
                'summary' => self::summary($analysis),
                'rows' => self::publicRows($analysis),
                'headers' => $headers,
            ]);
        }

        $db->beginTransaction();
        try {
            // Re-check against the live database inside the import transaction.
            $analysis = self::analyse($db, $type, $rows);
            $summary = self::summary($analysis);
            if ($summary['errors'] > 0) {
                $db->rollBack();
                Response::json([
                    'error' => 'Correct the CSV errors and preview the file again before importing.',
                    'summary' => $summary,
                    'rows' => self::publicRows($analysis),
                ], 422);
            }

            $created = 0;
            $skipped = 0;
            foreach ($analysis as $row) {
                if ($row['status'] !== 'ready') {
                    if ($row['status'] === 'skipped') $skipped++;
                    continue;
                }
                $id = self::insertRecord($db, $type, $row['resolved'], (int) $admin['id']);
                self::audit($db, (int) $admin['id'], $type, $id, $row['label']);
                $created++;
            }

            $db->commit();
            Response::json([
                'message' => 'Academic data import completed.',
                'created_count' => $created,
                'skipped_count' => $skipped,
                'type' => $type,
            ]);
        } catch (PDOException $exception) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('CourseHubs academic CSV import database failure: ' . $exception->getMessage());
            if ((string) $exception->getCode() === '23505') {
                Response::error('Some records changed while the import was running. Preview the file again and retry.', 409);
            }
            Response::error('The CSV import could not be completed. No records from this import were saved.', 500);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            error_log('CourseHubs academic CSV import failure: ' . $exception->getMessage());
            Response::error('The CSV import could not be completed. No records from this import were saved.', 500);
        }
    }

    private static function readCsv(): array
    {
        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            Response::error('Choose a CSV file to upload.', 422);
        }
        $file = $_FILES['file'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::error('The CSV file could not be uploaded. Choose it again and retry.', 422);
        }
        if ((int) ($file['size'] ?? 0) < 1 || (int) $file['size'] > self::MAX_FILE_BYTES) {
            Response::error('Choose a CSV file smaller than 2 MB.', 422);
        }
        $extension = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        if ($extension !== 'csv') {
            Response::error('Upload a file with the .csv extension.', 422);
        }

        $handle = fopen((string) $file['tmp_name'], 'rb');
        if ($handle === false) Response::error('The CSV file could not be read. Save it again as CSV and retry.', 422);

        try {
            $rawHeaders = fgetcsv($handle, 0, ',', '"', '\\');
            if (!is_array($rawHeaders) || $rawHeaders === []) {
                Response::error('The CSV file is empty or does not contain a header row.', 422);
            }
            $headers = [];
            foreach ($rawHeaders as $index => $header) {
                $value = trim((string) $header);
                if ($index === 0) $value = preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;
                $value = strtolower($value);
                $value = preg_replace('/[^a-z0-9]+/', '_', $value) ?? '';
                $headers[] = trim($value, '_');
            }
            if (count(array_unique($headers)) !== count($headers)) {
                Response::error('The CSV contains duplicate column headings. Use the supplied template.', 422);
            }

            $type = strtolower(trim((string) ($_POST['type'] ?? '')));
            $allowed = self::ALLOWED_HEADERS[$type] ?? [];
            $required = self::REQUIRED_HEADERS[$type] ?? [];
            $unknown = array_values(array_diff($headers, $allowed));
            $missing = array_values(array_diff($required, $headers));
            if ($unknown !== []) {
                Response::error('The CSV contains unsupported column headings. Download the matching template and try again.', 422, ['columns' => $unknown]);
            }
            if ($missing !== []) {
                Response::error('The CSV is missing required columns: ' . implode(', ', $missing) . '.', 422);
            }

            $rows = [];
            $line = 1;
            while (($values = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
                $line++;
                if ($values === [null] || (count($values) === 1 && trim((string) $values[0]) === '')) continue;
                if (count($rows) >= self::MAX_ROWS) {
                    Response::error('A CSV import can contain no more than 1,000 data rows.', 422);
                }
                if (count($values) !== count($headers)) {
                    $rows[] = ['line' => $line, 'data' => [], 'csv_error' => 'The number of values does not match the column headings. Check commas and quotation marks.'];
                    continue;
                }
                $data = [];
                foreach ($headers as $index => $header) $data[$header] = trim((string) ($values[$index] ?? ''));
                if (count(array_filter($data, static fn(string $value): bool => $value !== '')) === 0) continue;
                $rows[] = ['line' => $line, 'data' => $data];
            }
            if ($rows === []) Response::error('This CSV contains column headings but no data rows. Add at least one academic record, save the file, and preview it again.', 422, ['code' => 'CSV_EMPTY']);
            return [$rows, $headers];
        } finally {
            fclose($handle);
        }
    }

    private static function analyse(PDO $db, string $type, array $rows): array
    {
        $analysis = [];
        $seen = [];
        foreach ($rows as $row) {
            $line = (int) $row['line'];
            if (isset($row['csv_error'])) {
                $analysis[] = ['line' => $line, 'status' => 'error', 'label' => 'Row ' . $line, 'message' => $row['csv_error'], 'resolved' => null];
                continue;
            }
            $result = self::analyseRow($db, $type, $row['data'], $seen);
            $analysis[] = ['line' => $line] + $result;
        }
        return $analysis;
    }

    private static function analyseRow(PDO $db, string $type, array $data, array &$seen): array
    {
        if (isset($data['description']) && strlen(trim((string) $data['description'])) > 1200) {
            return self::errorRow('Academic record', 'Descriptions must not exceed 1,200 characters.');
        }

        switch ($type) {
            case 'faculties':
                $name = self::text($data['faculty_name'] ?? '', 160);
                $code = self::validCode($data['faculty_code'] ?? '', 24);
                if ($name === '' || $code === null) return self::errorRow('Faculty', 'Enter a faculty name and a code of 2–24 letters or numbers.');
                $stmt = $db->prepare('SELECT id, name, code FROM faculties WHERE LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?)');
                $stmt->execute([$code, $name]);
                $matches = $stmt->fetchAll();
                if (count($matches) > 1) return self::errorRow($name, 'The faculty name and code match different existing records.');
                if ($matches !== []) {
                    $existing = $matches[0];
                    if (strcasecmp((string) $existing['name'], $name) === 0 && strcasecmp((string) $existing['code'], $code) === 0) return self::skipRow($name, 'This faculty already exists and will be skipped.');
                    return self::errorRow($name, 'The faculty name or code is already used by a different record.');
                }
                return self::uniqueOrReady($seen, ['faculty:' . strtolower($name), 'faculty-code:' . strtolower($code)], $name, ['name' => $name, 'code' => $code, 'description' => self::description($data['description'] ?? '')]);

            case 'departments':
                $faculty = self::resolveFaculty($db, $data['faculty_code'] ?? '', $data['faculty_name'] ?? '');
                if (!$faculty['record']) return self::errorRow($data['department_name'] ?? 'Department', $faculty['error']);
                $name = self::text($data['department_name'] ?? '', 160);
                $code = self::validCode($data['department_code'] ?? '', 24);
                if ($name === '' || $code === null) return self::errorRow($name ?: 'Department', 'Enter a department name and a code of 2–24 letters or numbers.');
                $stmt = $db->prepare('SELECT id, name, code FROM departments WHERE faculty_id = ? AND (LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?))');
                $stmt->execute([(int) $faculty['record']['id'], $code, $name]);
                $matches = $stmt->fetchAll();
                if (count($matches) > 1) return self::errorRow($name, 'The department name and code match different records in this faculty.');
                if ($matches !== []) {
                    $existing = $matches[0];
                    if (strcasecmp((string) $existing['name'], $name) === 0 && strcasecmp((string) $existing['code'], $code) === 0) return self::skipRow($name, 'This department already exists in the selected faculty and will be skipped.');
                    return self::errorRow($name, 'The department name or code is already used in this faculty.');
                }
                return self::uniqueOrReady($seen, ['department:' . $faculty['record']['id'] . ':' . strtolower($name), 'department-code:' . $faculty['record']['id'] . ':' . strtolower($code)], $name, [
                    'faculty_id' => (int) $faculty['record']['id'], 'name' => $name, 'code' => $code,
                    'description' => self::description($data['description'] ?? ''),
                ]);

            case 'programmes':
                $faculty = self::resolveFaculty($db, $data['faculty_code'] ?? '', $data['faculty_name'] ?? '');
                if (!$faculty['record']) return self::errorRow($data['programme_name'] ?? 'Programme', $faculty['error']);
                $department = self::resolveDepartment($db, (int) $faculty['record']['id'], $data['department_code'] ?? '');
                if (!$department['record']) return self::errorRow($data['programme_name'] ?? 'Programme', $department['error']);
                $name = self::text($data['programme_name'] ?? '', 160);
                $code = self::validCode($data['programme_code'] ?? '', 30);
                $award = self::text($data['award'] ?? 'Bachelor of Science', 80);
                $duration = filter_var($data['duration_years'] ?? '4', FILTER_VALIDATE_INT);
                if ($name === '' || $code === null || $award === '' || $duration === false || $duration < 1 || $duration > 10) return self::errorRow($name ?: 'Programme', 'Enter a programme name, valid code, award and duration between 1 and 10 years.');
                $stmt = $db->prepare('SELECT id, name, code FROM programmes WHERE department_id = ? AND (LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?))');
                $stmt->execute([(int) $department['record']['id'], $code, $name]);
                $matches = $stmt->fetchAll();
                if (count($matches) > 1) return self::errorRow($name, 'The programme name and code match different records in this department.');
                if ($matches !== []) {
                    $existing = $matches[0];
                    if (strcasecmp((string) $existing['name'], $name) === 0 && strcasecmp((string) $existing['code'], $code) === 0) return self::skipRow($name, 'This programme already exists in the selected department and will be skipped.');
                    return self::errorRow($name, 'The programme name or code is already used in this department.');
                }
                return self::uniqueOrReady($seen, ['programme:' . $department['record']['id'] . ':' . strtolower($name), 'programme-code:' . $department['record']['id'] . ':' . strtolower($code)], $name, [
                    'department_id' => (int) $department['record']['id'], 'name' => $name, 'code' => $code,
                    'award' => $award, 'duration_years' => (int) $duration, 'description' => self::description($data['description'] ?? ''),
                ]);

            case 'sessions':
                $name = trim((string) ($data['session_name'] ?? ''));
                if (!self::validSessionName($name)) return self::errorRow($name ?: 'Academic session', 'Use the format YYYY/YYYY, for example 2026/2027.');
                $stmt = $db->prepare('SELECT id FROM academic_sessions WHERE LOWER(name) = LOWER(?) LIMIT 1');
                $stmt->execute([$name]);
                if ($stmt->fetchColumn()) return self::skipRow($name, 'This academic session already exists and will be skipped.');
                return self::uniqueOrReady($seen, ['session:' . strtolower($name)], $name, ['name' => $name]);

            case 'courses':
                $name = self::text($data['course_title'] ?? '', 200);
                $code = self::courseCode($data['course_code'] ?? '');
                if ($name === '' || $code === null) return self::errorRow($name ?: 'Course', 'Enter a course title and a valid course code.');
                $rawUniversityWide = strtolower(trim((string) ($data['is_university_wide'] ?? 'false')));
                if ($rawUniversityWide === '') $rawUniversityWide = 'false';
                if (!in_array($rawUniversityWide, ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'], true)) {
                    return self::errorRow($code . ' · ' . $name, 'Set is_university_wide to true or false.');
                }
                $universityWide = in_array($rawUniversityWide, ['true', '1', 'yes', 'y'], true);
                $departmentId = null;
                if (!$universityWide) {
                    $faculty = self::resolveFaculty($db, $data['faculty_code'] ?? '', $data['faculty_name'] ?? '');
                    if (!$faculty['record']) return self::errorRow($name, $faculty['error']);
                    $department = self::resolveDepartment($db, (int) $faculty['record']['id'], $data['department_code'] ?? '');
                    if (!$department['record']) return self::errorRow($name, $department['error']);
                    $departmentId = (int) $department['record']['id'];
                }
                $stmt = $db->prepare('SELECT id, title, department_id, is_university_wide FROM courses WHERE LOWER(current_code) = LOWER(?) AND deleted_at IS NULL LIMIT 1');
                $stmt->execute([$code]);
                $existing = $stmt->fetch();
                if ($existing) {
                    $existingUniversityWide = self::booleanValue($existing['is_university_wide']);
                    if (
                        strcasecmp((string) $existing['title'], $name) === 0
                        && (int) ($existing['department_id'] ?? 0) === (int) ($departmentId ?? 0)
                        && $existingUniversityWide === $universityWide
                    ) {
                        return self::skipRow($code . ' · ' . $name, 'This course already exists and will be skipped.');
                    }
                    return self::errorRow($code . ' · ' . $name, 'This course code is already assigned to a different course.');
                }
                return self::uniqueOrReady($seen, ['course:' . strtolower($code)], $code . ' · ' . $name, [
                    'current_code' => $code, 'title' => $name, 'department_id' => $departmentId,
                    'is_university_wide' => $universityWide, 'description' => self::description($data['description'] ?? ''),
                ]);

            case 'offerings':
                $faculty = self::resolveFaculty($db, $data['faculty_code'] ?? '', $data['faculty_name'] ?? '');
                if (!$faculty['record']) return self::errorRow($data['course_code'] ?? 'Course offering', $faculty['error']);
                $department = self::resolveDepartment($db, (int) $faculty['record']['id'], $data['department_code'] ?? '');
                if (!$department['record']) return self::errorRow($data['course_code'] ?? 'Course offering', $department['error']);
                $programmeCode = self::validCode($data['programme_code'] ?? '', 30);
                $programmeStmt = $db->prepare('SELECT id, department_id, name FROM programmes WHERE department_id = ? AND LOWER(code) = LOWER(?) AND is_active IS TRUE LIMIT 1');
                $programmeStmt->execute([(int) $department['record']['id'], (string) $programmeCode]);
                $programme = $programmeStmt->fetch();
                if (!$programme) return self::errorRow($data['course_code'] ?? 'Course offering', 'The programme code was not found under the selected department. Import its programme first.');
                $courseCode = self::courseCode($data['course_code'] ?? '');
                $courseStmt = $db->prepare('SELECT id, current_code FROM courses WHERE LOWER(current_code) = LOWER(?) AND deleted_at IS NULL AND is_active IS TRUE LIMIT 1');
                $courseStmt->execute([(string) $courseCode]);
                $course = $courseStmt->fetch();
                if (!$course) return self::errorRow($data['course_code'] ?? 'Course offering', 'The course code was not found. Import its course first.');
                // A programme curriculum may include service/ancillary courses owned by another department.
                // The selected programme is resolved within its own department above; course ownership is independent.
                $sessionName = trim((string) ($data['academic_session'] ?? ''));
                $sessionStmt = $db->prepare('SELECT id, ended_at FROM academic_sessions WHERE LOWER(name) = LOWER(?) LIMIT 1');
                $sessionStmt->execute([$sessionName]);
                $session = $sessionStmt->fetch();
                if (!$session) return self::errorRow($courseCode, 'The academic session was not found. Create the session first.');
                if ($session['ended_at'] !== null) return self::errorRow($courseCode, 'The selected academic session is closed.');
                $level = filter_var($data['level'] ?? '', FILTER_VALIDATE_INT);
                $semester = trim((string) ($data['semester'] ?? ''));
                $courseType = trim((string) ($data['course_type'] ?? ''));
                $creditUnits = filter_var($data['credit_units'] ?? '', FILTER_VALIDATE_INT);
                if (!in_array($level, [100, 200, 300, 400, 500, 600], true) || !in_array($semester, ['First', 'Second'], true) || !in_array($courseType, ['Compulsory', 'Elective'], true) || $creditUnits === false || $creditUnits < 1 || $creditUnits > 30) return self::errorRow($courseCode, 'Check the level, semester, course type and credit units (1–30).');
                $examDate = trim((string) ($data['exam_date'] ?? ''));
                if ($examDate !== '' && !self::validDate($examDate)) return self::errorRow($courseCode, 'Enter an examination date in YYYY-MM-DD format or leave it blank.');
                $identity = implode(':', [(int) $course['id'], (int) $programme['id'], (int) $level, (int) $session['id'], $semester]);
                $existsStmt = $db->prepare('SELECT id FROM course_offerings WHERE course_id = ? AND COALESCE(programme_id, 0) = ? AND level = ? AND academic_session_id = ? AND semester = ? AND deleted_at IS NULL LIMIT 1');
                $existsStmt->execute([(int) $course['id'], (int) $programme['id'], (int) $level, (int) $session['id'], $semester]);
                if ($existsStmt->fetchColumn()) return self::skipRow($courseCode . ' · ' . $programme['name'] . ' · ' . $level, 'This course offering already exists and will be skipped.');
                $lecturerNames = array_values(array_unique(array_filter(array_map('trim', explode(';', (string) ($data['lecturer_names'] ?? ''))))));
                if (count($lecturerNames) > 10 || array_filter($lecturerNames, static fn(string $value): bool => strlen($value) > 160)) return self::errorRow($courseCode, 'Enter no more than 10 lecturer names, each no longer than 160 characters.');
                return self::uniqueOrReady($seen, ['offering:' . $identity], $courseCode . ' · ' . $programme['name'] . ' · ' . $level, [
                    'course_id' => (int) $course['id'], 'course_code' => (string) $course['current_code'], 'programme_id' => (int) $programme['id'],
                    'level' => (int) $level, 'academic_session_id' => (int) $session['id'], 'semester' => $semester,
                    'course_type' => $courseType, 'credit_units' => (int) $creditUnits, 'exam_date' => $examDate === '' ? null : $examDate,
                    'lecturer_names' => $lecturerNames,
                ]);
        }

        return self::errorRow('Academic record', 'This CSV data type is not supported.');
    }

    private static function resolveFaculty(PDO $db, mixed $codeValue, mixed $nameValue): array
    {
        $code = trim((string) $codeValue);
        $name = trim((string) $nameValue);
        $byCode = null;
        $byName = null;
        if ($code !== '') {
            $stmt = $db->prepare('SELECT id, name, code, is_active FROM faculties WHERE LOWER(code) = LOWER(?) LIMIT 1');
            $stmt->execute([$code]);
            $byCode = $stmt->fetch() ?: null;
        }
        if ($name !== '') {
            $stmt = $db->prepare('SELECT id, name, code, is_active FROM faculties WHERE LOWER(name) = LOWER(?) LIMIT 1');
            $stmt->execute([$name]);
            $byName = $stmt->fetch() ?: null;
        }
        if ($byCode && $byName && (int) $byCode['id'] !== (int) $byName['id']) return ['record' => null, 'error' => 'The faculty code and faculty name refer to different faculties.'];
        if ($byCode && $name !== '' && !$byName && strcasecmp((string) $byCode['name'], $name) !== 0) return ['record' => null, 'error' => 'The faculty code and faculty name do not match. Check both values.'];
        $faculty = $byCode ?: $byName;
        if (!$faculty) return ['record' => null, 'error' => 'The faculty was not found. Check its code or name and create it before importing departments.'];
        if (!self::booleanValue($faculty['is_active'])) return ['record' => null, 'error' => 'The selected faculty is archived. Reactivate it before importing records.'];
        return ['record' => $faculty, 'error' => null];
    }

    private static function resolveDepartment(PDO $db, int $facultyId, mixed $codeValue): array
    {
        $code = trim((string) $codeValue);
        if ($code === '') return ['record' => null, 'error' => 'Enter a department code.'];
        $stmt = $db->prepare('SELECT id, name, code, is_active FROM departments WHERE faculty_id = ? AND LOWER(code) = LOWER(?) LIMIT 1');
        $stmt->execute([$facultyId, $code]);
        $department = $stmt->fetch() ?: null;
        if (!$department) return ['record' => null, 'error' => 'The department code was not found under the selected faculty. Import the department first.'];
        if (!self::booleanValue($department['is_active'])) return ['record' => null, 'error' => 'The selected department is archived. Reactivate it before importing records.'];
        return ['record' => $department, 'error' => null];
    }

    private static function uniqueOrReady(array &$seen, array $keys, string $label, array $resolved): array
    {
        foreach ($keys as $key) {
            if (isset($seen[$key])) return self::skipRow($label, 'This record is duplicated in the CSV. Only its first occurrence will be considered.');
        }
        foreach ($keys as $key) $seen[$key] = true;
        return ['status' => 'ready', 'label' => $label, 'message' => 'Ready to import.', 'resolved' => $resolved];
    }

    private static function errorRow(string $label, string $message): array
    {
        return ['status' => 'error', 'label' => $label, 'message' => $message, 'resolved' => null];
    }

    private static function skipRow(string $label, string $message): array
    {
        return ['status' => 'skipped', 'label' => $label, 'message' => $message, 'resolved' => null];
    }

    private static function insertRecord(PDO $db, string $type, array $record, int $adminId): int
    {
        switch ($type) {
            case 'faculties':
                $stmt = $db->prepare('INSERT INTO faculties (name, code, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?) RETURNING id');
                $stmt->execute([$record['name'], $record['code'], $record['description'], $adminId, $adminId]);
                break;
            case 'departments':
                $stmt = $db->prepare('INSERT INTO departments (faculty_id, name, code, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
                $stmt->execute([$record['faculty_id'], $record['name'], $record['code'], $record['description'], $adminId, $adminId]);
                break;
            case 'programmes':
                $stmt = $db->prepare('INSERT INTO programmes (department_id, name, code, award, duration_years, description, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
                $stmt->execute([$record['department_id'], $record['name'], $record['code'], $record['award'], $record['duration_years'], $record['description'], $adminId, $adminId]);
                break;
            case 'sessions':
                $stmt = $db->prepare('INSERT INTO academic_sessions (name, is_current) VALUES (?, FALSE) RETURNING id');
                $stmt->execute([$record['name']]);
                break;
            case 'courses':
                $stmt = $db->prepare("INSERT INTO courses (current_code, title, status, department_id, description, is_active, is_university_wide, created_by, updated_by) VALUES (?, ?, 'active', ?, ?, TRUE, ?, ?, ?) RETURNING id");
                // PDO_PGSQL may encode PHP false as an empty string for a BOOLEAN parameter.
                // Pass explicit PostgreSQL boolean literals so FALSE is never sent as ''.
                $universityWide = $record['is_university_wide'] ? 'true' : 'false';
                $stmt->execute([$record['current_code'], $record['title'], $record['department_id'], $record['description'], $universityWide, $adminId, $adminId]);
                break;
            case 'offerings':
                $stmt = $db->prepare("INSERT INTO course_offerings (course_id, programme_id, level, academic_session_id, semester, code_used, course_type, credit_units, exam_date, status, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?) RETURNING id");
                $stmt->execute([$record['course_id'], $record['programme_id'], $record['level'], $record['academic_session_id'], $record['semester'], $record['course_code'], $record['course_type'], $record['credit_units'], $record['exam_date'], $adminId, $adminId]);
                $id = (int) $stmt->fetchColumn();
                if ($record['lecturer_names'] !== []) {
                    $lecturerStmt = $db->prepare('INSERT INTO course_offering_lecturers (course_offering_id, lecturer_name) VALUES (?, ?)');
                    foreach ($record['lecturer_names'] as $lecturerName) $lecturerStmt->execute([$id, $lecturerName]);
                }
                return $id;
            default:
                throw new RuntimeException('Unsupported CSV import type.');
        }
        return (int) $stmt->fetchColumn();
    }

    private static function audit(PDO $db, int $adminId, string $type, int $id, string $label): void
    {
        $target = [
            'faculties' => 'faculty', 'departments' => 'department', 'programmes' => 'programme',
            'sessions' => 'academic_session', 'courses' => 'course', 'offerings' => 'course_offering',
        ][$type] ?? 'academic_record';
        $action = $target . '_created';
        $stmt = $db->prepare('INSERT INTO activity_log (actor_user_id, action_type, target_type, target_id, description) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$adminId, $action, $target, $id, 'Imported ' . $label . ' from an academic CSV file.']);
    }

    private static function summary(array $analysis): array
    {
        $summary = ['total' => count($analysis), 'ready' => 0, 'skipped' => 0, 'errors' => 0];
        foreach ($analysis as $row) {
            if ($row['status'] === 'ready') $summary['ready']++;
            elseif ($row['status'] === 'skipped') $summary['skipped']++;
            else $summary['errors']++;
        }
        return $summary;
    }

    private static function publicRows(array $analysis): array
    {
        return array_map(static fn(array $row): array => [
            'line' => $row['line'], 'status' => $row['status'], 'label' => $row['label'], 'message' => $row['message'],
        ], $analysis);
    }

    private static function text(mixed $value, int $max): string
    {
        $text = trim((string) $value);
        return strlen($text) <= $max ? $text : '';
    }

    private static function description(mixed $value): ?string
    {
        $description = trim((string) $value);
        if ($description === '') return null;
        return strlen($description) <= 1200 ? $description : null;
    }

    private static function validCode(mixed $value, int $max): ?string
    {
        $code = strtoupper(trim((string) $value));
        if (strlen($code) < 2 || strlen($code) > $max) return null;
        return preg_match('/^[A-Z0-9][A-Z0-9._-]+$/', $code) ? $code : null;
    }

    private static function courseCode(mixed $value): ?string
    {
        $code = strtoupper(preg_replace('/\s+/', ' ', trim((string) $value)) ?? '');
        if (strlen($code) < 2 || strlen($code) > 20) return null;
        return preg_match('/^[A-Z0-9]+(?:[ .-][A-Z0-9]+)*$/', $code) ? $code : null;
    }

    private static function validSessionName(string $name): bool
    {
        if (!preg_match('/^(19|20|21)\d{2}\/(19|20|21)\d{2}$/', $name)) return false;
        [$start, $end] = array_map('intval', explode('/', $name));
        return $end === $start + 1;
    }

    private static function validDate(string $date): bool
    {
        $parsed = DateTime::createFromFormat('!Y-m-d', $date);
        return $parsed !== false && $parsed->format('Y-m-d') === $date;
    }

    private static function booleanValue(mixed $value): bool
    {
        if (is_bool($value)) return $value;
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 't', 'yes', 'y'], true);
    }
}
