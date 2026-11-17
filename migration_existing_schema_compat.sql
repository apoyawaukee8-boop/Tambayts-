USE tambayts_db;
ALTER TABLE menu_items
  ADD COLUMN stall_id BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER id,
  MODIFY COLUMN stall VARCHAR(80) NOT NULL DEFAULT 'Campus Stall',
  ADD KEY idx_menu_items_stall (stall_id),
  ADD CONSTRAINT chk_menu_items_stall CHECK (stall_id BETWEEN 1 AND 7);

ALTER TABLE favorites
  DROP FOREIGN KEY fk_favorites_menu,
  DROP FOREIGN KEY fk_favorites_user;

ALTER TABLE favorites
  CHANGE COLUMN user_id student_id BIGINT UNSIGNED NOT NULL,
  CHANGE COLUMN menu_item_id food_id BIGINT UNSIGNED NOT NULL,
  ADD COLUMN student_name VARCHAR(120) NOT NULL DEFAULT '' AFTER student_id,
  ADD COLUMN food_name VARCHAR(120) NOT NULL DEFAULT '' AFTER food_id;

ALTER TABLE favorites
  ADD CONSTRAINT fk_favorites_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_favorites_food FOREIGN KEY (food_id) REFERENCES menu_items (id) ON DELETE CASCADE;

UPDATE favorites AS favorite
JOIN users AS student ON student.id = favorite.student_id
JOIN menu_items AS food ON food.id = favorite.food_id
SET favorite.student_name = student.name,
    favorite.food_name = food.name;

RENAME TABLE order_items TO ordered_food;

ALTER TABLE ordered_food
  ADD COLUMN stall VARCHAR(80) NOT NULL DEFAULT 'Campus Stall' AFTER item_name;

UPDATE ordered_food AS ordered_item
JOIN menu_items AS food ON food.id = ordered_item.menu_item_id
SET ordered_item.stall = CONCAT('Stall ', food.stall_id);
