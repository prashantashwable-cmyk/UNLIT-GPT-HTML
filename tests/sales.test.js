/* Sales and money: rate card with start dates and versions, negotiation history and ladder, customer's offer, quotation validity, below-floor price needs Owner + second person, profit per job. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const P = 'AIEC-P010';
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');

  /* rate card */
  const cost0 = await ev('priceCfg().costAuto');
  assert((await act('CONFIG_SET', null, { key: 'costAuto', value: 330000, from: '2020-01-01' }, 'POWNER')).err === 'err_date', 'new rates cannot start in the past');
  const later = await ev('addDays(10)');
  assert((await act('CONFIG_SET', null, { key: 'costAuto', value: 330000, from: later }, 'POWNER')).ok, 'the Owner sets a new lift cost starting in 10 days');
  assert(await ev('priceCfg().costAuto') === cost0 && await ev(`priceCfg("${later}T12:00:00Z").costAuto`) === 330000 && await ev('ratePending().length') === 1, 'today\'s quotes still use the old cost; the new one is waiting for its date');
  const v0 = await ev('rateVersion()');
  assert((await act('CONFIG_SET', null, { key: 'costAuto', value: 310000 }, 'POWNER')).ok && await ev('priceCfg().costAuto') === 310000 && await ev('rateVersion()') === v0 + 1, 'a change from today applies at once and the rate card version goes up');

  /* a new lead through to a sent quotation */
  await act('LEAD_ACCEPTED', P, {}, 'PSALES');
  await act('CONTACT_LOGGED', P, { channel: 'call', outcome: 'interested', note: '' }, 'PSALES');
  await act('REQ_SAVED', P, { req: { use: 'apartment', stops: 5, capacity: '6', type: 'auto', finish: 'ss', shaft: 'yes', power: 'yes', timeline: '3m' } }, 'PSALES');
  assert((await act('QUOTE_CREATED', P, { discountPct: 0 }, 'PSALES')).ok && await ev(`lastQuote(S.projects["${P}"]).rv`) === v0 + 1 && await ev(`lastQuote(S.projects["${P}"]).cost`) > 0, 'the quotation keeps the rate card version it used');
  await act('QUOTE_SENT', P, { channel: 'whatsapp' }, 'PSALES');
  const total = await ev(`lastQuote(S.projects["${P}"]).total`);

  /* negotiation */
  assert((await act('COUNTER_OFFER', P, { amount: Math.round(total * 0.9) , note: 'Builder next door paid less' }, 'PSALES')).ok, 'Sales records the customer\'s offer');
  await page.evaluate(async P => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); await wiz('quote', P); }, P); await page.waitForTimeout(200);
  const qtxt = await page.innerText('main');
  assert(/Price talks so far/.test(qtxt) && /Customer offered/.test(qtxt) && /about 10% discount needed/.test(qtxt) && await page.$('[data-a="discSet"][data-v="10"]'), 'the quotation screen shows earlier quotes, the customer\'s offer, the discount it needs and the ladder steps');
  assert(!(await page.$('[data-a="discSet"][data-v="35"]')), 'the ladder stops at the Sales discount limit');

  /* validity */
  await page.evaluate(P => { lastQuote(S.projects[P]).sent.t = new Date(Date.now() - 40 * 864e5).toISOString(); }, P);
  assert((await act('DEAL_WON', P, {}, 'PSALES')).err === 'err_quote_expired', 'an expired quotation cannot be won');
  assert(await ev(`myTasks(S.users.PSALES).some(n => n.k === "requote" && n.pid === "${P}")`), 'Sales is asked to make a new quotation');
  await act('QUOTE_CREATED', P, { discountPct: 10, reason: 'Matching customer offer' }, 'PSALES'); await act('QUOTE_SENT', P, { channel: 'visit' }, 'PSALES');
  assert((await act('DEAL_WON', P, {}, 'PSALES')).ok, 'a fresh quotation can be won');

  /* below the margin floor */
  const P9 = 'AIEC-P009';
  await page.evaluate(P9 => { const x = S.projects[P9]; x.stage = 'quoted'; x.lost = null; }, P9);
  assert((await act('QUOTE_CREATED', P9, { discountPct: 70, reason: 'Big builder, many towers' }, 'PSALES')).ok && await ev(`S.projects["${P9}"].stage`) === 'quote_approval', 'a deep discount goes for approval');
  assert(await ev(`lastQuote(S.projects["${P9}"]).margin < S.config.minMargin`), '…it is below the margin floor');
  assert((await act('QUOTE_DECISION', P9, { decision: 'approve', reason: 'ok' }, 'PADMIN')).err === 'err_role', 'the Admin cannot approve a price below the floor');
  assert((await act('QUOTE_DECISION', P9, { decision: 'approve', reason: 'Strategic customer' }, 'POWNER')).ok && await ev(`S.projects["${P9}"].stage`) === 'quote_approval', 'the Owner\'s approval waits for a second person');
  const aid = await ev('S.approvalOrder.find(id => S.approvals[id].status === "pending" && S.approvals[id].action.type === "QUOTE_DECISION")');
  assert((await act('APPROVAL_DECIDED', null, { aid, decision: 'approve' }, 'POWNER')).err === 'err_same_person', 'the Owner cannot be his own second person');
  assert((await act('APPROVAL_DECIDED', null, { aid, decision: 'approve' }, 'PADMIN')).ok && await ev(`S.projects["${P9}"].stage`) === 'quote_ready', 'the Admin agrees as second person; the quotation is approved');

  /* profit (office only) */
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-P001', tab: 'money' }); }); await page.waitForTimeout(250);
  assert(/Profit on this job/.test(await page.innerText('main')) && /Markup/.test(await page.innerText('main')), 'the Owner sees margin and markup on the job');
  await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-P001', tab: 'money' }); }); await page.waitForTimeout(200);
  assert(!/Profit on this job/.test(await page.innerText('main')), 'Sales does not');
  const own = await page.evaluate(() => { App.me = S.users.PADMIN; const p = exportPack('person', 'PTECH'); return JSON.stringify(p.events.filter(e => e.type === 'COUNTER_OFFER' || (e.type === 'CONFIG_SET' && e.data.key === 'costAuto'))); });
  assert(!/310000|330000/.test(own), 'rates and offers are not in a technician\'s file');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['POWNER', 'rules', {}], ['POWNER', 'project', { pid: 'AIEC-P001', tab: 'money' }], ['PSALES', 'project', { pid: P, tab: 'money' }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async P9 => { LANG = 'mr'; loginAs(S.users.PSALES); const x = S.projects[P9]; x.stage = 'quoted'; await wiz('decision', P9); }, P9); await page.waitForTimeout(100);
  await page.evaluate(async P9 => { await wiz('counter', P9); }, P9); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SALES PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
