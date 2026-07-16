CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  reply TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);