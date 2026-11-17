USE tambayts_db;
ALTER TABLE menu_items
  DROP FOREIGN KEY fk_menu_items_stall,
  ADD CONSTRAINT chk_menu_items_stall CHECK (stall_id BETWEEN 1 AND 7);

DROP TABLE stalls;
