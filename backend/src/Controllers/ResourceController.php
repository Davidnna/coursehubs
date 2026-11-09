<?php

declare(strict_types=1);

final class ResourceController
{
    private const MAX_FILE_BYTES = 25 * 1024 * 1024;
    private const TYPES = ['material', 'past_question', 'model_answer'];
    private const MIME_BY_EXTENSION = [
        'pdf' => ['application/pdf'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
        'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream'],
    ];

    public static function access(): void
    {
        $user = Auth::requireUser();
        $canUploadAssessments = self::canUploadAssessmentTypes((int) $user['id']);
        $canUpload = self::isAdmin($user) || $canUploadAssessments;
        $allowedTypes = $canUpload ? ['material'] : [];
        if ($canUploadAssessments) {
            $allowedTypes = ['material', 'past_question', 'model_answer'];
        }
        $storageReady = ObjectStorage::isConfigured();

        Response::json([
            'account_type' => $user['account_type'] ?? null,
            'can_upload' => $canUpload,
            'can_upload_assessments' => $canUploadAssessments,
            'allowed_types' => $allowedTypes,
            'storage_ready' => $storageReady,
            'message' => !$canUpload
                ? 'Resource contributions are available to approved course representatives, course advisers, lecturers and administrators.'
                : (!$storageReady
                    ? 'Resource uploads are temporarily unavailable. Please contact CourseHubs support.'
                    : (!$canUploadAssessments
                        ? 'You can submit course materials. Past questions and model answers can only be submitted by lecturers, course representatives and course advisers.'
                        : 'You can submit academic resources for review.')),
        ]);
    }

    public static function courseOptions(): void
    {
        $user = Auth::requireUser();
        $db = Database::connection();

        // Students only see courses offered by their department for their
        // current level in the active academic session. This scope is repeated in
        // upload() so a client cannot bypass it by submitting an arbitrary course ID.
        if (($user['account_type'] ?? '') === 'student') {
            $profileStmt = $db->prepare(
                "SELECT department_id, level FROM users WHERE id = ? AND account_type = 'student' AND deleted_at IS NULL LIMIT 1"
            );
            $profileStmt->execute([(int) $user['id']]);
            $profile = $profileStmt->fetch();

            if (!$profile || empty($profile['department_id']) || empty($profile['level'])) {
                Response::json([
                    'courses' => [],
                    'scope' => 'student_department_level',
                    'message' => 'Your academic profile is missing a department or current level. Submit an academic information correction request so an administrator can verify and update your record.',
                ]);
            }

            $stmt = $db->prepare(
                "SELECT DISTINCT c.id, c.current_code AS code, c.title, d.name AS department_name
                 FROM course_offerings co
                 JOIN courses c ON c.id = co.course_id
                 JOIN programmes p ON p.id = co.programme_id
                 JOIN departments d ON d.id = p.department_id
                 WHERE p.department_id = ? AND co.level = ?
                   AND co.academic_session_id = (SELECT id FROM academic_sessions WHERE is_current IS TRUE LIMIT 1)
                   AND co.deleted_at IS NULL
                   AND p.is_active IS TRUE AND d.is_active IS TRUE
                   AND c.deleted_at IS NULL AND c.is_active IS TRUE AND c.status = 'active'
                 ORDER BY c.current_code, c.title"
            );
            $stmt->execute([
                (int) $profile['department_id'],
                (int) $profile['level'],
            ]);
            $courses = $stmt->fetchAll();
            Response::json([
                'courses' => $courses,
                'scope' => 'student_department_level',
                'message' => $courses === []
                    ? 'No courses have been added for your department and current level in the active academic session. If your department, programme or level is missing or incorrect, request an academic information correction. If your details are correct, contact your department administrator about the programme course list.'
                    : null,
            ]);
        }

        // Staff contributors retain the broader catalogue. Their resource types
        // are still constrained by the server-side academic-role checks.
        $stmt = $db->query(
            "SELECT c.id, c.current_code AS code, c.title, d.name AS department_name
             FROM courses c LEFT JOIN departments d ON d.id = c.department_id
             WHERE c.deleted_at IS NULL AND c.is_active IS TRUE AND c.status = 'active'
             ORDER BY c.current_code, c.title"
        );
        Response::json(['courses' => $stmt->fetchAll(), 'scope' => 'staff_catalogue', 'message' => null]);
    }

