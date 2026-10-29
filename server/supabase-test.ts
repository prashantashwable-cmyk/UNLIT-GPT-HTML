/* A throwaway copy of the server for testing on the real Supabase engine: ".../functions/v1/aiec-test/t_<run>/health".
   Each test run gets its own empty tables (schema t_<run>), so the live company's tables are never touched.
   Replace it with a stub after testing, so nobody else can make tables. */
import postgres from 'npm:postgres@3.4.5';
import { handle } from './core.mjs';
import { pgStore, pgTables } from './pgstore.mjs';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 }), stores = new Map();

Deno.serve(async req => {
  const url = new URL(req.url), m = /^(?:\/functions\/v1)?\/aiec-test\/(t_[a-z0-9]{6,20})(\/.*)?$/.exec(url.pathname);
  if (!m) return new Response('not found', { status: 404 });
  if (!stores.has(m[1])) { await sql.unsafe(pgTables(m[1])); stores.set(m[1], pgStore(sql, m[1])); }
  url.pathname = m[2] || '/';
  return handle(new Request(url, req), {}, stores.get(m[1]));
});
