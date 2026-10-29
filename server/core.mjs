/* AIEC Elevator OS — company mailbox (stage 1).
   The server never sees readable business data: phones encrypt every message before sending.
   It only decides who may put into and take from each box:
   - "inbox": every registered phone may put its own new records; only office phones may read it.
   - one box per person: only office phones may put; only that person (and the office) may read.
   Tokens are never stored, only their SHA-256 fingerprints. */

export const VERSION = '1';
const MAX_BLOB = 900 * 1024, PAGE = 50, KEEP_DAYS = 120, PER_MIN = 600;
const ID = /^[A-Za-z0-9_-]{2,40}$/;

const enc = new TextEncoder();
export async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(String(s)));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function same(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Box', 'Access-Control-Max-Age': '86400' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });

/* who is calling: the office (office token) or one person (their box id + token) */
async function caller(req, store) {
  const m = /^Bearer\s+([A-Za-z0-9]{20,128})$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const h = await sha256hex(m[1]), office = await store.getMeta('officeHash');
  if (office && same(h, office)) return { office: true, box: 'office' };
  const id = req.headers.get('X-Box') || '';
  if (!ID.test(id)) return null;
  const box = await store.getBox(id);
  return box && same(h, box.hash) ? { office: false, box: id } : null;
}

export async function handle(req, env, store) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url), parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const body = async () => { try { return await req.json(); } catch (e) { return null; } };
  try {
    if (req.method === 'GET' && parts[0] === 'health') return json(200, { ok: true, version: VERSION, ready: !!(await store.getMeta('officeHash')) });

    /* one-time setup (or a reset after a lost office key) with the secret set when the server was created */
    if (req.method === 'POST' && parts[0] === 'setup') {
      const b = await body();
      if (!env.ADMIN_SECRET || !b || !same(await sha256hex(b.adminSecret || ''), await sha256hex(env.ADMIN_SECRET))) return json(403, { error: 'bad_secret' });
      if (!/^[0-9a-f]{64}$/.test(b.officeHash || '')) return json(400, { error: 'bad_request' });
      await store.setMeta('officeHash', b.officeHash);
      if (b.org) await store.setMeta('org', String(b.org).slice(0, 40));
      return json(200, { ok: true });
    }

    const who = await caller(req, store);
    if (!who) return json(401, { error: 'not_allowed' });
    if (!(await store.allow(who.box, PER_MIN))) return json(429, { error: 'too_many' });

    /* the office adds, changes or removes a person's box (removing it stops that phone at once) */
    if (parts[0] === 'box' && parts[1]) {
      if (!who.office) return json(403, { error: 'office_only' });
      const id = parts[1];
      if (!ID.test(id) || ['inbox', 'office'].includes(id)) return json(400, { error: 'bad_box' });
      if (req.method === 'PUT') { const b = await body(); if (!/^[0-9a-f]{64}$/.test((b && b.hash) || '')) return json(400, { error: 'bad_request' }); await store.putBox(id, { hash: b.hash, t: new Date().toISOString() }); return json(200, { ok: true }); }
      if (req.method === 'DELETE') { await store.delBox(id); return json(200, { ok: true }); }
    }
    if (req.method === 'GET' && parts[0] === 'boxes') {
      if (!who.office) return json(403, { error: 'office_only' });
      return json(200, { boxes: await store.listBoxes() });
    }

    /* put an encrypted message into a box */
    if (req.method === 'POST' && parts[0] === 'send' && parts[1]) {
      const to = parts[1];
      if (to === 'inbox') { /* anyone registered */ }
      else if (!who.office) return json(403, { error: 'office_only' });
      else if (!ID.test(to) || !(await store.getBox(to))) return json(404, { error: 'no_box' });
      const b = await body();
      if (!b || typeof b.blob !== 'string' || !b.blob.length || b.blob.length > MAX_BLOB || !/^[A-Za-z0-9+/=.]+$/.test(b.blob)) return json(413, { error: 'bad_blob' });
      const seq = await store.addMsg(to, who.box, new Date().toISOString(), b.blob);
      if (seq % 50 === 0) await store.prune(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
      return json(200, { ok: true, seq });
    }

    /* take new messages from a box after a position */
    if (req.method === 'GET' && parts[0] === 'recv' && parts[1]) {
      const box = parts[1];
      if (!who.office && box !== who.box) return json(403, { error: 'not_your_box' });
      const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
      const msgs = await store.listMsgs(box, after, PAGE);
      return json(200, { msgs, more: msgs.length === PAGE });
    }
    return json(404, { error: 'not_found' });
  } catch (e) {
    return json(500, { error: 'server_error' });
  }
}

/* storage kept in memory: used by the tests and for trying the server on a laptop */
export function memoryStore() {
  const meta = new Map(), boxes = new Map(), msgs = [], hits = new Map();
  let seq = 0;
  return {
    msgs,
    async getMeta(k) { return meta.has(k) ? meta.get(k) : null; },
    async setMeta(k, v) { meta.set(k, v); },
    async getBox(id) { return boxes.get(id) || null; },
    async putBox(id, v) { boxes.set(id, v); },
    async delBox(id) { boxes.delete(id); },
    async listBoxes() { return [...boxes.keys()]; },
    async addMsg(box, frm, t, blob) { msgs.push({ seq: ++seq, box, frm, t, blob }); return seq; },
    async listMsgs(box, after, n) { return msgs.filter(m => m.box === box && m.seq > after).slice(0, n).map(m => ({ seq: m.seq, from: m.frm, t: m.t, blob: m.blob })); },
    async prune(before) { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].t < before) msgs.splice(i, 1); },
    async allow(who, max) { const k = who + '|' + Math.floor(Date.now() / 60000), n = (hits.get(k) || 0) + 1; hits.set(k, n); return n <= max; }
  };
}

/* storage on Cloudflare D1 (see schema.sql) */
export function d1Store(db) {
  return {
    async getMeta(k) { const r = await db.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first(); return r ? r.v : null; },
    async setMeta(k, v) { await db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run(); },
    async getBox(id) { return await db.prepare('SELECT hash, t FROM boxes WHERE id = ?').bind(id).first(); },
    async putBox(id, v) { await db.prepare('INSERT INTO boxes (id, hash, t) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, t = excluded.t').bind(id, v.hash, v.t).run(); },
    async delBox(id) { await db.prepare('DELETE FROM boxes WHERE id = ?').bind(id).run(); },
    async listBoxes() { const r = await db.prepare('SELECT id FROM boxes ORDER BY id').all(); return r.results.map(x => x.id); },
    async addMsg(box, frm, t, blob) { const r = await db.prepare('INSERT INTO msgs (box, frm, t, blob) VALUES (?, ?, ?, ?)').bind(box, frm, t, blob).run(); return r.meta.last_row_id; },
    async listMsgs(box, after, n) { const r = await db.prepare('SELECT seq, frm, t, blob FROM msgs WHERE box = ? AND seq > ? ORDER BY seq LIMIT ?').bind(box, after, n).all(); return r.results.map(m => ({ seq: m.seq, from: m.frm, t: m.t, blob: m.blob })); },
    async prune(before) { await db.prepare('DELETE FROM msgs WHERE t < ?').bind(before).run(); },
    async allow(who, max) {
      const k = 'rate|' + who + '|' + Math.floor(Date.now() / 60000);
      await db.prepare('INSERT INTO meta (k, v) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1').bind(k).run();
      const r = await db.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first();
      return +r.v <= max;
    }
  };
}
