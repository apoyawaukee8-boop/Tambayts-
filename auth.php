<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';

function authLogin(PDO $db, int $id, string $role): array
{
    startAuthSession();
    session_regenerate_id(true);
    $userIds = is_array($_SESSION['user_ids'] ?? null) ? $_SESSION['user_ids'] : [];
    $previousId = $_SESSION['user_id'] ?? null;
    $previousRole = $_SESSION['role'] ?? null;
    if (in_array($previousRole, ['student', 'admin'], true) && (is_int($previousId) || ctype_digit((string) $previousId))) {
        $userIds[$previousRole] = (int) $previousId;
    }
    $userIds[$role] = $id;
    $_SESSION['user_ids'] = $userIds;
    unset($_SESSION['user_id'], $_SESSION['role']);
    $user = sessionUser($db, $role) ?? [];
    session_write_close();
    return $user;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    $db = database();
    if ($method === 'GET') {
        // Older student pages may still request this endpoint without a role.
        // Keep them signed in when both student and admin sessions are present.
        $role = $_GET['role'] ?? 'student';
        if (!in_array($role, ['student', 'admin'], true)) {
            jsonResponse(['error' => 'Invalid account role.'], 400);
        }
        jsonResponse(['user' => sessionUser($db, $role)]);
    }
    if ($method !== 'POST') { header('Allow: GET, POST'); jsonResponse(['error' => 'Method not allowed.'], 405); }
    $payload = requestJson();
    $action = $payload['action'] ?? 'login';
    if ($action === 'logout') {
        $role = $payload['role'] ?? null;
        if ($role !== null && !in_array($role, ['student', 'admin'], true)) {
            jsonResponse(['error' => 'Invalid account role.'], 400);
        }
        startAuthSession();
        if ($role !== null && isset($_SESSION['user_ids']) && is_array($_SESSION['user_ids'])) {
            unset($_SESSION['user_ids'][$role]);
            if ($_SESSION['user_ids'] !== []) {
                jsonResponse(['message' => 'Signed out.']);
            }
        } elseif ($role !== null && isset($_SESSION['role']) && $_SESSION['role'] !== $role) {
            jsonResponse(['message' => 'Signed out.']);
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $params['path'], 'domain' => $params['domain'], 'secure' => $params['secure'], 'httponly' => $params['httponly'], 'samesite' => $params['samesite'] ?? 'Lax']);
        }
        session_destroy();
        jsonResponse(['message' => 'Signed out.']);
    }
    if ($action === 'update-profile') {
        $user = requireRole($db, 'student');
        $name = trim((string)($payload['name'] ?? $user['name']));
        $course = trim((string)($payload['course'] ?? $user['course'] ?? ''));
        $gender = trim((string)($payload['gender'] ?? $user['gender'] ?? ''));
        $allowedGenders = ['', 'Man', 'Woman', 'Non-binary', 'Prefer not to disclose'];
        if ($name === '' || strlen($name) > 120 || mb_strlen($course, 'UTF-8') > 120 || !in_array($gender, $allowedGenders, true)) {
            jsonResponse(['error' => 'Enter a name and keep both fields within 120 characters.'], 400);
        }
        $update = $db->prepare('UPDATE users SET name = ?, course = ?, gender = ? WHERE id = ?');
        $update->execute([$name, $course ?: null, $gender ?: null, $user['id']]);
        $updateFavorites = $db->prepare('UPDATE favorites SET student_name = ? WHERE student_id = ?');
        $updateFavorites->execute([$name, $user['id']]);
        jsonResponse(['user' => sessionUser($db, 'student')]);
    }
    if ($action === 'register') {
        $name = trim((string)($payload['name'] ?? ''));
        $email = strtolower(trim((string)($payload['email'] ?? '')));
        $password = (string)($payload['password'] ?? '');
        $course = trim((string)($payload['course'] ?? ''));
        $gender = trim((string)($payload['gender'] ?? ''));
        $allowedGenders = ['', 'Man', 'Woman', 'Non-binary', 'Prefer not to disclose'];
        if ($name === '' || strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190 || strlen($password) < 8 || strlen($password) > 200 || mb_strlen($course, 'UTF-8') > 120 || !in_array($gender, $allowedGenders, true)) {
            jsonResponse(['error' => 'Enter a name, valid email, course (optional), and password with at least 8 characters.'], 400);
        }
        $clientId = sprintf('%04x%04x-%04x-4%03x-%x%03x-%012x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(0, 4095), random_int(8, 11), random_int(0, 4095), random_int(0, 0xffffffffffff));
        try {
            $insert = $db->prepare("INSERT INTO users (name,email,password_hash,role,client_id,course,gender) VALUES (?,?,?,'student',?,?,?)");
            $insert->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $clientId, $course ?: null, $gender ?: null]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') jsonResponse(['error' => 'That email is already registered.'], 409);
            throw $e;
        }
        jsonResponse(['message' => 'Account created. Please sign in.'], 201);
    }
    if ($action !== 'login') jsonResponse(['error' => 'Unknown authentication action.'], 400);
    $email = strtolower(trim((string)($payload['email'] ?? '')));
    $password = (string)($payload['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) jsonResponse(['error' => 'Enter a valid email and password.'], 400);
    $query = $db->prepare('SELECT id, password_hash, role FROM users WHERE email = ? LIMIT 1');
    $query->execute([$email]);
    $account = $query->fetch();
    if (!$account || !password_verify($password, $account['password_hash'])) jsonResponse(['error' => 'Email or password is incorrect.'], 401);
    jsonResponse(['user' => authLogin($db, (int)$account['id'], $account['role'])]);
} catch (Throwable $e) {
    error_log('TamBayts auth API failed: ' . $e->getMessage());
    jsonResponse(['error' => 'Unable to complete sign in. Check the server and database configuration.'], 500);
}
