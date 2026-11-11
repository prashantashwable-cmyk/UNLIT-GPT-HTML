/* Blueprint B2 — partner company status (Applied → Under review → Verified → Active, Conditional, Suspended,
   Terminated) with a reason for every change; only Active or Conditional companies are offered new jobs; an ended
   insurance blocks new jobs; a due-diligence checklist on the company page; Silver / Gold / Platinum worked out from
   the work record (never paid for); a suspended company with open jobs gives the office a handover task. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, data, as) => page.evaluate(([type, data, as]) => perform(type, null, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, data, as]);
  const C = 'PPART1';
  const post = await ev(`Object.values(S.posts).find(p => jobWhyNot('${C}', p) === null).id`);
  assert(await ev(`partnerStatus('${C}') === 'ACTIVE'`), 'a company set up before this rule with a valid licence counts as Active');
  assert(await ev(`partnerStatus('PPART2') === 'ACTIVE' && partnerTier('PPART2').tier === 'silver'`), 'a new company starts at Silver');
  /* rules */
  assert((await act('PARTNER_STATUS_SET', { uid: C, status: 'SUSPENDED', reason: '' }, 'PADMIN')).err === 'err_reason', 'a status change needs a reason');
  assert((await act('PARTNER_STATUS_SET', { uid: C, status: 'SUSPENDED', reason: 'Safety breach' }, 'PSALES')).err, 'Sales cannot change a company status');
  assert((await act('PARTNER_STATUS_SET', { uid: 'PTECH', status: 'ACTIVE', reason: 'x' }, 'PADMIN')).err === 'err_no_user', 'only partner companies have a status');
  assert((await act('PARTNER_STATUS_SET', { uid: C, status: 'SUSPENDED', reason: 'Worker without harness at P003' }, 'PADMIN')).ok, 'Admin suspends a company with a reason');
  assert(await ev(`jobWhyNot('${C}', S.posts['${post}']) === 'why_pstatus'`), 'a suspended company is not offered new jobs');
  const ho = await ev(`Object.values(S.projects).filter(P => needs(P).some(n => n.k === 'partner_handover')).map(P => P.id)`);
  assert(ho.length && await ev(`${JSON.stringify(ho)}.every(id => S.projects[id].partner === '${C}' && OPEN_STAGES.includes(S.projects[id].stage))`), 'each open job of the suspended company asks the office for a handover plan: ' + ho.join(','));
  assert((await act('PARTNER_STATUS_SET', { uid: C, status: 'CONDITIONAL', reason: 'Safety retraining done, extra QC on next 2 jobs' }, 'PADMIN')).ok && await ev(`jobWhyNot('${C}', S.posts['${post}']) === null`), 'Conditional can take jobs again');
  assert(!(await ev(`Object.values(S.projects).some(P => needs(P).some(n => n.k === 'partner_handover'))`)), 'the handover tasks go');
  assert(await ev(`S.workers['${C}'].pstLog.length === 2`), 'every change is kept in the company history');
  /* due diligence and insurance */
  assert((await act('PARTNER_DD_SET', { uid: C, item: 'insurance', ok: true, note: '', expiry: '2027-01-01' }, 'PADMIN')).err === 'err_fill', 'a check needs a note of what was seen');
  assert((await act('PARTNER_DD_SET', { uid: C, item: 'insurance', ok: true, note: 'TATA AIG CAR policy 991', expiry: '2026-10-01' }, 'PADMIN')).ok, 'the insurance check is recorded with its end date');
  assert(await ev(`jobWhyNot('${C}', S.posts['${post}']) === 'why_insurance'`), 'an ended insurance blocks new jobs');
  assert((await act('PARTNER_DD_SET', { uid: C, item: 'insurance', ok: true, note: 'Renewed, policy 1204', expiry: '2027-10-01' }, 'PADMIN')).ok && await ev(`jobWhyNot('${C}', S.posts['${post}']) === null`), 'after renewal the company is offered jobs again');
  assert((await act('PARTNER_STATUS_SET', { uid: 'PPART2', status: 'ACTIVE', reason: 'x' }, 'PADMIN')).ok, '(Active is allowed with a valid licence)');
  await page.evaluate(() => { const l = licOf('PPART2'); l._e = l.licExpiry; l.licExpiry = '2020-01-01'; });
  assert((await act('PARTNER_STATUS_SET', { uid: 'PPART2', status: 'ACTIVE', reason: 'x' }, 'PADMIN')).err === 'err_why_licence', 'Active is refused without a valid lift licence');
  await page.evaluate(() => { const l = licOf('PPART2'); l.licExpiry = l._e; delete l._e; });
  /* tiers */
  assert(await ev(`(() => { const r = partnerTier('${C}'); return r.tier === 'silver' && /finished jobs/.test(r.why); })()`), 'the tier says why');
  assert(await ev(`tierOf(12, 95, 0, 90) === 'platinum' && tierOf(12, 95, 1, 90) === 'gold' && tierOf(4, 80, 0, 50) === 'gold' && tierOf(4, 70, 0, 90) === 'silver' && tierOf(2, 100, 0, 99) === 'silver'`), 'a long clean record gives Platinum; one strike drops it to Gold; few jobs or rework stay Silver');
  /* the company page */
  await page.evaluate(c => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('worker', { uid: c }); }, C); await page.waitForTimeout(300);
  let txt = await page.innerText('main');
  assert(/Company status and checks/.test(txt) && /Conditional/.test(txt) && /Due-diligence checks/.test(txt) && /Electrical contractor licence/.test(txt) && /Renewed, policy 1204/.test(txt), 'the company page shows the status, the reason and the checklist');
  assert(/cannot be bought/.test(txt), 'it says the tier is never paid for');
  assert(!!(await page.$('[data-v^="pStatus||"]')) && !!(await page.$('[data-v^="ddCheck||"]')), 'Admin can change the status and record checks');
  await page.click('[data-v^="pStatus||"]'); await page.waitForTimeout(300);
  assert(/Choose the company status/.test(await page.innerText('main')), 'the status wizard opens');
  await page.evaluate(() => { W = null; });
  await page.evaluate(c => { loginAs(S.users[c]); ACT.permsDone(); Notify.hide(); go('worker', { uid: c }); }, C); await page.waitForTimeout(300);
  assert(/Company status and checks/.test(await page.innerText('main')) && !(await page.$('[data-v^="pStatus||"]')), 'the company sees its own status but cannot change it');
  /* rebuild */
  assert(await ev(`(() => { const S2 = rebuild(EVENTS); return S2.workers['${C}'].pst.s === 'CONDITIONAL' && S2.workers['${C}'].dd.insurance.expiry === '2027-10-01'; })()`), 'status and checks survive a rebuild');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP2 PARTNERS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
