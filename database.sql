CREATE DATABASE IF NOT EXISTS expense_management_system;
USE expense_management_system;

DROP TABLE IF EXISTS user_activities;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_items (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_activities (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_expense_user ON expense_items(user_id);
CREATE INDEX idx_expense_date ON expense_items(expense_date);
CREATE INDEX idx_activity_user ON user_activities(user_id);
CREATE INDEX idx_activity_created_at ON user_activities(created_at);
