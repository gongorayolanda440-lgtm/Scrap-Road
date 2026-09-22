// Góngora Transport — servidor Express + PostgreSQL
// Sirve la app y una API sencilla que todos los dispositivos consultan
// (despacho y choferes), para que todos vean los mismos datos.

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable de entorno DATABASE_URL (la base de datos de Postgres).');
  process.exit(1);
}
if (!APP_PASSWORD) {
  console.warn('AVISO: no configuraste APP_PASSWORD. La app quedará abierta para cualquiera con el enlace.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // necesario para conectarse a Postgres de Render
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- sesión simple compartida ---------------- */
const sessions = new Set();
function requireAuth(req, res, next) {
  if (!APP_PASSWORD) return next(); // sin contraseña configurada: abierta
  const sid = req.cookies && req.cookies.sr_session;
  if (sid && sessions.has(sid)) return next();
  return res.status(401).json({ error: 'no_session' });
}
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!APP_PASSWORD || password === APP_PASSWORD) {
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.add(sid);
    res.cookie('sr_session', sid, {
      httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 1000 * 60 * 60 * 24 * 60,
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'bad_password' });
});
app.post('/api/logout', (req, res) => {
  const sid = req.cookies && req.cookies.sr_session;
  if (sid) sessions.delete(sid);
  res.clearCookie('sr_session');
  res.json({ ok: true });
});
app.get('/api/session', (req, res) => {
  const sid = req.cookies && req.cookies.sr_session;
  res.json({ needsPassword: !!APP_PASSWORD, authed: !APP_PASSWORD || (sid && sessions.has(sid)) });
});

/* ---------------- utilidades ---------------- */
function newId(prefix) { return prefix + '_' + crypto.randomBytes(6).toString('hex'); }
function num(v) { return (v === '' || v === undefined || v === null) ? null : Number(v); }

async function migrate() {
  await pool.query(`
    create table if not exists trucks(
      id text primary key, name text not null default '', plate text default '', type text default ''
    );
    create table if not exists drivers(
      id text primary key, name text not null default '', phone text default '', truck_id text
    );
    create table if not exists places(
      id text primary key, name text not null default '', address text default '', kind text default 'destino'
    );
    create table if not exists trips(
      id text primary key,
      date text, driver_id text, truck_id text, material text,
      origin_name text default '', dest_name text default '',
      est_tons numeric, status text not null default 'asignado',
      origin_ticket text default '', origin_tons numeric,
      dest_actual text default '', dest_ticket text default '', dest_tons numeric,
      notes text default '', geo jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create table if not exists config(
      key text primary key, value jsonb not null
    );
    create index if not exists trips_date_idx on trips(date desc);
  `);
}

function rowToTruck(r) { return { id: r.id, name: r.name, plate: r.plate, type: r.type }; }
function rowToDriver(r) { return { id: r.id, name: r.name, phone: r.phone, truckId: r.truck_id }; }
function rowToPlace(r) { return { id: r.id, name: r.name, address: r.address, kind: r.kind }; }
function rowToTrip(r) {
  return {
    id: r.id, date: r.date, driverId: r.driver_id, truckId: r.truck_id, material: r.material,
    originName: r.origin_name, destName: r.dest_name, estTons: r.est_tons == null ? null : Number(r.est_tons),
    status: r.status, originTicket: r.origin_ticket, originTons: r.origin_tons == null ? null : Number(r.origin_tons),
    destActual: r.dest_actual, destTicket: r.dest_ticket, destTons: r.dest_tons == null ? null : Number(r.dest_tons),
    notes: r.notes, geo: r.geo || {},
  };
}
async function ensurePlace(name, kind) {
  const n = (name || '').trim();
  if (!n) return;
  const existing = await pool.query('select id from places where name = $1', [n]);
  if (existing.rows.length === 0) {
    await pool.query('insert into places(id, name, address, kind) values ($1,$2,$3,$4)', [newId('p'), n, '', kind]);
  }
}

