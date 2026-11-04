<?php

declare(strict_types=1);

/** @var Router $router */

// Simple health check: confirms the PHP app is running and can reach
// the database, without exposing any real data. Useful for a quick
// "is the server up?" check during development and demo day.
$router->get('/health', function (): void {
    try {
        Database::connection()->query('SELECT 1');
        Response::json(['status' => 'ok', 'database' => 'connected']);
    } catch (Throwable $e) {
        Response::json(['status' => 'ok', 'database' => 'unreachable'], 200);
    }
});

// Further route groups (auth, courses, uploads, admin, ...)
// get added here as each feature is built.

$router->get('/academic-sessions', [AcademicSessionController::class, 'index']);

$router->post('/auth/register', [AuthController::class, 'register']);
