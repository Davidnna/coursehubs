<?php

declare(strict_types=1);

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/DatabaseMigrator.php';

$backendRoot = dirname(__DIR__);
Config::load($backendRoot . '/.env');

try {
    $applied = DatabaseMigrator::run(
        Database::connection(),
        $backendRoot . '/database/migrations'
    );

    foreach ($applied as $migration) {
        fwrite(STDOUT, "Applied database migration: {$migration}\n");
    }
} catch (Throwable $exception) {
    fwrite(STDERR, "Cannot start CourseHubs: database migration failed: {$exception->getMessage()}\n");
    exit(1);
}

$host = getenv('APP_HOST') ?: '127.0.0.1';
$port = getenv('APP_PORT') ?: '8000';
$command = [
    PHP_BINARY,
    '-S',
    $host . ':' . $port,
    '-t',
    $backendRoot . '/public',
    $backendRoot . '/public/index.php',
];

fwrite(STDOUT, "CourseHubs API running at http://{$host}:{$port}\n");
$process = proc_open($command, [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes, $backendRoot);
if (!is_resource($process)) {
    fwrite(STDERR, "Unable to start the local PHP development server.\n");
    exit(1);
}

exit(proc_close($process));
