/* Before starting work every person knows: what they earn by it (from the same rules as the weekly pay), what they
   must do and who checks it, how far their next achievement is, and today's plan made automatically (late first,
   nearest site next, lunch 13-14, day 9-18, Sunday off, what does not fit moves to the next day). */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; go('home'); }, uid); await page.waitForTimeout(250); };
  const P = await ev(`(Object.values(S.projects).find(P => P.stage === 'install') || Object.values(S.projects).find(P => P.site.gps)).id`);
  /* 1) what you earn: the same rule as the weekly pay */
  const co = await ev(`S.users.PTECH.company`);
  const p1 = await ev(`taskPay({ k: 'install', pid: '${P}' }, S.users.PTECH)`);
  const rule = await ev(`Math.round(S.config.paySopStep * gradeRate(gradeOf('PTECH')) / 100)`);
  assert(p1.value === rule && p1.co === co && p1.mine === null, 'a company technician sees the work value of a step (' + p1.value + '), labelled for the company');
  const r = await page.evaluate(([co]) => perform('COMPANY_SHARE_SET', null, { uid: 'PTECH', pct: 60 }, { as: co, quiet: true }).then(x => x.ok), [co]);
  assert(r && await ev(`taskPay({ k: 'install', pid: '${P}' }, S.users.PTECH).mine === Math.round(${rule} * 0.6)`), 'once the company sets a 60% share, the technician sees their own amount');
  const other = await ev(`Object.values(S.users).find(u => u.role === 'partner' && u.uid !== '${co}')`);
  if (other) assert(!(await page.evaluate(([o]) => perform('COMPANY_SHARE_SET', null, { uid: 'PTECH', pct: 90 }, { as: o, quiet: true }).then(x => x.ok), [other.uid])), 'another company cannot set it');
  assert(!(await ev(`(() => { const x = S.users.PTECH; return validate(S, { id: 'x', n: 1, t: nowISO(), by: 'POWNER', type: 'COMPANY_SHARE_SET', pid: null, data: { uid: 'PTECH', pct: 150 }, dev: 'x', v: 1 }) === null; })()`)), 'a share over 100% is refused');
  assert(await ev(`taskPay({ k: 'final_inspect', pid: '${P}' }, S.users.PQC).mine === +S.config.payQcInspection`), 'QC sees the inspection fee');
  const sp = await ev(`(() => { const P = Object.values(S.projects).find(P => P.quotes.length && P.schedule); return P ? taskPay({ k: 'record_payment', pid: P.id, purpose: 'arrival' }, S.users.PSALES).move === P.schedule.arrival : true; })()`);
  assert(sp, 'office roles see the money a task moves');
  /* 2) responsibility and who checks, on the first screen of the work */
  await as('PQC');
  await page.evaluate(([pid]) => { openTask({ k: 'final_inspect', pid, roles: ['qc'] }); }, [P]); await page.waitForTimeout(250);
  let b = await page.evaluate(() => (document.querySelector('.brief') || {}).innerText || '');
  assert(/Before you start/.test(b) && /You earn/.test(b) && /Your job:/.test(b) && /Checked by:/.test(b), 'the first screen shows earn, job and who checks: ' + b.replace(/\s+/g, ' ').slice(0, 120));
  await page.evaluate(() => { W = null; App.curTask = null; ACT.nav('home'); });
  /* 3) next achievement */
  assert(/Next: |ready for/.test(await ev(`nextWin(S.users.PTECH)`)), 'the technician sees the next level, what is left and the pay rise');
  /* 4) today's plan */
  await page.evaluate(([pid]) => {
    const Pr = S.projects[pid]; Pr.stage = 'install'; window._sop = Pr.sop; Pr.sop = {};
    window._tasks = [{ k: 'site_checkin', pid, roles: ['tech'] }, { k: 'amc_visit', pid: Object.values(S.projects).find(x => x.site.gps && x.id !== pid).id, roles: ['tech'] }];
    window._mt = myTasks; myTasks = () => window._tasks; App.planNow = '2026-11-05T08:40';
  }, [P]);
  let pl = await ev(`(() => { const p = dayPlan0(S.users.PTECH); return { items: p.items.map(x => (x.lunch ? 'lunch' : x.move ? 'move' : x.k) + '@' + hm(x.t)), later: p.later.map(x => x.k), next: p.next, earn: p.earn }; })()`);
  console.log('   plan:', pl.items.join(' '), '| later:', pl.later.join(','));
  assert(/^(move@09:00 )?site_checkin@/.test(pl.items.join(' ')) && pl.items.some(x => /^safety_check/.test(x)) && pl.items.some(x => /^install/.test(x)), 'a technician\'s day: check in, safety, then the installation step');
  assert(pl.items.includes('lunch@13:00') && pl.items.some(x => /^daily_report@17:/.test(x)), 'lunch at 1 pm and end-of-day photos before 6 pm');
  assert(pl.later.includes('amc_visit'), 'what does not fit after the installation day moves to the next day');
  assert(pl.earn > 0, 'the plan says what the day can earn');
  pl = await ev(`(() => { App.planNow = '2026-11-08T10:00'; const p = dayPlan0(S.users.PTECH); return { next: p.next, day: p.day }; })()`);
  assert(pl.next && pl.day === '2026-11-09', 'Sunday is off: the plan is for Monday');
  pl = await ev(`(() => { App.planNow = '2026-11-05T18:30'; const p = dayPlan0(S.users.PTECH); return { next: p.next, day: p.day }; })()`);
  assert(pl.next && pl.day === '2026-11-06', 'after work hours it shows the next day');
  await page.evaluate(([pid]) => { myTasks = window._mt; App.planNow = null; S = rebuild(EVENTS); }, [P]);
  /* the card on home */
  for (const uid of ['PTECH', 'PSALES', 'PQC', 'PADMIN', 'PFIELD']) {
    await as(uid);
    const card = await page.evaluate(() => { const c = document.getElementById('plan'), nx = document.querySelector('main [data-a="openTask"].btn'); return { has: !!c, before: !nx || !c || !!(c.compareDocumentPosition(nx) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    assert(card.has && card.before, uid + ': today\'s plan is on the first page, before "Start my next task"');
  }
  assert(!(await page.evaluate(() => { loginAs(S.users.PCUST); go('home'); return !!document.getElementById('plan'); })), 'customers do not get a work plan');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BEFORE WORK PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
