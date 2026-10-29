/* AIEC company server on Supabase's free plan: an Edge Function named "aiec" with the tables in Postgres.
   Address for the phones: https://<project>.supabase.co/functions/v1/aiec
   Deploy with core.mjs and pgstore.mjs beside this file, "Verify JWT" off (phones bring their own tokens),
   after running PG_TABLES from pgstore.mjs once in the SQL editor. */
import postgres from 'npm:postgres@3.4.5';
import { handle } from './core.mjs';
import { pgStore } from './pgstore.mjs';

const store = pgStore(postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 }));
const env = { ADMIN_SECRET: Deno.env.get('ADMIN_SECRET') || '', VAPID_SUBJECT: Deno.env.get('VAPID_SUBJECT') || '' };

Deno.serve(req => {
  /* the phones talk to ".../functions/v1/aiec/health"; the core expects "/health" */
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^(\/functions\/v1)?\/aiec(?=\/|$)/, '') || '/';
  return handle(new Request(url, req), env, store);
});
