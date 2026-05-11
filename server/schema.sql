-- ============================================================
-- NutriCare Database Schema (Supabase / PostgreSQL)
-- ============================================================

-- 1. Usuários
CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL PRIMARY KEY,
  device_id    TEXT UNIQUE NOT NULL,
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);

-- 2. Premium Tokens
CREATE TABLE IF NOT EXISTS premium_tokens (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  is_active         BOOLEAN DEFAULT true,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_premium_tokens_user_id ON premium_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_tokens_stripe_session ON premium_tokens(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- 3. Consultas
CREATE TABLE IF NOT EXISTS consultations (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_json JSONB,
  plan_json    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultations_user_id ON consultations(user_id);
