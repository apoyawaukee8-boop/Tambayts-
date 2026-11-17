CREATE DATABASE IF NOT EXISTS tambayts_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tambayts_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  client_id CHAR(36) NULL,
  course VARCHAR(120) NULL,
  gender VARCHAR(30) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_client_id (client_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stall_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(60) NOT NULL,
  image_url VARCHAR(255) NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY idx_menu_items_stall (stall_id),
  CONSTRAINT chk_menu_items_stall CHECK (stall_id BETWEEN 1 AND 7),
  CONSTRAINT chk_menu_items_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_code VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  total DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(40) NOT NULL DEFAULT 'cash_on_pickup',
  payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_code (order_code),
  KEY idx_orders_user_created (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_orders_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ordered_food (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  stall VARCHAR(80) NOT NULL DEFAULT 'Campus Stall',
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ordered_food_order (order_id),
  CONSTRAINT fk_ordered_food_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_ordered_food_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE SET NULL,
  CONSTRAINT chk_ordered_food_price CHECK (unit_price >= 0),
  CONSTRAINT chk_ordered_food_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS favorites (
  student_id BIGINT UNSIGNED NOT NULL,
  student_name VARCHAR(120) NOT NULL,
  food_id BIGINT UNSIGNED NOT NULL,
  food_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, food_id),
  CONSTRAINT fk_favorites_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_food FOREIGN KEY (food_id) REFERENCES menu_items (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS help_faqs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_help_faqs_question (question)
) ENGINE=InnoDB;

INSERT INTO help_faqs (question, answer, sort_order) VALUES
  ('How do I place an order?', 'Browse the available meals, add your selections to the cart, then go to checkout and confirm your order. Payment is cash on pickup.', 1),
  ('How can I track my order?', 'Open My orders or Order History. Your Active and Past orders show the latest status.', 2),
  ('Can I cancel my order?', 'You cannot cancel an order through the website. Contact the cafeteria stall directly as soon as possible to ask if it can be cancelled.', 3),
  ('What payment methods are accepted?', 'Cash is the only accepted payment method. Pay at the canteen when you pick up your order.', 4),
  ('What should I do if my order is incorrect?', 'Use Share feedback in your profile and include your order number and details. The website saves your message to the feedback database, but it does not provide live support.', 5)
ON DUPLICATE KEY UPDATE
  answer = VALUES(answer),
  sort_order = VALUES(sort_order),
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS student_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_feedback_student_created (student_id, created_at),
  CONSTRAINT fk_student_feedback_student FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
