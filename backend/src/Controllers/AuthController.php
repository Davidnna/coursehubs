<?php

declare(strict_types=1);

final class AuthController
{
    private const GENERIC_RESEND_MESSAGE = 'If an eligible account exists, a verification link may arrive shortly. Please check your inbox and spam folder.';
    private const GENERIC_RESET_MESSAGE = 'If an eligible account exists, password-reset instructions may arrive shortly. Please check your inbox and spam folder.';

    public static function register(): void
    {
        $body = self::input();
        $accountType = $body['account_type'] ?? '';

        $validator = new Validator($body);
        $validator
            ->required('first_name', 'First name')
            ->required('surname', 'Surname')
            ->required('email', 'Email')
            ->email('email')
            ->required('phone', 'Phone number')
            ->required('password', 'Password')
            ->required('account_type', 'Account type')
            ->minLength('password', 8, 'Password')
            ->in('account_type', ['student', 'staff'], 'Account type');

        if ($accountType === 'student') {
            $validator
                ->required('reg_no', 'Registration number')
                ->required('level', 'Level')
                ->levelRange('level', 100, 600, 'Level')
                ->required('expected_graduation_session_id', 'Expected graduation session');
        } elseif ($accountType === 'staff') {
            $validator->required('staff_no', 'Staff number');
        }

        if ($validator->fails()) {
            Response::error('Please fix the errors below.', 422, ['fields' => $validator->errors()]);
        }

        if (strlen((string) $body['password']) > 72) {
            Response::error('Please fix the errors below.', 422, ['fields' => ['password' => 'Password must not exceed 72 bytes.']]);
        }

        $db = Database::connection();
        $departmentId = null;
        $programmeId = null;
        if ($accountType === 'student') {
            $departmentRaw = $body['department_id'] ?? null;
            $programmeRaw = $body['programme_id'] ?? null;
            $activeProgrammeCount = (int) $db->query('SELECT COUNT(*) FROM programmes WHERE is_active IS TRUE')->fetchColumn();
            if ($activeProgrammeCount > 0 && (empty($departmentRaw) || empty($programmeRaw))) {
                $academicFields = [];
                if (empty($departmentRaw)) $academicFields['department_id'] = 'Choose your department.';
                if (empty($programmeRaw)) $academicFields['programme_id'] = 'Choose your programme.';
                Response::error('Choose your department and programme to continue.', 422, ['fields' => $academicFields]);
            }
            if (!empty($departmentRaw) || !empty($programmeRaw)) {
                $departmentId = filter_var($departmentRaw, FILTER_VALIDATE_INT);
                $programmeId = filter_var($programmeRaw, FILTER_VALIDATE_INT);
                if ($departmentId === false || $departmentId < 1 || $programmeId === false || $programmeId < 1) {
                    Response::error('Choose a valid department and programme.', 422, ['fields' => ['department_id' => 'Choose your department.', 'programme_id' => 'Choose your programme.']]);
                }
                $academicCheck = $db->prepare(
                    'SELECT p.id FROM programmes p JOIN departments d ON d.id = p.department_id
                     WHERE p.id = ? AND p.department_id = ? AND p.is_active IS TRUE AND d.is_active IS TRUE'
                );
                $academicCheck->execute([(int) $programmeId, (int) $departmentId]);
                if (!$academicCheck->fetchColumn()) {
                    Response::error('The selected programme does not belong to the selected department.', 422, [
                        'fields' => ['programme_id' => 'Choose a programme under the selected department.'],
                    ]);
                }
            }
        } elseif (!empty($body['department_id'])) {
            $departmentId = filter_var($body['department_id'], FILTER_VALIDATE_INT);
            if ($departmentId === false || $departmentId < 1) Response::error('Choose a valid department.', 422, ['fields' => ['department_id' => 'Choose a department.']]);
            $departmentCheck = $db->prepare('SELECT id FROM departments WHERE id = ? AND is_active IS TRUE');
            $departmentCheck->execute([(int) $departmentId]);
            if (!$departmentCheck->fetchColumn()) Response::error('Choose an active department.', 422, ['fields' => ['department_id' => 'Choose an active department.']]);
        }

        $email = strtolower(trim((string) $body['email']));
        $existing = $db->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL AND status = \'active\' LIMIT 1');
        $existing->execute([$email]);
        if ($existing->fetch()) {
            Response::error('Please fix the errors below.', 422, [
                'fields' => ['email' => 'An account with this email already exists.'],
            ]);
        }

