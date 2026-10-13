const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const client = require('prom-client');
const { validatePatient } = require('./validate');

const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || 'dev';
const SLOT = process.env.SLOT || 'local';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || 'app',
  database: process.env.DB_NAME || 'patients',
  max: 5,
});

// ---------- Prometheus metrics (scraped by Prometheus, shown in Grafana) ----------
client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
});
new client.Gauge({
  name: 'patients_total',
  help: 'Number of patient records in the database',
  async collect() {
    try {
      const r = await pool.query('SELECT COUNT(*)::int AS n FROM patients');
      this.set(r.rows[0].n);
    } catch (e) { /* db down: leave last value */ }
  },
});
new client.Gauge({ name: 'app_info', help: 'App version and deployment slot', labelNames: ['version', 'slot'] })
  .labels(VERSION, SLOT).set(1);

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(helmet());            // security headers (CSP, HSTS-ready, etc.)
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'other';
    httpRequests.inc({ method: req.method, route, status: res.statusCode });
    end({ method: req.method, route });
  });
  next();
});

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

async function audit(action, detail) {
  try {
    await pool.query('INSERT INTO audit_log(action, detail, slot, version) VALUES ($1,$2,$3,$4)',
      [action, detail || null, SLOT, VERSION]);
  } catch (e) { console.error('audit failed', e.message); }
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', version: VERSION, slot: SLOT });
  } catch (e) {
    res.status(503).json({ status: 'db-unavailable', version: VERSION, slot: SLOT });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/info', (req, res) => res.json({ version: VERSION, slot: SLOT }));

app.get('/api/patients', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, age, gender, diagnosis, created_at FROM patients ORDER BY id DESC LIMIT 100');
    await audit('LIST', `${r.rowCount} records`);
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

app.post('/api/patients', async (req, res) => {
  const v = validatePatient(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  try {
    const { name, age, gender, diagnosis } = v.value;
    const r = await pool.query(
      'INSERT INTO patients(name, age, gender, diagnosis) VALUES ($1,$2,$3,$4) RETURNING id, name, age, gender, diagnosis, created_at',
      [name, age, gender, diagnosis]);   // parameterised query -> no SQL injection
    await audit('CREATE', `patient #${r.rows[0].id}`);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

app.delete('/api/patients/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await pool.query('DELETE FROM patients WHERE id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    await audit('DELETE', `patient #${id}`);
    res.status(204).end();
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

app.get('/api/audit', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, action, detail, slot, version, at FROM audit_log ORDER BY id DESC LIMIT 10');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'server error' }); }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Start (wait for DB, create tables) ----------
async function initDb() {
  for (let i = 1; i <= 30; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        age INT NOT NULL,
        gender VARCHAR(10) NOT NULL,
        diagnosis VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(20) NOT NULL,
        detail VARCHAR(200),
        slot VARCHAR(10),
        version VARCHAR(20),
        at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      return;
    } catch (e) {
      console.log(`DB not ready (${i}/30): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('database never became ready');
}

if (require.main === module) {
  initDb()
    .then(() => app.listen(PORT, () => console.log(`patient app v${VERSION} (${SLOT}) on :${PORT}`)))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = app;
