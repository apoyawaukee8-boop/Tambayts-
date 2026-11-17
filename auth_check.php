<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/api/http.php';

$admin = sessionUser(database(), 'admin');
if ($admin === null) {
    header('Location: ../login.html');
    exit;
}