        if ($accountType === 'student') {
            $regNo = trim((string) $body['reg_no']);
            $check = $db->prepare('SELECT id FROM users WHERE reg_no = ? AND deleted_at IS NULL LIMIT 1');
            $check->execute([$regNo]);
            if ($check->fetch()) {
                Response::error('Please fix the errors below.', 422, [
                    'fields' => ['reg_no' => 'An account with this registration number already exists.'],
                ]);
            }
        } else {
            $staffNo = trim((string) $body['staff_no']);
            $check = $db->prepare('SELECT id FROM users WHERE staff_no = ? AND deleted_at IS NULL LIMIT 1');
            $check->execute([$staffNo]);
            if ($check->fetch()) {
                Response::error('Please fix the errors below.', 422, [
                    'fields' => ['staff_no' => 'An account with this staff number already exists.'],
                ]);
            }
        }

        $firstName = Names::display((string) $body['first_name']);
        $surname = Names::display((string) $body['surname']);
        $middleName = isset($body['middle_name']) && trim((string) $body['middle_name']) !== ''
            ? Names::display((string) $body['middle_name'])
            : null;
        $passwordHash = password_hash((string) $body['password'], PASSWORD_DEFAULT);
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = (new DateTimeImmutable('+24 hours'))->format(DateTimeInterface::ATOM);

