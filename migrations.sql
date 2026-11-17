USE tambayts_db;

ALTER TABLE users
  ADD COLUMN role ENUM('student', 'admin') NOT NULL DEFAULT 'student' AFTER password_hash,
  ADD COLUMN client_id CHAR(36) NULL,
  ADD UNIQUE KEY uq_users_client_id (client_id);

ALTER TABLE orders
  ADD COLUMN payment_method VARCHAR(40) NOT NULL DEFAULT 'cash_on_pickup' AFTER total,
  ADD COLUMN payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid' AFTER payment_method;

UPDATE orders
SET payment_status = 'paid'
WHERE status = 'Completed';
