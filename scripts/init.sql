#!/usr/bin/env bash
# Initialise PostgreSQL schema for flexgate-labs
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE TABLE IF NOT EXISTS users (
    id          VARCHAR(36) PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    item        VARCHAR(255) NOT NULL,
    amount      NUMERIC(10,2) NOT NULL,
    status      VARCHAR(50)  NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );

  -- Seed a test user
  INSERT INTO users (id, name, email, created_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Seed User', 'seed@example.com', NOW())
  ON CONFLICT (id) DO NOTHING;
EOSQL
