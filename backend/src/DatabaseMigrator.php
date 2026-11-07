<?php

declare(strict_types=1);

/**
 * Applies versioned PostgreSQL migrations exactly once.
 *
 * Canonical migration filenames use four-digit versions, for example
 * 0002_add_course_reviews.sql. Two known three-digit filenames from earlier
 * CourseHubs releases are mapped to their canonical successors during the
 * transition. If both names exist, identical content is required and only
 * the canonical migration is considered.
 *
 * Migration files are immutable after application. A checksum mismatch is
 * treated as a deployment error so schema history cannot silently drift.
 */
final class DatabaseMigrator
{
    private const LOCK_NAMESPACE = 1296918853;
    private const LOCK_ID = 1;

    /**
     * Compatibility map for files that may remain in an existing Git checkout
     * after the migration system was standardised on four-digit versions.
     * The SQL content is retained in the canonical files shipped with the app.
     */
    private const LEGACY_MIGRATIONS = [
        '001_authentication.sql' => '0002_authentication_indexes.sql',
        '002_provider_neutral_email_quota.sql' => '0003_provider_neutral_email_quota.sql',
    ];

    /** @return list<string> Names of migrations applied during this run. */
    public static function run(PDO $pdo, string $migrationsDirectory): array
    {
        if (!is_dir($migrationsDirectory)) {
            throw new RuntimeException('Database migrations directory does not exist.');
        }

        // Validate and normalise every filename before touching the database.
        // This prevents a late invalid filename from leaving a partial setup.
        $migrations = self::discoverMigrations($migrationsDirectory);
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

            $appliedNow = [];

            foreach ($migrations as $migration) {
                $name = $migration['name'];
                $file = $migration['file'];
                $checksum = $migration['checksum'];

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

            self::bootstrapInitialSuperAdmin($pdo);

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


    /**
     * One-time first-administrator bootstrap. Set INITIAL_SUPER_ADMIN_EMAIL in
     * the hosting environment to the verified account that should receive the
     * first super-admin role. The database marker makes this operation one-shot.
     */
    private static function bootstrapInitialSuperAdmin(PDO $pdo): void
    {
        $email = strtolower(trim((string) Config::get('INITIAL_SUPER_ADMIN_EMAIL', '')));
        if ($email === '') {
            return;
        }

        $pdo->beginTransaction();
        try {
            $state = $pdo->prepare(
                "SELECT completed_at
                 FROM public.coursehubs_bootstrap_state
                 WHERE bootstrap_key = 'initial_super_admin'
                 LIMIT 1 FOR UPDATE"
            );
            $state->execute();
            $bootstrap = $state->fetch(PDO::FETCH_ASSOC);
            if (!$bootstrap || $bootstrap['completed_at'] !== null) {
                $pdo->commit();
                return;
            }

            $existing = $pdo->query(
                "SELECT id FROM public.users
                 WHERE is_super_admin IS TRUE AND deleted_at IS NULL AND status = 'active'
                 ORDER BY id ASC LIMIT 1 FOR UPDATE"
            )->fetchColumn();

            if ($existing !== false) {
                $pdo->prepare('UPDATE public.users SET is_admin = TRUE WHERE id = ?')->execute([(int) $existing]);
                $complete = $pdo->prepare(
                    "UPDATE public.coursehubs_bootstrap_state
                     SET completed_at = CURRENT_TIMESTAMP, completed_user_id = ?
                     WHERE bootstrap_key = 'initial_super_admin' AND completed_at IS NULL"
                );
                $complete->execute([(int) $existing]);
                $pdo->commit();
                error_log('CourseHubs initial super-admin bootstrap skipped because an active super administrator already exists.');
                return;
            }

            $find = $pdo->prepare(
                "SELECT id FROM public.users
                 WHERE LOWER(email) = :email AND deleted_at IS NULL
                   AND status = 'active' AND is_verified IS TRUE
                 LIMIT 1 FOR UPDATE"
            );
            $find->execute(['email' => $email]);
            $userId = $find->fetchColumn();

            if ($userId === false) {
                $pdo->rollBack();
                error_log('CourseHubs initial super-admin bootstrap is pending: the configured account was not found or is not yet verified.');
                return;
            }

            $promote = $pdo->prepare(
                "UPDATE public.users SET is_admin = TRUE, is_super_admin = TRUE
                 WHERE id = ? AND deleted_at IS NULL AND status = 'active' AND is_verified IS TRUE"
            );
            $promote->execute([(int) $userId]);
            if ($promote->rowCount() !== 1) {
                throw new RuntimeException('The configured initial administrator could not be promoted.');
            }

            $complete = $pdo->prepare(
                "UPDATE public.coursehubs_bootstrap_state
                 SET completed_at = CURRENT_TIMESTAMP, completed_user_id = ?
                 WHERE bootstrap_key = 'initial_super_admin' AND completed_at IS NULL"
            );
            $complete->execute([(int) $userId]);
            $pdo->commit();
            error_log('CourseHubs initial super administrator configured successfully. Remove INITIAL_SUPER_ADMIN_EMAIL from the hosting environment.');
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    /**
     * @return list<array{name:string, version:int, file:string, checksum:string}>
     */
    private static function discoverMigrations(string $migrationsDirectory): array
    {
        $files = glob(rtrim($migrationsDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.sql');
        if ($files === false || $files === []) {
            throw new RuntimeException('No database migration files were found.');
        }

        /** @var array<string, array{name:string, version:int, file:string, checksum:string, canonical:bool}> $resolved */
        $resolved = [];

        foreach ($files as $file) {
            $filename = basename($file);
            $canonical = true;

            if (preg_match('/^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/D', $filename, $matches)) {
                $canonicalName = $filename;
                $version = (int) $matches[1];
            } elseif (isset(self::LEGACY_MIGRATIONS[$filename])) {
                $canonical = false;
                $canonicalName = self::LEGACY_MIGRATIONS[$filename];
                $version = (int) substr($canonicalName, 0, 4);
            } else {
                throw new RuntimeException(
                    "Invalid migration filename: {$filename}. Use 0001_descriptive_name.sql format. " .
                    'Known legacy CourseHubs migration names are supported during this transition.'
                );
            }

            if ($version < 1) {
                throw new RuntimeException("Migration {$filename} must use a version greater than 0000.");
            }

            $checksum = hash_file('sha256', $file);
            if (!is_string($checksum)) {
                throw new RuntimeException("Unable to calculate checksum for migration {$filename}.");
            }

            if (isset($resolved[$canonicalName])) {
                $existing = $resolved[$canonicalName];
                if (!hash_equals($existing['checksum'], $checksum)) {
                    throw new RuntimeException(
                        "Conflicting legacy and canonical migration files resolve to {$canonicalName}. " .
                        'Their contents must be identical; do not edit or duplicate migration history.'
                    );
                }

                // Prefer the canonical path when both old and new filenames exist.
                if ($canonical && !$existing['canonical']) {
                    $resolved[$canonicalName] = [
                        'name' => $canonicalName,
                        'version' => $version,
                        'file' => $file,
                        'checksum' => $checksum,
                        'canonical' => true,
                    ];
                }
                continue;
            }

            $resolved[$canonicalName] = [
                'name' => $canonicalName,
                'version' => $version,
                'file' => $file,
                'checksum' => $checksum,
                'canonical' => $canonical,
            ];
        }

        $migrations = array_values($resolved);
        usort($migrations, static function (array $left, array $right): int {
            return ($left['version'] <=> $right['version'])
                ?: strcmp($left['name'], $right['name']);
        });

        $seenVersions = [];
        foreach ($migrations as $migration) {
            $version = $migration['version'];
            if (isset($seenVersions[$version])) {
                throw new RuntimeException(
                    sprintf(
                        'Duplicate database migration version %04d. Each migration must have a unique four-digit version.',
                        $version
                    )
                );
            }
            $seenVersions[$version] = true;
        }

        return $migrations;
    }
}
