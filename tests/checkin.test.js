/* Technician check-in at the site (distance from the site's saved location; a reason and an office look when far) before the daily
   safety check, and ending the day (hazards reported first, then the printable safety report). */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const H = 'AIEC-P003', day = await ev('safeDay()'), site = await ev(`S.projects["${H}"].site.gps`);
  assert(await ev('S.rejected.length === 0') && await ev('Object.values(S.projects).some(P => Object.keys(P.checkins || {}).length)'), 'practice data has check-ins on past work days and nothing refused');

  /* check-in before the safety check */
  assert((await tasks('PSENIOR'))[0] === 'site_checkin', 'the lead\'s first task today is to check in at the site');
  const far = { lat: site.lat + 0.01, lng: site.lng, acc: 15 };
  assert((await act('SITE_CHECKED_IN', H, { day, gps: far }, 'PSENIOR')).err === 'err_checkin_reason', 'about 1 km away: a reason is needed');
  assert((await act('SITE_CHECKED_IN', H, { day: '2020-01-01', gps: site }, 'PSENIOR')).err === 'err_date', 'only for today');
  assert((await act('SITE_CHECKED_IN', H, { day, gps: site }, 'PSUP')).ok === false, 'only the job\'s team checks in');
  assert((await act('SITE_CHECKED_IN', H, { day, gps: far, reason: 'basement', note: 'Working in the pit' }, 'PSENIOR')).ok, 'the lead checks in from the basement with a reason');
  assert(await ev(`(x => x.out && x.dist > 1000 && x.reason === "basement")(S.projects["${H}"].checkins["${day}"].PSENIOR)`), 'distance and reason are saved');
  assert((await tasks('PSENIOR'))[0] === 'safety_check', 'work is not stopped: next is the daily safety check');
  assert((await tasks('PADMIN')).includes('review_checkin'), 'the office is asked to look at the far check-in');
  assert((await act('CHECKIN_REVIEWED', H, { day, uid: 'PSENIOR', ok: false }, 'PADMIN')).err === 'err_reason' && (await act('CHECKIN_REVIEWED', H, { day, uid: 'PSENIOR', ok: true }, 'PADMIN')).ok && !(await tasks('PADMIN')).includes('review_checkin'), 'the office accepts the reason; the item closes');
  assert((await act('SITE_CHECKED_IN', H, { day, gps: site }, 'PSENIOR')).err === 'err_already', 'one check-in per person per day');
  const crew = await ev(`(S.projects["${H}"].crew || [])[0] || null`);
  if (crew) assert((await act('SITE_CHECKED_IN', H, { day, gps: site }, crew)).ok && await ev(`!S.projects["${H}"].checkins["${day}"]["${crew}"].out`), 'a crew member at the site checks in without a reason');
  await page.evaluate(async H => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); await wiz('checkin', H); W.ctx.gps = { lat: S.projects[H].site.gps.lat + 0.0022, lng: S.projects[H].site.gps.lng, acc: 10 }; render(); }, H); await page.waitForTimeout(150);
  assert(/more than 150 m/.test(await page.innerText('main')) && await page.$('[data-a="pick"][data-k="reason"]'), 'the check-in screen shows the distance and asks why when far');
  await page.evaluate(H => { W.ctx.gps = Object.assign({ acc: 8 }, S.projects[H].site.gps); render(); }, H); await page.waitForTimeout(100);
  assert(/within 150 m/.test(await page.innerText('main')) && !(await page.$('[data-a="pick"][data-k="reason"]')), 'at the site no reason is asked');
  await page.evaluate(() => { W = null; });

  /* end of the day */
  await act('SAFETY_CHECKED', H, { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) }, 'PSENIOR');
  await page.evaluate(() => { loginAs(S.users.PSENIOR); go('home'); }); await page.waitForTimeout(150);
  assert(await page.$(`[data-a="wizOpen"][data-v="techEnd|${H}"]`), 'the technician\'s home offers "end my day at this site"');
  assert((await act('DAY_ENDED_TECH', 'AIEC-P004', { noHazard: true }, await ev('S.projects["AIEC-P004"].tech'))).err === 'err_checkin', 'someone who did not check in cannot end a day there');
  assert((await act('DAY_ENDED_TECH', H, { noHazard: false }, 'PSENIOR')).err === 'err_open_hazard', 'an unreported hazard must be reported first');
  await page.evaluate(async H => { await wiz('techEnd', H); }, H); await page.waitForTimeout(150);
  const et = await page.innerText('main');
  assert(/Today at this site/.test(et) && /Steps done today/.test(et), 'the end-of-day screen lists today\'s work');
  await page.click('[data-a="pick"][data-k="haz"][data-v="no"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`!!S.projects["${H}"].dayEnds["${day}"].PSENIOR`) && await page.$('[data-a="safetyLog"]'), 'the day is ended and the safety report for the builder is offered');
  assert((await act('DAY_ENDED_TECH', H, { noHazard: true }, 'PSENIOR')).err === 'err_already', 'once per day');

  /* the rule can be switched off; old records stay valid */
  await act('CONFIG_SET', null, { key: 'checkinGate', value: 0 }, 'POWNER');
  assert(!(await ev(`checkinNeeded(S.projects["AIEC-P003"], nowISO())`)), 'with the rule off, no check-in is needed');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PSENIOR', 'home', {}], ['PADMIN', 'home', {}], ['PSENIOR', 'project', { pid: H }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async H => { LANG = 'mr'; loginAs(S.users.PTECH); await wiz('checkin', 'AIEC-P003'); W.ctx.gps = null; render(); }, H); await page.waitForTimeout(100);
  await page.evaluate(async H => { loginAs(S.users.PADMIN); S.projects[H].checkins[safeDay()].PSENIOR.review = null; await wiz('checkinReview', H, { day: safeDay(), uid: 'PSENIOR' }); }, H); await page.waitForTimeout(100);
  await page.evaluate(async H => { loginAs(S.users.PSENIOR); await wiz('techEnd', H); W.ctx.haz = 'yes'; render(); }, H); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('CHECKIN PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
