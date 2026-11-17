USE tambayts_db;

CREATE TABLE IF NOT EXISTS student_cart_items (
  student_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, menu_item_id),
  CONSTRAINT fk_student_cart_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_cart_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
  CONSTRAINT chk_student_cart_quantity CHECK (quantity BETWEEN 1 AND 100)
) ENGINE=InnoDB;
