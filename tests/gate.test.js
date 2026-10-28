/* Front door: animated logo, then three doors (customer/builder, join us, staff). On an empty phone each door still works:
   open the office's file, send an enquiry, or send a join request the office pastes in and approves. Builders see all their sites. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const route = () => ev('App.route.name');
  const fill = async (k, v) => { await page.fill(`[data-f="${k}"]`, v); };

  /* splash, then the doors */
  assert(await route() === 'splash' && await page.$('.splash .logo'), 'the app opens with the animated logo');
  await page.click('[data-a="splashSkip"]'); await page.waitForTimeout(150);
  assert(await route() === 'gate' && (await page.$$('button.door')).length === 3, 'a tap skips it; the three doors show');
  await page.click('[data-a="setLang"][data-v="en"]'); await page.waitForTimeout(100);
  assert(/Customer or builder/.test(await page.innerText('main')) && /Join us/.test(await page.innerText('main')) && /Staff login/.test(await page.innerText('main')), 'language can be chosen on the same screen');
  await page.evaluate(() => go('splash')); await page.waitForTimeout(2300);
  assert(await route() === 'gate', 'without a tap it moves on by itself');

  /* empty phone */
  await page.click('[data-a="door"][data-v="cust"]'); await page.waitForTimeout(100);
  assert(!(await page.$('[data-a="loginUser"]')) && await page.$('[data-a="nav"][data-v="join"]') && await page.$('[data-a="nav"][data-v="enquiry"]'), 'customer door on an empty phone: open my file, or a new enquiry');
  await page.evaluate(() => go('door', { kind: 'staff' })); await page.waitForTimeout(100);
  assert(await page.$('[data-a="nav"][data-v="join"]') && /New here/.test(await page.innerText('main')), 'staff door on an empty phone: open my file; new people are sent to Join us');
  await page.evaluate(() => go('door', { kind: 'join' })); await page.waitForTimeout(100);
  assert((await page.$$('[data-a="joinRole"]')).length === 7, 'join us: seven kinds of work, including supplier and partner company');

  /* join request */
  await page.click('[data-a="joinRole"][data-v="tech"]'); await page.waitForTimeout(100);
  await fill('rqName', 'Ganesh Pawar'); await fill('rqPhone', '9822012345'); await fill('rqArea', 'Hadapsar, Pune'); await fill('rqOffice', '9890000000');
  await fill('rqPin1', '4321'); await fill('rqPin2', '4320'); await page.click('[data-a="joinMake"]'); await page.waitForTimeout(150);
  assert(/not the same/.test(await page.innerText('main')), 'the two PINs must match');
  await fill('rqPin2', '4321'); await page.click('[data-a="joinMake"]'); await page.waitForTimeout(400);
  const join = await ev('App.reqOut');
  assert(await route() === 'reqSent' && /AIEC-REQ:/.test(join.msg) && await page.$('a[href^="https://wa.me/919890000000"]'), 'the request is a message with a code, ready to send on WhatsApp to the office');
  assert(!/4321/.test(join.msg) && await page.evaluate(m => { const o = reqDecode(m); return o && o.pin && o.salt && o.name === 'Ganesh Pawar'; }, join.msg), 'the PIN never travels, only a salted fingerprint');
  assert(await ev('!!App.set.myReq'), 'the phone remembers the request was made');

  /* enquiry */
  await page.evaluate(() => { App.form = {}; go('enquiry'); }); await page.waitForTimeout(100);
  await fill('rqName', 'Mr. Kulkarni'); await fill('rqPhone', '9765432109'); await page.click('[data-a="enqWho"][data-v="builder"]');
  await fill('rqAddr', 'Plot 12, Baner Road, Pune'); await fill('rqFloors', '7'); await page.click('[data-a="enqMake"]'); await page.waitForTimeout(300);
  const enq = await ev('App.reqOut');
  assert(enq.kind === 'enq' && await page.evaluate(m => { const o = reqDecode(m); return o && o.who === 'builder' && o.floors === 7; }, enq.msg), 'an enquiry carries the site details');
  assert(await page.evaluate(() => !reqDecode('hello') && !reqDecode('AIEC-REQ:' + btoa('{"v":1,"kind":"join","rid":"bad"}'))), 'a broken or made-up code is refused');
  assert(await page.evaluate(() => { const j = parseJoin('#j=1&n=AIEC%20Pune&o=9890000000'); return j.org === 'AIEC Pune' && j.office === '9890000000'; }), 'a join link carries the company and office number');

  /* the office pastes them in (practice company) */
  await page.evaluate(() => { App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('users'); }); await page.waitForTimeout(150);
  assert(await page.$('[data-a="nav"][data-v="paste"]') && await page.$('[data-a="nav"][data-v="joinlink"]'), 'Users has "Paste a request" and "Join link / QR"');
  await page.evaluate(() => go('paste')); await page.waitForTimeout(100);
  await fill('reqText', 'hello'); await page.click('[data-a="pasteRead"]'); await page.waitForTimeout(100);
  assert(/No request code/.test(await page.innerText('main')), 'a message without a code is refused');
  await fill('reqText', join.msg); await page.click('[data-a="pasteRead"]'); await page.waitForTimeout(150);
  let tx = await page.innerText('main');
  assert(/Ganesh Pawar/.test(tx) && /Not checked yet/.test(tx) && await page.$('a[href="tel:+919822012345"]'), 'the office sees the details, a warning, and a button to call first');
  await page.click('[data-a="pasteApprove"]'); await page.waitForTimeout(400);
  const o = await page.evaluate(m => reqDecode(m), join.msg), uid = 'U' + o.rid.slice(1);
  assert(await ev(`S.users["${uid}"] && S.users["${uid}"].role === "tech" && S.joins["${o.rid}"].ok`), 'approved: the technician is added');
  assert(await page.evaluate(async uid => { const u = S.users[uid]; return u.pin === await pinHash('4321', u.salt); }, uid), 'the PIN they chose on their own phone works');
  assert(/already decided/.test(await page.innerText('main')) && await page.$(`[data-a="exportFor"][data-v="${uid}"]`), 'the office is offered to send their file; pasting again is refused');
  assert(!(await page.evaluate(o => perform('JOIN_DECIDED', null, { rid: o.rid, ok: true, uid: 'x' }, { quiet: true }).then(r => r.ok), o)), 'a request is decided once');

  /* enquiry: becomes a task for Sales, then a lead */
  await page.evaluate(m => { App.form = { reqText: m, pasteOk: true }; go('paste'); }, enq.msg); await page.waitForTimeout(150);
  await page.click('[data-a="pasteEnq"]'); await page.waitForTimeout(300);
  const eid = await ev('S.enqOrder[0]');
  assert(await route() === 'enquiries' && await ev(`S.enquiries["${eid}"].open`), 'the enquiry is added to the list');
  assert(await page.evaluate(() => myTasks(S.users.PSALES).some(n => n.k === 'new_enquiry')), 'Sales is asked to call it');
  await page.evaluate(() => { loginAs(S.users.PFIELD); go('enquiries'); }); await page.waitForTimeout(100);
  await page.click(`[data-a="enqVisit"][data-v="${eid}"]`); await page.waitForTimeout(300);
  assert(await ev(`W && W.id === "lead" && W.ctx.name === "Mr. Kulkarni" && W.ctx.enq === "${eid}"`), 'visiting the site starts a new lead with the details filled in');
  await page.evaluate(() => { W = null; });
  assert(await page.evaluate(eid => perform('ENQUIRY_CLOSED', null, { eid }, { as: 'PSALES', quiet: true }).then(r => r.err && (r.err.k || r.err)), eid) === 'err_reason', 'closing without a lead needs a reason');

  /* doors with people on the phone */
  await page.evaluate(() => { App.me = null; go('door', { kind: 'cust' }); }); await page.waitForTimeout(100);
  const cu = await page.$$eval('[data-a="loginUser"]', bs => bs.map(b => S.users[b.dataset.v].role));
  assert(cu.length && cu.every(r => r === 'customer'), 'the customer door lists customers only');
  await page.evaluate(() => go('door', { kind: 'staff' })); await page.waitForTimeout(100);
  const st = await page.$$eval('[data-a="loginUser"]', bs => bs.map(b => S.users[b.dataset.v].role));
  assert(st.length && !st.includes('customer'), 'the staff door never shows customers');

  /* builder: one login, many sites */
  assert(await page.evaluate(() => perform('CUSTOMER_LINKED', 'AIEC-P005', { uid: 'PCUST' }, { as: 'PADMIN', quiet: true }).then(r => r.ok)), 'the office links the builder to another site');
  assert(await page.evaluate(() => perform('CUSTOMER_LINKED', 'AIEC-P005', { uid: 'PCUST' }, { as: 'PADMIN', quiet: true }).then(r => !r.ok)), 'a site has one customer login');
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  assert(/Your sites/.test(await page.innerText('main')) && (await page.$$('[data-a="custSite"]')).length === 2, 'the builder sees both sites');
  await page.click('[data-a="custSite"][data-v="AIEC-P005"]'); await page.waitForTimeout(200);
  assert(/AIEC-P005/.test(await page.$eval('main .card:nth-of-type(2)', d => d.innerText).catch(() => '')) || await ev('custPid(App.me) === "AIEC-P005"'), 'switching shows the other site');
  assert(await ev('visibleProjects(App.me).length === 2'), 'and nothing else');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) for (const [name, p, who] of [['gate', {}, null], ['door', { kind: 'join' }, null], ['joinReq', { role: 'partner' }, null], ['enquiry', {}, null], ['paste', {}, 'PADMIN'], ['joinlink', {}, 'PADMIN'], ['enquiries', {}, 'PADMIN'], ['home', {}, 'PCUST']]) {
    await page.evaluate(([lang, name, p, who, m]) => { LANG = lang; App.set.lang = lang; if (who) loginAs(S.users[who]); else App.me = null; App.reqOut = { kind: 'join', office: '9890000000', msg: m }; if (name === 'paste') App.form = { reqText: m, pasteOk: true }; go(name, p); }, [lang, name, p, who, join.msg]); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(m => { App.me = null; App.reqOut = { kind: 'enq', office: '9890000000', msg: m }; go('reqSent'); }, enq.msg); await page.waitForTimeout(80);
  const mm = await miss(page);
  assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('GATE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
