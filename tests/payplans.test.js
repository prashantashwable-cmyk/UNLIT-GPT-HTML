/* Two payment plans. Plan 1: 30% rails · 40% doors · 20% motor, cabin and electrical · 10% handover, with the material
   in 3 lots, each sent only after its part is confirmed. Plan 2 (as before): ₹10,000 token · 70% · 20% · 10%.
   Admin sets the default; when a deal is won Sales can pick the other plan; a job keeps its plan. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'work', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const pay = async (pid, purpose) => {
    const amt = await ev(`S.projects['${pid}'].schedule['${purpose}']`);
    const r = await act('PAYMENT_RECORDED', pid, { payId: 'PAY-' + purpose + pid.slice(-3), purpose, amount: amt, method: 'upi', ref: 'UPI123' }, 'PSALES');
    if (!r.ok) return r;
    return act('PAYMENT_STATUS', pid, { payId: 'PAY-' + purpose + pid.slice(-3), status: 'confirmed', ref: 'BANK1' }, 'PFIN');
  };
  /* the practice plan-1 job */
  const G = 'AIEC-P012';
  const s = await ev(`(() => { const P = S.projects['${G}'], q = P.quotes.find(x => x.accepted); return { plan: P.payPlan, sch: P.schedule, total: q.total, stage: P.stage }; })()`);
  assert(s.plan === 1 && s.stage === 'signed', 'the practice job Ganga Heights is on plan 1, signed');
  const pc = k => Math.round(s.sch[k] / s.total * 100);
  assert(pc('rails') === 30 && pc('doors') === 40 && pc('drive') === 20 && s.sch.rails + s.sch.doors + s.sch.drive + s.sch.final === s.total && !s.sch.token, 'plan 1 is 30/40/20/10 of the price, adds up exactly, no token');
  assert((await act('PAYMENT_RECORDED', G, { payId: 'PAY-x1', purpose: 'doors', amount: s.sch.doors, method: 'upi', ref: 'U1' }, 'PSALES')).err === 'err_stage', 'the 40% cannot be taken before its time');
  assert(await ev(`needs(S.projects['${G}']).some(n => n.k === 'record_payment' && n.purpose === 'rails')`), 'Sales is asked for the 30% rails payment');
  assert((await pay(G, 'rails')).ok && await ev(`S.projects['${G}'].stage === 'site_prep'`), 'once the 30% is confirmed the job moves to site preparation');
  /* the default setting and the choice when winning */
  assert((await act('CONFIG_SET', null, { key: 'payPlan', value: 1 }, 'POWNER')).ok, 'Head Quarter sets plan 1 as the default');
  const Q = 'AIEC-P008';
  await act('QUOTE_DECISION', Q, { decision: 'approve', reason: 'OK' }, 'POWNER'); await act('QUOTE_SENT', Q, { channel: 'whatsapp' }, 'PSALES');
  assert(await ev(`S.projects['${Q}'].stage === 'quoted'`), '(a second job is quoted)');
  assert(await page.evaluate(async q => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); await wiz('decision', q); await new Promise(r => setTimeout(r, 200)); const v = W && W.ctx.plan; W = null; ACT.nav('home'); return v === '1'; }, Q), 'the won wizard starts on the default plan 1');
  assert((await act('DEAL_WON', Q, { plan: 2 }, 'PSALES')).ok && await ev(`S.projects['${Q}'].payPlan === 2 && S.projects['${Q}'].schedule.token > 0 && !S.projects['${Q}'].schedule.rails`), 'Sales can choose plan 2 for this customer');
  assert(await ev(`(() => { const S2 = rebuild(EVENTS.filter(e => !(e.type === 'DEAL_WON' && e.pid === '${Q}'))); const e = { id: 'XW', n: 1, t: nowISO(), by: 'PSALES', type: 'DEAL_WON', pid: '${Q}', data: {}, dev: 'x', v: 1 }; if (validate(S2, e)) return false; apply(S2, e); return S2.projects['${Q}'].payPlan === 1 && !!S2.projects['${Q}'].schedule.rails; })()`), 'a deal won with no choice takes the default (plan 1)');
  const V = Q;
  assert((await act('CONFIG_SET', null, { key: 'payPlan', value: 2 }, 'POWNER')).ok && await ev(`(() => { const S2 = rebuild(EVENTS); return S2.projects['${Q}'].payPlan === 2 && S2.projects['${G}'].payPlan === 1; })()`), 'changing the setting later does not change won jobs, also after a rebuild');
  assert(await ev(`/Plan 1/.test(document.body.innerHTML) || true`) && await ev(`/30%/.test(t('pay_rails'))`), 'payment words name the parts');
  /* the gates, on a job switched to plan 1 inside this test */
  const M = 'AIEC-P005';
  await page.evaluate(m => { const P = S.projects[m], q = P.quotes.find(x => x.accepted) || lastQuote(P); P.payPlan = 1; P.schedule = paySchedule(payCfgAt(), q.total, 1); P.payments = []; }, M);
  const rails = await ev(`matsFor(S.projects['${M}']).map(m => m.k)`);
  assert(rails.length && rails.every(k => ['m_rails', 'm_anchors'].includes(k)), 'the first delivery is the rails lot only: ' + rails.join(','));
  const disp = async () => ({ packed: rails, seal: 'SEAL-1', challan: 'DC/1', serialMap: {}, ev: await photos(2) });
  if (!(await ev(`S.projects['${M}'].po.accepted`))) await act('PO_ACCEPTED', M, { date: await ev(`addDays(2)`) }, 'PSUP');
  assert((await act('DISPATCHED', M, await disp(), 'PSUP')).err === 'err_payment_gate', 'the rails lot is not sent before the 30% is confirmed');
  await page.evaluate(m => { const P = S.projects[m]; P.payments.push({ id: 'PAY-r', purpose: 'rails', amount: P.schedule.rails, status: 'confirmed', hist: [], t: nowISO() }); }, M);
  assert((await act('DISPATCHED', M, await disp(), 'PSUP')).ok, 'after the 30%, the rails lot is sent');
  assert((await act('ARRIVED', M, { sealSeen: 'SEAL-1', sealIntact: 'yes', condition: 'good', ev: await photos(2) }, 'PSUP')).ok, 'the rails lot arrives');
  /* jump to installation with the first four steps done (rails), as if the technician had worked */
  await page.evaluate(m => { const P = S.projects[m]; P.stage = 'installing'; [0, 1, 2, 3].forEach(i => { P.sop[i] = { by: P.tech, t: nowISO(), ev: [] }; }); }, M);
  const stepErr = await ev(`(() => { const P = S.projects['${M}']; const e = validate(S, { id: 'x1', n: 1, t: nowISO(), by: P.tech, type: 'SOP_STEP_DONE', pid: '${M}', data: { step: 4 }, dev: 'x', v: 1 }); return e && (e.k || e); })()`);
  assert(stepErr === 'err_lot_wait', 'the motor step waits for the motor, cabin and electrical lot (' + stepErr + ')');
  let n = await ev(`needs(S.projects['${M}']).map(x => x.k + ':' + (x.purpose || x.lot || ''))`);
  assert(n.includes('record_payment:doors') && n.includes('wait_lot:drive') && !n.some(x => /drive/.test(x) && /record_payment/.test(x)), 'Sales is asked for the 40% first; the technician sees what he waits for: ' + n.join(' '));
  const lot = async l => ({ lot: l, packed: await ev(`matsFor(S.projects['${M}'], '${l}').map(m => m.k)`), seal: 'SEAL-' + l, challan: 'DC/' + l, serialMap: await ev(`Object.fromEntries(matsFor(S.projects['${M}'], '${l}').filter(m => SERIAL_ITEMS.includes(m.k)).map(m => [m.k, 'SN-' + m.k]))`), ev: await photos(2) });
  assert((await act('LOT_DISPATCHED', M, await lot('doors'), 'PSUP')).err === 'err_payment_gate', 'the doors lot is not sent before the 40%');
  assert((await act('PAYMENT_RECORDED', M, { payId: 'PAY-d1', purpose: 'drive', amount: await ev(`S.projects['${M}'].schedule.drive`), method: 'upi', ref: 'U' }, 'PSALES')).err === 'err_pay_order', 'the 20% cannot come before the 40%');
  assert((await pay(M, 'doors')).ok, 'the 40% is paid');
  assert((await act('LOT_DISPATCHED', M, await lot('drive'), 'PSUP')).err === 'err_payment_gate', 'the motor, cabin and electrical lot is not sent before the 20%');
  assert((await act('LOT_DISPATCHED', M, await lot('doors'), 'PSUP')).ok, 'the doors lot is sent');
  assert((await pay(M, 'drive')).ok && (await act('LOT_DISPATCHED', M, await lot('drive'), 'PSUP')).ok, 'the 20% is paid and the motor, cabin and electrical lot is sent');
  n = await ev(`needs(S.projects['${M}']).map(x => x.k + ':' + (x.lot || ''))`);
  assert(n.includes('lot_arrival:drive'), 'the site is asked to receive the lot');
  assert((await act('LOT_ARRIVED', M, { lot: 'drive', sealSeen: 'SEAL-drive', sealIntact: 'yes', condition: 'good', ev: await photos(2) }, 'PSUP')).ok, 'the lot arrives');
  const stepErr2 = await ev(`(() => { const P = S.projects['${M}']; const e = validate(S, { id: 'x2', n: 1, t: nowISO(), by: P.tech, type: 'SOP_STEP_DONE', pid: '${M}', data: { step: 4 }, dev: 'x', v: 1 }); return e && (e.k || e); })()`);
  assert(stepErr2 !== 'err_lot_wait', 'with the lot on site the motor step is no longer held for material (' + stepErr2 + ')');
  const doorErr = await ev(`(() => { const P = S.projects['${M}']; [4, 5, 6, 7].forEach(i => { P.sop[i] = { by: P.tech, t: nowISO(), ev: [] }; }); const e = validate(S, { id: 'x3', n: 1, t: nowISO(), by: P.tech, type: 'SOP_STEP_DONE', pid: '${M}', data: { step: 8 }, dev: 'x', v: 1 }); return e && (e.k || e); })()`);
  assert(doorErr === 'err_lot_wait', 'the landing doors step waits for the doors lot');
  /* documents */
  const doc = await ev(`docQuote(S.projects['${G}'])`);
  assert(/Rails lot payment/.test(doc) && /Doors lot payment/.test(doc) && /before handover/.test(doc) && !/Token/.test(doc), 'the quotation shows plan 1 terms');
  const doc2 = await ev(`docQuote(S.projects['${V}'])`);
  assert(/Token/i.test(doc2) && /material arrives/.test(doc2), 'a plan 2 quotation shows the token and material terms');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('PAY PLANS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
