<?php

final class AcademicSessionController
{
    public static function index(): void
    {
        $stmt = Database::connection()->query(
            'SELECT id, name, is_current FROM academic_sessions ORDER BY name ASC'
        );

        Response::json(['sessions' => $stmt->fetchAll()]);
    }
}