    public static function upload(): void
    {
        $user = Auth::requireUser();
        if (!self::canUpload($user)) Response::error('Your account does not currently have permission to contribute resources.', 403, ['code' => 'RESOURCE_UPLOAD_ACCESS_REQUIRED']);
        if (!ObjectStorage::isConfigured()) Response::error('Resource uploads are temporarily unavailable. Please contact CourseHubs support.', 503);

        $file = $_FILES['file'] ?? null;
        $uploadError = is_array($file) ? (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
        if (in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            Response::error('The selected file exceeds the 25 MB upload limit.', 422);
        }
        if (!is_array($file) || $uploadError !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
            Response::error('Choose a file to upload and try again.', 422, ['fields' => ['file' => 'Choose a PDF, DOCX or PPTX file.']]);
        }
        $size = (int) ($file['size'] ?? 0);
        if ($size < 1 || $size > self::MAX_FILE_BYTES) Response::error('Choose a file smaller than 25 MB.', 422);
        $originalName = basename((string) ($file['name'] ?? 'resource'));
        if (self::characterLength($originalName) > 255) Response::error('The selected filename is too long. Rename the document and try again.', 422);
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!isset(self::MIME_BY_EXTENSION[$extension])) Response::error('Upload a PDF, DOCX or PPTX document.', 422);
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = (string) $finfo->file((string) $file['tmp_name']);
        if (!in_array($mimeType, self::MIME_BY_EXTENSION[$extension], true)) Response::error('The selected file does not match its file type. Save the document again and retry.', 422);

        $title = trim((string) ($_POST['title'] ?? ''));
        $courseId = self::positiveId($_POST['course_id'] ?? null);
        $sessionId = self::positiveId($_POST['academic_session_id'] ?? null);
        $type = trim((string) ($_POST['type'] ?? ''));
        $answerTo = self::positiveId($_POST['answer_to_upload_id'] ?? null);
        if ($title === '' || self::characterLength($title) > 200) Response::error('Enter a resource title of no more than 200 characters.', 422, ['fields' => ['title' => 'Enter a resource title of no more than 200 characters.']]);
        if ($courseId < 1) Response::error('Choose the course this resource belongs to.', 422, ['fields' => ['course_id' => 'Choose a course.']]);
        if (!in_array($type, self::TYPES, true)) Response::error('Choose a valid resource category.', 422);

        $db = Database::connection();
        if ($type !== 'material' && !self::canUploadAssessmentTypes((int) $user['id'])) {
            Response::error(
                'Past questions and model answers can only be submitted by lecturers, course representatives and course advisers.',
                403,
                ['code' => 'ASSESSMENT_RESOURCE_ROLE_REQUIRED']
            );
        }
        $course = $db->prepare('SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL AND is_active IS TRUE AND status = \'active\' LIMIT 1');
        $course->execute([$courseId]);
        if (!$course->fetchColumn()) Response::error('Choose an active course.', 422, ['fields' => ['course_id' => 'Choose an active course.']]);
        if (($user['account_type'] ?? '') === 'student' && !self::studentCanUploadCourse($db, (int) $user['id'], $courseId)) {
            Response::error(
                'Choose a course currently offered by your department for your current level in the active academic session.',
                422,
                ['fields' => ['course_id' => 'Choose a course offered by your department for your current level.']]
            );
        }
        if ($sessionId > 0) {
            $session = $db->prepare('SELECT id FROM academic_sessions WHERE id = ? LIMIT 1');
            $session->execute([$sessionId]);
            if (!$session->fetchColumn()) Response::error('Choose a valid academic session.', 422);
        } else {
            $sessionId = null;
        }
        if ($type === 'model_answer' && $answerTo > 0) {
            $parent = $db->prepare("SELECT id FROM uploads WHERE id = ? AND course_id = ? AND type = 'past_question' AND status = 'approved' AND deleted_at IS NULL");
            $parent->execute([$answerTo, $courseId]);
            if (!$parent->fetchColumn()) Response::error('Choose an approved past question for this model answer.', 422);
        } elseif ($type !== 'model_answer') {
            $answerTo = null;
        }

        $userId = (int) $user['id'];
        $quota = $db->prepare("SELECT COUNT(*) FROM uploads WHERE uploader_id = ? AND deleted_at IS NULL AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'");
        $quota->execute([$userId]);
        if ((int) $quota->fetchColumn() >= 10) Response::error('You have reached the hourly resource submission limit. Please try again later.', 429);
        $key = 'resources/' . $userId . '/' . self::uuid() . '.' . $extension;
        try {
            ObjectStorage::putFile((string) $file['tmp_name'], $key, $mimeType);
            $status = self::isAdmin($user) ? 'approved' : 'pending';
            $stmt = $db->prepare(
                'INSERT INTO uploads (course_id, academic_session_id, uploader_id, type, title, original_file_path,
                    viewable_file_path, file_size, answer_to_upload_id, storage_key, original_filename, mime_type,
                    sha256, status, moderated_by, moderated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'
            );
            $stmt->execute([
                $courseId, $sessionId, $userId, $type, $title, $key,
                $extension === 'pdf' ? $key : null, $size, $answerTo > 0 ? $answerTo : null,
                $key, $originalName, $mimeType, hash_file('sha256', (string) $file['tmp_name']),
                $status, self::isAdmin($user) ? $userId : null, self::isAdmin($user) ? date('c') : null,
            ]);
            $id = (int) $stmt->fetchColumn();
            Response::json([
                'message' => $status === 'approved' ? 'Your resource has been published.' : 'Your resource has been submitted for review.',
                'id' => $id,
                'status' => $status,
            ], 201);
        } catch (PDOException $exception) {
            try { ObjectStorage::delete($key); } catch (Throwable) { /* Keep original database failure private. */ }
            error_log('CourseHubs resource metadata insert failed: ' . $exception->getMessage());
            Response::error('We could not save this resource right now. Please try again shortly.', 500);
        } catch (Throwable $exception) {
            error_log('CourseHubs resource upload failed: ' . $exception->getMessage());
            Response::error('We could not upload this resource right now. Please try again shortly.', 503);
        }
    }

