CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  department_id INT UNIQUE NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash VARCHAR(255)
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

CREATE TABLE IF NOT EXISTS expense_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_id INT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  invoice_ref VARCHAR(120) NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'DECLINED')),
  reason VARCHAR(255),
  requested_by INT NOT NULL REFERENCES app_users(id),
  idempotency_key VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_txn_wallet_invoice_success
  ON expense_transactions(wallet_id, invoice_ref)
  WHERE status = 'SUCCESS';

CREATE UNIQUE INDEX IF NOT EXISTS uq_txn_wallet_idempotency
  ON expense_transactions(wallet_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_created
  ON expense_transactions(wallet_id, created_at DESC);
