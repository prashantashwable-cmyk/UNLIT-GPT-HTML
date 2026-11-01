/* Business rules from the second review: every rule number has a range (a margin of 100 can no longer break prices);
   escalation counts working days (Sunday and holidays off); "waiting" is information, not a task; the customer signing on
   the technician's phone needs a reason and a photo of the paper signature; a customer's yes before the quote expired can
   still win; and an Owner-only company can do everything except the documented site and outside-party work. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err), v: r.err && r.err.v })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'work'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const sgn = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);

  /* L1 limits */
  const r100 = await act('CONFIG_SET', null, { key: 'targetMargin', value: 100 }, 'POWNER');
  assert(r100.err === 'err_cfg_range' && r100.v.a === 1 && r100.v.b === 90 && /Allowed: 1 to 90/.test(await ev('errText({ k: "err_cfg_range", v: { a: 1, b: 90 } })')), 'a starting margin of 100 is refused, saying the allowed range (1 to 90)');
  const keys = await ev('Object.keys(DEFAULT_CONFIG).filter(k => typeof DEFAULT_CONFIG[k] === "number")');
  const noLim = await ev('Object.keys(DEFAULT_CONFIG).filter(k => typeof DEFAULT_CONFIG[k] === "number" && !CFG_LIMITS[k])');
  assert(!noLim.length, `every number rule has a range (${keys.length} rules)` + (noLim.length ? ': missing ' + noLim.join(', ') : ''));
  const ends = await page.evaluate(async () => { const bad = [];
    for (const [k, [a, b]] of Object.entries(CFG_LIMITS)) {
      const lo = await perform('CONFIG_SET', null, { key: k, value: a - 1 < 0 ? -1 : a - 1 }, { as: 'POWNER', quiet: true }), hi = await perform('CONFIG_SET', null, { key: k, value: b + 1 }, { as: 'POWNER', quiet: true });
      if (lo.ok || hi.ok) bad.push(k);
    } return bad; });
  assert(!ends.length, 'every rule refuses a value just below and just above its range' + (ends.length ? ': ' + ends.join(', ') : ''));
  assert((await act('CONFIG_SET', null, { key: 'remindDays', value: 5 }, 'POWNER')).err === 'err_cfg_order', 'rules that must stay in order are checked together (reminder after the Admin day is refused)');
  assert((await act('CONFIG_SET', null, { key: 'gst', value: 18 }, 'POWNER')).ok, 'a value inside the range is saved');
  await page.evaluate(() => { loginAs(S.users.POWNER); go('rules'); }); await page.waitForTimeout(250);
  assert(/allowed 1–90/.test(await page.innerText('main')), 'the rules screen shows each allowed range');

  /* L2 working days */
  const wd = await page.evaluate(() => {
    const at = (d, h) => Date.parse(d + 'T' + String(h).padStart(2, '0') + ':00:00+05:30');
    const satMorning = at('2026-10-31', 9), monMorning = at('2026-11-02', 9);
    const a = Math.floor(workDays(satMorning, monMorning)), lvA = escLevel(a, 'x');
    const keep = S.config.holidays; S.config.holidays = '2026-11-02'; const b = workDays(at('2026-10-31', 9), at('2026-11-03', 9)); S.config.holidays = keep;
    S.config.sundayWork = 1; const c = workDays(satMorning, monMorning); S.config.sundayWork = 0;
    return { a, lvA, b, c };
  });
  assert(wd.a === 1 && wd.lvA < 2, 'work started Saturday morning is 1 working day old on Monday morning, not escalated (level ' + wd.lvA + ')');
  assert(Math.round(wd.b) === 1 && Math.round(wd.c) === 2, 'holidays are not counted; if Sunday is made a working day, it counts');
  assert((await act('CONFIG_SET', null, { key: 'holidays', value: '2026-11-14, 2026-12-25' }, 'POWNER')).ok && (await act('CONFIG_SET', null, { key: 'holidays', value: 'Diwali' }, 'POWNER')).err === 'err_pay_detail', 'holidays are dates');

  /* L3 waiting is not a task */
  const w = await page.evaluate(() => { const P = S.projects['AIEC-P003']; const keep = P.sop[8]; P.sop[8] = P.sop[8] || { t: nowISO(), by: P.tech, ev: [] }; P.peer = {}; const tasks = myTasks(S.users[P.tech]).filter(n => n.pid === P.id).map(n => n.k), waits = myWaits(S.users[P.tech]).map(n => n.k); if (!keep) delete P.sop[8]; return { tasks, waits }; });
  assert(!w.tasks.some(k => k.startsWith('wait_')) && w.waits.includes('wait_peer'), 'during a co-worker check the lead has no task they cannot act on; the wait is shown as information');

  /* L4 customer signing on the technician's phone */
  const H = 'AIEC-P002', tech = await ev(`S.projects["${H}"].tech`);
  const hs = await page.evaluate(H => { const P = S.projects[H]; const keep = P.hand.customer; delete P.hand.customer; return keep ? JSON.stringify(keep) : ''; }, H);
  assert((await act('HANDOVER_SIGNED', H, { slot: 'customer', consent: true, signer: 'Mrs. Kale', ev: await sgn() }, tech)).err === 'err_hs_reason', 'the technician signing for the customer must say why and add a photo of the paper signature');
  assert((await act('HANDOVER_SIGNED', H, { slot: 'customer', consent: true, signer: 'Mrs. Kale', why: 'noapp', ev: (await sgn()).concat(await photos(1, 'handover')) }, tech)).ok, 'with the reason and photo it is saved');
  assert(await ev(`(h => h.inPerson && h.why === "noapp" && !!h.paper)(S.projects["${H}"].hand.customer)`), 'the record keeps the reason and the photo');
  assert(await ev('weekSummary().techSigned >= 1'), 'the weekly summary counts handovers signed on the technician\'s phone');
  void hs;

  /* L6 a yes before the expiry */
  const Q = await ev('Object.values(S.projects).find(P => P.stage === "quoted" || P.stage === "quote_approval").id');
  const setup = await page.evaluate(Q => { const P = S.projects[Q], q = lastQuote(P); P.stage = 'quoted'; q.sent = { t: new Date(Date.now() - 33 * 864e5).toISOString(), by: P.sales || 'PSALES' }; q.validity = 30; P.sales = P.sales || 'PSALES'; return { till: quoteValidTill(q), sales: P.sales }; }, Q);
  assert((await act('DEAL_WON', Q, {}, setup.sales)).err === 'err_quote_expired', 'an expired quote cannot simply be won');
  assert((await act('DEAL_WON', Q, { agreedOn: await ev('todayStr()') }, setup.sales)).err === 'err_late_yes', 'a yes given after the expiry is refused');
  assert((await act('DEAL_WON', Q, { agreedOn: setup.till }, setup.sales)).ok, 'a yes given on the last valid day, recorded within 7 days, wins at the quoted price');
  assert(await ev(`lastQuote(S.projects["${Q}"]).accepted.on === "${setup.till}"`), 'both dates are kept: when it was recorded and when the customer agreed');

  /* L7 an Owner-only company */
  const DELIBERATE = {
    /* physical site work: the person on site must do it */
    SHIFT_STARTED: 1, SHIFT_ENDED: 1, ARRIVED: 1, MATERIAL_HANDED: 1, SOP_STEP_DONE: 1, CLAIM_RAISED: 1, CLAIM_RECEIVED: 1, SITE_CHECKED_IN: 1, DAY_ENDED_TECH: 1, SAFETY_CHECKED: 1,
    INSPECTION_REQUESTED: 1, SERVICE_DONE: 1, PEER_CHECKED: 1, QC_RECHECK_DONE: 1, CREW_RATED: 1, SAFETY_COUNTERSIGNED: 1,
    /* outside parties act for themselves */
    PO_ACCEPTED: 1, PO_DECLINED: 1, DISPATCHED: 1, CLAIM_SENT: 1, SUPPLIER_INVOICE: 1, JOB_APPLIED: 1, JOB_WITHDRAWN: 1, LEAD_EDITED: 1, MATERIAL_RECEIPT_SIGNED: 1,
    /* a person's own complaint about their own pay */
    PAY_DISPUTED: 1
  };
  const cov = await page.evaluate(D => { const keep = {}; for (const u of Object.values(S.users)) { keep[u.uid] = u.active; if (u.role !== 'owner') u.active = false; }
    const o = Object.values(S.users).find(u => u.role === 'owner'), no = [];
    for (const [type, R] of Object.entries(RULES)) { if (!R.roles || R.roles.includes('owner') || ownerCovers(S, R, { type, by: o.uid, data: {}, t: nowISO() }, o, null)) continue; if (!D[type]) no.push(type); }
    for (const u of Object.values(S.users)) u.active = keep[u.uid]; return no; }, DELIBERATE);
  assert(!cov.length, 'an Owner-only company can do every action except the documented site work, outside parties and personal pay complaints' + (cov.length ? ': ' + cov.join(', ') : ''));
  const one = await page.evaluate(() => { const P = S.projects['AIEC-P003'], keep = {}; for (const u of Object.values(S.users)) { keep[u.uid] = u.active; if (u.uid !== P.tech && u.role !== 'owner') u.active = false; } const r = peerWaiting(Object.assign({}, P, { sop: Object.assign({}, P.sop, { 8: { t: nowISO() } }), peer: {} })).length; for (const u of Object.values(S.users)) u.active = keep[u.uid]; return r; });
  assert(one === 0, 'with nobody else to do a co-worker check, a one-technician company is not held up forever');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.POWNER); go('rules'); }, lang); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BUSINESS LOGIC PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
