<?php
declare(strict_types=1);

require_once __DIR__ . '/db_connect.php';

require_method('GET');

$userId = current_user_id();
$statement = db()->prepare(
    'SELECT id, search_text, searched_at
     FROM search_history
     WHERE user_id = ?
     ORDER BY searched_at DESC
     LIMIT 10'
);
$statement->bind_param('i', $userId);
$statement->execute();
$statement->bind_result($id, $searchText, $searchedAt);

$searches = [];

while ($statement->fetch()) {
    $searches[] = [
        'id' => (int) $id,
        'search_text' => $searchText,
        'searched_at' => $searchedAt
    ];
}

json_response([
    'success' => true,
    'searches' => $searches
]);