    public static function search(): void
    {
        $user = Auth::requireUser();
        $db = Database::connection();
        $userId = (int) $user['id'];
        $view = trim((string) ($_GET['view'] ?? 'all'));
        if (!in_array($view, ['all', 'bookmarks', 'recent'], true)) $view = 'all';

        $where = ["u.status = 'approved'", 'u.deleted_at IS NULL', 'c.deleted_at IS NULL', "c.is_active IS TRUE", "c.status = 'active'"];
        $params = [];
        if ($view === 'bookmarks') {
            $where[] = 'EXISTS (SELECT 1 FROM resource_bookmarks rb WHERE rb.user_id = ? AND rb.upload_id = u.id)';
            $params[] = $userId;
        } elseif ($view === 'recent') {
            $where[] = 'EXISTS (SELECT 1 FROM resource_views rv WHERE rv.user_id = ? AND rv.upload_id = u.id)';
            $params[] = $userId;
        }

        $query = trim((string) ($_GET['q'] ?? ''));
        if ($query !== '') {
            if (self::characterLength($query) > 100 && preg_match('/^.{0,100}/us', $query, $matches)) {
                $query = $matches[0];
            }
            $term = '%' . $query . '%';
            $where[] = "(u.title ILIKE ? OR c.current_code ILIKE ? OR c.title ILIKE ? OR COALESCE(u.original_filename, '') ILIKE ? OR u.search_vector @@ plainto_tsquery('english', ?))";
            array_push($params, $term, $term, $term, $term, $query);
        }

        $type = trim((string) ($_GET['type'] ?? ''));
        if (in_array($type, self::TYPES, true)) { $where[] = 'u.type = ?'; $params[] = $type; }
        $courseId = self::positiveId($_GET['course_id'] ?? null);
        if ($courseId > 0) { $where[] = 'u.course_id = ?'; $params[] = $courseId; }

        $programmeId = self::positiveId($_GET['programme_id'] ?? null);
        $departmentId = self::positiveId($_GET['department_id'] ?? null);
        $facultyId = self::positiveId($_GET['faculty_id'] ?? null);
        $level = filter_var($_GET['level'] ?? null, FILTER_VALIDATE_INT);
        if (!in_array($level, [100, 200, 300, 400, 500, 600], true)) $level = null;
        $semester = trim((string) ($_GET['semester'] ?? ''));
        if (!in_array($semester, ['First', 'Second'], true)) $semester = '';
        $sessionId = self::positiveId($_GET['session_id'] ?? null);

        $hasOfferingFilters = $programmeId > 0 || $departmentId > 0 || $facultyId > 0 || $level !== null || $semester !== '';
        if ($hasOfferingFilters) {
            $offeringWhere = ['co.course_id = u.course_id', 'co.deleted_at IS NULL'];
            $offeringParams = [];
            if ($programmeId > 0) { $offeringWhere[] = 'co.programme_id = ?'; $offeringParams[] = $programmeId; }
            if ($departmentId > 0) { $offeringWhere[] = 'COALESCE(p.department_id, c.department_id) = ?'; $offeringParams[] = $departmentId; }
            if ($facultyId > 0) { $offeringWhere[] = 'd.faculty_id = ?'; $offeringParams[] = $facultyId; }
            if ($level !== null) { $offeringWhere[] = 'co.level = ?'; $offeringParams[] = $level; }
            if ($semester !== '') { $offeringWhere[] = 'co.semester = ?'; $offeringParams[] = $semester; }
            if ($sessionId > 0) {
                $offeringWhere[] = 'co.academic_session_id = ?';
                $offeringParams[] = $sessionId;
                $offeringWhere[] = '(u.academic_session_id IS NULL OR u.academic_session_id = co.academic_session_id)';
            }
            $where[] = 'EXISTS (SELECT 1 FROM course_offerings co LEFT JOIN programmes p ON p.id = co.programme_id LEFT JOIN departments d ON d.id = COALESCE(p.department_id, c.department_id) WHERE ' . implode(' AND ', $offeringWhere) . ')';
            array_push($params, ...$offeringParams);
        } elseif ($sessionId > 0) {
            $where[] = '(u.academic_session_id = ? OR EXISTS (SELECT 1 FROM course_offerings co_session WHERE co_session.course_id = u.course_id AND co_session.academic_session_id = ? AND co_session.deleted_at IS NULL))';
            array_push($params, $sessionId, $sessionId);
        }

        $whereSql = implode(' AND ', $where);
        $countStmt = $db->prepare('SELECT COUNT(*) FROM uploads u JOIN courses c ON c.id = u.course_id WHERE ' . $whereSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sort = trim((string) ($_GET['sort'] ?? 'newest'));
        $orderBy = match ($sort) {
            'popular' => 'download_count DESC, u.created_at DESC, u.id DESC',
            'title' => 'u.title ASC, u.created_at DESC',
            default => $view === 'recent' ? 'rv.last_viewed_at DESC NULLS LAST, u.created_at DESC' : 'u.created_at DESC, u.id DESC',
        };
        $limit = filter_var($_GET['limit'] ?? 24, FILTER_VALIDATE_INT);
        $limit = $limit === false ? 24 : max(1, min(48, $limit));
        $offset = filter_var($_GET['offset'] ?? 0, FILTER_VALIDATE_INT);
        $offset = $offset === false ? 0 : max(0, min(10000, $offset));

        $sql = "SELECT u.id, u.title, u.type, u.file_size, u.original_filename, u.mime_type, u.created_at,
                       u.academic_session_id, s.name AS session_name, u.course_id,
                       c.current_code AS course_code, c.title AS course_title,
                       COALESCE(offering_area.department_name, d.name, 'Academic directory') AS department_name,
                       COALESCE(offering_area.faculty_name, f.name) AS faculty_name,
                       CONCAT(author.first_name, ' ', author.surname) AS uploader_name,
                       (SELECT COUNT(*) FROM download_logs dl WHERE dl.upload_id = u.id) AS download_count,
                       CASE WHEN EXISTS (SELECT 1 FROM resource_bookmarks rb WHERE rb.user_id = ? AND rb.upload_id = u.id) THEN 1 ELSE 0 END AS is_bookmarked,
                       CASE WHEN EXISTS (SELECT 1 FROM flags fl WHERE fl.flaggable_type = 'upload' AND fl.flaggable_id = u.id AND fl.reported_by = ? AND fl.status = 'open') THEN 1 ELSE 0 END AS has_open_report,
                       rv.last_viewed_at
                FROM uploads u
                JOIN courses c ON c.id = u.course_id
                JOIN users author ON author.id = u.uploader_id
                LEFT JOIN academic_sessions s ON s.id = u.academic_session_id
                LEFT JOIN departments d ON d.id = c.department_id
                LEFT JOIN faculties f ON f.id = d.faculty_id
                LEFT JOIN LATERAL (
                    SELECT d2.name AS department_name, f2.name AS faculty_name
                    FROM course_offerings co2
                    LEFT JOIN programmes p2 ON p2.id = co2.programme_id
                    LEFT JOIN departments d2 ON d2.id = COALESCE(p2.department_id, c.department_id)
                    LEFT JOIN faculties f2 ON f2.id = d2.faculty_id
                    WHERE co2.course_id = u.course_id AND co2.deleted_at IS NULL
                      AND (u.academic_session_id IS NULL OR co2.academic_session_id = u.academic_session_id)
                    ORDER BY co2.academic_session_id DESC, co2.level, co2.semester
                    LIMIT 1
                ) offering_area ON TRUE
                LEFT JOIN resource_views rv ON rv.user_id = ? AND rv.upload_id = u.id
                WHERE {$whereSql}
                ORDER BY {$orderBy}
                LIMIT {$limit} OFFSET {$offset}";
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge([$userId, $userId, $userId], $params));
        $resources = $stmt->fetchAll();

        Response::json([
            'resources' => $resources,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => $offset + count($resources) < $total,
            'view' => $view,
        ]);
    }