        $db->beginTransaction();
        try {
            if ($accountType === 'student') {
                $stmt = $db->prepare(
                    'INSERT INTO users
                        (first_name, surname, middle_name, email, password_hash, phone,
                         reg_no, account_type, level, expected_graduation_session_id, department_id, programme_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     RETURNING id'
                );
                $stmt->execute([
                    $firstName, $surname, $middleName, $email, $passwordHash, trim((string) $body['phone']),
                    trim((string) $body['reg_no']), 'student', (int) $body['level'], (int) $body['expected_graduation_session_id'],
                    $departmentId, $programmeId,
                ]);
            } else {
                $stmt = $db->prepare(
                    'INSERT INTO users
                        (first_name, surname, middle_name, email, password_hash, phone, staff_no, account_type, department_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     RETURNING id'
                );
                $stmt->execute([
                    $firstName, $surname, $middleName, $email, $passwordHash, trim((string) $body['phone']),
                    trim((string) $body['staff_no']), 'staff', $departmentId,
                ]);
            }

            $userId = (int) $stmt->fetchColumn();
            $db->prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)')
                ->execute([$userId, $tokenHash, $expiresAt]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $emailSent = Mailer::sendVerificationEmail($email, $firstName, $token);

        Response::json([
            'message' => 'Account created. Please verify your email address before signing in.',
            'user' => [
                'id' => $userId,
                'first_name' => $firstName,
                'surname' => $surname,
                'email' => $email,
                'account_type' => $accountType,
            ],
            'verification_email_sent' => $emailSent,
        ], 201);
    }

    public static function verifyEmail(): void
    {
        $token = trim((string) ($_GET['token'] ?? ''));
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            Response::error('This verification link is invalid.', 422, ['code' => 'INVALID_VERIFICATION_TOKEN']);
        }

        $db = Database::connection();
        $tokenHash = hash('sha256', $token);
        $db->beginTransaction();
        try {
            // The raw-token comparison is retained temporarily for links issued
            // by the first deployed build before token hashing was introduced.
            $stmt = $db->prepare(
                'SELECT id, user_id, expires_at, verified_at
                 FROM email_verifications
                 WHERE token = ? OR token = ?
                 ORDER BY created_at DESC
                 LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([$tokenHash, $token]);
            $verification = $stmt->fetch();

            if (!$verification) {
                $db->rollBack();
                Response::error('This verification link is invalid or has already been used.', 422, ['code' => 'INVALID_VERIFICATION_TOKEN']);
            }
            if ($verification['verified_at'] !== null) {
                $db->commit();
                Response::json(['message' => 'This email address has already been verified.', 'already_verified' => true]);
            }
            if (new DateTimeImmutable((string) $verification['expires_at']) <= new DateTimeImmutable()) {
                $db->rollBack();
                Response::error('This verification link has expired. Request a new one.', 410, ['code' => 'VERIFICATION_EXPIRED']);
            }

            $updated = $db->prepare('UPDATE users SET is_verified = TRUE WHERE id = ? AND deleted_at IS NULL');
            $updated->execute([(int) $verification['user_id']]);
            if ($updated->rowCount() !== 1) {
                throw new RuntimeException('The account associated with this verification link is unavailable.');
            }
            $db->prepare('UPDATE email_verifications SET verified_at = NOW() WHERE id = ? AND verified_at IS NULL')
                ->execute([(int) $verification['id']]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        Response::json(['message' => 'Your email address has been verified. You can now sign in.']);
    }

    public static function resendVerification(): void
    {
        $body = self::input();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Enter a valid email address.', 422, ['fields' => ['email' => 'Enter a valid email address.']]);
        }

        $db = Database::connection();
        $stmt = $db->prepare(
            'SELECT id, first_name, CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified
             FROM users WHERE email = ? AND deleted_at IS NULL AND status = \'active\' LIMIT 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && (int) $user['is_verified'] !== 1) {
            $recent = $db->prepare(
                "SELECT id FROM email_verifications
                 WHERE user_id = ? AND created_at > NOW() - INTERVAL '60 seconds'
                 ORDER BY created_at DESC LIMIT 1"
            );
            $recent->execute([(int) $user['id']]);
            if (!$recent->fetch()) {
                $token = bin2hex(random_bytes(32));
                $db->beginTransaction();
                try {
                    $db->prepare('UPDATE email_verifications SET expires_at = NOW() WHERE user_id = ? AND verified_at IS NULL')
                        ->execute([(int) $user['id']]);
                    $db->prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, NOW() + INTERVAL \'24 hours\')')
                        ->execute([(int) $user['id'], hash('sha256', $token)]);
                    $db->commit();
                } catch (Throwable $e) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    throw $e;
                }
                Mailer::sendVerificationEmail($email, (string) $user['first_name'], $token);
            }
        }

        Response::json(['message' => self::GENERIC_RESEND_MESSAGE]);
    }

    public static function login(): void
    {
        $body = self::input();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            Response::error('Enter your email address and password.', 422);
        }

        $db = Database::connection();
        $stmt = $db->prepare(
            'SELECT id, first_name, surname, middle_name, email, password_hash, profile_picture_data, account_type, level,
                    CASE WHEN is_admin IS TRUE THEN 1 ELSE 0 END AS is_admin,
                    CASE WHEN is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin,
                    CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified, status, failed_login_attempts,
                    locked_until, auth_token_version
             FROM users
             WHERE email = ? AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            password_verify($password, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            Response::error('The email address or password is incorrect.', 401, ['code' => 'INVALID_CREDENTIALS']);
        }

        if ($user['locked_until'] !== null && new DateTimeImmutable((string) $user['locked_until']) > new DateTimeImmutable()) {
            Response::error('Too many unsuccessful attempts. Please try again later.', 429, ['code' => 'ACCOUNT_TEMPORARILY_LOCKED']);
        }

        $attempts = (int) $user['failed_login_attempts'];
        $lockoutThreshold = self::settingInt($db, 'login_lockout_threshold', 5);
        $lockoutMinutes = self::settingInt($db, 'login_lockout_cooldown_minutes', 15);
        if ($user['locked_until'] !== null && new DateTimeImmutable((string) $user['locked_until']) <= new DateTimeImmutable()) {
            $attempts = 0;
        }

        if (!password_verify($password, (string) $user['password_hash'])) {
            $attempts++;
            $lockedUntil = $attempts >= $lockoutThreshold
                ? (new DateTimeImmutable('+' . $lockoutMinutes . ' minutes'))->format(DateTimeInterface::ATOM)
                : null;
            $db->prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
                ->execute([$attempts, $lockedUntil, (int) $user['id']]);
            if ($attempts >= $lockoutThreshold) {
                Response::error('Too many unsuccessful attempts. Your account is temporarily locked for ' . $lockoutMinutes . ' minutes.', 429, ['code' => 'ACCOUNT_TEMPORARILY_LOCKED']);
            }
            Response::error('The email address or password is incorrect.', 401, ['code' => 'INVALID_CREDENTIALS']);
        }

        if ($user['status'] !== 'active') {
            Response::error('This account is currently suspended. Contact the department administrator.', 403, ['code' => 'ACCOUNT_SUSPENDED']);
        }
        if ((int) $user['is_verified'] !== 1) {
            Response::error('Verify your email address before signing in.', 403, [
                'code' => 'EMAIL_NOT_VERIFIED',
                'email' => $email,
            ]);
        }

        $db->prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
            ->execute([(int) $user['id']]);

        $token = Jwt::issue((int) $user['id'], (int) $user['auth_token_version']);
        Response::json([
            'message' => 'Signed in successfully.',
            'token' => $token,
            'user' => self::publicUser($user),
            'expires_in' => 8 * 60 * 60,
        ]);
    }

    public static function me(): void
    {
        $user = Auth::requireUser();
        $avatar = Database::connection()->prepare('SELECT profile_picture_data FROM users WHERE id = ? LIMIT 1');
        $avatar->execute([(int) $user['id']]);
        $user['profile_picture_data'] = $avatar->fetchColumn() ?: null;
        Response::json(['user' => self::publicUser($user)]);
    }

    public static function logout(): void
    {
        $user = Auth::requireUser();
        Database::connection()->prepare('UPDATE users SET auth_token_version = auth_token_version + 1 WHERE id = ?')
            ->execute([(int) $user['id']]);
        Response::json(['message' => 'You have been signed out.']);
    }

    public static function forgotPassword(): void
    {
        $body = self::input();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Enter a valid email address.', 422, ['fields' => ['email' => 'Enter a valid email address.']]);
        }

        $db = Database::connection();
        $stmt = $db->prepare(
            'SELECT id, first_name, CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified
             FROM users WHERE email = ? AND deleted_at IS NULL AND status = \'active\' LIMIT 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && (int) $user['is_verified'] === 1) {
            $recent = $db->prepare(
                "SELECT id FROM password_resets
                 WHERE user_id = ? AND created_at > NOW() - INTERVAL '60 seconds'
                 ORDER BY created_at DESC LIMIT 1"
            );
            $recent->execute([(int) $user['id']]);
            if (!$recent->fetch()) {
                $token = bin2hex(random_bytes(32));
                $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
                    ->execute([(int) $user['id']]);
                $db->prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, NOW() + INTERVAL \'1 hour\')')
                    ->execute([(int) $user['id'], hash('sha256', $token)]);
                Mailer::sendPasswordResetEmail($email, (string) $user['first_name'], $token);
            }
        }

