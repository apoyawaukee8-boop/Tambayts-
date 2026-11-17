<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    jsonResponse(['error' => 'Method not allowed.'], 405);
}

try {
    $db = database();
    $user = requireRole($db, 'student');
    $payload = requestJson();
    $message = is_string($payload['message'] ?? null) ? trim($payload['message']) : '';
    $characterCount = preg_match_all('/./us', $message);
    if ($characterCount === false || $characterCount < 1 || $characterCount > 2000) {
        jsonResponse(['error' => 'Feedback must be between 1 and 2,000 characters.'], 400);
    }

    $insert = $db->prepare('INSERT INTO student_feedback (student_id, message) VALUES (?, ?)');
    $insert->execute([$user['id'], $message]);
    jsonResponse(['success' => true, 'feedbackId' => (int) $db->lastInsertId()], 201);
} catch (Throwable $exception) {
    error_log('TamBayts feedback API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to save your feedback right now. Please try again later.'], 500);
}