    public static function bookmark(array $params): void
    {
        $user = Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        $db = Database::connection();
        $resource = $db->prepare("SELECT id FROM uploads WHERE id = ? AND status = 'approved' AND deleted_at IS NULL");
        $resource->execute([$id]);
        if (!$resource->fetchColumn()) Response::error('The resource could not be found.', 404);
        $stmt = $db->prepare('INSERT INTO resource_bookmarks (user_id, upload_id) VALUES (?, ?) ON CONFLICT (user_id, upload_id) DO NOTHING');
        $stmt->execute([(int) $user['id'], $id]);
        Response::json(['message' => 'Resource saved to your bookmarks.', 'bookmarked' => true]);
    }

    public static function unbookmark(array $params): void
    {
        $user = Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        Database::connection()->prepare('DELETE FROM resource_bookmarks WHERE user_id = ? AND upload_id = ?')->execute([(int) $user['id'], $id]);
        Response::json(['message' => 'Resource removed from your bookmarks.', 'bookmarked' => false]);
    }

    public static function report(array $params): void
    {
        $user = Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::jsonBody();
        $reasonCode = trim((string) ($body['reason'] ?? ''));
        $details = trim((string) ($body['details'] ?? ''));
        $reasonLabels = [
            'incorrect_course' => 'Incorrect course or academic information',
            'poor_quality' => 'Poor or unreadable document',
            'copyright' => 'Copyright or ownership concern',
            'inappropriate' => 'Inappropriate content',
            'duplicate' => 'Duplicate resource',
            'other' => 'Other concern',
        ];
        if (!isset($reasonLabels[$reasonCode])) Response::error('Choose a reason for reporting this resource.', 422);
        if (self::characterLength($details) > 1200) Response::error('The additional details are too long.', 422);
        $db = Database::connection();
        $resource = $db->prepare("SELECT id FROM uploads WHERE id = ? AND status = 'approved' AND deleted_at IS NULL");
        $resource->execute([$id]);
        if (!$resource->fetchColumn()) Response::error('The resource could not be found.', 404);
        $userId = (int) $user['id'];
        $existing = $db->prepare("SELECT id FROM flags WHERE flaggable_type = 'upload' AND flaggable_id = ? AND reported_by = ? AND status = 'open' LIMIT 1");
        $existing->execute([$id, $userId]);
        if ($existing->fetchColumn()) Response::error('You already have an open report for this resource.', 409, ['code' => 'RESOURCE_REPORT_PENDING']);
        $reason = $reasonLabels[$reasonCode] . ($details !== '' ? ': ' . $details : '');
        $stmt = $db->prepare("INSERT INTO flags (flaggable_type, flaggable_id, reported_by, reason) VALUES ('upload', ?, ?, ?) RETURNING id");
        $stmt->execute([$id, $userId, $reason]);
        Response::json(['message' => 'Thank you. Your report has been sent to the CourseHubs administrators.', 'report_id' => (int) $stmt->fetchColumn()], 201);
    }

