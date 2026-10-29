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
/* push alerts carry no text; they only wake the phone, which then fetches its locked messages */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export function pushHostOk(endpoint, env) {
  let u; try { u = new URL(endpoint); } catch (e) { return false; }
  if (env.PUSH_TEST_HOST && u.hostname === env.PUSH_TEST_HOST) return true;
  return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname));
}
async function vapidJwt(env, aud) {
  const pub = unb64u(env.VAPID_PUBLIC);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:office@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
/* wake the phones of a box: urgent always; normal at most once in 10 minutes per box */
async function wake(env, store, box, level) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return 0;
  if (level !== 'urgent') { const k = 'wake|' + box, last = +(await store.getMeta(k)) || 0; if (Date.now() - last < 10 * 60000) return 0; await store.setMeta(k, String(Date.now())); }
  let n = 0;
  for (const sub of await store.listSubs(box)) {
    try {
      const aud = new URL(sub.endpoint).origin;
      const r = await fetch(sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: level === 'urgent' ? 'high' : 'normal', Authorization: 'vapid t=' + await vapidJwt(env, aud) + ', k=' + env.VAPID_PUBLIC, 'Content-Length': '0' } });
      if (r.status === 404 || r.status === 410) await store.delSub(sub.endpoint); else if (r.ok) n++;
    } catch (e) { /* one phone's push service being down does not stop the others */ }
  }
  return n;
}
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
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Box,X-Admin-Secret', 'Access-Control-Max-Age': '86400' };
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

async function backupRead(parts, store) {
  if (!parts[1]) {
    const metas = [];
    for (const k of (await store.listObj('bk/')).filter(k => k.endsWith('/meta'))) { const v = await store.getObj(k); if (v) metas.push(JSON.parse(v)); }
    return json(200, { backups: metas.sort((a, b) => a.id < b.id ? 1 : -1) });
  }
  if (!/^B\d{8}T\d{6}$/.test(parts[1]) || !/^\d{1,3}$/.test(parts[2] || '')) return json(400, { error: 'bad_request' });
  const v = await store.getObj('bk/' + parts[1] + '/' + parts[2]);
  return v ? new Response(v, { status: 200, headers: Object.assign({ 'Content-Type': 'text/plain' }, CORS) }) : json(404, { error: 'not_found' });
}

