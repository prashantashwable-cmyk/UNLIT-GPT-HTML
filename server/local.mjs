/* Run the mailbox on a laptop or in tests:  ADMIN_SECRET=... node server/local.mjs 8787
   Keeps everything in memory (lost when stopped). For real use, deploy worker.mjs to Cloudflare. */
import http from 'node:http';
import { handle, memoryStore } from './core.mjs';
import { sqlStore } from './sqlstore.mjs';

/* the same storage as on Cloudflare's free plan (Durable Object SQLite), here on node:sqlite */
export async function sqliteStore() {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return sqlStore({ exec(q, ...a) { const st = db.prepare(q), rows = /^\s*SELECT/i.test(q) ? st.all(...a) : (st.run(...a), []); return { toArray: () => rows }; } });
}
export function startLocal(port, env, store = memoryStore()) {
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handle(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body }), env, store);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok({ srv, store, port: srv.address().port, close: () => new Promise(c => srv.close(c)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startLocal(+process.argv[2] || 8787, { ADMIN_SECRET: process.env.ADMIN_SECRET || '' }).then(s => console.log('AIEC mailbox on http://127.0.0.1:' + s.port));
}
