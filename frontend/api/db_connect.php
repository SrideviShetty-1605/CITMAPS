<?php
declare(strict_types=1);

session_start();

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

const DB_HOST = 'localhost';
const DB_USER = 'root';
const DB_PASS = '';
const DB_NAME = 'citmaps';
const MAX_SEARCH_LENGTH = 255;

header('X-Content-Type-Options: nosniff');

function db(): mysqli
{
    static $connection = null;

    if ($connection instanceof mysqli) {
        return $connection;
    }

    $connection = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    $connection->set_charset('utf8mb4');

    return $connection;
}

function json_response(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        json_response([
            'success' => false,
            'message' => 'Method not allowed.'
        ], 405);
    }
}

function require_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($origin === '') {
        return;
    }

    $host = $_SERVER['HTTP_HOST'] ?? '';
    $allowedOrigins = [
        'http://' . $host,
        'https://' . $host
    ];

    if (!in_array($origin, $allowedOrigins, true)) {
        json_response([
            'success' => false,
            'message' => 'Cross-origin request rejected.'
        ], 403);
    }
}

function read_request_data(): array
{
    $rawBody = file_get_contents('php://input');

    if ($rawBody === '' || $rawBody === false) {
        return $_POST;
    }

    $decoded = json_decode($rawBody, true);

    if (!is_array($decoded)) {
        json_response([
            'success' => false,
            'message' => 'Invalid JSON request body.'
        ], 400);
    }

    return $decoded;
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function normalize_search_text(mixed $value): string
{
    if (!is_string($value)) {
        json_response([
            'success' => false,
            'message' => 'Search text is required.'
        ], 422);
    }

    $text = preg_replace('/\s+/u', ' ', trim($value)) ?? '';

    if ($text === '') {
        json_response([
            'success' => false,
            'message' => 'Search text cannot be empty.'
        ], 422);
    }

    if (text_length($text) > MAX_SEARCH_LENGTH) {
        json_response([
            'success' => false,
            'message' => 'Search text must be 255 characters or fewer.'
        ], 422);
    }

    return $text;
}

function current_user_id(): int
{
    /*
     * Replace this demo fallback with your login system, for example:
     * $_SESSION['user_id'] = $authenticatedUserId;
     */
    if (!isset($_SESSION['user_id'])) {
        $_SESSION['user_id'] = 1;
    }

    $userId = filter_var(
        $_SESSION['user_id'],
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 1]]
    );

    if ($userId === false) {
        json_response([
            'success' => false,
            'message' => 'Invalid user session.'
        ], 401);
    }

    return (int) $userId;
}