    public static function adminReports(): void
    {
        Auth::requireAdmin();
        $status = trim((string) ($_GET['status'] ?? 'open'));
        if (!in_array($status, ['open', 'resolved', 'all'], true)) $status = 'open';
        $sql = "SELECT fl.id AS report_id, fl.reason, fl.status, fl.created_at, fl.resolution_note,
                       u.id AS resource_id, u.title AS resource_title, u.type AS resource_type, u.status AS resource_status,
                       u.deleted_at AS resource_deleted_at, u.mime_type, c.current_code AS course_code, c.title AS course_title,
                       CONCAT(reporter.first_name, ' ', reporter.surname) AS reporter_name, reporter.email AS reporter_email,
                       CONCAT(resolver.first_name, ' ', resolver.surname) AS resolver_name
                FROM flags fl
                JOIN uploads u ON u.id = fl.flaggable_id AND fl.flaggable_type = 'upload'
                JOIN courses c ON c.id = u.course_id
                JOIN users reporter ON reporter.id = fl.reported_by
                LEFT JOIN users resolver ON resolver.id = fl.resolved_by";
        $params = [];
        if ($status !== 'all') { $sql .= ' WHERE fl.status = ?'; $params[] = $status; }
        $sql .= " ORDER BY CASE fl.status WHEN 'open' THEN 0 ELSE 1 END, fl.created_at DESC LIMIT 200";
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        Response::json(['reports' => $stmt->fetchAll()]);
    }

