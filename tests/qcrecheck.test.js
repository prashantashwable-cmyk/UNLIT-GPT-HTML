/* QC independence: a passed lift picked at random is re-checked by a second QC (never the first inspector or the crew);
   a disagreement goes to the office; QC never inspects their own company's work; QC is paid for every inspection. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = n => page.evaluate(n => Array.from({ length: n }, (_, i) => ({ id: 'E' + rid(8), m: 'x', kind: 'photo', label: 'recheck', t: nowISO(), gps: null, hash: 'h' + rid(6), dev: 'practice', q: {} })), n);
  /* a second QC exists; every pass is picked for this test */
  await page.evaluate(async () => { const salt = 'abababab'; await perform('USER_ADDED', null, { uid: 'PQC2', name: 'Kiran QC', role: 'qc', salt, pin: await pinHash('2222', salt), pinLen: 4 }, { as: 'PADMIN', quiet: true }); S.config.qcRecheckPct = 100; });
  const P = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.stage === 'handover' || x.stage === 'amc'); P.recheck = { first: lastPass(P) ? lastPass(P).by : 'PQC', t: nowISO(), done: null }; return P.id; });
  assert(await page.evaluate(p => myTasks(S.users.PQC2).some(n => n.k === 'qc_recheck' && n.pid === p) && !myTasks(S.users.PQC).some(n => n.k === 'qc_recheck' && n.pid === p), P), 'the re-check goes to the second QC, never the first inspector');
  assert((await act('QC_RECHECK_DONE', P, { result: 'pass', ev: await ph(1) }, 'PQC')).err === 'err_own_job', 'the first inspector cannot re-check their own pass');
  assert((await act('QC_RECHECK_DONE', P, { result: 'fail', ev: await ph(1) }, 'PQC2')).err === 'err_reason', 'disagreeing needs a reason');
  assert((await act('QC_RECHECK_DONE', P, { result: 'fail', note: 'Door gap 9 mm, not 6', ev: await ph(1) }, 'PQC2')).ok, 'the second QC records a disagreement');
  assert(await page.evaluate(p => myTasks(S.users.PADMIN).some(n => n.k === 'recheck_failed' && n.pid === p), P), 'the office is asked to review it');
  await page.evaluate(p => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); wiz('recheckReview', p); }, P); await page.waitForTimeout(300);
  assert(/Door gap 9 mm/.test(await page.innerText('main')), 'Admin sees what the second QC found');
  await page.fill('#f_note', 'Called both inspectors; door re-adjusted'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await page.evaluate(p => !!S.projects[p].recheck.reviewed && !myTasks(S.users.PADMIN).some(n => n.k === 'recheck_failed' && n.pid === p), P), 'reviewed and closed');
  assert(await page.evaluate(p => earnings('PQC2').some(e => e.pid === p && e.what === 'earn_qc_recheck' && e.amount > 0), P), 'the second QC is paid for the re-check, whatever the result');

  /* a QC from the installing crew's company cannot do the final inspection */
  const own = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.tech && companyOf(x.tech)); if (!P) return 'none'; const keep = S.users.PQC.company; S.users.PQC.company = companyOf(P.tech); const st = P.stage; P.stage = 'qc_final';
    const v = validate(S, { type: 'QC_FINAL_RESULT', pid: P.id, by: 'PQC', t: nowISO(), data: { outcome: 'pass', checks: {}, crit: {}, ev: [] } }); S.users.PQC.company = keep; P.stage = st; return v && (v.k || v); });
  assert(own === 'err_own_company' || own === 'none', 'QC never inspects their own company\'s work: ' + own);
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('QC RECHECK PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
