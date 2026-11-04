/* Sales speed and the field day (role-wise specs): an open lead score with reasons; "call next" for Sales with why; a
   new lead not called in time tells the Admin (not the Owner); an enquiry idle for 90 days must be kept or closed; a
   quotation ending within 3 days is urgent; a new quotation version says what changed; the job lead's daily report;
   the main switch locked and tagged in the safety photos; a work-at-height certificate with expiry. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const needsOf = pid => page.evaluate(pid => needs(S.projects[pid]).map(n => ({ k: n.k, urgent: !!n.urgent, roles: n.roles })), pid);

  /* lead score and call next */
  /* (the practice company has no lead being talked to; one is put there for this check) */
  const L = await ev(`(P => { P.sales = 'PSALES'; P.stage = 'contacted'; return P.id; })(Object.values(S.projects).find(P => P.stage === 'new'))`);
  const hs = await ev(`leadHeat(S.projects["${L}"])`);
  assert(hs.n >= 0 && hs.n <= 100 && hs.why.every(([v, k]) => v > 0 && typeof k === 'string'), 'the lead score is 0 to 100 and lists its reasons: ' + hs.n);
  const S0 = await ev(`S.projects["${L}"].sales`);
  await page.evaluate(([L, s]) => { loginAs(S.users[s]); ACT.permsDone(); Notify.hide(); go('project', { pid: L, tab: 'info' }); }, [L, S0]); await page.waitForTimeout(250);
  assert(/Lead score:/.test(await page.innerText('main')), 'Sales sees the score and why on the job');
  await page.evaluate(() => go('home')); await page.waitForTimeout(250);
  const cn = await ev(`callNext(App.me).map(x => x[2])`);
  assert(cn.length >= 1 && cn.length <= 8 && /Call next/.test(await page.innerText('main')), 'Sales home shows up to 8 people to call next, each with why: ' + cn.slice(0, 2).join(' | '));

  /* first contact */
  const A = await ev(`(P => { P.stage = 'accepted'; P.since = new Date(Date.now() - 3 * 3600e3).toISOString(); return P.id; })(S.projects["${L}"])`);
  let ns = await needsOf(A);
  assert(ns.some(n => n.k === 'call_customer' && n.urgent) && ns.some(n => n.k === 'first_contact_late' && n.roles.includes('admin') && !n.roles.includes('owner')), 'a new lead not called within 2 hours: Sales\' task turns urgent and the Admin (not the Owner) is told');

  /* idle */
  await page.evaluate(A => { const P = S.projects[A]; P.stage = 'contacted'; P.since = new Date(Date.now() - 100 * 864e5).toISOString(); P.followUp = null; }, A);
  assert((await needsOf(A)).some(n => n.k === 'lead_idle'), 'an enquiry unmoved for 90 days: keep it or close it');
  await page.evaluate(A => { S.projects[A].followUp = { due: addDays(5) }; }, A);
  assert(!(await needsOf(A)).some(n => n.k === 'lead_idle'), 'a follow-up date keeps it');

  /* quotation ending soon, and what changed */
  const Q = await ev(`(P => { const q = lastQuote(P); P.stage = 'quoted'; q.sent = { t: new Date(Date.now() - (q.validity || S.config.validityDays) * 864e5 + 2 * 864e5).toISOString(), by: 'PSALES' }; return P.id; })(Object.values(S.projects).find(P => P.quotes.length && P.stage !== 'lost'))`);
  assert((await needsOf(Q)).some(n => n.k === 'get_decision' && n.urgent), 'a quotation ending within 3 days makes the follow-up urgent');
  const qd = await ev(`(P => { const q = lastQuote(P), q2 = Object.assign({}, q, { v: q.v + 1, total: q.total + 25000, discountPct: (q.discountPct || 0) + 2, req: Object.assign({}, q.req, { stops: (+q.req.stops || 4) + 1 }) }); P.quotes.push(q2); const r = quoteDiff(P, q2); const doc = docQuote(P, q2.v); P.quotes.pop(); return { r, doc: /What changed from version/.test(doc) }; })(S.projects["${Q}"])`);
  assert(qd.r.length === 3 && qd.doc, 'a new quotation version lists what changed (total, discount, floors) and prints it: ' + qd.r.join(' | '));

  /* daily report */
  const J = await ev(`Object.values(S.projects).find(P => P.stage === 'installing').id`), T = await ev(`S.projects["${J}"].tech`);
  assert((await act('DAILY_REPORT', J, { done: 'Rails up to 4th floor' }, T)).err === 'err_fill', 'the daily report needs work done and tomorrow\'s plan');
  assert((await act('DAILY_REPORT', J, { done: 'Rails up to 4th', tomorrow: 'Cabin frame' }, 'PTECH' === T ? 'PSENIOR' : 'PTECH')).err === 'err_access', 'only the job lead sends it');
  assert((await act('DAILY_REPORT', J, { done: 'Rails up to 4th floor', material: '2 brackets short', blockers: 'No power after 3 pm', tomorrow: 'Cabin frame' }, T)).ok, 'the job lead sends the day\'s report');
  assert((await act('DAILY_REPORT', J, { done: 'again', tomorrow: 'x' }, T)).err === 'err_already', 'one report a day');
  await page.evaluate(J => { loginAs(S.users.PADMIN); go('project', { pid: J, tab: 'info' }); }, J); await page.waitForTimeout(250);
  assert(/Daily reports/.test(await page.innerText('main')), 'the office sees the daily reports on the job');

  /* safety and certificate */
  assert(await ev(`safetyNeeded(nowISO()).some(([k]) => k === 'loto') && !safetyNeeded('2026-10-20T10:00:00.000Z').some(([k]) => k === 'loto')`), 'from now the safety photos include the locked and tagged main switch; older checks stay valid');
  assert((await act('LEGAL_SET', null, { uid: T, k: 'height', no: 'WAH-2291', expiry: await ev('addDays(20)') }, 'PADMIN')).ok, 'a work-at-height certificate is recorded with its expiry');
  assert(await ev(`myTasks(S.users.PADMIN).some(n => n.k === 'legal_renew' && n.uid === "${T}")`), 'ending within 30 days, the office is reminded');

  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, s]) => { LANG = l; App.set.lang = l; loginAs(S.users[s]); go('home'); }, [lang, S0]); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SALES FIELD PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