export async function handle(req, env, store) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url), parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const body = async () => { try { return await req.json(); } catch (e) { return null; } };
  try {
    if (req.method === 'GET' && parts[0] === 'health') return json(200, { ok: true, version: VERSION, ready: !!(await store.getMeta('officeHash')), push: !!env.VAPID_PUBLIC });
    if (req.method === 'GET' && parts[0] === 'vapid') return env.VAPID_PUBLIC ? json(200, { key: env.VAPID_PUBLIC }) : json(404, { error: 'no_push' });

    /* one-time setup (or a reset after a lost office key) with the secret set when the server was created */
    if (req.method === 'POST' && parts[0] === 'setup') {
      const b = await body();
      if (!env.ADMIN_SECRET || !b || !same(await sha256hex(b.adminSecret || ''), await sha256hex(env.ADMIN_SECRET))) return json(403, { error: 'bad_secret' });
      if (!/^[0-9a-f]{64}$/.test(b.officeHash || '')) return json(400, { error: 'bad_request' });
      await store.setMeta('officeHash', b.officeHash);
      if (b.org) await store.setMeta('org', String(b.org).slice(0, 40));
      return json(200, { ok: true });
    }

    /* a new phone opens its one-time login code (no account yet): the code itself is the key; 5 wrong tries delete it */
    if (req.method === 'POST' && parts[0] === 'invite' && parts[2] === 'open') {
      const id = parts[1];
      if (!/^[0-9a-f]{64}$/.test(id) || !(await store.allow('inv|' + id, 10))) return json(429, { error: 'too_many' });
      const inv = await store.getInvite(id), b = await body();
      if (!inv || inv.exp < new Date().toISOString()) { if (inv) await store.delInvite(id); return json(404, { error: 'no_code' }); }
      if (!b || !/^\d{6}$/.test(String(b.code || '')) || !same(await sha256hex(inv.salt + '|' + b.code), inv.codeHash)) {
        const tries = (inv.tries || 0) + 1;
        if (tries >= 5) await store.delInvite(id); else await store.putInvite(id, Object.assign({}, inv, { tries }));
        return json(403, { error: 'wrong_code', left: Math.max(0, 5 - tries) });
      }
      await store.delInvite(id);
      return json(200, { blob: inv.blob });
    }

    /* restoring after every office phone is lost: the setup secret opens the list of locked backups (the recovery code, kept only on paper, opens them) */
    const adm = req.headers.get('X-Admin-Secret');
    if (adm != null && req.method === 'GET' && parts[0] === 'backups') {
      if (!(await store.allow('admin-secret', 20))) return json(429, { error: 'too_many' });
      if (!env.ADMIN_SECRET || !same(await sha256hex(adm), await sha256hex(env.ADMIN_SECRET))) return json(403, { error: 'bad_secret' });
      return backupRead(parts, store);
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
      if (req.method === 'DELETE') { await store.delBox(id); for (const x of await store.listSubs(id)) await store.delSub(x.endpoint); return json(200, { ok: true }); }
    }
    /* the office leaves a locked file for a new phone, opened with a one-time code (valid up to 3 days) */
    if (req.method === 'PUT' && parts[0] === 'invite' && parts[1]) {
      if (!who.office) return json(403, { error: 'office_only' });
      const b = await body(), id = parts[1], max = new Date(Date.now() + 3 * 864e5).toISOString();
      if (!/^[0-9a-f]{64}$/.test(id) || !b || typeof b.blob !== 'string' || b.blob.length > MAX_BLOB || !/^[0-9a-f]{64}$/.test(b.codeHash || '') || !/^[A-Za-z0-9]{8,40}$/.test(b.salt || '') || !(b.exp > new Date().toISOString())) return json(400, { error: 'bad_request' });
      await store.putInvite(id, { blob: b.blob, salt: b.salt, codeHash: b.codeHash, exp: b.exp < max ? b.exp : max, tries: 0 });
      return json(200, { ok: true });
    }
    /* a phone asks to be woken for its box (the office phones for the inbox) */
    if (parts[0] === 'push-sub' && ['POST', 'DELETE'].includes(req.method)) {
      const b = await body(), ep = b && b.endpoint;
      if (typeof ep !== 'string' || ep.length > 600 || !pushHostOk(ep, env)) return json(400, { error: 'bad_endpoint' });
      if (req.method === 'DELETE') { await store.delSub(ep); return json(200, { ok: true }); }
      await store.putSub(ep, who.box); return json(200, { ok: true });
    }
    /* locked backups of the whole company, made by an office phone; the newest 7 are kept */
    if (parts[0] === 'backups') {
      if (!who.office) return json(403, { error: 'office_only' });
      if (req.method === 'GET') return backupRead(parts, store);
      if (req.method === 'PUT' && /^B\d{8}T\d{6}$/.test(parts[1] || '') && parts[2] != null) {
        const text = await req.text();
        if (parts[2] === 'meta') {
          let m; try { m = JSON.parse(text); } catch (e) { return json(400, { error: 'bad_request' }); }
          if (!(m.parts > 0 && m.parts < 400)) return json(400, { error: 'bad_request' });
          for (let i = 0; i < m.parts; i++) if (!(await store.getObj('bk/' + parts[1] + '/' + i))) return json(400, { error: 'missing_part' });
          await store.putObj('bk/' + parts[1] + '/meta', JSON.stringify({ id: parts[1], parts: m.parts, size: +m.size || 0, t: new Date().toISOString() }));
          const ids = (await store.listObj('bk/')).filter(k => k.endsWith('/meta')).map(k => k.split('/')[1]).sort().reverse();
          for (const old of ids.slice(7)) for (const k of await store.listObj('bk/' + old + '/')) await store.delObj(k);
          return json(200, { ok: true });
        }
        if (!/^\d{1,3}$/.test(parts[2]) || !text.length || text.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/=.]+$/.test(text)) return json(413, { error: 'bad_part' });
        await store.putObj('bk/' + parts[1] + '/' + parts[2], text);
        return json(200, { ok: true });
      }
      return json(400, { error: 'bad_request' });
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
      if (b.wake === 'urgent' || b.wake === 'normal') await wake(env, store, to === 'inbox' ? 'office' : to, b.wake);
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
  const meta = new Map(), boxes = new Map(), msgs = [], hits = new Map(), invites = new Map(), subs = new Map(), objs = new Map();
  let seq = 0;
  return {
    msgs, invites, subs, meta, objs,
    async putObj(k, v) { objs.set(k, v); },
    async getObj(k) { return objs.has(k) ? objs.get(k) : null; },
    async listObj(prefix) { return [...objs.keys()].filter(k => k.startsWith(prefix)); },
    async delObj(k) { objs.delete(k); },
    async putSub(ep, box) { subs.set(ep, box); },
    async delSub(ep) { subs.delete(ep); },
    async listSubs(box) { return [...subs].filter(([, b]) => b === box).map(([endpoint]) => ({ endpoint })); },
    async getInvite(id) { return invites.get(id) || null; },
    async putInvite(id, v) { invites.set(id, v); },
    async delInvite(id) { invites.delete(id); },
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
export function d1Store(db, bucket) {
  return {
    /* backups live in an R2 bucket (big files); without one they cannot be made */
    async putObj(k, v) { if (!bucket) throw new Error('no_bucket'); await bucket.put(k, v); },
    async getObj(k) { if (!bucket) return null; const o = await bucket.get(k); return o ? await o.text() : null; },
    async listObj(prefix) { if (!bucket) return []; const out = []; let cur; do { const r = await bucket.list({ prefix, cursor: cur }); out.push(...r.objects.map(o => o.key)); cur = r.truncated ? r.cursor : null; } while (cur); return out; },
    async delObj(k) { if (bucket) await bucket.delete(k); },
    async getInvite(id) { return await db.prepare('SELECT blob, salt, codeHash, exp, tries FROM invites WHERE id = ?').bind(id).first(); },
    async putInvite(id, v) { await db.prepare('INSERT INTO invites (id, blob, salt, codeHash, exp, tries) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET blob = excluded.blob, salt = excluded.salt, codeHash = excluded.codeHash, exp = excluded.exp, tries = excluded.tries').bind(id, v.blob, v.salt, v.codeHash, v.exp, v.tries || 0).run(); },
    async delInvite(id) { await db.prepare('DELETE FROM invites WHERE id = ?').bind(id).run(); },
    async putSub(ep, box) { await db.prepare('INSERT INTO subs (endpoint, box, t) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET box = excluded.box, t = excluded.t').bind(ep, box, new Date().toISOString()).run(); },
    async delSub(ep) { await db.prepare('DELETE FROM subs WHERE endpoint = ?').bind(ep).run(); },
    async listSubs(box) { const r = await db.prepare('SELECT endpoint FROM subs WHERE box = ?').bind(box).all(); return r.results; },
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
