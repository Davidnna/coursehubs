<?php

declare(strict_types=1);

// WAT (Africa/Lagos) everywhere — set before anything else runs, so
// every date()/time() call in the app is consistent regardless of the
// hosting server's own default timezone.
date_default_timezone_set('Africa/Lagos');

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Http/Router.php';
require __DIR__ . '/../src/Http/Response.php';
require __DIR__ . '/../src/Support/Validator.php';
require __DIR__ . '/../src/Support/Names.php';
require __DIR__ . '/../src/Support/EmailQuota.php';
require __DIR__ . '/../src/Support/Mailer.php';
require __DIR__ . '/../src/Controllers/AuthController.php';
require __DIR__ . '/../src/Controllers/AcademicSessionController.php';

Config::load(__DIR__ . '/../.env');

// --- CORS -------------------------------------------------------------
// The React frontend is served from a different origin during
// development (Vite dev server) and possibly a different subdomain in
// production, so CORS headers are needed on every response.
$allowedOrigin = Config::get('FRONTEND_ORIGIN', '*');
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- Routing ------------------------------------------------------------
$router = new Router();

require __DIR__ . '/../src/routes.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$router->dispatch($_SERVER['REQUEST_METHOD'], $path);
