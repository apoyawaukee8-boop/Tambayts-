USE tambayts_db;

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
