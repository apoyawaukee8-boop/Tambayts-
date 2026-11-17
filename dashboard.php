<?php
require_once __DIR__ . '/auth_check.php';

header('Cache-Control: no-store');
header('Location: ../admin.html');
exit;
