<?php
declare(strict_types=1);

require_once __DIR__ . '/db_connect.php';

require_method('POST');
require_same_origin();

$userId = current_user_id();
$statement = db()->prepare('DELETE FROM search_history WHERE user_id = ?');
$statement->bind_param('i', $userId);
$statement->execute();

json_response([
    'success' => true,
    'message' => 'Recent searches cleared.',
    'deleted_count' => $statement->affected_rows
]);
