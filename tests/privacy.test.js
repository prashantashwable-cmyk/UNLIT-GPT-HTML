/* Data protection against poaching: partner companies, technicians and suppliers never receive customer contacts, prices or other companies' details;
   masked contact, no money for technicians, no export/print, watermark, access log with office alerts. Saves screenshots. */
const path = require('path');
const { launch, miss, OUT } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const SHOTS = process.env.SHOT_DIR || OUT;
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const shot = async n => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(SHOTS, `privacy_${n}.png`) }); };
  await act('CONFIG_SET', null, { key: 'costAuto', value: 312345 }, 'POWNER');
  await act('CONFIG_SET', null, { key: 'officeNumber', value: '02041234567' }, 'POWNER');

  /* files for outside companies and their people */
  const fileFor = uid => page.evaluate(uid => { App.me = S.users.PADMIN; return JSON.stringify(exportPack('person', uid)); }, uid);
  const office = await ev('JSON.stringify(Object.fromEntries(Object.values(S.projects).map(P => [P.id, P.stage])))');
  for (const [uid, label] of [['PPART1', 'partner company'], ['PTECH', 'technician'], ['PSUP', 'supplier']]) {
    const txt = await fileFor(uid);
    const others = JSON.stringify(JSON.parse(txt).events.filter(e => e.by !== uid)); /* names the person typed themself at a handover stay in their own records */
    for (const secret of ['9822000001', '9822000003', 'Mr. Gokhale', 'Dr. Patil', 'Mrs. Kale', '312345', 'MH/LIFT/2021/0642', 'UPI']) if (others.includes(secret)) throw new Error(`${label} file contains "${secret}"`);
    assert(!txt.includes('Om Elevator Services') || uid === 'PSUP', `the ${label}'s file has no customer phone, customer name, price, payment reference or other company's licence`);
    const B = await launch(); const pb = B.page;
    const r = await pb.evaluate(async txt => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.mode = 'practice'; await loadMode('practice'); const r = await importText(txt); return { r, rej: S.rejected.map(x => x.ev.type + ':' + JSON.stringify(x.err)), stages: Object.fromEntries(Object.values(S.projects).map(P => [P.id, P.stage])), cost: S.config.costAuto, logins: Object.values(S.users).filter(u => u.pin).map(u => u.uid) }; }, txt);
    const same = Object.entries(r.stages).every(([id, st]) => JSON.parse(office)[id] === st);
    assert(r.r.ok && !r.rej.length && same && r.cost !== 312345, `the ${label}'s phone imports cleanly, every job is at the same stage as the office, and the real price is not there: ` + r.rej.join(' '));
    assert(r.logins.join() === uid, `only the ${label} can log in on that phone`);
    if (uid === 'PPART1') assert(await pb.evaluate(() => S.users.PPART2.hidden && userName('PPART2').startsWith('Licensed Partner Company #')), 'another company\'s name is not on a partner company\'s phone');
    await B.browser.close();
  }

  /* screens for a partner company */
  await page.evaluate(() => { loginAs(S.users.PPART1); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-P003', tab: 'info' }); }); await page.waitForTimeout(300);
  const info = await page.innerText('main');
  assert(!/Dr\. Patil/.test(info) && !/9822000003/.test(info) && /kept by AIEC/.test(info) && await page.$('[data-a="openChat"]') && await page.$('a[href="tel:02041234567"]'), 'the partner sees "contact through AIEC": chat and the AIEC office number, never the customer');
  assert(await page.$('.wm') && await ev('document.body.classList.contains("guard")'), 'every page carries a watermark with the viewer\'s name and copying is off');
  await shot('1_partner_project');
  await page.evaluate(() => ACT.print()); await page.waitForTimeout(200);
  assert(/not allowed/.test(await page.innerText('body')), 'printing is refused for a partner company');
  assert(!(await ev('projDocs(S.projects["AIEC-P002"]).includes("agreement")')), 'the agreement (prices, customer) is not offered to the partner');
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  assert(await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const v = document.body.classList.contains('veil'); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return v && !document.body.classList.contains('veil'); }), 'the screen is blurred when the app goes to the background');

  /* technicians: no money, no customer */
  await page.evaluate(() => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); go('me', {}); }); await page.waitForTimeout(250);
  assert(!(await page.$('[data-a="nav2"][data-v^="earn|"]')), 'a technician has no pay screen');
  await page.evaluate(() => go('earn', { uid: 'PSENIOR' })); await page.waitForTimeout(150);
  assert(await ev('App.route.name') === 'earn' && !/Pay rules/.test(await page.innerText('main')), 'opening pay directly shows nothing');
  await page.evaluate(() => { go('home', {}); }); await page.waitForTimeout(150); await shot('2_technician_home');
  assert(!(await act('MSG_LOGGED', 'AIEC-P003', { mid: 'M1', template: 'intro', text: 'Hi' }, 'PSENIOR')).ok, 'technicians cannot send WhatsApp messages to customers');

  /* chat hides contacts typed by customers or outside companies */
  await act('CHAT_POSTED', 'AIEC-P002', { text: 'Call me on 98220 12345 or mail kale@example.com' }, 'PCUST');
  assert(await ev('S.projects["AIEC-P002"].chat.slice(-1)[0].text') === 'Call me on 📞 ••• or mail ✉️ •••', 'a phone number or e-mail typed in chat is hidden');

  /* access log and alerts */
  await page.evaluate(() => { loginAs(S.users.PPART1); Notify.hide(); go('project', { pid: 'AIEC-P006' }); go('users', {}); go('rules', {}); });
  await page.waitForTimeout(400);
  const den = await ev('JSON.stringify(S.access.filter(x => x.uid === "PPART1"))');
  assert(JSON.parse(den).filter(x => x.denied).map(x => x.w).join() === 'print,project,users,rules', 'the print attempt and pages the company may not see are logged as refused');
  assert(await ev('myTasks(S.users.PADMIN).some(n => n.k === "access_alert" && n.uid === "PPART1") || myTasks(S.users.POWNER).some(n => n.k === "access_alert")'), 'the office gets "unusual looking at data"');
  await page.evaluate(() => { loginAs(S.users.PADMIN); Notify.hide(); go('access', {}); }); await page.waitForTimeout(250); await shot('3_office_access_log');
  await page.evaluate(() => go('access', { uid: 'PPART1' })); await page.waitForTimeout(200);
  await page.click('[data-a="accessOk"]'); await page.waitForTimeout(300);
  assert(!(await ev('accessAlert("PPART1")')), 'after the office checks it, the alert stops');
  await act('CONFIG_SET', null, { key: 'accessAlert', value: 3 }, 'POWNER');
  await page.evaluate(() => { loginAs(S.users.PPART1); ['AIEC-P001', 'AIEC-P002', 'AIEC-P003', 'AIEC-P004'].forEach(pid => go('project', { pid })); return flushAccess(); }); await page.waitForTimeout(300);
  assert(await ev('(accessAlert("PPART1") || {}).why') === 'acc_why_many', 'opening many jobs in one day alerts the office');
  const own = await page.evaluate(() => { App.me = S.users.PADMIN; return exportPack('person', 'PPART1').events.filter(e => e.type === 'ACCESS_LOGGED').length; });
  assert(own >= 2, 'the access log travels to the office with the company\'s file');

  /* a file made by a partner cannot carry records with hidden fields (only office files can) */
  const forged = await page.evaluate(() => { App.me = S.users.PPART1; const p = exportPack('person', 'PPART1'); p.events = [Object.assign({}, EVENTS.find(e => e.type === 'CONFIG_SET'), { id: 'FORGE-1', cut: 1, data: { key: 'minMargin', value: null } })]; return JSON.stringify(p); });
  const rf = await page.evaluate(async txt => importText(txt), forged);
  assert(rf.added === 0 && rf.rejected === 1, 'a file from a partner with hidden-field records is refused');

  /* three languages, no missing words */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PPART1', 'project', { pid: 'AIEC-P003' }], ['PADMIN', 'access', {}], ['PADMIN', 'access', { uid: 'PPART1' }], ['PSENIOR', 'home', {}], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { LANG = 'mr'; App.set.lang = 'mr'; loginAs(S.users.PPART1); go('project', { pid: 'AIEC-P003' }); }); await page.waitForTimeout(200); await shot('4_partner_project_marathi');
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('PRIVACY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
