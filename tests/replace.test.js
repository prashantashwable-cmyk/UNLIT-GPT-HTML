/* Replacing an old lift (housing societies) is its own kind of job: Sales chooses it in the needs, the quote adds removing
   the old lift, and the society's approval is mentioned. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const P = await page.evaluate(() => Object.values(S.projects).find(x => ['quoted', 'requirements', 'contacted'].includes(x.stage))?.id || Object.values(S.projects).find(x => x.stage === 'quote_approval').id);
  if (await page.evaluate(p => S.projects[p].stage === 'quote_approval', P)) await page.evaluate(p => perform('QUOTE_DECISION', p, { decision: 'reject', reason: 'again' }, { as: 'POWNER', quiet: true }), P);
  await page.evaluate(p => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); wiz('needs', p); }, P); await page.waitForTimeout(300);
  assert(await page.$('[data-a="pick"][data-k="job"][data-v="replace"]'), 'the needs start with "New lift" or "Replace an old lift"');
  await page.click('[data-a="pick"][data-k="job"][data-v="replace"]'); await page.waitForTimeout(150);
  assert(/committee's written approval/.test(await page.innerText('main')), 'for a replacement the society\'s approval is mentioned');
  const q = await page.evaluate(p => { const r = Object.assign({}, S.projects[p].req || { use: 'apartment', stops: 4, capacity: '6', type: 'auto', finish: 'ss' }); const a = calcQuote(priceCfg(), Object.assign({}, r, { job: 'new' }), 0), b = calcQuote(priceCfg(), Object.assign({}, r, { job: 'replace' }), 0);
    return { diff: b.cost - a.cost, line: b.lines.some(l => l[0] === 'ql_dismantle'), none: !a.lines.some(l => l[0] === 'ql_dismantle'), cfg: S.config.costDismantle }; }, P);
  assert(q.diff === q.cfg && q.line && q.none, 'the replacement quote adds removing the old lift at the company\'s cost (' + q.cfg + ')');
  const ok = await page.evaluate(p => perform('REQ_SAVED', p, { req: { job: 'replace', use: 'apartment', stops: 5, capacity: '6', type: 'auto', finish: 'ss', shaft: 'yes', power: 'yes', timeline: '3m' } }, { as: 'PSALES', quiet: true }).then(r => r.ok), P);
  assert(ok && await page.evaluate(p => S.projects[p].req.job === 'replace', P), 'Sales saves it as a replacement job');
  assert(await page.evaluate(() => rebuild(EVENTS.slice()) && !S.rejected.length), 'older needs without a job type stay valid');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('REPLACE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