    public static function resolveReport(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::jsonBody();
        $note = trim((string) ($body['resolution_note'] ?? ''));
        if (self::characterLength($note) > 1000) Response::error('The resolution note is too long.', 422);
        $stmt = Database::connection()->prepare(
            "UPDATE flags SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, resolution_note = ?
             WHERE id = ? AND flaggable_type = 'upload' AND status = 'open' RETURNING id"
        );
        $stmt->execute([(int) $admin['id'], $note !== '' ? $note : null, $id]);
        if (!$stmt->fetchColumn()) Response::error('The open resource report could not be found.', 404);
        Response::json(['message' => 'Resource report marked as resolved.']);
    }

    public static function forCourse(array $params): void
    {
        $user = Auth::requireUser();
        $courseId = self::positiveId($params['id'] ?? null);
        if ($courseId < 1) Response::error('The course could not be found.', 404);
        $type = trim((string) ($_GET['type'] ?? ''));
        $sql = "SELECT u.id, u.title, u.type, u.file_size, u.original_filename, u.mime_type, u.created_at,
                       u.academic_session_id, s.name AS session_name,
                       CONCAT(author.first_name, ' ', author.surname) AS uploader_name,
                       CASE WHEN EXISTS (SELECT 1 FROM resource_bookmarks rb WHERE rb.user_id = ? AND rb.upload_id = u.id) THEN 1 ELSE 0 END AS is_bookmarked
                FROM uploads u JOIN users author ON author.id = u.uploader_id
                LEFT JOIN academic_sessions s ON s.id = u.academic_session_id
                WHERE u.course_id = ? AND u.status = 'approved' AND u.deleted_at IS NULL";
        $paramsSql = [(int) $user['id'], $courseId];
        if (in_array($type, self::TYPES, true)) { $sql .= ' AND u.type = ?'; $paramsSql[] = $type; }
        $sql .= ' ORDER BY u.created_at DESC LIMIT 100';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($paramsSql);
        Response::json(['resources' => $stmt->fetchAll()]);
    }

    public static function mine(): void
    {
        $user = Auth::requireUser();
        $stmt = Database::connection()->prepare(
            'SELECT u.id, u.title, u.type, u.file_size, u.original_filename, u.status, u.moderation_note,
                    u.created_at, c.current_code AS course_code, c.title AS course_title,
                    s.name AS session_name
             FROM uploads u JOIN courses c ON c.id = u.course_id
             LEFT JOIN academic_sessions s ON s.id = u.academic_session_id
             WHERE u.uploader_id = ? AND u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 50'
        );
        $stmt->execute([(int) $user['id']]);
        Response::json(['submissions' => $stmt->fetchAll()]);
    }

