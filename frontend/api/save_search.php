<?php
declare(strict_types=1);

require_once __DIR__ . '/db_connect.php';

require_method('POST');
require_same_origin();

$requestData = read_request_data();
$userId = current_user_id();
$searchText = normalize_search_text($requestData['search_text'] ?? null);

$statement = db()->prepare(
    'INSERT INTO search_history (user_id, search_text)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE searched_at = CURRENT_TIMESTAMP'
);
$statement->bind_param('is', $userId, $searchText);
$statement->execute();

json_response([
    'success' => true,
    'message' => 'Search saved.',
    'search' => [
        'search_text' => $searchText
    ]
]);
