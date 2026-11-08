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
$router->get('/academic-structure', [AcademicController::class, 'publicStructure']);
$router->get('/courses', [AcademicController::class, 'catalog']);
$router->get('/courses/{id}', [AcademicController::class, 'courseDetail']);

// Signed-in course resource library. Private files use short-lived Neon Object Storage links.
$router->get('/resources/access', [ResourceController::class, 'access']);
$router->get('/resources/courses', [ResourceController::class, 'courseOptions']);
$router->get('/resources/mine', [ResourceController::class, 'mine']);
$router->post('/resources', [ResourceController::class, 'upload']);
$router->get('/resources/{id}/file', [ResourceController::class, 'fileUrl']);
$router->delete('/resources/{id}', [ResourceController::class, 'delete']);
$router->get('/courses/{id}/resources', [ResourceController::class, 'forCourse']);
$router->get('/admin/resources', [ResourceController::class, 'adminIndex']);
$router->patch('/admin/resources/{id}/moderation', [ResourceController::class, 'moderate']);

// Administrative academic management. Every route enforces administrator access server-side.
$router->post('/admin/academic/import/csv', [AcademicCsvImportController::class, 'handle']);
$router->get('/admin/academic/overview', [AcademicController::class, 'overview']);
$router->get('/admin/academic/structure', [AcademicController::class, 'adminStructure']);
$router->get('/admin/academic/sessions', [AcademicController::class, 'sessions']);
$router->post('/admin/academic/sessions', [AcademicController::class, 'createSession']);
$router->patch('/admin/academic/sessions/{id}', [AcademicController::class, 'updateSession']);
$router->post('/admin/academic/faculties', [AcademicController::class, 'createFaculty']);
$router->patch('/admin/academic/faculties/{id}', [AcademicController::class, 'updateFaculty']);
$router->post('/admin/academic/departments', [AcademicController::class, 'createDepartment']);
$router->patch('/admin/academic/departments/{id}', [AcademicController::class, 'updateDepartment']);
$router->post('/admin/academic/programmes', [AcademicController::class, 'createProgramme']);
$router->patch('/admin/academic/programmes/{id}', [AcademicController::class, 'updateProgramme']);
$router->get('/admin/academic/courses', [AcademicController::class, 'adminCourses']);
$router->post('/admin/academic/courses', [AcademicController::class, 'createCourse']);
$router->patch('/admin/academic/courses/{id}', [AcademicController::class, 'updateCourse']);
$router->get('/admin/academic/offerings', [AcademicController::class, 'adminOfferings']);
$router->post('/admin/academic/offerings', [AcademicController::class, 'createOffering']);
$router->patch('/admin/academic/offerings/{id}', [AcademicController::class, 'updateOffering']);
$router->delete('/admin/academic/offerings/{id}', [AcademicController::class, 'archiveOffering']);
$router->get('/admin/academic/staff', [AcademicController::class, 'staff']);

$router->post('/auth/register', [AuthController::class, 'register']);
$router->get('/auth/verify-email', [AuthController::class, 'verifyEmail']);
$router->post('/auth/resend-verification', [AuthController::class, 'resendVerification']);
$router->post('/auth/login', [AuthController::class, 'login']);
$router->get('/auth/me', [AuthController::class, 'me']);
$router->post('/auth/logout', [AuthController::class, 'logout']);
$router->post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/auth/reset-password', [AuthController::class, 'resetPassword']);


// Google OAuth uses a server-side authorization-code flow and a one-time code exchange.
$router->get('/auth/google', [GoogleAuthController::class, 'start']);
$router->get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
$router->post('/auth/google/exchange', [GoogleAuthController::class, 'exchange']);

// Signed-in account management.
$router->get('/account', [AccountController::class, 'show']);
$router->patch('/account/profile', [AccountController::class, 'updateProfile']);
$router->post('/account/email-change', [AccountController::class, 'requestEmailChange']);
$router->get('/account/verify-email-change', [AccountController::class, 'verifyEmailChange']);
$router->post('/account/password', [AccountController::class, 'changePassword']);
$router->delete('/account', [AccountController::class, 'deleteAccount']);
