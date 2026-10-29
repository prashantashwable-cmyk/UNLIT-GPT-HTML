/* The server's storage on SQLite (Cloudflare Durable Object storage.sql, or node:sqlite in tests). */
const TABLES = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)',
  'CREATE TABLE IF NOT EXISTS boxes (id TEXT PRIMARY KEY, hash TEXT NOT NULL, t TEXT)',
  'CREATE TABLE IF NOT EXISTS msgs (seq INTEGER PRIMARY KEY AUTOINCREMENT, box TEXT NOT NULL, frm TEXT NOT NULL, t TEXT NOT NULL, blob TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS msgs_box ON msgs (box, seq)',
  'CREATE INDEX IF NOT EXISTS msgs_t ON msgs (t)',
  'CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, blob TEXT NOT NULL, salt TEXT NOT NULL, codeHash TEXT NOT NULL, exp TEXT NOT NULL, tries INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, box TEXT NOT NULL, t TEXT)',
  'CREATE INDEX IF NOT EXISTS subs_box ON subs (box)',
  /* big things (backups) are kept in pieces of under 1 MB, the most one row may hold */
  'CREATE TABLE IF NOT EXISTS objs (k TEXT NOT NULL, i INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (k, i))'
];
const PIECE = 900000;

/* the same storage the server core expects, on the Durable Object's SQLite (sql.exec returns a cursor) */
export function sqlStore(sql) {
  for (const q of TABLES) sql.exec(q);
  const rows = (q, ...a) => sql.exec(q, ...a).toArray(), one = (q, ...a) => rows(q, ...a)[0] || null;
  /* rate counts and "last seen" times are kept in memory, so ordinary use writes almost nothing */
  const hits = new Map(), seenAt = new Map();
  return {
    async getMeta(k) { const r = one('SELECT v FROM meta WHERE k = ?', k); return r ? r.v : null; },
    async setMeta(k, v) {
      if (k.startsWith('seen|')) { const last = seenAt.get(k) || 0; if (Date.now() - last < 10 * 60000) return; seenAt.set(k, Date.now()); }
      sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
    },
    async getBox(id) { return one('SELECT hash, t FROM boxes WHERE id = ?', id); },
    async putBox(id, v) { sql.exec('INSERT INTO boxes (id, hash, t) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, t = excluded.t', id, v.hash, v.t); },
    async delBox(id) { sql.exec('DELETE FROM boxes WHERE id = ?', id); },
    async listBoxes() { return rows('SELECT id FROM boxes ORDER BY id').map(x => x.id); },
    async addMsg(box, frm, t, blob) { sql.exec('INSERT INTO msgs (box, frm, t, blob) VALUES (?, ?, ?, ?)', box, frm, t, blob); return one('SELECT last_insert_rowid() AS id').id; },
    async listMsgs(box, after, n) { return rows('SELECT seq, frm, t, blob FROM msgs WHERE box = ? AND seq > ? ORDER BY seq LIMIT ?', box, after, n).map(m => ({ seq: m.seq, from: m.frm, t: m.t, blob: m.blob })); },
    async prune(before) { sql.exec('DELETE FROM msgs WHERE t < ?', before); sql.exec('DELETE FROM invites WHERE exp < ?', new Date().toISOString()); },
    async getInvite(id) { return one('SELECT blob, salt, codeHash, exp, tries FROM invites WHERE id = ?', id); },
    async putInvite(id, v) { sql.exec('INSERT INTO invites (id, blob, salt, codeHash, exp, tries) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET blob = excluded.blob, salt = excluded.salt, codeHash = excluded.codeHash, exp = excluded.exp, tries = excluded.tries', id, v.blob, v.salt, v.codeHash, v.exp, v.tries || 0); },
    async delInvite(id) { sql.exec('DELETE FROM invites WHERE id = ?', id); },
    async putSub(ep, box) { sql.exec('INSERT INTO subs (endpoint, box, t) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET box = excluded.box, t = excluded.t', ep, box, new Date().toISOString()); },
    async delSub(ep) { sql.exec('DELETE FROM subs WHERE endpoint = ?', ep); },
    async listSubs(box) { return rows('SELECT endpoint FROM subs WHERE box = ?', box); },
    async putObj(k, v) { sql.exec('DELETE FROM objs WHERE k = ?', k); for (let i = 0; i * PIECE < v.length; i++) sql.exec('INSERT INTO objs (k, i, v) VALUES (?, ?, ?)', k, i, v.slice(i * PIECE, (i + 1) * PIECE)); },
    async getObj(k) { const r = rows('SELECT v FROM objs WHERE k = ? ORDER BY i', k); return r.length ? r.map(x => x.v).join('') : null; },
    async listObj(prefix) { return rows('SELECT DISTINCT k FROM objs WHERE k >= ? AND k < ? ORDER BY k', prefix, prefix + '￿').map(x => x.k); },
    async delObj(k) { sql.exec('DELETE FROM objs WHERE k = ?', k); },
    async allow(who, max) { const k = who + '|' + Math.floor(Date.now() / 60000), n = (hits.get(k) || 0) + 1; hits.set(k, n); if (hits.size > 5000) hits.clear(); return n <= max; }
  };
}

