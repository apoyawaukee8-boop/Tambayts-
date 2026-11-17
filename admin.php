<?php
declare(strict_types=1);

require_once __DIR__ . '/http.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$createdImagePath = null;
if (!in_array($method, ['GET', 'POST', 'PATCH', 'DELETE'], true)) {
    header('Allow: GET, POST, PATCH, DELETE');
    jsonResponse(['error' => 'Method not allowed.'], 405);
}

try {
    $db = database();
    requireRole($db, 'admin');

    if ($method === 'GET') {
        $menu = $db->query(
            "SELECT m.id, m.name, m.price, CONCAT('Stall ', m.stall_id) AS stall, m.category, m.image_url, m.is_available FROM menu_items m ORDER BY m.name, m.id"
        )->fetchAll();

        $orderRows = $db->query(
            "SELECT o.id, o.order_code, o.status, o.total, o.payment_method, o.payment_status, o.created_at, u.name AS student
             FROM orders o JOIN users u ON u.id = o.user_id
             ORDER BY o.created_at DESC, o.id DESC LIMIT 30"
        )->fetchAll();
        $itemsQuery = $db->prepare('SELECT item_name, stall, quantity, unit_price FROM ordered_food WHERE order_id = ? ORDER BY id');
        $orders = [];
        foreach ($orderRows as $row) {
            $itemsQuery->execute([$row['id']]);
            $items = $itemsQuery->fetchAll();
            $orders[] = [
                'id' => $row['order_code'],
                'names' => array_column($items, 'item_name'),
                'items' => array_map(static fn(array $item): array => [
                    'name' => $item['item_name'],
                    'stall' => $item['stall'],
                    'quantity' => (int) $item['quantity'],
                    'unitPrice' => (float) $item['unit_price'],
                ], $items),
                'total' => (float) $row['total'],
                'paymentMethod' => $row['payment_method'] === 'cash_on_pickup' ? 'Cash on pickup' : 'Cash',
                'paymentStatus' => $row['payment_status'],
                'status' => $row['status'] === 'Completed' ? 'Picked up' : $row['status'],
                'student' => $row['student'],
                'createdAt' => $row['created_at'],
            ];
        }

        $students = $db->query(
            "SELECT name, email, course
             FROM users WHERE role = 'student' ORDER BY created_at DESC"
        )->fetchAll();
        $feedbackRows = $db->query(
            "SELECT f.id, f.message, f.created_at, u.name AS student_name, u.email
             FROM student_feedback f JOIN users u ON u.id = f.student_id
             ORDER BY f.created_at DESC, f.id DESC LIMIT 200"
        )->fetchAll();
        $summary = $db->query(
            "SELECT COUNT(*) AS orders_today,
                    COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END), 0) AS sales_today
             FROM orders WHERE created_at >= CURRENT_DATE()"
        )->fetch();

        jsonResponse([
            'menu' => array_map(static fn(array $item): array => [
                'id' => (int) $item['id'],
                'name' => $item['name'],
                'price' => (float) $item['price'],
                'stall' => $item['stall'],
                'category' => $item['category'],
                'imageUrl' => $item['image_url'] ?: menuItemImageUrl((int) $item['id']),
                'available' => (bool) $item['is_available'],
            ], $menu),
            'orders' => $orders,
            'students' => $students,
            'feedback' => array_map(static fn(array $row): array => [
                'id' => (int) $row['id'],
                'studentName' => $row['student_name'],
                'email' => $row['email'],
                'message' => $row['message'],
                'createdAt' => date('M j, Y g:i A', strtotime($row['created_at'])),
                'createdAtIso' => date(DATE_ATOM, strtotime($row['created_at'])),
            ], $feedbackRows),
            'summary' => [
                'ordersToday' => (int) $summary['orders_today'],
                'salesToday' => (float) $summary['sales_today'],
                'studentCount' => (int) $db->query("SELECT COUNT(*) FROM users WHERE role = 'student'")->fetchColumn(),
            ],
        ]);
    }

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $payload = stripos($contentType, 'multipart/form-data') === 0 ? $_POST : requestJson();
    $action = $payload['action'] ?? '';

    if ($method === 'POST' && $action === 'add-menu') {
        $name = trim((string) ($payload['name'] ?? ''));
        $category = strtolower(trim((string) ($payload['category'] ?? '')));
        $stall = trim((string) ($payload['stall'] ?? ''));
        $price = filter_var($payload['price'] ?? null, FILTER_VALIDATE_FLOAT);
        $allowedCategories = ['meals', 'add_ons', 'drinks', 'snacks', 'healthy', 'pasta'];
        if ($name === '' || strlen($name) > 120 || !in_array($category, $allowedCategories, true)
            || $stall === '' || strlen($stall) > 80
            || $price === false || $price < 0 || $price > 99999999.99) {
            jsonResponse(['error' => 'Choose a valid category and enter a valid name, stall, and non-negative price.'], 400);
        }
        $stallId = preg_match('/^Stall ([1-7])$/', $stall, $stallMatch) === 1 ? (int) $stallMatch[1] : null;
        if ($stallId === null) jsonResponse(['error' => 'Choose one of the listed stalls.'], 400);
        $duplicate = $db->prepare('SELECT id FROM menu_items WHERE LOWER(name) = LOWER(?) AND stall_id = ? LIMIT 1');
        $duplicate->execute([$name, $stallId]);
        if ($duplicate->fetchColumn() !== false) {
            jsonResponse(['error' => 'A menu item with that name already exists at this stall.'], 409);
        }

        $imageUrl = null;
        $imageExtension = null;
        $temporaryPath = null;
        if (isset($_FILES['image']) && is_array($_FILES['image'])) {
            $image = $_FILES['image'];
            $uploadError = (int) ($image['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($uploadError !== UPLOAD_ERR_NO_FILE) {
                if ($uploadError !== UPLOAD_ERR_OK) {
                    jsonResponse(['error' => 'The photo could not be uploaded. Choose another image and try again.'], 400);
                }
                $temporaryPath = (string) ($image['tmp_name'] ?? '');
                $fileSize = (int) ($image['size'] ?? 0);
                if ($fileSize < 1 || $fileSize > 5 * 1024 * 1024) {
                    jsonResponse(['error' => 'Food photos must be 5 MB or smaller.'], 400);
                }
                $imageInfo = $temporaryPath !== '' ? @getimagesize($temporaryPath) : false;
                $mimeType = is_array($imageInfo) ? ($imageInfo['mime'] ?? '') : '';
                $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
                if (!isset($extensions[$mimeType])) {
                    jsonResponse(['error' => 'Use a valid JPEG, PNG, or WebP photo.'], 400);
                }
                $width = (int) ($imageInfo[0] ?? 0);
                $height = (int) ($imageInfo[1] ?? 0);
                if ($width < 1 || $height < 1 || $width > 6000 || $height > 6000 || $width * $height > 25000000) {
                    jsonResponse(['error' => 'The photo dimensions are too large. Use an image up to 25 megapixels.'], 400);
                }

                $imageExtension = $extensions[$mimeType];
            }
        }
        $db->beginTransaction();
        $insert = $db->prepare(
            'INSERT INTO menu_items (name, price, stall_id, category, is_available) VALUES (?, ?, ?, ?, 1)'
        );
        $insert->execute([$name, number_format((float) $price, 2, '.', ''), $stallId, $category]);
        $itemId = (int) $db->lastInsertId();
        if ($imageExtension !== null && is_string($temporaryPath)) {
            $uploadDirectory = dirname(__DIR__) . '/uploads/menu';
            if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
                throw new RuntimeException('Unable to create the menu photo upload directory.');
            }
            $imageUrl = 'uploads/menu/food-' . $itemId . '.' . $imageExtension;
            $createdImagePath = dirname(__DIR__) . '/' . $imageUrl;
            if (!move_uploaded_file($temporaryPath, $createdImagePath)) {
                $createdImagePath = null;
                throw new RuntimeException('Unable to save the menu photo.');
            }
        }
        $db->commit();
        $createdImagePath = null;
        jsonResponse(['message' => 'Menu item added.', 'id' => $itemId, 'imageUrl' => $imageUrl], 201);
    }

    if ($method === 'PATCH' && $action === 'set-menu-availability') {
        $id = filter_var($payload['id'] ?? null, FILTER_VALIDATE_INT);
        $available = $payload['available'] ?? null;
        if ($id === false || $id < 1 || !is_bool($available)) {
            jsonResponse(['error' => 'Menu item ID and availability are required.'], 400);
        }
        $update = $db->prepare('UPDATE menu_items SET is_available = ? WHERE id = ?');
        $update->execute([$available ? 1 : 0, $id]);
        if ($update->rowCount() === 0 && !$db->query("SELECT 1 FROM menu_items WHERE id = " . (int) $id)->fetchColumn()) {
            jsonResponse(['error' => 'Menu item not found.'], 404);
        }
        jsonResponse(['message' => 'Menu availability updated.']);
    }

    if (in_array($method, ['PATCH', 'POST'], true) && $action === 'edit-menu') {
        $id = filter_var($payload['id'] ?? null, FILTER_VALIDATE_INT);
        $name = trim((string) ($payload['name'] ?? ''));
        $stall = trim((string) ($payload['stall'] ?? ''));
        $price = filter_var($payload['price'] ?? null, FILTER_VALIDATE_FLOAT);
        if ($id === false || $id < 1 || $name === '' || strlen($name) > 120
            || $stall === '' || strlen($stall) > 80
            || $price === false || $price < 0 || $price > 99999999.99) {
            jsonResponse(['error' => 'Enter a valid food name, stall, and non-negative price.'], 400);
        }
        $stallId = preg_match('/^Stall ([1-7])$/', $stall, $stallMatch) === 1 ? (int) $stallMatch[1] : null;
        if ($stallId === null) jsonResponse(['error' => 'Choose one of the listed stalls.'], 400);
        $exists = $db->prepare('SELECT id FROM menu_items WHERE id = ? LIMIT 1');
        $exists->execute([$id]);
        if ($exists->fetchColumn() === false) {
            jsonResponse(['error' => 'Menu item not found. Refresh the dashboard and try again.'], 404);
        }
        $duplicate = $db->prepare('SELECT id FROM menu_items WHERE LOWER(name) = LOWER(?) AND stall_id = ? AND id <> ? LIMIT 1');
        $duplicate->execute([$name, $stallId, $id]);
        if ($duplicate->fetchColumn() !== false) {
            jsonResponse(['error' => 'A menu item with that name already exists at this stall.'], 409);
        }
        $imageUrl = null;
        $temporaryPath = null;
        if (isset($_FILES['image']) && is_array($_FILES['image'])) {
            $image = $_FILES['image'];
            $uploadError = (int) ($image['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($uploadError !== UPLOAD_ERR_NO_FILE) {
                if ($uploadError !== UPLOAD_ERR_OK) {
                    jsonResponse(['error' => 'The photo could not be uploaded. Choose another image and try again.'], 400);
                }
                $temporaryPath = (string) ($image['tmp_name'] ?? '');
                $fileSize = (int) ($image['size'] ?? 0);
                $imageInfo = $temporaryPath !== '' ? @getimagesize($temporaryPath) : false;
                $mimeType = is_array($imageInfo) ? ($imageInfo['mime'] ?? '') : '';
                $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
                if ($fileSize < 1 || $fileSize > 5 * 1024 * 1024 || !isset($extensions[$mimeType])) {
                    jsonResponse(['error' => 'Choose a valid JPEG, PNG, or WebP photo up to 5 MB.'], 400);
                }
                $width = (int) ($imageInfo[0] ?? 0);
                $height = (int) ($imageInfo[1] ?? 0);
                if ($width < 1 || $height < 1 || $width > 6000 || $height > 6000 || $width * $height > 25000000) {
                    jsonResponse(['error' => 'The photo dimensions are too large. Use an image up to 25 megapixels.'], 400);
                }
                $uploadDirectory = dirname(__DIR__) . '/uploads/menu';
                if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
                    throw new RuntimeException('Unable to create the menu photo upload directory.');
                }
                $extension = $extensions[$mimeType];
                $imageUrl = 'uploads/menu/food-' . $id . '.' . $extension;
                $createdImagePath = dirname(__DIR__) . '/' . $imageUrl;
                if (!move_uploaded_file($temporaryPath, $createdImagePath)) {
                    $createdImagePath = null;
                    throw new RuntimeException('Unable to save the menu photo.');
                }
            }
        }
        $update = $db->prepare('UPDATE menu_items SET name = ?, stall_id = ?, price = ?, image_url = COALESCE(?, image_url) WHERE id = ?');
        $update->execute([$name, $stallId, number_format((float) $price, 2, '.', ''), $imageUrl, $id]);
        $updateFavorites = $db->prepare('UPDATE favorites SET food_name = ? WHERE food_id = ?');
        $updateFavorites->execute([$name, $id]);
        $createdImagePath = null;
        jsonResponse(['message' => 'Menu item updated.', 'imageUrl' => $imageUrl]);
    }

    if ($method === 'DELETE' && $action === 'delete-menu') {
        $id = filter_var($payload['id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) {
            jsonResponse(['error' => 'A valid menu item ID is required.'], 400);
        }
        $imageUrl = menuItemImageUrl((int) $id);
        $delete = $db->prepare('DELETE FROM menu_items WHERE id = ?');
        $delete->execute([$id]);
        if ($delete->rowCount() === 0) {
            jsonResponse(['error' => 'Menu item not found.'], 404);
        }
        if (is_string($imageUrl) && preg_match('#^uploads/menu/food-[0-9]+\.(?:jpg|png|webp)$#', $imageUrl) === 1) {
            @unlink(dirname(__DIR__) . '/' . $imageUrl);
        }
        jsonResponse(['message' => 'Menu item removed.']);
    }

    if ($method === 'PATCH' && $action === 'advance-order') {
        $orderCode = trim((string) ($payload['orderCode'] ?? ''));
        $nextStatus = match ($payload['nextStatus'] ?? '') {
            'Preparing' => 'Preparing',
            'Ready' => 'Ready',
            'Picked up' => 'Completed',
            default => null,
        };
        $previousStatus = match ($nextStatus) {
            'Preparing' => 'Pending',
            'Ready' => 'Preparing',
            'Completed' => 'Ready',
            default => null,
        };
        if ($orderCode === '' || $nextStatus === null) {
            jsonResponse(['error' => 'A valid order code and next status are required.'], 400);
        }
        if ($nextStatus === 'Completed') {
            $update = $db->prepare("UPDATE orders SET status = ?, payment_status = 'paid' WHERE order_code = ? AND status = ?");
        } else {
            $update = $db->prepare('UPDATE orders SET status = ? WHERE order_code = ? AND status = ?');
        }
        $update->execute([$nextStatus, $orderCode, $previousStatus]);
        if ($update->rowCount() !== 1) {
            jsonResponse(['error' => 'Order status could not be advanced. Refresh the dashboard and try again.'], 409);
        }
        jsonResponse(['message' => 'Order status updated.']);
    }

    if ($method === 'DELETE' && $action === 'delete-order') {
        $orderCode = trim((string) ($payload['orderCode'] ?? ''));
        if ($orderCode === '' || strlen($orderCode) > 32) {
            jsonResponse(['error' => 'A valid order code is required.'], 400);
        }
        $delete = $db->prepare('DELETE FROM orders WHERE order_code = ?');
        $delete->execute([$orderCode]);
        if ($delete->rowCount() !== 1) {
            jsonResponse(['error' => 'Order not found.'], 404);
        }
        jsonResponse(['message' => 'Order deleted.']);
    }

    jsonResponse(['error' => 'Unknown admin action.'], 400);
} catch (Throwable $exception) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    if (is_string($createdImagePath) && is_file($createdImagePath)) {
        @unlink($createdImagePath);
    }
    error_log('TamBayts admin API failed: ' . $exception->getMessage());
    jsonResponse(['error' => 'Unable to complete the admin request. Check the server and database configuration.'], 500);
}
