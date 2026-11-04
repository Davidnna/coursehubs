<?php

/**
 * Single shared PDO connection for PostgreSQL (Neon).
 * DATABASE_URL is supplied by Render in production and by backend/.env locally.
 * The connection timezone is Africa/Lagos; timestamps use TIMESTAMPTZ.
 */
final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection === null) {
            $databaseUrl = Config::required('DATABASE_URL');
            $parts = parse_url($databaseUrl);

            if ($parts === false || empty($parts['host']) || empty($parts['path'])) {
                throw new RuntimeException('DATABASE_URL is not a valid PostgreSQL connection URL.');
            }

            $database = rawurldecode(ltrim($parts['path'], '/'));
            $username = rawurldecode($parts['user'] ?? '');
            $password = rawurldecode($parts['pass'] ?? '');
            $host = $parts['host'];
            $port = (int) ($parts['port'] ?? 5432);

            $query = [];
            parse_str($parts['query'] ?? '', $query);
            $sslMode = $query['sslmode'] ?? 'require';

            // Neon requires TLS. Do not allow an accidental plaintext connection.
            if (!in_array($sslMode, ['require', 'verify-ca', 'verify-full'], true)) {
                $sslMode = 'require';
            }

            $dsn = "pgsql:host={$host};port={$port};dbname={$database};sslmode={$sslMode}";

            self::$connection = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);

            self::$connection->exec("SET TIME ZONE 'Africa/Lagos'");
        }

        return self::$connection;
    }
}
