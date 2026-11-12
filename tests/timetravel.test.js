/* Time travel: rules that start on fixed dates must never break the practice company as days pass. The practice
   company is built with the clock moved forward 0, 30, 120 and 400 days: every step of its story is accepted, the jobs
   reach the same stages, yesterday's work is on yesterday's day shift and today starts clean (nobody has checked in). */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const base = +process.env.AIEC_SHIFT_DAYS || 0, seen = [];
  for (const days of [0, 30, 120, 400]) {
    process.env.AIEC_SHIFT_DAYS = String(base + days);
    const { browser, page } = await launch();
    const warns = []; page.on('console', m => { if (/practice seed/i.test(m.text())) warns.push(m.text().slice(0, 140)); });
    await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(9000);
    const r = await page.evaluate(() => ({ today: todayStr(), stages: Object.values(S.projects).map(P => P.id.slice(-3) + ':' + P.stage).join(' '), rejected: S.rejected.length, back: EVENTS.some((e, i) => i && e.t < EVENTS[i - 1].t),
      senior: myTasks(S.users.PSENIOR).map(n => n.k)[0], lastWork: safeDay(EVENTS.filter(e => e.type === 'SOP_STEP_DONE' && e.pid === 'AIEC-P003').pop().t), yesterday: addDays(-1), todayCheckins: EVENTS.filter(e => e.type === 'SITE_CHECKED_IN' && e.data.day === todayStr()).length }));
    assert(!warns.length && r.rejected === 0, `+${days} days (${r.today}): every step of the practice story is accepted` + (warns.length ? ': ' + warns.slice(0, 2).join(' | ') : ''));
    assert(!r.back, `+${days} days: time never runs backwards in the story`);
    assert(r.lastWork === r.yesterday && r.todayCheckins === 0 && r.senior === 'site_checkin', `+${days} days: the hospital's last work was yesterday and today starts with the check-in (${r.lastWork}, first task ${r.senior})`);
    seen.push(r.stages);
    await browser.close();
  }
  process.env.AIEC_SHIFT_DAYS = base ? String(base) : '';
  assert(seen.every(x => x === seen[0]) && /001:amc 002:handover 003:installing 004:arrived 005:material_order 006:qc_site/.test(seen[0]), 'the jobs reach the same stages on every date: ' + seen[0]);
  console.log('TIME TRAVEL PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