/* ---------------- estado completo (para carga inicial y sondeo) ---------------- */
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const [trucks, drivers, places, trips, goalRow] = await Promise.all([
      pool.query('select * from trucks order by name'),
      pool.query('select * from drivers order by name'),
      pool.query('select * from places order by name'),
      pool.query('select * from trips order by date desc, created_at desc limit 1000'),
      pool.query("select value from config where key = 'goals'"),
    ]);
    res.json({
      trucks: trucks.rows.map(rowToTruck),
      drivers: drivers.rows.map(rowToDriver),
      places: places.rows.map(rowToPlace),
      trips: trips.rows.map(rowToTrip),
      goal: goalRow.rows[0] ? goalRow.rows[0].value : { weeklyTons: 250 },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------------- camiones ---------------- */
app.post('/api/trucks', requireAuth, async (req, res) => {
  const id = newId('t');
  const { name, plate, type } = req.body || {};
  await pool.query('insert into trucks(id,name,plate,type) values ($1,$2,$3,$4)', [id, name || '', plate || '', type || '']);
  res.json({ id });
});
app.put('/api/trucks/:id', requireAuth, async (req, res) => {
  const { name, plate, type } = req.body || {};
  await pool.query('update trucks set name=coalesce($2,name), plate=coalesce($3,plate), type=coalesce($4,type) where id=$1', [req.params.id, name, plate, type]);
  res.json({ ok: true });
});
app.delete('/api/trucks/:id', requireAuth, async (req, res) => {
  await pool.query('delete from trucks where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------- choferes ---------------- */
app.post('/api/drivers', requireAuth, async (req, res) => {
  const id = newId('d');
  const { name, phone, truckId } = req.body || {};
  await pool.query('insert into drivers(id,name,phone,truck_id) values ($1,$2,$3,$4)', [id, name || '', phone || '', truckId || null]);
  res.json({ id });
});
app.put('/api/drivers/:id', requireAuth, async (req, res) => {
  const { name, phone, truckId } = req.body || {};
  await pool.query('update drivers set name=coalesce($2,name), phone=coalesce($3,phone), truck_id=$4 where id=$1', [req.params.id, name, phone, truckId || null]);
  res.json({ ok: true });
});
app.delete('/api/drivers/:id', requireAuth, async (req, res) => {
  await pool.query('delete from drivers where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------- lugares ---------------- */
app.post('/api/places', requireAuth, async (req, res) => {
  const id = newId('p');
  const { name, address, kind } = req.body || {};
  await pool.query('insert into places(id,name,address,kind) values ($1,$2,$3,$4)', [id, name || '', address || '', kind || 'destino']);
  res.json({ id });
});
app.put('/api/places/:id', requireAuth, async (req, res) => {
  const { name, address, kind } = req.body || {};
  await pool.query('update places set name=coalesce($2,name), address=coalesce($3,address), kind=coalesce($4,kind) where id=$1', [req.params.id, name, address, kind]);
  res.json({ ok: true });
});
app.delete('/api/places/:id', requireAuth, async (req, res) => {
  await pool.query('delete from places where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------- viajes ---------------- */
app.post('/api/trips', requireAuth, async (req, res) => {
  const id = newId('v');
  const b = req.body || {};
  await ensurePlace(b.originName, 'origen');
  await ensurePlace(b.destName, 'destino');
  await pool.query(
    `insert into trips(id,date,driver_id,truck_id,material,origin_name,dest_name,est_tons,status,origin_ticket,origin_tons,dest_actual,dest_ticket,dest_tons,notes,geo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [id, b.date || null, b.driverId || null, b.truckId || null, b.material || '', b.originName || '', b.destName || '',
      num(b.estTons), b.status || 'asignado', b.originTicket || '', num(b.originTons), b.destActual || '', b.destTicket || '',
      num(b.destTons), b.notes || '', JSON.stringify(b.geo || {})],
  );
  res.json({ id });
});
app.put('/api/trips/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (b.originName) await ensurePlace(b.originName, 'origen');
  if (b.destName) await ensurePlace(b.destName, 'destino');
  if (b.destActual) await ensurePlace(b.destActual, 'destino');
  const map = {
    date: 'date', driverId: 'driver_id', truckId: 'truck_id', material: 'material',
    originName: 'origin_name', destName: 'dest_name', estTons: 'est_tons', status: 'status',
    originTicket: 'origin_ticket', originTons: 'origin_tons', destActual: 'dest_actual',
    destTicket: 'dest_ticket', destTons: 'dest_tons', notes: 'notes',
  };
  const numericFields = new Set(['estTons', 'originTons', 'destTons']);
  const fields = []; const vals = [req.params.id]; let i = 2;
  for (const k in map) {
    if (b[k] !== undefined) { fields.push(`${map[k]}=$${i}`); vals.push(numericFields.has(k) ? num(b[k]) : b[k]); i++; }
  }
  if (b.geo) { fields.push(`geo = geo || $${i}::jsonb`); vals.push(JSON.stringify(b.geo)); i++; }
  if (!fields.length) return res.json({ ok: true });
  await pool.query(`update trips set ${fields.join(', ')} where id=$1`, vals);
  res.json({ ok: true });
});
app.delete('/api/trips/:id', requireAuth, async (req, res) => {
  await pool.query('delete from trips where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------------- meta semanal ---------------- */
app.put('/api/goal', requireAuth, async (req, res) => {
  const { weeklyTons } = req.body || {};
  await pool.query(
    `insert into config(key,value) values ('goals',$1) on conflict(key) do update set value=$1`,
    [JSON.stringify({ weeklyTons: num(weeklyTons) || 0 })],
  );
  res.json({ ok: true });
});

/* ---------------- borrar todo (con contraseña ya validada) ---------------- */
app.delete('/api/all', requireAuth, async (req, res) => {
  await pool.query('delete from trips');
  await pool.query('delete from drivers');
  await pool.query('delete from trucks');
  await pool.query('delete from places');
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

migrate()
  .then(() => {
    app.listen(PORT, () => console.log('Góngora Transport escuchando en el puerto ' + PORT));
  })
  .catch((e) => {
    console.error('No se pudo preparar la base de datos:', e);
    process.exit(1);
  });
