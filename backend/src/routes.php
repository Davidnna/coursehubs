<?php

declare(strict_types=1);

/** @var Router $router */

$router->get('/health', function (): void {
    try {
        Database::connection()->query('SELECT 1');
        Response::json(['status' => 'ok', 'database' => 'connected']);
    } catch (Throwable $e) {
        error_log('Health check database failure: ' . $e->getMessage());
        Response::json(['status' => 'ok', 'database' => 'unreachable'], 503);
    }
});

$router->get('/academic-sessions', [AcademicSessionController::class, 'index']);

$router->post('/auth/register', [AuthController::class, 'register']);
$router->get('/auth/verify-email', [AuthController::class, 'verifyEmail']);
$router->post('/auth/resend-verification', [AuthController::class, 'resendVerification']);
$router->post('/auth/login', [AuthController::class, 'login']);
$router->get('/auth/me', [AuthController::class, 'me']);
$router->post('/auth/logout', [AuthController::class, 'logout']);
$router->post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/auth/reset-password', [AuthController::class, 'resetPassword']);
