<?php

/**
 * Single shared PDO connection, built from Config values.
 * All timestamps are handled in WAT (Africa/Lagos) — see public/index.php
 * where date_default_timezone_set() is called before anything else runs.
 */
final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection === null) {
            $host = Config::required('DB_HOST');
            $name = Config::required('DB_NAME');
            $user = Config::required('DB_USER');
            $pass = Config::get('DB_PASS', '');
            $port = Config::get('DB_PORT', '3306');

            $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

            self::$connection = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);

            // Keep MySQL's own session timezone aligned with WAT too, so
            // DB-side NOW()/CURRENT_TIMESTAMP defaults match the app's
            // timezone rather than the server's system default. Done as
            // a separate query rather than PDO::MYSQL_ATTR_INIT_COMMAND,
            // since that constant is only defined once the pdo_mysql
            // driver is fully initialised — referencing it directly in
            // the options array broke on some local PHP setups.
            self::$connection->exec("SET time_zone = '+01:00'");
        }

        return self::$connection;
    }
}
