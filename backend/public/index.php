<?php

declare(strict_types=1);

date_default_timezone_set('Africa/Lagos');

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Http/Router.php';
require __DIR__ . '/../src/Http/Response.php';
require __DIR__ . '/../src/Support/Validator.php';
require __DIR__ . '/../src/Support/Names.php';
require __DIR__ . '/../src/Support/EmailQuota.php';
require __DIR__ . '/../src/Support/Mailer.php';
require __DIR__ . '/../src/Security/Jwt.php';
require __DIR__ . '/../src/Security/Auth.php';
require __DIR__ . '/../src/Controllers/AuthController.php';
require __DIR__ . '/../src/Controllers/AcademicSessionController.php';

Config::load(__DIR__ . '/../.env');

// CORS is restricted to the configured frontend origin. No wildcard is
// used in production, and the API uses bearer tokens rather than cookies.
$allowedOrigin = rtrim((string) Config::get('FRONTEND_ORIGIN', 'http://localhost:5173'), '/');
$requestOrigin = rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
if ($requestOrigin !== '' && hash_equals($allowedOrigin, $requestOrigin)) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$router = new Router();
require __DIR__ . '/../src/routes.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], $path);
} catch (Throwable $e) {
    error_log('CourseHubs API error: ' . $e->getMessage());
    Response::error('An unexpected server error occurred. Please try again later.', 500);
}