        Response::json(['message' => self::GENERIC_RESET_MESSAGE]);
    }

    public static function resetPassword(): void
    {
        $body = self::input();
        $token = trim((string) ($body['token'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $errors = [];
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            $errors['token'] = 'This password-reset link is invalid.';
        }
        if (strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        } elseif (strlen($password) > 72) {
            $errors['password'] = 'Password must not exceed 72 bytes.';
        }
        if ($errors !== []) {
            Response::error('Please fix the errors below.', 422, ['fields' => $errors]);
        }

        $db = Database::connection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'SELECT id, user_id FROM password_resets
                 WHERE token = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([hash('sha256', $token)]);
            $reset = $stmt->fetch();
            if (!$reset) {
                $db->rollBack();
                Response::error('This password-reset link is invalid or has expired. Request a new one.', 410, ['code' => 'RESET_TOKEN_EXPIRED']);
            }

            $updated = $db->prepare(
                'UPDATE users
                 SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL,
                     auth_token_version = auth_token_version + 1
                 WHERE id = ? AND deleted_at IS NULL'
            );
            $updated->execute([password_hash($password, PASSWORD_DEFAULT), (int) $reset['user_id']]);
            if ($updated->rowCount() !== 1) {
                throw new RuntimeException('The account associated with this reset link is unavailable.');
            }
            $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ? AND used_at IS NULL')
                ->execute([(int) $reset['id']]);
            $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
                ->execute([(int) $reset['user_id']]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        Response::json(['message' => 'Your password has been reset. You can now sign in with your new password.']);
    }

    private static function settingInt(PDO $db, string $key, int $default): int
    {
        try {
            $stmt = $db->prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ? LIMIT 1');
            $stmt->execute([$key]);
            $value = $stmt->fetchColumn();
            return is_numeric($value) && (int) $value > 0 ? (int) $value : $default;
        } catch (Throwable) {
            return $default;
        }
    }

    private static function input(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            Response::error('Request body must contain valid JSON.', 400);
        }
        if (!is_array($data)) {
            Response::error('Request body must be a JSON object.', 400);
        }
        return $data;
    }

    private static function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'first_name' => $user['first_name'],
            'surname' => $user['surname'],
            'middle_name' => $user['middle_name'],
            'email' => $user['email'],
            'account_type' => $user['account_type'],
            'level' => $user['level'] !== null ? (int) $user['level'] : null,
            'is_admin' => (int) $user['is_admin'] === 1,
            'is_super_admin' => (int) $user['is_super_admin'] === 1,
            'admin_scopes' => Auth::scopesFor((int) $user['id']),
            'is_verified' => (int) $user['is_verified'] === 1,
            'profile_picture_data' => $user['profile_picture_data'] ?? null,
        ];
    }
}
