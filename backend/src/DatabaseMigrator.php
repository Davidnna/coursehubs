<?php

declare(strict_types=1);

/**
 * Applies versioned PostgreSQL migrations exactly once.
 *
 * Migration files are immutable after application. A checksum mismatch is
 * treated as a deployment error so schema history cannot silently drift.
 */
final class DatabaseMigrator
{
    private const LOCK_NAMESPACE = 1296918853;
    private const LOCK_ID = 1;

    /** @return list<string> Names of migrations applied during this run. */
    public static function run(PDO $pdo, string $migrationsDirectory): array
    {
        if (!is_dir($migrationsDirectory)) {
            throw new RuntimeException('Database migrations directory does not exist.');
        }

        $lockAcquired = false;

        try {
            $pdo->query(sprintf(
                'SELECT pg_advisory_lock(%d, %d)',
                self::LOCK_NAMESPACE,
                self::LOCK_ID
            ));
            $lockAcquired = true;

            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS public.coursehubs_schema_migrations (
                    migration_name VARCHAR(160) PRIMARY KEY,
                    checksum CHAR(64) NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )'
            );

            $files = glob(rtrim($migrationsDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.sql');
            if ($files === false || $files === []) {
                throw new RuntimeException('No database migration files were found.');
            }

            sort($files, SORT_STRING);
            $appliedNow = [];
            $seenVersions = [];

            foreach ($files as $file) {
                $name = basename($file);
                if (!preg_match('/^(\d{4})_[a-z0-9][a-z0-9_]*\.sql$/D', $name, $matches)) {
                    throw new RuntimeException("Invalid migration filename: {$name}. Use 0002_descriptive_name.sql format.");
                }
                $version = $matches[1];
                if (isset($seenVersions[$version])) {
                    throw new RuntimeException("Duplicate database migration version {$version}. Each migration must have a unique four-digit version.");
                }
                $seenVersions[$version] = true;

                $checksum = hash_file('sha256', $file);
                if (!is_string($checksum)) {
                    throw new RuntimeException("Unable to calculate checksum for migration {$name}.");
                }

                $lookup = $pdo->prepare(
                    'SELECT checksum
                     FROM public.coursehubs_schema_migrations
                     WHERE migration_name = :migration_name'
                );
                $lookup->execute(['migration_name' => $name]);
                $storedChecksum = $lookup->fetchColumn();

                if ($storedChecksum !== false) {
                    if (!hash_equals((string) $storedChecksum, $checksum)) {
                        throw new RuntimeException(
                            "Applied migration {$name} has changed. Do not edit applied migrations; create a new migration instead."
                        );
                    }
                    continue;
                }

                $sql = file_get_contents($file);
                if ($sql === false || trim($sql) === '') {
                    throw new RuntimeException("Migration {$name} is empty or unreadable.");
                }

                $pdo->beginTransaction();
                try {
                    // PDO_PGSQL executes this as a PostgreSQL simple-query batch;
                    // this preserves PL/pgSQL function bodies in the baseline.
                    $pdo->exec($sql);

                    $record = $pdo->prepare(
                        'INSERT INTO public.coursehubs_schema_migrations (migration_name, checksum)
                         VALUES (:migration_name, :checksum)'
                    );
                    $record->execute([
                        'migration_name' => $name,
                        'checksum' => $checksum,
                    ]);

                    $pdo->commit();
                    $appliedNow[] = $name;
                } catch (Throwable $exception) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }

                    throw new RuntimeException(
                        "Database migration {$name} failed: " . $exception->getMessage(),
                        0,
                        $exception
                    );
                }
            }

            return $appliedNow;
        } finally {
            if ($lockAcquired) {
                try {
                    $pdo->query(sprintf(
                        'SELECT pg_advisory_unlock(%d, %d)',
                        self::LOCK_NAMESPACE,
                        self::LOCK_ID
                    ));
                } catch (Throwable $unlockException) {
                    error_log('CourseHubs could not release the PostgreSQL migration lock: ' . $unlockException->getMessage());
                }
            }
        }
    }
}
