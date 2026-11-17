<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestJson(): array
{
    $input = file_get_contents('php://input');
    $payload = json_decode($input ?: '', true);
    if (!is_array($payload)) {
        jsonResponse(['error' => 'Request body must be valid JSON.'], 400);
    }
    return $payload;
}

function validClientId(mixed $clientId): bool
{
    return is_string($clientId)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $clientId) === 1;
}

function menuItemImageUrl(int $menuItemId): ?string
{
    foreach (['jpg', 'png', 'webp'] as $extension) {
        $relativePath = 'uploads/menu/food-' . $menuItemId . '.' . $extension;
        if (is_file(dirname(__DIR__) . '/' . $relativePath)) return $relativePath;
    }
    return null;
}

function startAuthSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $sessionLifetime = 60 * 60 * 24 * 30;
    session_name('tambayts_session');
    ini_set('session.gc_maxlifetime', (string) $sessionLifetime);
    session_set_cookie_params([
        'lifetime' => $sessionLifetime,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (!headers_sent()) {
        $params = session_get_cookie_params();
        setcookie(session_name(), session_id(), [
            'expires' => time() + $sessionLifetime,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
}

function sessionUser(PDO $db, ?string $role = null): ?array
{
    startAuthSession();
    $id = $_SESSION['user_id'] ?? null;
    $sessionRole = $_SESSION['role'] ?? null;

    // Accept one old session format during rollout, but never take a role from the URL.
    if ($id === null && isset($_SESSION['user_ids']) && is_array($_SESSION['user_ids'])) {
        if ($role !== null && isset($_SESSION['user_ids'][$role])) {
            $sessionRole = $role;
            $id = $_SESSION['user_ids'][$role];
        } elseif (count($_SESSION['user_ids']) === 1) {
            $sessionRole = (string) array_key_first($_SESSION['user_ids']);
            $id = reset($_SESSION['user_ids']);
        }
    }
    if (!is_int($id) && !ctype_digit((string) $id)) return null;
    $query = $db->prepare('SELECT id, name, email, role, client_id, course, gender FROM users WHERE id = ? LIMIT 1');
    $query->execute([(int) $id]);
    $user = $query->fetch();
    if (!$user || ($sessionRole !== null && $user['role'] !== $sessionRole)) {
        unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['user_ids']);
        return null;
    }
    if ($role !== null && $user['role'] !== $role) return null;

    if (isset($_SESSION['user_ids']) && is_array($_SESSION['user_ids'])) {
        $_SESSION['user_ids'][$user['role']] = (int) $user['id'];
        unset($_SESSION['user_id'], $_SESSION['role']);
    } else {
        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['role'] = $user['role'];
    }
    return [
        'id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'],
        'role' => $user['role'], 'clientId' => $user['client_id'], 'course' => $user['course'], 'gender' => $user['gender'],
    ];
}

function requireRole(PDO $db, string $role): array
{
    $user = sessionUser($db, $role);
    if ($user === null) {
        jsonResponse(['error' => 'Please sign in with an authorized account.', 'loginRequired' => true], 401);
    }
    return $user;
}

function orderForClient(PDO $db, string $clientId, string $orderCode): ?array
{
    $query = $db->prepare(
        "SELECT o.id AS row_id, o.order_code AS id, o.status, o.total, o.payment_method, o.payment_status, o.created_at, u.name AS student
         FROM orders o
         JOIN users u ON u.id = o.user_id
         WHERE u.client_id = ? AND o.order_code = ?"
    );
    $query->execute([$clientId, $orderCode]);
    $row = $query->fetch();
    if (!$row) {
        return null;
    }
    $itemsQuery = $db->prepare('SELECT item_name, quantity, menu_item_id FROM ordered_food WHERE order_id = ? ORDER BY id');
    $itemsQuery->execute([$row['row_id']]);
    $items = array_map(static fn(array $item): array => [
        'name' => $item['item_name'],
        'quantity' => (int) $item['quantity'],
        'menuItemId' => $item['menu_item_id'] === null ? null : (int) $item['menu_item_id'],
    ], $itemsQuery->fetchAll());
    return [
        'id' => $row['id'],
        'names' => array_column($items, 'name'),
        'items' => $items,
        'total' => (float) $row['total'],
        'paymentMethod' => $row['payment_method'] === 'cash_on_pickup' ? 'Cash on pickup' : 'Cash',
        'paymentStatus' => $row['payment_status'],
        'status' => $row['status'] === 'Completed' ? 'Picked up' : $row['status'],
        'createdAt' => date('M j, Y g:i A', strtotime($row['created_at'])),
        'student' => $row['student'],
    ];
}

function ordersForClient(PDO $db, string $clientId): array
{
    $query = $db->prepare(
        "SELECT o.order_code
         FROM orders o JOIN users u ON u.id = o.user_id
         WHERE u.client_id = ?
         ORDER BY o.created_at DESC, o.id DESC"
    );
    $query->execute([$clientId]);
    $orders = [];
    foreach ($query->fetchAll(PDO::FETCH_COLUMN) as $orderCode) {
        $order = orderForClient($db, $clientId, (string) $orderCode);
        if ($order !== null) {
            $orders[] = $order;
        }
    }
    return $orders;
}
