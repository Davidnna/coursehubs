<?php

declare(strict_types=1);

final class GoogleAuthController
{
    private const STATE_COOKIE = 'coursehubs_google_state';

    public static function start(): void
    {
        $clientId = trim((string) Config::get('GOOGLE_CLIENT_ID', ''));
        $redirectUri = trim((string) Config::get('GOOGLE_REDIRECT_URI', ''));
        if ($clientId === '' || $redirectUri === '' || !filter_var($redirectUri, FILTER_VALIDATE_URL)) {
            self::redirectFrontend('/login?google=unavailable');
        }

        RateLimiter::enforce(
            Database::connection(),
            'google_oauth_start_ip',
            RateLimiter::clientIp(),
            60,
            3600,
            900
        );

        $state = bin2hex(random_bytes(32));
        $redirectParts = parse_url($redirectUri);
        $secure = is_array($redirectParts) && ($redirectParts['scheme'] ?? '') === 'https';
        setcookie(self::STATE_COOKIE, $state, [
            'expires' => time() + 600,
            'path' => '/auth/google/callback',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'prompt' => 'select_account',
            'access_type' => 'online',
        ], '', '&', PHP_QUERY_RFC3986);

        header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $query, true, 302);
        exit;
    }

    public static function callback(): void
    {
        $cookieState = (string) ($_COOKIE[self::STATE_COOKIE] ?? '');
        $queryState = (string) ($_GET['state'] ?? '');
        $redirectUri = trim((string) Config::get('GOOGLE_REDIRECT_URI', ''));
        $redirectParts = parse_url($redirectUri);
        setcookie(self::STATE_COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/auth/google/callback',
            'secure' => is_array($redirectParts) && ($redirectParts['scheme'] ?? '') === 'https',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        if ($cookieState === '' || $queryState === '' || !hash_equals($cookieState, $queryState)) {
            self::redirectFrontend('/login?google=invalid_state');
        }
        if (isset($_GET['error'])) {
            self::redirectFrontend('/login?google=cancelled');
        }

        RateLimiter::enforce(
            Database::connection(),
            'google_oauth_callback_ip',
            RateLimiter::clientIp(),
            60,
            3600,
            900
        );

        try {
            $tokens = self::exchangeAuthorizationCode((string) ($_GET['code'] ?? ''));
            $profile = self::fetchGoogleProfile((string) ($tokens['access_token'] ?? ''));
            $email = strtolower(trim((string) ($profile['email'] ?? '')));
            $googleId = trim((string) ($profile['sub'] ?? ''));
            $emailVerified = filter_var($profile['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $googleId === '' || !$emailVerified) {
                self::redirectFrontend('/login?google=unverified_email');
            }

            $db = Database::connection();
            $db->beginTransaction();
            try {
                $linked = $db->prepare(
                    'SELECT u.id, u.status, u.deleted_at
                     FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id
                     WHERE oa.provider = \'google\' AND oa.provider_user_id = ?
                     LIMIT 1 FOR UPDATE OF u'
                );
                $linked->execute([$googleId]);
                $user = $linked->fetch();

                if (!$user) {
                    $byEmail = $db->prepare(
                        'SELECT id, status, deleted_at FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL LIMIT 1 FOR UPDATE'
                    );
                    $byEmail->execute([$email]);
                    $user = $byEmail->fetch();
                }

                if (!$user || $user['deleted_at'] !== null) {
                    $db->rollBack();
                    self::redirectFrontend('/register?google=account_not_found&email=' . rawurlencode($email));
                }
                if ($user['status'] !== 'active') {
                    $db->rollBack();
                    self::redirectFrontend('/login?google=account_unavailable');
                }

                $userId = (int) $user['id'];
                $existingGoogle = $db->prepare("SELECT provider_user_id FROM oauth_accounts WHERE user_id = ? AND provider = 'google' LIMIT 1");
                $existingGoogle->execute([$userId]);
                $existingGoogleId = $existingGoogle->fetchColumn();
                if (is_string($existingGoogleId) && $existingGoogleId !== '' && !hash_equals($existingGoogleId, $googleId)) {
                    $db->rollBack();
                    self::redirectFrontend('/login?google=account_already_linked');
                }

                $db->prepare('UPDATE users SET is_verified = TRUE WHERE id = ?')->execute([$userId]);
                $db->prepare('UPDATE email_verifications SET verified_at = COALESCE(verified_at, NOW()) WHERE user_id = ?')
                    ->execute([$userId]);
                $db->prepare(
                    'INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email)
                     VALUES (?, \'google\', ?, ?)
                     ON CONFLICT (provider, provider_user_id) DO UPDATE SET provider_email = EXCLUDED.provider_email'
                )->execute([$userId, $googleId, $email]);

                $db->prepare("DELETE FROM oauth_login_codes WHERE expires_at < NOW() OR used_at < NOW() - INTERVAL '1 day'")->execute();
                $code = bin2hex(random_bytes(32));
                $db->prepare(
                    'INSERT INTO oauth_login_codes (user_id, code_hash, expires_at)
                     VALUES (?, ?, NOW() + INTERVAL \'5 minutes\')'
                )->execute([$userId, hash('sha256', $code)]);
                $db->commit();
            } catch (Throwable $exception) {
                if ($db->inTransaction()) $db->rollBack();
                throw $exception;
            }

            self::redirectFrontend('/auth/google/callback?code=' . rawurlencode($code));
        } catch (Throwable $exception) {
            error_log('CourseHubs Google sign-in failed: ' . $exception->getMessage());
            self::redirectFrontend('/login?google=unavailable');
        }
    }

    public static function exchange(): void
    {
        RateLimiter::enforce(
            Database::connection(),
            'google_code_exchange_ip',
            RateLimiter::clientIp(),
            60,
            3600,
            3600
        );

        $body = self::input();
        $code = trim((string) ($body['code'] ?? ''));
        if (!preg_match('/^[a-f0-9]{64}$/i', $code)) {
            Response::error('This sign-in attempt is invalid. Please try again.', 422);
        }

        $db = Database::connection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'SELECT id, user_id FROM oauth_login_codes
                 WHERE code_hash = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([hash('sha256', $code)]);
            $loginCode = $stmt->fetch();
            if (!$loginCode) {
                $db->rollBack();
                Response::error('This Google sign-in link has expired. Please try again.', 410);
            }

            $db->prepare('UPDATE oauth_login_codes SET used_at = NOW() WHERE id = ?')->execute([(int) $loginCode['id']]);
            $userStmt = $db->prepare(
                'SELECT id, first_name, surname, middle_name, email, account_type, level,
                        CASE WHEN is_admin IS TRUE THEN 1 ELSE 0 END AS is_admin,
                        CASE WHEN is_super_admin IS TRUE THEN 1 ELSE 0 END AS is_super_admin,
                        CASE WHEN is_verified IS TRUE THEN 1 ELSE 0 END AS is_verified,
                        profile_picture_data, auth_token_version, status, deleted_at
                 FROM users WHERE id = ? LIMIT 1'
            );
            $userStmt->execute([(int) $loginCode['user_id']]);
            $user = $userStmt->fetch();
            if (!$user || $user['deleted_at'] !== null || $user['status'] !== 'active' || (int) $user['is_verified'] !== 1) {
                $db->rollBack();
                Response::error('This account is not currently available. Please contact CourseHubs support.', 403);
            }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) $db->rollBack();
            throw $exception;
        }

        Response::json([
            'message' => 'Signed in successfully.',
            'token' => Jwt::issue((int) $user['id'], (int) $user['auth_token_version']),
            'user' => self::publicUser($user),
            'expires_in' => 8 * 60 * 60,
        ]);
    }

    private static function exchangeAuthorizationCode(string $code): array
    {
        if ($code === '' || !function_exists('curl_init')) throw new RuntimeException('Google sign-in is not available.');
        $response = self::curlJson('https://oauth2.googleapis.com/token', [
            'client_id' => Config::required('GOOGLE_CLIENT_ID'),
            'client_secret' => Config::required('GOOGLE_CLIENT_SECRET'),
            'redirect_uri' => Config::required('GOOGLE_REDIRECT_URI'),
            'grant_type' => 'authorization_code',
            'code' => $code,
        ], 'POST');
        if (empty($response['access_token'])) throw new RuntimeException('Google did not return an access token.');
        return $response;
    }

    private static function fetchGoogleProfile(string $accessToken): array
    {
        if ($accessToken === '') throw new RuntimeException('Google access token is missing.');
        $ch = curl_init('https://openidconnect.googleapis.com/v1/userinfo');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken, 'Accept: application/json'],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if (!is_string($raw) || $status < 200 || $status >= 300) {
            throw new RuntimeException('Google profile request failed (' . $status . '): ' . $error);
        }
        $profile = json_decode($raw, true);
        if (!is_array($profile)) throw new RuntimeException('Google returned an invalid profile response.');
        return $profile;
    }

    private static function curlJson(string $url, array $fields, string $method = 'POST'): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => $method === 'POST',
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query($fields),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data) || $status < 200 || $status >= 300) {
            throw new RuntimeException('Google token exchange failed (' . $status . '): ' . $error);
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

    private static function redirectFrontend(string $path): never
    {
        $origin = rtrim(trim((string) Config::get('FRONTEND_ORIGIN', '')), '/');
        $parts = parse_url($origin);
        if (!is_array($parts) || !in_array(($parts['scheme'] ?? ''), ['https', 'http'], true) || empty($parts['host'])) {
            error_log('CourseHubs Google OAuth redirect could not be completed because the frontend origin is invalid.');
            http_response_code(500);
            echo 'CourseHubs sign-in is temporarily unavailable. Please return to the website and try again.';
            exit;
        }
        header('Location: ' . $origin . $path, true, 302);
        exit;
    }

    private static function input(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') return [];
        try { $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
        catch (JsonException) { Response::error('Request body must contain valid JSON.', 400); }
        if (!is_array($data)) Response::error('Request body must contain a JSON object.', 400);
        return $data;
    }
}
