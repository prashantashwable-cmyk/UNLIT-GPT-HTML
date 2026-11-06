/* Share the app: from Me, from the first page and from the gate before sign-in. Each person's link carries only a
   short code (a customer's lift code, otherwise their user id) so enquiries are credited to them; the message is
   ready in English, Hindi and Marathi; a QR and a printable poster; office roles also get worker invites and login
   codes. Opening a shared link remembers who shared it and the enquiry carries it. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; ACT.nav('home'); }, uid); await page.waitForTimeout(250); };
  /* entry points */
  await as('PFIELD');
  assert(!!(await page.$('main [data-a="nav"][data-v="shareApp"]')), 'the first page has a Share button');
  await page.evaluate(() => go('me')); await page.waitForTimeout(150);
  assert(!!(await page.$('main [data-a="nav"][data-v="shareApp"]')), 'Me has "Share the app"');
  await page.evaluate(() => go('shareApp')); await page.waitForTimeout(200);
  const msg = await page.inputValue('#shMsg');
  assert(/#r=PFIELD$/.test(msg) && /rough price in 4 questions/.test(msg), 'the message carries the link with this person\'s code');
  assert(!/9822|PIN|secret/i.test(msg.replace(/AIEC-Elevator-OS/, '')) && !/[?&](s|k)=/.test(msg), 'the link carries no phone number, PIN or server key');
  const wa = await page.getAttribute('a[href^="https://wa.me/"]', 'href');
  assert(decodeURIComponent(wa.split('text=')[1]) === msg, 'WhatsApp opens with the message filled in (nothing is sent by the app)');
  await page.click('[data-a="shLang"][data-v="mr"]'); await page.waitForTimeout(100);
  assert(/अ‍ॅप|किंमत/.test(await page.inputValue('#shMsg')), 'the message can be in Marathi');
  await page.click('[data-a="shLang"][data-v="hi"]'); await page.waitForTimeout(100);
  assert(/कीमत/.test(await page.inputValue('#shMsg')), 'and in Hindi');
  assert(!!(await page.$('main svg')), 'a QR is shown');
  assert(/From your link so far: 0 enquiries/.test(await page.innerText('main')), 'the person sees what came from their link');
  assert(!(await page.$('[data-v="joinlink"]')), 'field staff do not get the worker invite tools');
  await page.click('[data-a="shPoster"]'); await page.waitForTimeout(150);
  assert(/Need a lift\? Rough price in 4 questions/.test(await page.innerText('main')), 'a printable poster with the QR');
  /* office */
  await as('PADMIN'); await page.evaluate(() => go('shareApp')); await page.waitForTimeout(200);
  assert(!!(await page.$('[data-a="nav"][data-v="joinlink"]')) && /login code/i.test(await page.innerText('main')), 'Admin also gets worker invites and login codes');
  /* customer: lift code as the code, only once the lift is finished */
  const cp = await ev(`custPid(S.users.PCUST)`);
  await as('PCUST');
  const done = await ev(`!!S.projects['${cp}'].done`);
  assert(!!(await page.$('main [data-v="shareApp"]')) === done, 'a customer is asked to recommend only after their lift is finished');
  await page.evaluate(() => go('shareApp')); await page.waitForTimeout(150);
  const cm = await page.inputValue('#shMsg'), code = await ev(`(S.projects['${cp}'].lift || {}).code || ''`);
  assert(code ? cm.endsWith('#r=' + code) : /#r=PCUST$/.test(cm), 'a customer\'s link uses their lift code (the referral code they already have)');
  /* before sign-in */
  await page.evaluate(() => { App.me = null; go('gate'); }); await page.waitForTimeout(200);
  assert(!!(await page.$('[data-a="nav"][data-v="shareApp"]')), 'the gate (before sign-in) has Share');
  await page.click('[data-a="nav"][data-v="shareApp"]'); await page.waitForTimeout(150);
  assert(/AIEC-Elevator-OS\.html$/.test(await page.inputValue('#shMsg')), 'before sign-in the plain app link is shared');
  /* opening a shared link */
  assert(await ev(`parseRef('#r=PFIELD') === 'PFIELD' && parseRef('#r=<x>') === null && parseRef('#j=1') === null`), 'only a clean code is read from a link');
  await page.evaluate(() => { App.set.ref = 'PFIELD'; App.me = null; App.form = { rqName: 'Ravi K', rqPhone: '9876543210', rqAddr: 'Baner' }; go('enquiry'); }); await page.waitForTimeout(150);
  await page.evaluate(() => ACT.enqMake()); await page.waitForTimeout(150);
  assert(await ev(`/Ref: PFIELD/.test(reqDecode(App.reqOut.msg).note)`), 'an enquiry from a shared link carries who shared it');
  await page.evaluate(() => { App.set.ref = null; });
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SHARE APP PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
