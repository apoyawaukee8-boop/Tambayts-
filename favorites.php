<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'PUT'], true)) {
    header('Allow: GET, PUT');
    jsonResponse(['error' => 'Method not allowed.'], 405);
}

try {
    $db = database();
    $user = requireRole($db, 'student');

    if ($method === 'GET') {
        $query = $db->prepare(
            'SELECT m.name FROM favorites f JOIN menu_items m ON m.id = f.food_id WHERE f.student_id = ? ORDER BY f.created_at, m.name'
        );
        $query->execute([$user['id']]);
        jsonResponse(['favorites' => $query->fetchAll(PDO::FETCH_COLUMN)]);
    }

    $payload = requestJson();
    $favorites = $payload['favorites'] ?? null;
    if (!is_array($favorites) || count($favorites) > 100) {
        jsonResponse(['error' => 'Favorites must be a list of up to 100 food names.'], 400);
    }

    $names = [];
    foreach ($favorites as $name) {
        if (!is_string($name)) continue;
        $name = trim($name);
        if ($name !== '' && strlen($name) <= 120) $names[$name] = true;
    }

    $db->beginTransaction();
    $delete = $db->prepare('DELETE FROM favorites WHERE student_id = ?');
    $delete->execute([$user['id']]);
    $findMenuItem = $db->prepare('SELECT id, name FROM menu_items WHERE name = ? LIMIT 1');
    $insert = $db->prepare('INSERT IGNORE INTO favorites (student_id, student_name, food_id, food_name) VALUES (?, ?, ?, ?)');
    foreach (array_keys($names) as $name) {
        $findMenuItem->execute([$name]);
        $menuItem = $findMenuItem->fetch();
        if ($menuItem) $insert->execute([$user['id'], $user['name'], (int) $menuItem['id'], $menuItem['name']]);
    }
    $db->commit();

    $query = $db->prepare(
        'SELECT m.name FROM favorites f JOIN menu_items m ON m.id = f.food_id WHERE f.student_id = ? ORDER BY f.created_at, m.name'
    );
    $query->execute([$user['id']]);
    jsonResponse(['favorites' => $query->fetchAll(PDO::FETCH_COLUMN)]);
} catch (Throwable $exception) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    error_log('TamBayts favorites API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to save favorites. Check the server and database configuration.'], 500);
}
