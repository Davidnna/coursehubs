<?php

declare(strict_types=1);

final class AccountController
{
    public static function show(): void
    {
        $sessionUser = Auth::requireUser();
        $db = Database::connection();
        $stmt = $db->prepare(
            'SELECT u.id, u.first_name, u.surname, u.middle_name, u.email, u.phone,
                    u.account_type, u.level, u.reg_no, u.staff_no, u.profile_picture_data,
                    u.password_hash, CASE WHEN u.is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified,
                    CASE WHEN u.is_admin IS TRUE THEN 1 ELSE 0 END AS is_admin,
                    CASE WHEN u.is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin,
                    CASE WHEN EXISTS (SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id AND oa.provider = \'google\') THEN 1 ELSE 0 END AS google_connected
             FROM users u WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([(int) $sessionUser['id']]);
        $user = $stmt->fetch();
        if (!$user) {
            Response::error('Your account could not be found. Please sign in again.', 404);
        }

        Response::json([
            'user' => self::userPayload($user),
            'has_password' => !empty($user['password_hash']),
            'google_connected' => filter_var($user['google_connected'], FILTER_VALIDATE_BOOLEAN),
        ]);
    }

    public static function updateProfile(): void
    {
        $sessionUser = Auth::requireUser();
        $body = self::input();
        $firstName = Names::display(trim((string) ($body['first_name'] ?? '')));
        $surname = Names::display(trim((string) ($body['surname'] ?? '')));
        $middleNameRaw = trim((string) ($body['middle_name'] ?? ''));
        $middleName = $middleNameRaw === '' ? null : Names::display($middleNameRaw);
        $phone = trim((string) ($body['phone'] ?? ''));
        $errors = [];

        if ($firstName === '' || strlen($firstName) > 80) $errors['first_name'] = 'Enter a first name of no more than 80 characters.';
        if ($surname === '' || strlen($surname) > 80) $errors['surname'] = 'Enter a surname of no more than 80 characters.';
        if ($middleName !== null && strlen($middleName) > 80) $errors['middle_name'] = 'Middle name must be no more than 80 characters.';
        if ($phone === '' || strlen($phone) > 30) $errors['phone'] = 'Enter a valid phone number.';

        $avatar = null;
        $avatarWasProvided = array_key_exists('profile_picture_data', $body);
        if ($avatarWasProvided) {
            $avatar = self::validateAvatar($body['profile_picture_data'], $errors);
        }
        if ($errors !== []) {
            Response::error('Please review the highlighted information.', 422, ['fields' => $errors]);
        }

        $db = Database::connection();
        if ($avatarWasProvided) {
            $stmt = $db->prepare(
                'UPDATE users SET first_name = ?, surname = ?, middle_name = ?, phone = ?, profile_picture_data = ? WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$firstName, $surname, $middleName, $phone, $avatar, (int) $sessionUser['id']]);
        } else {
            $stmt = $db->prepare(
                'UPDATE users SET first_name = ?, surname = ?, middle_name = ?, phone = ? WHERE id = ? AND deleted_at IS NULL'
            );
            $stmt->execute([$firstName, $surname, $middleName, $phone, (int) $sessionUser['id']]);
        }

        Response::json(['message' => 'Your profile has been updated.', 'user' => self::loadUserPayload($db, (int) $sessionUser['id'])]);
    }

    public static function requestEmailChange(): void
    {
        $sessionUser = Auth::requireUser();
        $body = self::input();
        $newEmail = strtolower(trim((string) ($body['new_email'] ?? '')));
        $currentPassword = (string) ($body['current_password'] ?? '');
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL) || strlen($newEmail) > 190) {
            Response::error('Enter a valid email address.', 422, ['fields' => ['new_email' => 'Enter a valid email address.']]);
        }

        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, email, first_name, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([(int) $sessionUser['id']]);
        $user = $stmt->fetch();
        if (!$user) Response::error('Your account could not be found.', 404);
        if (!password_verify($currentPassword, (string) $user['password_hash'])) {
            Response::error('Your current password is incorrect.', 403, ['code' => 'CURRENT_PASSWORD_INVALID']);
        }
        if (hash_equals(strtolower((string) $user['email']), $newEmail)) {
            Response::error('That is already your current email address.', 422, ['fields' => ['new_email' => 'Choose a different email address.']]);
        }

        $exists = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL AND id <> ? LIMIT 1');
        $exists->execute([$newEmail, (int) $user['id']]);
        if ($exists->fetch()) {
            Response::error('That email address is already associated with another account.', 409, ['fields' => ['new_email' => 'That email address is already in use.']]);
        }

        $recent = $db->prepare(
            "SELECT id FROM email_change_requests WHERE user_id = ? AND created_at > NOW() - INTERVAL '60 seconds' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1"
        );
        $recent->execute([(int) $user['id']]);
        if ($recent->fetch()) {
            Response::error('Please wait a minute before requesting another email change.', 429);
        }

        $token = bin2hex(random_bytes(32));
        $db->beginTransaction();
        try {
            $db->prepare('UPDATE email_change_requests SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
                ->execute([(int) $user['id']]);
            $db->prepare(
                'INSERT INTO email_change_requests (user_id, new_email, token_hash, expires_at)
                 VALUES (?, ?, ?, NOW() + INTERVAL \'24 hours\')'
            )->execute([(int) $user['id'], $newEmail, hash('sha256', $token)]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        $sent = Mailer::sendEmailChangeVerificationEmail($newEmail, (string) $user['first_name'], $token);
        if (!$sent) {
            $db->prepare('UPDATE email_change_requests SET used_at = NOW() WHERE token_hash = ?')->execute([hash('sha256', $token)]);
            Response::error('We could not send the confirmation email just now. Please try again shortly.', 503);
        }

        Response::json(['message' => 'We sent a confirmation link to your new email address. Your current email will remain active until you confirm the change.']);
    }

    public static function verifyEmailChange(): void
    {
        $token = trim((string) ($_GET['token'] ?? ''));
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            Response::error('This email-change link is invalid.', 422);
        }

        $db = Database::connection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'SELECT ecr.id, ecr.user_id, ecr.new_email
                 FROM email_change_requests ecr
                 WHERE ecr.token_hash = ? AND ecr.used_at IS NULL AND ecr.expires_at > NOW()
                 ORDER BY ecr.created_at DESC LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([hash('sha256', $token)]);
            $request = $stmt->fetch();
            if (!$request) {
                $db->rollBack();
                Response::error('This email-change link is invalid or has expired. Request a new one.', 410);
            }

            $conflict = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL AND id <> ? LIMIT 1');
            $conflict->execute([(string) $request['new_email'], (int) $request['user_id']]);
            if ($conflict->fetch()) {
                $db->rollBack();
                Response::error('That email address is now associated with another account. Please choose another address.', 409);
            }

            $updated = $db->prepare('UPDATE users SET email = ?, is_verified = TRUE, auth_token_version = auth_token_version + 1 WHERE id = ? AND deleted_at IS NULL');
            $updated->execute([(string) $request['new_email'], (int) $request['user_id']]);
            if ($updated->rowCount() !== 1) {
                $db->rollBack();
                Response::error('This CourseHubs account is no longer available.', 410);
            }
            $db->prepare('UPDATE email_change_requests SET used_at = NOW() WHERE id = ?')->execute([(int) $request['id']]);
            $db->prepare('UPDATE email_verifications SET verified_at = COALESCE(verified_at, NOW()) WHERE user_id = ?')
                ->execute([(int) $request['user_id']]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        Response::json(['message' => 'Your email address has been updated. Please sign in again using your new email address.']);
    }

    public static function changePassword(): void
    {
        $sessionUser = Auth::requireUser();
        $body = self::input();
        $currentPassword = (string) ($body['current_password'] ?? '');
        $newPassword = (string) ($body['new_password'] ?? '');
        $confirmation = (string) ($body['confirm_password'] ?? '');

        if (strlen($newPassword) < 8 || strlen($newPassword) > 72) {
            Response::error('Choose a password between 8 and 72 characters.', 422, ['fields' => ['new_password' => 'Use between 8 and 72 characters.']]);
        }
        if (!hash_equals($newPassword, $confirmation)) {
            Response::error('The new passwords do not match.', 422, ['fields' => ['confirm_password' => 'The passwords do not match.']]);
        }

        $db = Database::connection();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([(int) $sessionUser['id']]);
        $hash = $stmt->fetchColumn();
        if (!is_string($hash) || !password_verify($currentPassword, $hash)) {
            Response::error('Your current password is incorrect.', 403, ['code' => 'CURRENT_PASSWORD_INVALID']);
        }

        $db->prepare(
            'UPDATE users SET password_hash = ?, auth_token_version = auth_token_version + 1,
             failed_login_attempts = 0, locked_until = NULL WHERE id = ? AND deleted_at IS NULL'
        )->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $sessionUser['id']]);
        $db->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')
            ->execute([(int) $sessionUser['id']]);

        $versionStmt = $db->prepare('SELECT auth_token_version FROM users WHERE id = ?');
        $versionStmt->execute([(int) $sessionUser['id']]);
        $newVersion = (int) $versionStmt->fetchColumn();
        Response::json([
            'message' => 'Your password has been changed. Other active sessions have been signed out.',
            'token' => Jwt::issue((int) $sessionUser['id'], $newVersion),
            'user' => self::loadUserPayload($db, (int) $sessionUser['id']),
        ]);
    }

    public static function deleteAccount(): void
    {
        $sessionUser = Auth::requireUser();
        $body = self::input();
        if (($body['confirmation'] ?? '') !== 'DELETE') {
            Response::error('Type DELETE exactly to confirm account deletion.', 422, ['fields' => ['confirmation' => 'Type DELETE to confirm.']]);
        }

        $db = Database::connection();
        $stmt = $db->prepare('SELECT id, account_type, reg_no, staff_no, CASE WHEN is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([(int) $sessionUser['id']]);
        $user = $stmt->fetch();
        if (!$user) Response::error('Your account could not be found.', 404);
        $hasSuperAdminScope = array_filter(
            Auth::scopesFor((int) $user['id']),
            static fn (array $scope): bool => $scope['role'] === 'super_admin'
        ) !== [];
        if (filter_var($user['is_super_admin'], FILTER_VALIDATE_BOOLEAN) || $hasSuperAdminScope) {
            Response::error('An account with Super Administrator responsibilities cannot be deleted from its own session. Ask another authorised administrator to update those appointments first.', 403);
        }
        if (!password_verify((string) ($body['current_password'] ?? ''), (string) $user['password_hash'])) {
            Response::error('Your current password is incorrect.', 403, ['code' => 'CURRENT_PASSWORD_INVALID']);
        }

        $id = (int) $user['id'];
        $deletedEmail = 'deleted+' . $id . '@deleted.coursehubs.invalid';
        $placeholder = 'DELETED-' . $id;
        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM oauth_login_codes WHERE user_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM oauth_accounts WHERE user_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM email_change_requests WHERE user_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM email_verifications WHERE user_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([$id]);
            $db->prepare(
                'UPDATE users SET first_name = \'Deleted\', surname = \'Account\', middle_name = NULL,
                    email = ?, password_hash = ?, phone = \'0000000000\',
                    reg_no = CASE WHEN account_type = \'student\' THEN ? ELSE reg_no END,
                    staff_no = CASE WHEN account_type = \'staff\' THEN ? ELSE staff_no END,
                    profile_picture_path = NULL, profile_picture_data = NULL, is_verified = FALSE,
                    deleted_at = NOW(), auth_token_version = auth_token_version + 1
                 WHERE id = ?'
            )->execute([$deletedEmail, password_hash(bin2hex(random_bytes(48)), PASSWORD_DEFAULT), $placeholder, $placeholder, $id]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        Response::json(['message' => 'Your CourseHubs account has been deleted.']);
    }

    private static function validateAvatar(mixed $value, array &$errors): ?string
    {
        if ($value === null || $value === '') return null;
        if (!is_string($value) || !preg_match('#^data:image/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$#', $value, $matches)) {
            $errors['profile_picture_data'] = 'Choose a valid JPG, PNG or WebP image.';
            return null;
        }
        $binary = base64_decode($matches[2], true);
        if ($binary === false || strlen($binary) > 400 * 1024) {
            $errors['profile_picture_data'] = 'Your profile photo must be smaller than 400 KB after processing.';
            return null;
        }
        $image = @getimagesizefromstring($binary);
        $allowedMime = ['image/webp', 'image/jpeg', 'image/png'];
        if (!is_array($image) || !in_array($image['mime'] ?? '', $allowedMime, true)) {
            $errors['profile_picture_data'] = 'The selected file is not a supported image.';
            return null;
        }
        return 'data:' . $image['mime'] . ';base64,' . base64_encode($binary);
    }

    private static function loadUserPayload(PDO $db, int $userId): array
    {
        $stmt = $db->prepare(
            'SELECT id, first_name, surname, middle_name, email, phone, account_type, level, reg_no, staff_no,
                    CASE WHEN is_admin IS TRUE THEN 1 ELSE 0 END AS is_admin,
                    CASE WHEN is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin,
                    CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified, profile_picture_data
             FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) Response::error('Your account could not be found.', 404);
        return self::userPayload($user);
    }

    private static function userPayload(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'first_name' => $user['first_name'],
            'surname' => $user['surname'],
            'middle_name' => $user['middle_name'],
            'email' => $user['email'],
            'phone' => $user['phone'] ?? null,
            'account_type' => $user['account_type'],
            'level' => isset($user['level']) && $user['level'] !== null ? (int) $user['level'] : null,
            'reg_no' => $user['reg_no'] ?? null,
            'staff_no' => $user['staff_no'] ?? null,
            'is_admin' => filter_var($user['is_admin'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'is_super_admin' => filter_var($user['is_super_admin'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'is_verified' => filter_var($user['is_verified'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'profile_picture_data' => $user['profile_picture_data'] ?? null,
        ];
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
