/* Office control: one queue of everything that needs the office (most serious first), closing the day with open items rolled to a person,
   a backup approver for days the Owner or Admin is away, and records whose phone clock jumped. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as, t) => page.evaluate(([type, pid, data, as, t]) => perform(type, pid, data, { as, quiet: true, t: t || undefined }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as, t]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  assert(await ev('S.rejected.length === 0 && openClockGaps().length === 0'), 'practice data loads with nothing refused and no clock jumps');

  /* the office queue */
  const q0 = await ev('officeQueue().map(n => n.exc)');
  assert(q0.length > 0 && q0.every((x, i) => i === 0 || ['critical', 'high', 'medium', 'low'].indexOf(q0[i - 1]) <= ['critical', 'high', 'medium', 'low'].indexOf(x)), 'the office queue lists items most serious first: ' + q0.join(','));
  await act('TICKET_OPENED', 'AIEC-P001', { tid: 'T-TRAP', kind: 'breakdown', sev: 'trapped', src: 'call', text: 'Person stuck on 2nd floor' }, 'PSALES');
  assert(await ev('officeQueue()[0].exc') === 'critical' && await ev('officeQueue()[0].tid') === 'T-TRAP', 'a person trapped goes to the top as critical');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  assert(await page.$('[data-a="nav"][data-v="exceptions"]'), 'the Admin\'s home has the "needs the office" button');
  await page.click('[data-a="nav"][data-v="exceptions"]'); await page.waitForTimeout(250);
  let txt = await page.innerText('main');
  assert(/Critical/.test(txt) && /High/.test(txt) && /Close the day/.test(txt), 'the queue shows counts by seriousness and the day close');
  await page.click('[data-a="excFilter"][data-v="critical"]'); await page.waitForTimeout(150);
  assert(await ev('App.tasks.every(n => n.exc === "critical")'), 'filter: only critical items');
  await page.click('[data-a="excFilter"][data-v=""]'); await page.waitForTimeout(100);
  await page.fill('#f_excq', 'P001'); await page.waitForTimeout(200);
  assert(await ev('App.tasks.length > 0 && App.tasks.every(n => (n.pid || "").includes("P001"))'), 'search by project number');
  await page.fill('#f_excq', ''); await page.waitForTimeout(100);

  /* day close */
  const day = await ev('safeDay()'), items = await ev('officeQueue().map(n => ({ key: n.key, k: n.k, pid: n.pid || null, sev: n.exc, owner: rollOwner(n) }))');
  assert((await act('DAY_CLOSED', null, { day: '2020-01-01', items }, 'PADMIN')).err === 'err_date', 'only today can be closed');
  assert((await act('DAY_CLOSED', null, { day, items }, 'PADMIN')).err === 'err_close_critical', 'with a red item open, closing needs a note');
  assert((await act('DAY_CLOSED', null, { day, items, note: 'Rescue team on site, lift engineer called' }, 'PADMIN')).ok, 'the Admin closes the day with a note');
  assert((await act('DAY_CLOSED', null, { day, items, note: 'x' }, 'POWNER')).err === 'err_already', 'one close per day');
  assert(!(await tasks('PADMIN')).includes('day_close') && !(await tasks('POWNER')).includes('day_close'), 'no "close the day" task after closing');
  await page.evaluate(() => { const d = safeDay(); S.dayClose[addDays(-1)] = S.dayClose[d]; delete S.dayClose[d]; go('exceptions'); }); await page.waitForTimeout(200);
  assert(/from yesterday/.test(await page.innerText('main')), 'next day, the rolled items show "from yesterday" with the person carrying them');

  /* backup approver */
  const to = await ev('addDays(3)');
  assert((await act('BACKUP_SET', null, { uid: 'PFIN', from: day, to }, 'PADMIN')).ok === false, 'only the Owner names a backup approver');
  assert((await act('BACKUP_SET', null, { uid: 'POWNER', from: day, to }, 'POWNER')).err === 'err_pick_person', 'the backup is another trusted person');
  assert((await act('BACKUP_SET', null, { uid: 'PFIN', from: day, to: await ev('addDays(40)') }, 'POWNER')).err === 'err_date', 'at most 31 days');
  assert((await act('BACKUP_SET', null, { uid: 'PFIN', from: day, to, note: 'Owner travelling' }, 'POWNER')).ok && await ev('isBackup("PFIN")'), 'the Owner names Finance as backup approver for 3 days');
  await act('APPROVAL_REQUESTED', null, { aid: 'A-RE1', action: { type: 'DEAL_REOPENED', pid: 'AIEC-P009', data: { reason: 'Customer called back' } } }, 'PADMIN');
  assert((await tasks('PFIN')).includes('second_approval'), 'the backup approver gets the second approval');
  assert((await act('APPROVAL_DECIDED', null, { aid: 'A-RE1', decision: 'approve' }, 'PSALES')).err === 'err_role', 'someone who is not the backup cannot approve');
  await page.evaluate(() => { loginAs(S.users.PFIN); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  assert(await page.$('[data-a="nav"][data-v="exceptions"]'), 'the backup approver sees the office queue');
  assert((await act('APPROVAL_DECIDED', null, { aid: 'A-RE1', decision: 'approve' }, 'PFIN')).ok && await ev('S.projects["AIEC-P009"].stage') !== 'lost', 'the backup approves: the lost deal is reopened');
  assert((await act('BACKUP_ENDED', null, {}, 'POWNER')).ok && !(await ev('isBackup("PFIN")')), 'the Owner ends it early');

  /* phone clock jumps */
  const back = await ev('new Date(Date.now() - 10 * 3600e3).toISOString()');
  await act('CONFIG_SET', null, { key: 'remindDays', value: 1 }, 'POWNER');
  await act('CONFIG_SET', null, { key: 'remindDays', value: 1 }, 'POWNER', back);
  const fut = await ev('new Date(Date.now() + 9 * 3600e3).toISOString()');
  await act('CONFIG_SET', null, { key: 'remindDays', value: 1 }, 'POWNER', fut);
  const gaps = await ev('openClockGaps().map(g => g.kind + ":" + g.h)');
  assert(gaps.length === 2 && gaps.some(x => x.startsWith('back:')) && gaps.some(x => x.startsWith('future:')), 'a record made after the clock went back 10 h, and one 9 h in the future, are flagged: ' + gaps.join(' '));
  assert((await tasks('PADMIN')).includes('clock_gap') && await ev('officeQueue().some(n => n.k === "clock_gap" && n.exc === "low")'), 'the office gets one low item to check them');
  const g1 = await ev('openClockGaps()[0].id');
  assert((await act('CLOCK_REVIEWED', null, { eid: g1, ok: false }, 'PADMIN')).err === 'err_reason', 'a decision needs a reason');
  assert((await act('CLOCK_REVIEWED', null, { eid: g1, ok: false, note: 'Phone date was wrong after battery change' }, 'PADMIN')).ok && (await act('CLOCK_REVIEWED', null, { eid: await ev('openClockGaps()[0].id'), ok: true, note: 'Checked with Owner' }, 'PADMIN')).ok, 'the Admin marks one time as not trusted and accepts the other');
  assert(!(await tasks('PADMIN')).includes('clock_gap'), 'then the item is gone');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('clock'); }); await page.waitForTimeout(200);
  assert(/Time not trusted/.test(await page.innerText('main')) && /Time accepted/.test(await page.innerText('main')), 'the clock screen keeps the decisions');

  assert(await page.evaluate(() => { const n = EVENTS.length; S = rebuild(EVENTS.slice()); return S.rejected.length === 0; }), 'everything rebuilds with nothing refused');
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'exceptions', {}], ['POWNER', 'exceptions', { f: 'high' }], ['PADMIN', 'clock', {}], ['PADMIN', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; delete S.dayClose[safeDay()]; loginAs(S.users.PADMIN); await wiz('dayClose'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.POWNER); await wiz('backup'); W.ctx.uid = 'PFIN'; W.step = 1; render(); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { S.backup = { uid: 'PFIN', from: safeDay(), to: addDays(2), ended: null }; await wiz('backup'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PADMIN); await wiz('clockReview', null, { eid: 'x' }); }); await page.waitForTimeout(100);
  await page.evaluate(() => { loginAs(S.users.PFIN); go('exceptions'); }); await page.waitForTimeout(100);
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('home'); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('OFFICE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
