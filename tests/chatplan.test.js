/* Job chat for the next responsible person: work stuck, follow-up on a date, work plan and appointment.
   Each goes to one person (suggested: who must do the job's next step); the office sees all. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const H = 'AIEC-P003', lead = await ev(`S.projects["${H}"].tech`), today = await ev('todayStr()'), tomorrow = await ev('addDays(1)');
  const last = () => ev(`S.projects["${H}"].chat[S.projects["${H}"].chat.length - 1]`);

  /* the composer suggests who must do the next step */
  await page.evaluate(H => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: H, tab: 'chat' }); }, H); await page.waitForTimeout(200);
  assert(/Next step:/.test(await page.innerText('main')), 'the chat shows the job\'s next step and who must do it');
  await page.click('[data-a="chatKind"][data-v="obstacle"]'); await page.waitForTimeout(150);
  const sel = await page.$eval('[data-a="chatUid"].on', b => b.dataset.v);
  const next = await ev(`chatPeople(S.projects["${H}"]).next`);
  assert(next.length && sel === next[0] && /⭐/.test(await page.$eval('[data-a="chatUid"].on', b => b.innerText)), 'work stuck goes to the next-step person by default (marked ⭐)');

  /* work stuck */
  await page.fill('[data-f="ctext"]', 'Lift pit has water, cannot fix rails'); await page.click('[data-a="chatSend"]'); await page.waitForTimeout(300);
  let m = await last();
  assert(m.kind === 'obstacle' && m.toUid === sel && m.open, 'sent to that person');
  assert((await tasks(sel)).includes('chat_obstacle'), 'it is a task for them');
  assert((await act('CHAT_STATUS', H, { mid: m.id, act: 'solved' }, sel)).err === 'err_reason', 'solving needs a note');
  assert((await act('CHAT_STATUS', H, { mid: m.id, act: 'solved', note: 'Pump arranged' }, 'PSALES')).err === 'err_access', 'someone else cannot close it');
  await page.evaluate(id => { S.projects['AIEC-P003'].chat.find(x => x.id === id).t = new Date(Date.now() - 2 * 864e5).toISOString(); }, m.id);
  assert((await tasks('PADMIN')).includes('chat_obstacle_late'), 'stuck for over a day: the office is told');
  await page.evaluate(() => { S = rebuild(EVENTS.slice()); });
  assert((await act('CHAT_STATUS', H, { mid: m.id, act: 'solved', note: 'Pump arranged' }, sel)).ok && !(await tasks(sel)).includes('chat_obstacle'), 'marked solved with a note; the task closes');

  /* follow-up on a date */
  assert((await act('CHAT_POSTED', H, { kind: 'followup', text: 'Check cabin delivery', toUid: lead, due: '2020-01-01' }, 'PADMIN')).err === 'err_past_date', 'no follow-up in the past');
  assert((await act('CHAT_POSTED', H, { kind: 'followup', text: 'Check cabin delivery', due: tomorrow }, 'PADMIN')).err === 'err_pick_person', 'a person is needed');
  assert((await act('CHAT_POSTED', H, { kind: 'followup', text: 'Check cabin delivery', toUid: lead, due: tomorrow }, 'PADMIN')).ok && !(await tasks(lead)).includes('chat_followup'), 'a follow-up for tomorrow is not a task today');
  m = await last(); await page.evaluate(id => { S.projects['AIEC-P003'].chat.find(x => x.id === id).due = todayStr(); }, m.id);
  assert((await tasks(lead)).includes('chat_followup'), 'on its date it becomes the person\'s task');
  assert((await act('CHAT_STATUS', H, { mid: m.id, act: 'done' }, lead)).ok, 'they mark it done');
  await page.evaluate(() => { S = rebuild(EVENTS.slice()); });

  /* work plan */
  assert((await act('CHAT_POSTED', H, { kind: 'plan', text: 'Rails, 2 people', toUid: lead, due: today }, 'PADMIN')).ok && (await tasks(lead)).includes('plan_today'), 'a work plan for today shows on the person\'s day');

  /* appointment with the customer */
  const C = await ev('Object.values(S.projects).find(P => P.customer === "PCUST").id');
  assert((await act('CHAT_POSTED', C, { kind: 'appt', text: 'Handover walk-through', toUid: 'PCUST', due: tomorrow }, 'PADMIN')).err === 'err_time', 'an appointment needs a time');
  assert((await act('CHAT_POSTED', C, { kind: 'appt', text: 'Handover walk-through', toUid: 'PCUST', due: tomorrow, time: '11:00', place: 'Site' }, 'PADMIN')).ok, 'the office proposes an appointment to the customer');
  const am = await ev(`S.projects["${C}"].chat[S.projects["${C}"].chat.length - 1]`);
  assert((await tasks('PCUST')).includes('chat_appt'), 'the customer is asked to answer');
  await page.evaluate(C => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); go('project', { pid: C, tab: 'chat' }); }, C); await page.waitForTimeout(200);
  assert(/Coming up/.test(await page.innerText('main')) && await page.$(`[data-a="chatAct"][data-v="${am.id}|propose"]`), 'the customer sees it under Coming up and can suggest another time');
  await page.click(`[data-a="chatAct"][data-v="${am.id}|propose"]`); await page.waitForTimeout(250);
  await page.evaluate(d => { W.ctx.due = d; W.ctx.time = '17:30'; }, tomorrow); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  let a2 = await ev(`S.projects["${C}"].chat.find(x => x.id === "${am.id}")`);
  assert(a2.status === 'proposed' && a2.time === '17:30' && a2.toUid === 'PADMIN' && a2.from === 'PCUST', 'the customer suggests 5:30 pm; now the office answers');
  assert((await tasks('PADMIN')).includes('chat_appt') && !(await tasks('PCUST')).includes('chat_appt'), 'the task moves to the office');
  assert((await act('CHAT_STATUS', C, { mid: am.id, act: 'accept' }, 'PCUST')).err === 'err_access', 'the customer cannot accept their own suggestion');
  assert((await act('CHAT_STATUS', C, { mid: am.id, act: 'accept' }, 'PADMIN')).ok && await ev(`S.projects["${C}"].chat.find(x => x.id === "${am.id}").status === "confirmed"`), 'the office accepts: confirmed');
  await page.evaluate(([C, id]) => { S.projects[C].chat.find(x => x.id === id).due = todayStr(); }, [C, am.id]);
  assert((await tasks('PCUST')).includes('appt_today') && (await tasks('PADMIN')).includes('appt_today'), 'on the day both get a reminder');
  await page.evaluate(() => { S = rebuild(EVENTS.slice()); });

  /* privacy and the customer's choices */
  await page.evaluate(C => { loginAs(S.users.PCUST); go('project', { pid: C, tab: 'chat' }); }, C); await page.waitForTimeout(150);
  const ck = await page.$$eval('[data-a="chatKind"]', bs => bs.map(b => b.dataset.v));
  assert(ck.includes('appt') && !ck.includes('obstacle') && !ck.includes('plan'), 'the customer can ask, complain or propose an appointment only');
  assert((await act('CHAT_POSTED', C, { kind: 'obstacle', text: 'x', toUid: 'PADMIN' }, 'PCUST')).err === 'err_choose', 'the customer cannot send work-stuck items');
  await act('CHAT_POSTED', C, { kind: 'obstacle', text: 'Internal: supplier late', toUid: 'PADMIN' }, 'PSALES');
  assert(!(await page.evaluate(C => { loginAs(S.users.PCUST); return S.projects[C].chat.filter(chatVisible).some(m => /Internal: supplier late/.test(m.text)); }, C)), 'the customer does not see staff-only items');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) for (const [uid, pid, k] of [['PADMIN', H, 'appt'], ['PADMIN', H, 'obstacle'], [lead, H, 'followup'], ['PCUST', C, 'appt']]) {
    await page.evaluate(([lang, uid, pid, k]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); Notify.hide(); App.form = { ck: k }; go('project', { pid, tab: 'chat' }); App.form.ck = k; render(); }, [lang, uid, pid, k]); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll (${lang}, ${uid}, ${k})`);
  }
  await page.evaluate(async () => { const C = Object.values(S.projects).find(P => P.customer === 'PCUST').id, m = S.projects[C].chat.find(x => x.kind === 'appt'); loginAs(S.users.PADMIN); await wiz('chatAct', C, { mid: m.id, act: 'decline' }); }); await page.waitForTimeout(100);
  await page.evaluate(() => { W = null; loginAs(S.users.PADMIN); go('home'); }); await page.waitForTimeout(100);
  const m2 = await miss(page);
  assert(!m2.length, 'no missing words' + (m2.length ? ': ' + m2.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('CHAT PLAN PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
