<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    jsonResponse(['error' => 'Method not allowed.'], 405);
}

try {
    $faqs = database()->query(
        'SELECT question, answer FROM help_faqs WHERE is_active = TRUE ORDER BY sort_order, id'
    )->fetchAll();
    jsonResponse(['faqs' => $faqs]);
} catch (Throwable $exception) {
    error_log('TamBayts help API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to load help articles. Please try again later.'], 500);
}
