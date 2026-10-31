CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('owner','admin','planner','manager','client','vendor')),
  phone VARCHAR(30),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
UPDATE users SET role='admin' WHERE role='owner';
UPDATE users SET role='planner' WHERE role='manager';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','planner','client','vendor'));
CREATE TABLE IF NOT EXISTS weddings (
  id SERIAL PRIMARY KEY,
  couple_name VARCHAR(180) NOT NULL,
  city VARCHAR(100) NOT NULL,
  wedding_date DATE NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 0,
  theme VARCHAR(160), package_type VARCHAR(80) NOT NULL DEFAULT 'Full-Service',
  budget NUMERIC(14,2) NOT NULL DEFAULT 0, status VARCHAR(40) NOT NULL DEFAULT 'Planning',
  client_id INTEGER REFERENCES users(id), planner_id INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS enquiries (
  id SERIAL PRIMARY KEY, couple_name VARCHAR(180) NOT NULL, source VARCHAR(50) NOT NULL, event_date DATE,
  city VARCHAR(100), guest_count INTEGER, theme VARCHAR(160), budget NUMERIC(14,2), stage VARCHAR(40) NOT NULL DEFAULT 'New',
  agreement_status VARCHAR(40) NOT NULL DEFAULT 'Draft', owner_id INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendor_quotes (
  id SERIAL PRIMARY KEY, wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE, vendor_id INTEGER REFERENCES users(id),
  vendor_name VARCHAR(160) NOT NULL, category VARCHAR(80) NOT NULL, price_per_plate NUMERIC(12,2), total NUMERIC(14,2) NOT NULL,
  inclusions TEXT, extra_hour NUMERIC(12,2) DEFAULT 0, rating NUMERIC(3,2) DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'Open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wedding_tasks (
  id SERIAL PRIMARY KEY, wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE, title VARCHAR(220) NOT NULL,
  workstream VARCHAR(80), owner_id INTEGER REFERENCES users(id), stage VARCHAR(30) NOT NULL DEFAULT 'To plan', due_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS client_payments (
  id SERIAL PRIMARY KEY, wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE, milestone VARCHAR(120) NOT NULL,
  due_date DATE NOT NULL, amount NUMERIC(14,2) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'Planned', paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY, wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE, vendor_id INTEGER REFERENCES users(id),
  vendor_name VARCHAR(160) NOT NULL, category VARCHAR(80), agreed NUMERIC(14,2) NOT NULL DEFAULT 0, billed NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid NUMERIC(14,2) NOT NULL DEFAULT 0, extra NUMERIC(14,2) NOT NULL DEFAULT 0, note TEXT, arrived BOOLEAN NOT NULL DEFAULT FALSE, rating NUMERIC(3,2) DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedule_items (
  id SERIAL PRIMARY KEY, wedding_id INTEGER NOT NULL REFERENCES weddings(id) ON DELETE CASCADE, event_time TIME NOT NULL,
  title VARCHAR(200) NOT NULL, owner_id INTEGER REFERENCES users(id), vendor_name VARCHAR(160), state VARCHAR(30) NOT NULL DEFAULT 'On track'
);
CREATE INDEX IF NOT EXISTS idx_weddings_client ON weddings(client_id);
CREATE INDEX IF NOT EXISTS idx_weddings_planner ON weddings(planner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wedding ON wedding_tasks(wedding_id, stage);
CREATE INDEX IF NOT EXISTS idx_quotes_wedding ON vendor_quotes(wedding_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_wedding ON client_payments(wedding_id, due_date);
CREATE INDEX IF NOT EXISTS idx_vendors_wedding ON vendors(wedding_id);
CREATE INDEX IF NOT EXISTS idx_schedule_wedding ON schedule_items(wedding_id, event_time);
