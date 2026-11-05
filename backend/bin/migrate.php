<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/DatabaseMigrator.php';

Config::load(__DIR__ . '/../.env');

try {
    $applied = DatabaseMigrator::run(
        Database::connection(),
        __DIR__ . '/../database/migrations'
    );

    if ($applied === []) {
        fwrite(STDOUT, "CourseHubs database is up to date.\n");
    } else {
        foreach ($applied as $migration) {
            fwrite(STDOUT, "Applied database migration: {$migration}\n");
        }
    }
} catch (Throwable $exception) {
    fwrite(STDERR, "CourseHubs database migration failed: {$exception->getMessage()}\n");
    exit(1);
}
