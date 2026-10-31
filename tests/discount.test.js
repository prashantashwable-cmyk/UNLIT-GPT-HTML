/* Discount authority: Sales alone up to 8%, Admin approves up to 18%, Head Quarter above; every discount records what the
   customer gives in return. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const P = await page.evaluate(() => Object.values(S.projects).find(x => x.req && ['quoted', 'requirements'].includes(x.stage))?.id || Object.values(S.projects).find(x => x.stage === 'quote_approval').id);
  if (await page.evaluate(p => S.projects[p].stage === 'quote_approval', P)) await act('QUOTE_DECISION', P, { decision: 'reject', reason: 'start again' }, 'POWNER');
  const st = () => page.evaluate(p => S.projects[p].stage, P);
  assert((await act('QUOTE_CREATED', P, { discountPct: 5, reason: 'x' }, 'PSALES')).err === 'err_trade', 'a discount without what the customer gives in return is refused');
  assert((await act('QUOTE_CREATED', P, { discountPct: 5, reason: 'Pays 40% advance', trade: 'advance' }, 'PSALES')).ok && await st() === 'quote_ready', 'Sales alone gives up to 8%');
  await act('QUOTE_SENT', P, { channel: 'visit' }, 'PSALES');
  assert((await act('QUOTE_CREATED', P, { discountPct: 12, reason: 'Signs AMC', trade: 'amc' }, 'PSALES')).ok && await st() === 'quote_approval', '12% needs approval');
  assert(await page.evaluate(p => myTasks(S.users.PADMIN).some(n => n.k === 'approve_quote' && n.pid === p), P), 'Admin is asked');
  assert((await act('QUOTE_DECISION', P, { decision: 'approve' }, 'PADMIN')).ok, 'Admin approves up to 18%');
  await act('QUOTE_SENT', P, { channel: 'visit' }, 'PSALES');
  assert((await act('QUOTE_CREATED', P, { discountPct: 22, reason: 'Reference tower', trade: 'reference' }, 'PSALES')).ok && await st() === 'quote_approval', '22% needs approval');
  assert(await page.evaluate(p => myTasks(S.users.POWNER).some(n => n.k === 'approve_quote' && n.pid === p) && !myTasks(S.users.PADMIN).some(n => n.k === 'approve_quote' && n.pid === p), P), 'above 18% only Head Quarter is asked');
  assert((await act('QUOTE_DECISION', P, { decision: 'approve' }, 'PADMIN')).err === 'err_role', 'Admin cannot approve above 18%');
  await page.evaluate(p => { loginAs(S.users.PADMIN); go('project', { pid: p, tab: 'money' }); }, P); await page.waitForTimeout(300);
  await page.evaluate(p => wiz('approveQuote', p), P).catch(() => { }); await page.waitForTimeout(300);
  const txt = await page.evaluate(() => document.querySelector('main').innerText);
  assert(/Given in return: Reference site we can show/.test(txt) || await page.evaluate(p => lastQuote(S.projects[p]).trade === 'reference', P), 'the quote records what was given in return');
  assert((await act('QUOTE_DECISION', P, { decision: 'approve' }, 'POWNER')).ok, 'Head Quarter approves it');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'older quotes without a trade stay valid');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('DISCOUNT PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
