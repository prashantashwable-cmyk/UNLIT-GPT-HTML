/* Workers (OCT file): a pay ledger where every rupee has a place, an optional reserve that is never taken away and is paid
   in full at exit; the contractor agreement accepted with a signature before taking jobs; training video links; appeals
   against a wrong rating; weekly and company leaderboards with bonus history; and the 70/20/10 customer payment split. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const sgn = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);

  /* pay ledger */
  const C = 'PPART1';
  const open = await ev(`weeksFor("${C}").filter(w => (!w.pay || w.pay.status === "open") && w.week < weekKey(nowISO()) && w.total > 0).map(w => ({ week: w.week, total: w.total }))`);
  assert(open.length >= 1, 'the company has earned weeks waiting for approval: ' + open.length);
  const approve = w => act('PAY_APPROVED', null, { uid: C, week: w.week, computed: w.total, adjust: 0, amount: w.total }, 'PADMIN');
  assert((await approve(open[0])).ok, 'the office approves a week');
  const p0 = await ev(`S.pay["${C}|${open[0].week}"]`);
  assert(p0.held === 0 && p0.payNow === open[0].total, 'with the reserve at 0% (the default) the whole week is paid');
  let L = await ev(`ledger("${C}")`);
  assert(L.due === open[0].total && L.outstanding === 0, 'the ledger shows it as approved, to be paid, and no reserve');
  assert((await act('CONFIG_SET', null, { key: 'reservePct', value: 95 }, 'POWNER')).err === 'err_cfg_range', 'a reserve above 90% is refused');
  if (open[1]) {
    assert((await act('CONFIG_SET', null, { key: 'reservePct', value: 50 }, 'POWNER')).ok, 'the Owner can turn a reserve on (after legal review)');
    assert((await approve(open[1])).ok, 'the next week is approved');
    const p1 = await ev(`S.pay["${C}|${open[1].week}"]`);
    assert(p1.held === Math.round(open[1].total / 2) && p1.payNow === open[1].total - p1.held, 'half is held as the contractor\'s reserve, the rest is paid now');
    L = await ev(`ledger("${C}")`);
    assert(L.outstanding === p1.held && L.outstanding > 0, 'the reserve shows as the contractor\'s balance');
    await page.evaluate(C => { S.users[C].active = false; }, C);
    assert((await tasks('PFIN')).includes('settle_reserve'), 'when a contractor stops working with us, Finance is asked to pay the whole reserve');
    assert((await act('RESERVE_SETTLED', null, { uid: C, amount: L.outstanding - 1, ref: 'NEFT1' }, 'PFIN')).err === 'err_settle_amount', 'the settlement must be the whole balance — nothing is kept back');
    assert((await act('RESERVE_SETTLED', null, { uid: C, amount: L.outstanding, ref: 'NEFT-778899' }, 'PFIN')).ok && await ev(`reserveBal("${C}") === 0`), 'the whole balance is paid with a bank reference');
    await page.evaluate(C => { S.users[C].active = true; }, C);
    await act('CONFIG_SET', null, { key: 'reservePct', value: 0 }, 'POWNER');
  }
  await page.evaluate(C => { loginAs(S.users[C]); ACT.permsDone(); Notify.hide(); go('earn', { uid: C }); }, C); await page.waitForTimeout(250);
  const es = await page.innerText('main');
  assert(/My money: where every rupee is/.test(es) && /Approved, to be paid|Paid to the bank/.test(es), 'the earnings screen starts with where every rupee is');

  /* contractor agreement */
  assert(await ev('contractOk("PPART1") && contractOk("PTECH")'), 'practice contractors have accepted the agreement');
  const post = await ev('(Object.values(S.posts).find(p => postLive(p) && p.kind !== "qc") || {}).id || ""');
  await page.evaluate(() => { delete S.contracts.PPART2; });
  assert((await tasks('PPART2')).includes('sign_contract'), 'someone who has not accepted the current agreement is asked to');
  if (post) assert((await act('JOB_APPLIED', null, { postId: post, team: {} }, 'PPART2')).err === 'err_contract', 'and cannot apply for jobs until they do');
  await page.evaluate(() => { loginAs(S.users.PPART2); ACT.permsDone(); Notify.hide(); go('contract', {}); }); await page.waitForTimeout(250);
  const ct = await page.innerText('main');
  assert(/independent contractor/.test(ct) && /accept or decline any job/.test(ct) && /never taken away/.test(ct) && /lawyer must review/.test(ct), 'the agreement says: contractor, free to decline, money never taken, lawyer review');
  assert((await act('CONTRACT_ACCEPTED', null, { v: 1, consent: true, signer: 'Om', ev: [] }, 'PPART2')).err === 'err_sign', 'acceptance needs a signature');
  assert((await act('CONTRACT_ACCEPTED', null, { v: 1, consent: true, signer: 'Om', ev: await sgn() }, 'PPART2')).ok && await ev('contractOk("PPART2")'), 'accepted with name, time and signature');
  assert((await act('CONFIG_SET', null, { key: 'agreeVersion', value: 2 }, 'POWNER')).ok && !(await ev('contractOk("PPART2")')), 'a new version must be accepted again');
  await act('CONFIG_SET', null, { key: 'agreeVersion', value: 1 }, 'POWNER');

  /* training videos */
  assert((await act('TRAINING_VIDEO_SET', null, { module: 'safety', url: 'javascript:alert(1)' }, 'PADMIN')).err === 'err_url', 'only https video links');
  assert((await act('TRAINING_VIDEO_SET', null, { module: 'safety', url: 'https://example.com/safety.mp4' }, 'PADMIN')).ok, 'the office adds a training video link');
  await page.evaluate(async () => { loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); await wiz('train', null, { module: 'safety' }); }); await page.waitForTimeout(250);
  assert(await page.evaluate(() => !!document.querySelector('a[href="https://example.com/safety.mp4"]')), 'the lesson shows a Watch the video button');

  /* rating appeal */
  const rv = await ev('(r => r && { id: r.id, uid: r.uid })(S.reviews.find(r => r.uid === "PTECH"))');
  if (rv) {
    const n0 = await ev('starsOf("PTECH").count');
    assert((await act('RATING_APPEALED', null, { rid: rv.id, reason: '' }, 'PTECH')).err === 'err_reason' && (await act('RATING_APPEALED', null, { rid: rv.id, reason: 'The door delay was the supplier part, not my work' }, 'PTECH')).ok, 'a technician can appeal a rating with a reason');
    assert((await act('RATING_APPEALED', null, { rid: rv.id, reason: 'again' }, 'PSENIOR')).err === 'err_access', 'only the rated person (or their company) can appeal it');
    assert((await tasks('PADMIN')).includes('rating_appeal'), 'the office is asked to decide');
    assert((await act('RATING_APPEAL_DECIDED', null, { rid: rv.id, ok: true, note: 'Checked: supplier part' }, 'PADMIN')).ok && await ev(`starsOf("PTECH").count === ${n0 - 1}`), 'an accepted appeal removes the rating from the stars');
  }

  /* leaderboards and bonus */
  await page.evaluate(() => { loginAs(S.users.PTECH); go('leaders', { m: 'week' }); }); await page.waitForTimeout(250);
  const lb = await page.innerText('main');
  assert(/This week/.test(lb) && /My bonus history/.test(lb) && /first time earns the lead/.test(lb), 'weekly board and a bonus history with its rule');
  await page.evaluate(() => go('leaders', {})); await page.waitForTimeout(200);
  assert(/Partner companies|Technician/.test(await page.innerText('main')), 'the monthly board ranks people and partner companies by quality');

  /* 70/20/10 for new deals */
  const sp = await ev('(c => ({ a: c.arrivalPct, c: c.cabinPct, s: paySchedule(c, 1000000) }))(payCfgAt(nowISO()))');
  assert(sp.a === 70 && sp.c === 20 && sp.s.cabin === 200000 && sp.s.token + sp.s.arrival + sp.s.cabin + sp.s.final === 1000000 && sp.s.final === 100000, 'new deals pay 70% at material arrival, 20% for the cabin, 10% at handover');
  assert(await ev('payCfgAt("2026-10-01T00:00:00.000Z").arrivalPct === S.config.arrivalPct'), 'deals won before the change keep the old split');
  assert((await act('CONFIG_SET', null, { key: 'arrivalPct', value: 80 }, 'POWNER')).ok && await ev('payCfgAt(nowISO()).arrivalPct === 80'), 'the Owner\'s own split always wins');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PPART1); go('earn', { uid: 'PPART1' }); }, lang); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('WORKERS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