    public static function adminIndex(): void
    {
        Auth::requireAdmin();
        $status = trim((string) ($_GET['status'] ?? 'pending'));
        if (!in_array($status, ['pending', 'approved', 'rejected', 'all'], true)) $status = 'pending';
        $sql = "SELECT u.id, u.title, u.type, u.file_size, u.original_filename, u.mime_type, u.status,
                       u.moderation_note, u.created_at, c.current_code AS course_code, c.title AS course_title,
                       s.name AS session_name, CONCAT(author.first_name, ' ', author.surname) AS uploader_name,
                       author.email AS uploader_email,
                       (SELECT COUNT(*) FROM download_logs dl WHERE dl.upload_id = u.id) AS download_count
                FROM uploads u JOIN courses c ON c.id = u.course_id
                JOIN users author ON author.id = u.uploader_id
                LEFT JOIN academic_sessions s ON s.id = u.academic_session_id
                WHERE u.deleted_at IS NULL";
        $params = [];
        if ($status !== 'all') { $sql .= ' AND u.status = ?'; $params[] = $status; }
        $sql .= ' ORDER BY CASE u.status WHEN \'pending\' THEN 0 ELSE 1 END, u.created_at DESC LIMIT 150';
        $stmt = Database::connection()->prepare($sql);
        $stmt->execute($params);
        Response::json(['resources' => $stmt->fetchAll()]);
    }

    public static function moderate(array $params): void
    {
        $admin = Auth::requireAdmin();
        $id = self::positiveId($params['id'] ?? null);
        $body = self::jsonBody();
        $status = trim((string) ($body['status'] ?? ''));
        $note = trim((string) ($body['moderation_note'] ?? ''));
        if (!in_array($status, ['approved', 'rejected'], true)) Response::error('Choose approve or reject.', 422);
        if ($status === 'rejected' && ($note === '' || self::characterLength($note) > 1000)) Response::error('Add a short explanation when rejecting a resource.', 422, ['fields' => ['moderation_note' => 'Add a short explanation for the contributor.']]);
        if (self::characterLength($note) > 1000) Response::error('The moderation note is too long.', 422);
        $stmt = Database::connection()->prepare(
            'UPDATE uploads SET status = ?, moderation_note = ?, moderated_by = ?, moderated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND deleted_at IS NULL RETURNING id'
        );
        $stmt->execute([$status, $note !== '' ? $note : null, (int) $admin['id'], $id]);
        if (!$stmt->fetchColumn()) Response::error('The resource could not be found.', 404);
        Response::json(['message' => $status === 'approved' ? 'Resource approved and published.' : 'Resource rejected.']);
    }

