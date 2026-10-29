/* Cloudflare Worker entry: the company mailbox on D1. Setup steps are in server/README.md. */
import { handle, d1Store } from './core.mjs';

export default {
  async fetch(request, env) {
    return handle(request, env, d1Store(env.DB, env.BACKUP));
  },
  /* once a day: remove old rate counters */
  async scheduled(event, env) {
    await env.DB.prepare("DELETE FROM meta WHERE k LIKE 'rate|%' AND k < ?").bind('rate|~').run();
    await env.DB.prepare('DELETE FROM invites WHERE exp < ?').bind(new Date().toISOString()).run();
  }
};
