/* The server's storage on Postgres (Supabase free plan). `sql` is a postgres.js client.
   The tables live in their own schema "aiec", which Supabase's public data API does not show. */
export const PG_TABLES = `
CREATE SCHEMA IF NOT EXISTS aiec;
REVOKE ALL ON SCHEMA aiec FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS aiec.meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS aiec.boxes (id TEXT PRIMARY KEY, hash TEXT NOT NULL, t TEXT);
CREATE TABLE IF NOT EXISTS aiec.msgs (seq BIGSERIAL PRIMARY KEY, box TEXT NOT NULL, frm TEXT NOT NULL, t TEXT NOT NULL, blob TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS msgs_box ON aiec.msgs (box, seq);
CREATE INDEX IF NOT EXISTS msgs_t ON aiec.msgs (t);
CREATE TABLE IF NOT EXISTS aiec.invites (id TEXT PRIMARY KEY, blob TEXT NOT NULL, salt TEXT NOT NULL, codehash TEXT NOT NULL, exp TEXT NOT NULL, tries INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS aiec.subs (endpoint TEXT PRIMARY KEY, box TEXT NOT NULL, t TEXT);
CREATE INDEX IF NOT EXISTS subs_box ON aiec.subs (box);
CREATE TABLE IF NOT EXISTS aiec.objs (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

export function pgStore(sql) {
  const one = async q => (await q)[0] || null;
  /* rate counts and "last seen" times are kept in memory, so ordinary use writes almost nothing */
  const hits = new Map(), seenAt = new Map();
  return {
    async getMeta(k) { const r = await one(sql`SELECT v FROM aiec.meta WHERE k = ${k}`); return r ? r.v : null; },
    async setMeta(k, v) {
      if (k.startsWith('seen|')) { const last = seenAt.get(k) || 0; if (Date.now() - last < 10 * 60000) return; seenAt.set(k, Date.now()); }
      await sql`INSERT INTO aiec.meta (k, v) VALUES (${k}, ${String(v)}) ON CONFLICT (k) DO UPDATE SET v = excluded.v`;
    },
    async getBox(id) { return one(sql`SELECT hash, t FROM aiec.boxes WHERE id = ${id}`); },
    async putBox(id, v) { await sql`INSERT INTO aiec.boxes (id, hash, t) VALUES (${id}, ${v.hash}, ${v.t}) ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, t = excluded.t`; },
    async delBox(id) { await sql`DELETE FROM aiec.boxes WHERE id = ${id}`; },
    async listBoxes() { return (await sql`SELECT id FROM aiec.boxes ORDER BY id`).map(x => x.id); },
    /* one writer at a time, so message numbers become visible in order and a reader never skips one */
    async addMsg(box, frm, t, blob) {
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(4207)`;
        return Number((await tx`INSERT INTO aiec.msgs (box, frm, t, blob) VALUES (${box}, ${frm}, ${t}, ${blob}) RETURNING seq`)[0].seq);
      });
    },
    async listMsgs(box, after, n) { return (await sql`SELECT seq, frm, t, blob FROM aiec.msgs WHERE box = ${box} AND seq > ${after} ORDER BY seq LIMIT ${n}`).map(m => ({ seq: Number(m.seq), from: m.frm, t: m.t, blob: m.blob })); },
    async prune(before) { await sql`DELETE FROM aiec.msgs WHERE t < ${before}`; await sql`DELETE FROM aiec.invites WHERE exp < ${new Date().toISOString()}`; },
    async getInvite(id) { const r = await one(sql`SELECT blob, salt, codehash, exp, tries FROM aiec.invites WHERE id = ${id}`); return r && { blob: r.blob, salt: r.salt, codeHash: r.codehash, exp: r.exp, tries: r.tries }; },
    async putInvite(id, v) { await sql`INSERT INTO aiec.invites (id, blob, salt, codehash, exp, tries) VALUES (${id}, ${v.blob}, ${v.salt}, ${v.codeHash}, ${v.exp}, ${v.tries || 0}) ON CONFLICT (id) DO UPDATE SET blob = excluded.blob, salt = excluded.salt, codehash = excluded.codehash, exp = excluded.exp, tries = excluded.tries`; },
    async delInvite(id) { await sql`DELETE FROM aiec.invites WHERE id = ${id}`; },
    async putSub(ep, box) { await sql`INSERT INTO aiec.subs (endpoint, box, t) VALUES (${ep}, ${box}, ${new Date().toISOString()}) ON CONFLICT (endpoint) DO UPDATE SET box = excluded.box, t = excluded.t`; },
    async delSub(ep) { await sql`DELETE FROM aiec.subs WHERE endpoint = ${ep}`; },
    async listSubs(box) { return [...await sql`SELECT endpoint FROM aiec.subs WHERE box = ${box}`]; },
    async putObj(k, v) { await sql`INSERT INTO aiec.objs (k, v) VALUES (${k}, ${v}) ON CONFLICT (k) DO UPDATE SET v = excluded.v`; },
    async getObj(k) { const r = await one(sql`SELECT v FROM aiec.objs WHERE k = ${k}`); return r ? r.v : null; },
    async listObj(prefix) { return (await sql`SELECT k FROM aiec.objs WHERE starts_with(k, ${prefix}) ORDER BY k COLLATE "C"`).map(x => x.k); },
    async delObj(k) { await sql`DELETE FROM aiec.objs WHERE k = ${k}`; },
    async allow(who, max) { const k = who + '|' + Math.floor(Date.now() / 60000), n = (hits.get(k) || 0) + 1; hits.set(k, n); if (hits.size > 5000) hits.clear(); return n <= max; }
  };
}
