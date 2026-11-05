CREATE DATABASE IF NOT EXISTS citmaps
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE citmaps;

CREATE TABLE IF NOT EXISTS search_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  search_text VARCHAR(255) NOT NULL,
  searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_search_history_user_text (user_id, search_text),
  KEY idx_search_history_user_recent (user_id, searched_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
