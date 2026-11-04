<?php

final class AuthController
{
    public static function register(): void
    {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $accountType = $body['account_type'] ?? '';

        $validator = new Validator($body);
        $validator
            ->required('first_name', 'First name')
            ->required('surname', 'Surname')
            ->required('email', 'Email')
            ->email('email')
            ->required('phone', 'Phone number')
            ->required('password', 'Password')
            ->minLength('password', 8, 'Password')
            ->in('account_type', ['student', 'staff'], 'Account type');

        if ($accountType === 'student') {
            $validator
                ->required('reg_no', 'Registration number')
                ->required('level', 'Level')
                ->levelRange('level', 100, 500, 'Level')
                ->required('expected_graduation_session_id', 'Expected graduation session');
        } elseif ($accountType === 'staff') {
            $validator->required('staff_no', 'Staff number');
        }

        if ($validator->fails()) {
            Response::error('Please fix the errors below.', 422, ['fields' => $validator->errors()]);
        }

        $db = Database::connection();

        // Friendly pre-check before hitting the DB's own unique
        // constraints, so the person gets a clear message about
        // exactly which field collided.
        $email = strtolower(trim($body['email']));
        $existing = $db->prepare('SELECT id FROM users WHERE email_active = ? LIMIT 1');
        $existing->execute([$email]);
        if ($existing->fetch()) {
            Response::error('Please fix the errors below.', 422, [
                'fields' => ['email' => 'An account with this email already exists.'],
            ]);
        }

        if ($accountType === 'student') {
            $regNo = trim($body['reg_no']);
            $check = $db->prepare('SELECT id FROM users WHERE regno_active = ? LIMIT 1');
            $check->execute([$regNo]);
            if ($check->fetch()) {
                Response::error('Please fix the errors below.', 422, [
                    'fields' => ['reg_no' => 'An account with this registration number already exists.'],
                ]);
            }
        } else {
            $staffNo = trim($body['staff_no']);
            $check = $db->prepare('SELECT id FROM users WHERE staffno_active = ? LIMIT 1');
            $check->execute([$staffNo]);
            if ($check->fetch()) {
                Response::error('Please fix the errors below.', 422, [
                    'fields' => ['staff_no' => 'An account with this staff number already exists.'],
                ]);
            }
        }

        $firstName  = Names::display($body['first_name']);
        $surname    = Names::display($body['surname']);
        $middleName = isset($body['middle_name']) && trim($body['middle_name']) !== ''
            ? Names::display($body['middle_name'])
            : null;

        $passwordHash = password_hash($body['password'], PASSWORD_BCRYPT);

        if ($accountType === 'student') {
            $stmt = $db->prepare(
                'INSERT INTO users
                    (first_name, surname, middle_name, email, password_hash, phone,
                     reg_no, account_type, level, expected_graduation_session_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $firstName, $surname, $middleName, $email, $passwordHash, trim($body['phone']),
                trim($body['reg_no']), 'student', (int) $body['level'], (int) $body['expected_graduation_session_id'],
            ]);
        } else {
            $stmt = $db->prepare(
                'INSERT INTO users
                    (first_name, surname, middle_name, email, password_hash, phone,
                     staff_no, account_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $firstName, $surname, $middleName, $email, $passwordHash, trim($body['phone']),
                trim($body['staff_no']), 'staff',
            ]);
        }

        $userId = (int) $db->lastInsertId();

        // Email verification token — 24 hour expiry.
        $token = bin2hex(random_bytes(32));
        $expiresAt = (new DateTime('+24 hours'))->format('Y-m-d H:i:s');
        $db->prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)')
            ->execute([$userId, $token, $expiresAt]);

        // Welcome + verification email would be sent here via Brevo.
        // Skipped for now until a real API key is configured — the
        // account still works, just unverified, consistent with the
        // "email_notifications may fail" design (in-app never blocks).
        $emailSent = Mailer::sendVerificationEmail($email, $firstName, $token);

        Response::json([
            'message' => 'Account created.',
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
}
