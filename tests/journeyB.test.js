/* Three options (v4 journey): one quotation can carry Good / Better / Best of the same lift (MS cabin; steel + ARD +
   light curtain; plus premium finish), with "Better" shown as the advice; the deal cannot be won until one is
   chosen, and the chosen one becomes the quotation's price and the lift's requirements. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'site', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const P = await ev('newPid()');
  await act('LEAD_CREATED', P, { safe: true, ev: await ph(2), address: 'Kothrud, Pune', name: 'Mrs. Apte', phone: '9822099901', shaft: 'yes', floors: 4, contactRole: 'owner' }, 'PFIELD');
  await act('LEAD_ACCEPTED', P, {}, 'PSALES'); await act('CONTACT_LOGGED', P, { channel: 'call', outcome: 'interested', note: '' }, 'PSALES');
  await act('REQ_SAVED', P, { req: { use: 'house', stops: 4, capacity: '6', type: 'auto', finish: 'ms', shaft: 'yes', power: 'yes', timeline: '3m' } }, 'PSALES');
  assert((await act('QUOTE_CREATED', P, { discountPct: 0, tiers: true }, 'PSALES')).ok, 'Sales makes a quotation with three options');
  const o = await ev(`lastQuote(S.projects["${P}"]).options.map(x => [x.k, x.total, x.req.finish, !!x.req.ard, !!x.req.premium])`);
  assert(o.length === 3 && o[0][1] < o[1][1] && o[1][1] < o[2][1] && o[0][2] === 'ms' && o[1][2] === 'ss' && o[1][3] && !o[1][4] && o[2][4], 'Good < Better < Best, each with its own cabin and extras: ' + o.map(x => x[0] + ' ' + x[1]).join(', '));
  assert(await ev(`lastQuote(S.projects["${P}"]).total === lastQuote(S.projects["${P}"]).options[1].total`), 'until a choice, the quotation shows the advised "Better"');
  const st = await ev(`S.projects["${P}"].stage`);
  if (st === 'quote_approval') await act('QUOTE_DECISION', P, { decision: 'approve', reason: 'ok' }, 'POWNER');
  assert((await act('QUOTE_SENT', P, { channel: 'whatsapp' }, 'PSALES')).ok, 'sent to the customer');
  await page.evaluate(P => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); go('project', { pid: P, tab: 'info' }); }, P); await page.waitForTimeout(250);
  let txt = await page.innerText('main');
  assert(/Three options/.test(txt) && /our advice/.test(txt) && await page.$('[data-a="tierPick"]'), 'the job shows the three options side by side with "choose" buttons');
  assert((await act('DEAL_WON', P, {}, 'PSALES')).err === 'err_pick_option', 'the deal cannot be won before one is chosen');
  await page.click(`[data-a="tierPick"][data-v="${P}|best"]`); await page.waitForTimeout(300);
  assert(await ev(`(q => q.chosen === 'best' && q.total === q.options[2].total)(lastQuote(S.projects["${P}"]))`) && await ev(`S.projects["${P}"].req.premium === true && S.projects["${P}"].req.finish === 'ss'`), '"Best" chosen: its price becomes the quotation and its cabin the requirement');
  assert((await act('DEAL_WON', P, {}, 'PSALES')).ok, 'now the deal is won');
  assert(/Three options/.test(await ev(`docQuote(S.projects["${P}"])`)) && /Chosen: Best/.test(await ev(`docQuote(S.projects["${P}"])`)), 'the printed quotation shows the options and the choice');
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, P]) => { LANG = l; App.set.lang = l; go('project', { pid: P, tab: 'info' }); }, [lang, P]); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY B PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
