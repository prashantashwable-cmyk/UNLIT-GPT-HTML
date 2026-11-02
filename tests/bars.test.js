/* Two bars on every responsibility: work done (only when the work has parts) and time used against the real limit, saying
   what happens at the limit; the clock shows "Paused" when the job is on hold or blocked by someone else. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { page, browser, errors } = await launch({ viewport: { width: 360, height: 760 } });
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  /* this test is about the bar maths: count every day (working days are tested in bizlogic) */
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'sundayWork', value: 1 }, { as: 'POWNER', quiet: true }); });

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
  const badL = Object.values(roles).flatMap(r => r.labels).filter(l => l && !/Day \d+ of \d+|day\(s\) over|h of \d+ h|Time limit passed|Paused|done ·|[Ll]icen|no time limit|Quote valid|validity over|Needed by/.test(l));
  assert(!badL.length, 'every bar says it in words, not only colour' + (badL.length ? ': ' + badL.slice(0, 4).join(' / ') : ''));

  const one = await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); App.form = {}; go('home');
    const cards = [...document.querySelectorAll('main .task[data-a="openTask"]')]; return cards.length && cards.every(c => { const b = [...c.querySelectorAll('.tbar .tb')], l = [...c.querySelectorAll('.tbar .tbl')]; return b.length === 2 && b[0].classList.contains('tw') && /^🧩/.test(l[0].textContent) && /^⏳/.test(l[1].textContent); }); });
  assert(one, 'every task shows two bars together: progress above, deadline below');
  const pace = await page.evaluate(() => [paceBar(60, 'x', { pct: 40, label: 'Day 2 of 5' }), paceBar(20, 'x', { pct: 60, label: 'Day 3 of 5' }), paceBar(20, 'x', { pct: 100, label: 'over' }), paceBar(20, 'x', { paused: 'P' })].map(h => /tp-(\w+)/.exec(h)[1]));
  assert(JSON.stringify(pace) === '["ok","warn","bad","pause"]', 'work ahead of time = on time, behind = behind, past the limit = late, blocked = paused: ' + pace);
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
  assert(tm.late.pct === 100 && /2 day\(s\) over/.test(tm.late.label) && tm.late.who === 'Admin', 'after the limit it says how late (the escalation tag says who has it now): ' + tm.late.label);
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
  assert(/Job \d+% done\s*⏳ (Day \d+ of \d+|\d+ day\(s\) over)/.test(ct) && !/then goes to|now also with/.test(ct), 'the customer sees how far the job is, and their own time without office escalation');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('project', { pid: Object.values(S.projects).find(x => x.stage === 'installing').id }); }); await page.waitForTimeout(300);
  assert(/Job \d+% done/.test(await page.innerText('body')), 'the project page shows the whole job %');

  /* the same two bars on every responsibility, everywhere it is shown */
  const places = await page.evaluate(() => {
    const two = el => !!el && !!el.querySelector('.tbar') && [...el.querySelectorAll('.tbar')].every(b => b.querySelectorAll('.tb').length === 2), out = {};
    loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); App.form = {}; go('projects');
    const pc = [...document.querySelectorAll('#plist .task')]; out.projects = pc.length > 0 && pc.every(two);
    const A = Object.values(S.projects).find(P => P.done && P.done.amc.visits.length);
    if (A) { const d = document.createElement('div'); d.innerHTML = amcCard(A); out.amc = two(d); out.tickets = [...d.querySelectorAll('.list-item[style*="block"]')].every(two); } else out.amc = out.tickets = 'none';
    const tk = { id: 'TX', status: 'assigned', sev: 'breakdown', t: new Date(Date.now() - 2 * 3600e3).toISOString(), hist: [] }, d2 = document.createElement('div'); d2.innerHTML = ticketBars(tk, A || Object.values(S.projects)[0]);
    out.ticketStep = /Step 2 of 5/.test(d2.textContent);
    go('stattracker', {}); const sc = [...document.querySelectorAll('main .card')].filter(c => c.querySelector('.stid')); out.stat = sc.length ? sc.every(two) : 'none';
    const newbie = Object.values(S.users).find(u => u.active && onboarding(u.uid).total); if (newbie) { const d3 = document.createElement('div'); d3.innerHTML = onbCard(newbie.uid); out.onb = two(d3); } else out.onb = 'none';
    const x = { rid: 'R1', role: 'tech', name: 'Ravi', phone: '9876543210', t: new Date(Date.now() - 1.2 * 864e5).toISOString() }, d4 = document.createElement('div'); d4.innerHTML = reqBars(x, '');
    out.req = two(d4) && /Day 2 of/.test(d4.textContent);
    const all = []; for (const P of Object.values(S.projects)) for (const n of needs(P)) all.push(n); const d5 = document.createElement('div'); d5.innerHTML = allWorkCard(all.slice(0, 10));
    out.allWork = [...d5.querySelectorAll('.list-item')].every(two);
    /* natural deadlines: a sent quote runs to its validity date, an order to its need-by date */
    const Q0 = Object.values(S.projects).find(P => lastQuote(P)), Q = Q0 && Object.assign({}, Q0, { holds: [], quotes: Q0.quotes.slice(0, -1).concat([Object.assign({}, lastQuote(Q0), { sent: { t: new Date(Date.now() - 5 * 864e5).toISOString() }, validity: 30 })]) });
    out.quote = Q ? timeOf({ k: 'get_decision', roles: ['sales'] }, Q).label : 'none';
    const O = Object.values(S.projects).find(P => P.po && P.stage === 'material_order');
    out.acc = !!(O && O.po.accepted); out.po = O ? timeOf({ k: O.po.accepted ? 'dispatch' : 'accept_po', roles: ['supplier'] }, O).label : 'none';
    out.fin = /tp-fin/.test(jobBars(Object.values(S.projects).find(P => P.done) || { stage: 'amc', done: {} }));
    return out;
  });
  for (const k of ['projects', 'amc', 'tickets', 'stat', 'onb', 'req', 'allWork']) assert(places[k] === true || places[k] === 'none', 'two bars on ' + k + ': ' + places[k]);
  const O_ACC = places.acc;
  assert(places.ticketStep, 'a ticket shows its steps (assigned = step 2 of 5)');
  assert(/Quote valid 2[56] more days/.test(places.quote), 'a sent quote counts down to its validity date: ' + places.quote);
  assert(O_ACC ? /Needed by/.test(places.po) : /h of 24 h|Time limit passed/.test(places.po), 'an order counts the supplier\'s 24 hours to answer, then the need-by date: ' + places.po);
  assert(places.fin, 'finished work shows a full green "Finished" bar');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PTECH); go('home'); }, lang); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BARS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
