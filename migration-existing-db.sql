-- Execute SOMENTE se a coluna role ainda não existir em users.
-- No banco atual do Portal Útil, conforme conferido no Cloudflare, ela já existe.
-- ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'));

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
