/* Tickets and lift QR: how serious a ticket is, time limits set by the Owner, repeat faults, the office changing urgency;
   the QR sticker for each handed-over lift and the no-login page residents open from it (call rescue, report a problem). */
const path = require('path');
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const APP = 'file://' + path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html');
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid), [uid, pid]);
  const A = 'AIEC-P001';
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');
  assert(await ev(`/^L-[A-Z0-9]{6}$/.test(S.projects["${A}"].lift.code) && S.projects["${A}"].tickets.every(x => x.sev)`), 'a handed-over lift has a QR code; tickets have an urgency');

  /* urgency */
  assert((await act('TICKET_OPENED', A, { tid: 'T-X1', kind: 'complaint', sev: 'trapped', text: 'x' }, 'PSALES')).err === 'err_choose', '"person trapped" is only for a stopped lift');
  assert((await act('TICKET_OPENED', A, { tid: 'T-X2', kind: 'breakdown', sev: 'repeat', text: 'x' }, 'PSALES')).err === 'err_choose', '"repeat fault" is set by the app, not chosen');
  assert((await act('TICKET_OPENED', A, { tid: 'T-TR', kind: 'breakdown', sev: 'trapped', src: 'qr', text: 'Two people stuck between 3rd and 4th floor' }, 'PSALES')).ok, 'Sales records a "person trapped" call that came from the lift QR');
  const tr = (await tasks('PADMIN', A)).find(n => n.k === 'assign_ticket' && n.tid === 'T-TR');
  assert(tr && tr.urgent && await page.evaluate(n => Notify.kind(n), tr) === 'alarm' && await ev(`ticketDue(ticketOf(S.projects["${A}"], "T-TR")) === null`), 'the office gets an alarm; there is no published time limit for a person trapped');
  assert((await act('TICKET_OPENED', A, { tid: 'T-B2', kind: 'breakdown', text: 'Stopped again on ground floor' }, 'PSALES')).ok && await ev(`(x => x.sev === "breakdown" && x.repeat)(ticketOf(S.projects["${A}"], "T-B2"))`), 'a second breakdown within 30 days is marked as a repeat fault');
  assert((await act('TICKET_OPENED', A, { tid: 'T-R3', kind: 'complaint', text: 'Jerk when stopping' }, 'PSALES')).ok && await ev(`ticketOf(S.projects["${A}"], "T-R3").sev`) === 'repeat', 'an ordinary complaint after a breakdown becomes "fault came back"');

  /* time limits */
  await act('CONFIG_SET', null, { key: 'slaBreakdown', value: 12 }, 'POWNER');
  assert(await ev(`Math.round((ticketDue(ticketOf(S.projects["${A}"], "T-B2")) - Date.parse(ticketOf(S.projects["${A}"], "T-B2").t)) / 3600e3)`) === 12, 'the Owner sets 12 hours for a stopped lift');
  await page.evaluate(A => { ticketOf(S.projects[A], 'T-B2').t = new Date(Date.now() - 13 * 3600e3).toISOString(); }, A);
  assert((await tasks('PADMIN', A)).some(n => n.k === 'sla_breach' && n.tid === 'T-B2'), 'after the limit the office sees "a ticket passed its time limit"');
  await act('TICKET_ASSIGNED', A, { tid: 'T-B2', uid: 'PTECH', due: await ev('todayStr()') }, 'PADMIN');
  const wt = (await tasks('PTECH', A)).find(n => n.k === 'work_ticket' && n.tid === 'T-B2');
  assert(wt && wt.urgent && wt.overdue, 'the technician\'s task is urgent and overdue');
  assert((await act('TICKET_UPDATED', A, { tid: 'T-B2', status: 'resolved', note: 'Door contact cleaned' }, 'PTECH')).ok && await ev(`ticketLate(ticketOf(S.projects["${A}"], "T-B2"))`) && !(await tasks('PADMIN', A)).some(n => n.k === 'sla_breach' && n.tid === 'T-B2'), 'once fixed, the breach task goes; the ticket stays recorded as fixed late');

  /* office changes urgency */
  assert((await act('TICKET_SEVERITY', A, { tid: 'T-R3', sev: 'unsafe', note: 'x' }, 'PTECH')).ok === false, 'a technician cannot change urgency');
  assert((await act('TICKET_SEVERITY', A, { tid: 'T-R3', sev: 'unsafe' }, 'PADMIN')).err === 'err_reason', 'changing urgency needs a reason');
  assert((await act('TICKET_SEVERITY', A, { tid: 'T-R3', sev: 'unsafe', note: 'Resident says the door opened while moving' }, 'PADMIN')).ok && await ev(`ticketOf(S.projects["${A}"], "T-R3").sev`) === 'unsafe', 'the office raises it to "unsafe to use"');
  await page.evaluate(A => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: A, tab: 'info' }); }, A); await page.waitForTimeout(250);
  const info = await page.innerText('main');
  assert(/Person trapped/.test(info) && /Unsafe to use/.test(info) && /fixed late/.test(info) && /Fault came back/.test(info), 'the ticket list shows urgency, repeat faults and time-limit status');
  assert(info.indexOf('Person trapped') < info.indexOf('Unsafe to use') && info.indexOf('Unsafe to use') < info.indexOf('Fault came back'), 'open tickets are listed most serious first');

  /* lift QR sticker */
  await act('CONFIG_SET', null, { key: 'sosNumber', value: '02066112233' }, 'POWNER');
  await act('CONFIG_SET', null, { key: 'officeNumber', value: '02041234567' }, 'POWNER');
  assert((await act('LIFT_QR_SET', A, { label: 'x'.repeat(31) }, 'PADMIN')).err === 'err_fill' && (await act('LIFT_QR_SET', A, { label: 'Sai Heights, Wing A' }, 'PADMIN')).ok, 'the office names the lift for the sticker (up to 30 letters)');
  await page.evaluate(A => go('liftqr', { pid: A }), A); await page.waitForTimeout(250);
  const st = await page.innerText('main');
  const code = await ev(`S.projects["${A}"].lift.code`), url = await ev(`liftUrl(S.projects["${A}"])`);
  assert(await page.$('#sticker svg path') && /Sai Heights, Wing A/.test(st) && st.includes(code) && /02066112233/.test(st) && /112/.test(st), 'the sticker shows the QR, the lift name and code, and the rescue number and 112 printed as text');
  assert(!/Gokhale|9822000001/.test(url) && url.includes(code) && url.includes('r=02066112233'), 'the QR holds only the lift code, its name and the company numbers — no customer details');
  await page.evaluate(() => { loginAs(S.users.PTECH); go('liftqr', { pid: 'AIEC-P001' }); }); await page.waitForTimeout(150);
  assert(await ev('App.route.name') === 'liftqr' && !(await page.$('#sticker')), 'a technician does not print stickers');

  /* the page a resident opens (another phone, no data, no login) */
  const B = await launch(); const pb = B.page;
  await pb.evaluate(() => { window.open = () => null; });
  await pb.goto(APP + url.slice(url.indexOf('#'))); await pb.reload(); await pb.waitForTimeout(1500);
  await pb.evaluate(() => { window.open = () => null; });
  assert(await pb.evaluate(() => App.route.name) === 'qr' && !(await pb.evaluate(() => !!App.me)), 'scanning opens the lift help page without any login');
  await pb.evaluate(() => ACT.qrLang('en')); await pb.waitForTimeout(100);
  const rt = await pb.innerText('main');
  assert(/PERSON TRAPPED/.test(rt) && /Sai Heights, Wing A/.test(rt) && await pb.$('a[href="tel:02066112233"]') && await pb.$('a[href="tel:112"]'), '"Person trapped" calls the rescue number, with 112 below');
  await pb.click('[data-a="qrReport"]'); await pb.click('[data-a="qrProblem"][data-v="door"]'); await pb.fill('#qrPhone', '98220 55555');
  await pb.click('[data-a="qrSend"][data-v="wa"]');
  const sent = await pb.evaluate(() => decodeURIComponent(App.qr.lastUrl));
  assert(sent.startsWith('https://wa.me/912041234567') && sent.includes(code) && /Door problem/.test(sent) && sent.includes('9822055555'), 'reporting a door problem prepares a WhatsApp message to the office with the lift code and a call-back number: ' + sent);
  await pb.evaluate(() => ACT.qrLang('mr')); await pb.waitForTimeout(100);
  assert(/अडकली/.test(await pb.innerText('main')), 'the page works in Marathi');
  if (await pb.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on the resident page');
  await pb.evaluate(() => ACT.qrStaff()); await pb.waitForTimeout(200);
  assert(await pb.evaluate(c => App.pendingLift === c && App.route.name !== 'qr', code), 'staff can go on to the app from the page');
  if (B.errors.length) { console.error(B.errors.join('\n')); process.exit(1); }
  await B.browser.close();
  assert(await page.evaluate(code => { App.set.permsSeen = Object.assign(App.set.permsSeen || {}, { [App.mode + 'PADMIN']: 1 }); App.pendingLift = code; loginAs(S.users.PADMIN); return App.route.name === 'project' && App.route.p.pid === 'AIEC-P001'; }, code), 'a staff member who logs in from the lift QR lands on that lift');

  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'project', { pid: A, tab: 'info' }], ['PADMIN', 'liftqr', { pid: A }], ['PTECH', 'home', {}], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; loginAs(S.users.PSALES); await wiz('ticket', 'AIEC-P001'); W.ctx.kind = 'breakdown'; W.ctx.sev = 'trapped'; W.step = 1; render(); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PADMIN); await wiz('ticketSev', 'AIEC-P001', { tid: 'T-R3' }); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { await wiz('liftLabel', 'AIEC-P001'); }); await page.waitForTimeout(100);
  await page.evaluate(() => { App.qr = parseQr('#q=L-ABCDEF&l=X&o=020'); App.qr.step = 'report'; App.qr.problem = 'noise'; go('qr'); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('TICKETS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
