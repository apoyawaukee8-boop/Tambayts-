<?php
declare(strict_types=1);

function database(): PDO
{
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    $host = getenv('TAMBAYTS_DB_HOST') ?: '127.0.0.1';
    $name = getenv('TAMBAYTS_DB_NAME') ?: 'tambayts_db';
    $user = getenv('TAMBAYTS_DB_USER') ?: 'root';
    $password = getenv('TAMBAYTS_DB_PASSWORD') ?: '';

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $host, $name);

    try {
        $connection = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        // Keep existing XAMPP databases compatible with the optional profile field.
        $genderColumn = $connection->query("SHOW COLUMNS FROM users LIKE 'gender'")->fetch();
        if (!$genderColumn) {
            $connection->exec('ALTER TABLE users ADD COLUMN gender VARCHAR(30) NULL AFTER course');
        }
    } catch (PDOException $exception) {
        
        error_log('TamBayts database connection failed: ' . $exception->getMessage());
        throw new RuntimeException('Unable to connect to the database. Check the server configuration.');
    }

    return $connection;
}
