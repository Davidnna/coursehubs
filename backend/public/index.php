<?php

declare(strict_types=1);

// Production-safe API output: diagnostics belong in server logs, never in browser responses.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$genericServerError = static function (): void {
    if (headers_sent()) {
        return;
    }

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Something went wrong on our end. Please try again shortly.']);
};

set_exception_handler(static function (Throwable $exception) use ($genericServerError): void {
    error_log(sprintf(
        'Uncaught CourseHubs exception [%s]: %s in %s:%d',
        get_class($exception),
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));
    $genericServerError();
});

register_shutdown_function(static function () use ($genericServerError): void {
    $lastError = error_get_last();
    if (!is_array($lastError) || !in_array($lastError['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }

    error_log(sprintf(
        'Fatal CourseHubs PHP error: %s in %s:%d',
        $lastError['message'],
        $lastError['file'],
        $lastError['line']
    ));
    $genericServerError();
});

date_default_timezone_set('Africa/Lagos');

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Http/Router.php';
require __DIR__ . '/../src/Http/Response.php';
require __DIR__ . '/../src/Support/Validator.php';
require __DIR__ . '/../src/Support/Names.php';
require __DIR__ . '/../src/Support/EmailQuota.php';
require __DIR__ . '/../src/Support/ObjectStorage.php';
require __DIR__ . '/../src/Support/Mailer.php';
require __DIR__ . '/../src/Security/Jwt.php';
require __DIR__ . '/../src/Security/Auth.php';
require __DIR__ . '/../src/Controllers/AuthController.php';
require __DIR__ . '/../src/Controllers/AccountController.php';
require __DIR__ . '/../src/Controllers/GoogleAuthController.php';
require __DIR__ . '/../src/Controllers/AcademicSessionController.php';
require __DIR__ . '/../src/Controllers/AcademicController.php';
require __DIR__ . '/../src/Controllers/AcademicCorrectionController.php';
require __DIR__ . '/../src/Controllers/AcademicCsvImportController.php';
require __DIR__ . '/../src/Controllers/ResourceController.php';

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
    error_log(sprintf('CourseHubs API exception [%s]: %s in %s:%d', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));
    Response::error('Something went wrong on our end. Please try again shortly.', 500);
}