    public static function fileUrl(array $params): void
    {
        $user = Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        $action = trim((string) ($_GET['action'] ?? 'download'));
        if (!in_array($action, ['preview', 'download'], true)) $action = 'download';
        $stmt = Database::connection()->prepare(
            'SELECT id, uploader_id, title, original_filename, mime_type, storage_key, status
             FROM uploads WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$id]);
        $resource = $stmt->fetch();
        if (!$resource) Response::error('The resource could not be found.', 404);
        $owner = (int) $resource['uploader_id'] === (int) $user['id'];
        if ($resource['status'] !== 'approved' && !$owner && !self::isAdmin($user)) Response::error('The resource is not available.', 404);
        if ($action === 'preview' && $resource['mime_type'] !== 'application/pdf') Response::error('Preview is available for PDF documents only. Download this file to open it.', 422);
        if (!ObjectStorage::isConfigured()) Response::error('This resource is temporarily unavailable. Please try again later.', 503);
        try {
            $url = ObjectStorage::presignedUrl((string) $resource['storage_key'], (string) $resource['original_filename'], (string) $resource['mime_type'], $action === 'preview');
            $db = Database::connection();
            $db->prepare(
                'INSERT INTO resource_views (user_id, upload_id, first_viewed_at, last_viewed_at, view_count)
                 VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                 ON CONFLICT (user_id, upload_id) DO UPDATE
                 SET last_viewed_at = CURRENT_TIMESTAMP, view_count = resource_views.view_count + 1'
            )->execute([(int) $user['id'], $id]);
            if ($action === 'download') {
                $db->prepare('INSERT INTO download_logs (upload_id, user_id) VALUES (?, ?)')->execute([$id, (int) $user['id']]);
            }
            Response::json(['url' => $url, 'expires_in' => 300]);
        } catch (Throwable $exception) {
            error_log('CourseHubs resource link generation failed: ' . $exception->getMessage());
            Response::error('This resource is temporarily unavailable. Please try again later.', 503);
        }
    }

    public static function delete(array $params): void
    {
        $user = Auth::requireUser();
        $id = self::positiveId($params['id'] ?? null);
        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, uploader_id, status, storage_key FROM uploads WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$id]);
        $resource = $stmt->fetch();
        if (!$resource) Response::error('The resource could not be found.', 404);
        $admin = self::isAdmin($user);
        $owner = (int) $resource['uploader_id'] === (int) $user['id'];
        if (!$admin && (!$owner || $resource['status'] === 'approved')) Response::error('You do not have permission to remove this resource.', 403);
        $db->prepare('UPDATE uploads SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$id]);
        if (ObjectStorage::isConfigured() && !empty($resource['storage_key'])) {
            try { ObjectStorage::delete((string) $resource['storage_key']); }
            catch (Throwable $exception) { error_log('CourseHubs resource object cleanup failed: ' . $exception->getMessage()); }
        }
        Response::json(['message' => 'Resource removed.']);
    }

    private static function canUploadAssessmentTypes(int $userId): bool
    {
        $stmt = Database::connection()->prepare(
            "SELECT (
                EXISTS (
                    SELECT 1 FROM role_requests
                    WHERE user_id = ? AND status = 'approved'
                      AND requested_role IN ('course_rep', 'course_adviser', 'lecturer')
                )
                OR EXISTS (SELECT 1 FROM level_reps WHERE user_id = ? AND status = 'active')
                OR EXISTS (SELECT 1 FROM level_advisers WHERE user_id = ? AND status = 'active')
                OR EXISTS (
                    SELECT 1 FROM course_offering_lecturers col
                    JOIN course_offerings co ON co.id = col.course_offering_id
                    WHERE col.lecturer_user_id = ? AND co.deleted_at IS NULL
                )
             ) AS allowed"
        );
        $stmt->execute([$userId, $userId, $userId, $userId]);
        return filter_var($stmt->fetchColumn(), FILTER_VALIDATE_BOOLEAN);
    }

    private static function canUpload(array $user): bool
    {
        return self::isAdmin($user) || self::canUploadAssessmentTypes((int) $user['id']);
    }

    private static function studentCanUploadCourse(PDO $db, int $userId, int $courseId): bool
    {
        $stmt = $db->prepare(
            "SELECT EXISTS (
                SELECT 1
                FROM users u
                JOIN departments d ON d.id = u.department_id
                JOIN programmes p ON p.department_id = d.id
                JOIN course_offerings co ON co.programme_id = p.id AND co.level = u.level
                JOIN courses c ON c.id = co.course_id
                WHERE u.id = ? AND u.account_type = 'student'
                  AND u.department_id IS NOT NULL AND u.level IS NOT NULL
                  AND co.course_id = ?
                  AND co.academic_session_id = (SELECT id FROM academic_sessions WHERE is_current IS TRUE LIMIT 1)
                  AND co.deleted_at IS NULL
                  AND p.is_active IS TRUE AND d.is_active IS TRUE
                  AND c.deleted_at IS NULL AND c.is_active IS TRUE AND c.status = 'active'
            )"
        );
        $stmt->execute([$userId, $courseId]);
        return filter_var($stmt->fetchColumn(), FILTER_VALIDATE_BOOLEAN);
    }

    private static function isAdmin(array $user): bool
    {
        return filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN);
    }

    private static function characterLength(string $value): int
    {
        $matched = preg_match_all('/./us', $value, $characters);
        return $matched === false ? strlen($value) : $matched;
    }

    private static function positiveId(mixed $value): int
    {
        return is_scalar($value) && ctype_digit((string) $value) ? (int) $value : 0;
    }

    private static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw ?: '[]', true);
        return is_array($data) ? $data : [];
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }
}
