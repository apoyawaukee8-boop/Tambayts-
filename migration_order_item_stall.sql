USE tambayts_db;

ALTER TABLE ordered_food
  ADD COLUMN stall VARCHAR(80) NOT NULL DEFAULT 'Campus Stall' AFTER item_name;

UPDATE ordered_food AS ordered_item
JOIN menu_items AS menu_item ON menu_item.id = ordered_item.menu_item_id
SET ordered_item.stall = menu_item.stall;
