USE tambayts_db;

CREATE TABLE IF NOT EXISTS stalls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stalls_name (name)
) ENGINE=InnoDB;

INSERT IGNORE INTO stalls (name) VALUES
  ('Stall 1'), ('Stall 2'), ('Stall 3'), ('Stall 4'), ('Stall 5'), ('Stall 6'), ('Stall 7');

INSERT IGNORE INTO stalls (name)
SELECT DISTINCT TRIM(stall)
FROM menu_items
WHERE stall IS NOT NULL AND TRIM(stall) <> '';

ALTER TABLE menu_items
  ADD COLUMN stall_id BIGINT UNSIGNED NULL AFTER id;

UPDATE menu_items AS menu_item
JOIN stalls AS stall_record ON stall_record.name = TRIM(menu_item.stall)
SET menu_item.stall_id = stall_record.id;

ALTER TABLE menu_items
  MODIFY COLUMN stall_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_menu_items_stall (stall_id),
  ADD CONSTRAINT fk_menu_items_stall FOREIGN KEY (stall_id) REFERENCES stalls (id),
  DROP COLUMN stall;
