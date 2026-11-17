<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    jsonResponse(['error' => 'Method not allowed.'], 405);
}

try {
    $stall = trim((string) ($_GET['stall'] ?? ''));
    $db = database();
    $stallId = null;
    if ($stall !== '' && preg_match('/^Stall ([1-7])$/', $stall, $stallMatch) === 1) {
        $stallId = (int) $stallMatch[1];
    }
    if ($stall === '') {
        $items = $db->query(
            "SELECT m.id, m.name, m.price, CONCAT('Stall ', m.stall_id) AS stall, m.category, m.image_url, m.is_available FROM menu_items m ORDER BY m.id"
        )->fetchAll();
    } elseif ($stallId !== null) {
        $query = $db->prepare(
            "SELECT m.id, m.name, m.price, CONCAT('Stall ', m.stall_id) AS stall, m.category, m.image_url, m.is_available FROM menu_items m WHERE m.stall_id = ? ORDER BY m.id"
        );
        $query->execute([$stallId]);
        $items = $query->fetchAll();
    } else {
        $items = [];
    }
    $menu = array_map(static fn(array $item): array => [
        'id' => (int) $item['id'],
        'name' => $item['name'],
        'price' => (float) $item['price'],
        'stall' => $item['stall'],
        'category' => $item['category'],
        'imageUrl' => $item['image_url'] ?: menuItemImageUrl((int) $item['id']),
        'available' => (bool) $item['is_available'],
    ], $items);
    jsonResponse(['menu' => $menu]);
} catch (Throwable $exception) {
    error_log('TamBayts menu API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to load the menu. Check the database configuration.'], 500);
}
