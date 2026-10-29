/* AIEC company server on Cloudflare's free plan: one Durable Object with its own SQLite database holds everything.
   Nothing to create by hand: connect the GitHub repository to Cloudflare Workers (root folder "server") and deploy.
   The tables are made on first use. */
import { handle } from './core.mjs';
import { sqlStore } from './sqlstore.mjs';
import { DurableObject } from 'cloudflare:workers';

/* the company's one storage object: every request is handled inside it, one at a time */
export class Company extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.store = sqlStore(ctx.storage.sql); }
  async fetch(request) { return handle(request, this.env, this.store); }
}

export default {
  async fetch(request, env) {
    return env.COMPANY.get(env.COMPANY.idFromName('company')).fetch(request);
  }
};
