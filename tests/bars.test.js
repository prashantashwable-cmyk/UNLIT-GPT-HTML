/* Two bars on every responsibility: work done (only when the work has parts) and time used against the real limit, saying
   what happens at the limit; the clock shows "Paused" when the job is on hold or blocked by someone else. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { page, browser, errors } = await launch({ viewport: { width: 360, height: 760 } });
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);

  /* every task card of every role carries a bar with words */
  const roles = await page.evaluate(() => {
    const out = {};
    for (const u of Object.values(S.users).filter(x => x.active)) {
      loginAs(u); ACT.permsDone(); Notify.hide(); App.set.calmSeen = { [u.uid]: true }; App.form = { allTasks: true, openGroups: (App.tasks || []).map(n => n.k) }; go('home');
      document.querySelectorAll('details').forEach(d => d.open = true);
      const cards = [...document.querySelectorAll('main .task[data-a="openTask"]')];
      out[u.uid] = { cards: cards.length, withBar: cards.filter(c => c.querySelector('.tbar .tb')).length, labels: cards.map(c => [...c.querySelectorAll('.tbar .tbl')].map(x => x.textContent).join(' | ')) };
    }
    return out;
  });
  const total = Object.values(roles).reduce((a, r) => a + r.cards, 0), barred = Object.values(roles).reduce((a, r) => a + r.withBar, 0);
  assert(total > 20 && barred / total >= 0.9, `task cards carry bars across all roles (${barred} of ${total})`);
  const badL = Object.values(roles).flatMap(r => r.labels).filter(l => l && !/Day \d+ of \d+|day\(s\) over|h of \d+ h|Time limit passed|Paused|done ·|[Ll]icen/.test(l));
  assert(!badL.length, 'every bar says it in words, not only colour' + (badL.length ? ': ' + badL.slice(0, 4).join(' / ') : ''));

  /* honest work bars */
  const w = await page.evaluate(() => {
    const P = Object.values(S.projects).find(x => x.stage === 'installing'), H = Object.values(S.projects).find(x => x.stage === 'handover');
    return { inst: JSON.stringify(workOf({ k: 'install' }, P)), sop: sopNext(P) + '/' + SOP.length, hand: JSON.stringify(workOf({ k: 'sign_handover' }, H)), signed: SLOTS.filter(s => H.hand[s]).length, single: workOf({ k: 'review_lead' }, P), approve: workOf({ k: 'approve_quote' }, P) };
  });
  assert(w.inst === JSON.stringify({ d: +w.sop.split('/')[0], t: +w.sop.split('/')[1] }), 'installation shows steps done of all steps: ' + w.inst);
  assert(JSON.parse(w.hand).d === w.signed && JSON.parse(w.hand).t === 3, 'handover shows signatures done of 3');
  assert(w.single === null && w.approve === null, 'one-action tasks show no work bar');

  /* time bars follow the company's settings and say what happens next */
  const tm = await page.evaluate(() => { loginAs(S.users.PSALES);
    const since = new Date(Date.now() - 1.5 * 864e5).toISOString(), a = timeOf({ k: 'review_lead', roles: ['sales'], since }, null);
    const late = timeOf({ k: 'review_lead', roles: ['sales'], since: new Date(Date.now() - 4.2 * 864e5).toISOString() }, null);
    return { a, late, esc: S.config.escalateDays };
  });
  assert(Math.round(tm.a.pct) === Math.round(1.5 / tm.esc * 100) && /Day 2 of 3 · then goes to Admin/.test(tm.a.label), 'day 2 of 3 days, then it goes to Admin: ' + tm.a.label);
  assert(tm.late.pct === 100 && /2 day\(s\) over · now also with Admin/.test(tm.late.label), 'after the limit it says how late and who has it now: ' + tm.late.label);
  const tk = await page.evaluate(() => { const P = S.projects['AIEC-P001'], x = P.tickets.find(y => y.status === 'open' && ticketDue(y)); return x ? timeOf({ k: 'assign_ticket', tid: x.id, roles: ['qc'] }, P).label : 'none'; });
  assert(/h of \d+ h|Time limit passed|none/.test(tk), 'a fault ticket uses its time limit in hours: ' + tk);
  const ins = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.stage === 'installing'); return timeOf({ k: 'install', roles: ['tech'] }, P); });
  assert(ins && (/installation plan/.test(ins.label) || ins.paused), 'installation uses the installation plan days: ' + JSON.stringify(ins));

  /* fair clock: on hold or blocked by someone else = paused */
  const pz = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.stage === 'installing');
    const bl = P.blockers, inc = P.incidents; P.blockers = [{ id: 'BX', open: true, role: 'supplier', reason: 'part', t: nowISO() }]; P.incidents = [];
    const a = timeOf({ k: 'install', roles: ['tech'] }, P); P.blockers = bl; P.incidents = inc;
    P.holds = (P.holds || []).concat([{ status: 'active' }]); const b = timeOf({ k: 'install', roles: ['tech'] }, P), c = timeOf({ k: 'record_payment', roles: ['sales'], since: P.since }, P); P.holds.pop();
    return [a.paused, b.paused, c.paused]; });
  assert(/Paused: waiting for Supplier/.test(pz[0]) && /on hold/.test(pz[1]) && /on hold/.test(pz[2]), 'blocked or on-hold work shows "Paused", not red');

  /* customer: job % and their own clock, without office escalation words */
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(300);
  const ct = await page.innerText('main');
  assert(/Job \d+% done/.test(ct) && /In this step/.test(ct) && !/then goes to|now also with/.test(ct), 'the customer sees how far the job is, and their own time without office escalation');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('project', { pid: Object.values(S.projects).find(x => x.stage === 'installing').id }); }); await page.waitForTimeout(300);
  assert(/Job \d+% done/.test(await page.innerText('body')), 'the project page shows the whole job %');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PTECH); go('home'); }, lang); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BARS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
