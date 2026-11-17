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
            'SELECT m.name, c.quantity FROM student_cart_items c JOIN menu_items m ON m.id = c.menu_item_id WHERE c.student_id = ? ORDER BY c.menu_item_id'
        );
        $query->execute([$user['id']]);
        $items = array_map(static fn(array $row): array => [
            'name' => $row['name'],
            'quantity' => (int) $row['quantity'],
        ], $query->fetchAll());
        jsonResponse(['items' => $items]);
    }

    $payload = requestJson();
    $rawItems = $payload['items'] ?? null;
    if (!is_array($rawItems) || count($rawItems) > 50) {
        jsonResponse(['error' => 'Cart must contain no more than 50 food items.'], 400);
    }
    $quantities = [];
    foreach ($rawItems as $item) {
        if (!is_array($item) || !is_string($item['name'] ?? null)) continue;
        $name = trim($item['name']);
        $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
        if ($name === '' || strlen($name) > 120 || $quantity === false || $quantity < 1 || $quantity > 100) {
            jsonResponse(['error' => 'Cart food names or quantities are invalid.'], 400);
        }
        $quantities[$name] = ($quantities[$name] ?? 0) + $quantity;
        if ($quantities[$name] > 100) jsonResponse(['error' => 'A food quantity cannot exceed 100.'], 400);
    }

    $menuItems = [];
    if ($quantities) {
        $placeholders = implode(',', array_fill(0, count($quantities), '?'));
        $find = $db->prepare("SELECT id, name FROM menu_items WHERE is_available = 1 AND name IN ($placeholders)");
        $find->execute(array_keys($quantities));
        foreach ($find->fetchAll() as $row) $menuItems[$row['name']] = (int) $row['id'];
        if (count($menuItems) !== count($quantities)) {
            jsonResponse(['error' => 'One or more cart items are no longer available. Refresh the menu and try again.'], 409);
        }
    }

    $db->beginTransaction();
    $delete = $db->prepare('DELETE FROM student_cart_items WHERE student_id = ?');
    $delete->execute([$user['id']]);
    $insert = $db->prepare('INSERT INTO student_cart_items (student_id, menu_item_id, quantity) VALUES (?, ?, ?)');
    foreach ($quantities as $name => $quantity) {
        $insert->execute([$user['id'], $menuItems[$name], $quantity]);
    }
    $db->commit();
    jsonResponse(['items' => array_map(static fn(string $name, int $quantity): array => [
        'name' => $name,
        'quantity' => $quantity,
    ], array_keys($quantities), array_values($quantities))]);
} catch (Throwable $exception) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    error_log('TamBayts cart API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to load or save your cart. Please try again later.'], 500);
}
