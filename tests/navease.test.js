/* Ease of moving around: every map can fill the screen (⛶) and ✕ or the phone's Back closes it; a 🚪 Log out button
   sits in the top-right corner and asks first; in full-screen mode the app shows its own ← Back; Back on the first
   page asks "Exit the app?" (Stay keeps the app, Exit closes it). */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; go('home'); }, uid); await page.waitForTimeout(300); };
  const phoneBack = async () => { await page.evaluate(() => aiecBack()); await page.waitForTimeout(200); };
  const isFs = id => ev(`document.getElementById('${id}').classList.contains('mapfs')`);
  /* maps */
  await as('PTECH');
  await page.click('[data-a="mapFull"][data-v="hbox"]'); await page.waitForTimeout(200);
  const r = await ev(`(() => { const b = document.getElementById('hbox').getBoundingClientRect(); return { w: b.width, h: b.height, W: innerWidth, H: innerHeight }; })()`);
  assert(await isFs('hbox') && r.w >= r.W - 1 && r.h >= r.H - 1, 'the home map fills the screen');
  await page.click('#hbox [data-a="mapFullClose"]'); await page.waitForTimeout(150);
  assert(!(await isFs('hbox')), 'Close returns to the page');
  await page.click('[data-a="mapFull"][data-v="hbox"]'); await page.waitForTimeout(150); await phoneBack();
  assert(!(await isFs('hbox')) && await ev(`App.route.name === 'home'`), 'the phone Back closes the full-screen map first');
  await page.evaluate(() => go('map')); await page.waitForTimeout(250);
  await page.click('[data-a="mapFull"][data-v="fbox"]'); await page.waitForTimeout(150);
  assert(await isFs('fbox'), 'the full map has the full-screen button too');
  await page.click('#fbox [data-a="mapFullClose"]'); await page.waitForTimeout(150);
  /* log out in the corner */
  for (const scr of ['home', 'projects', 'chat', 'me', 'map']) {
    await page.evaluate(s => go(s), scr); await page.waitForTimeout(150);
    const pos = await ev(`(() => { const b = document.querySelector('header.top [data-a="logoutAsk"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { right: innerWidth - r.right, top: r.top }; })()`);
    assert(pos && pos.right < 30 && pos.top < 60, `Log out is in the top-right corner (${scr})`);
  }
  await page.click('[data-a="logoutAsk"]'); await page.waitForTimeout(150);
  assert(/Log out\?/.test(await page.innerText('#ov')), 'Log out asks first');
  await page.click('#ov [data-a="closeSheet"]'); await page.waitForTimeout(100);
  assert(await ev(`App.me && App.me.uid === 'PTECH'`), 'Stay keeps the person signed in');
  await page.click('[data-a="logoutAsk"]'); await page.waitForTimeout(150); await page.click('[data-a="logoutGo"]'); await page.waitForTimeout(200);
  assert(await ev(`!App.me`), 'Log out signs out');
  assert(!(await page.$('header.top [data-a="logoutAsk"]')), 'no Log out button when nobody is signed in');
  /* own Back in full screen */
  await as('PTECH');
  assert(!(await page.$('.fback')), 'not in full screen: no extra Back button (the phone has its own)');
  await page.evaluate(() => { App.forceFull = true; ACT.nav('home'); }); await page.waitForTimeout(150);
  assert(!(await page.$('.fback')), 'full screen, first page: nothing to go back to, no back button');
  await page.evaluate(() => go('me')); await page.waitForTimeout(150);
  assert(!!(await page.$('.fback')), 'full screen, another page: the back button shows');
  const fb = await ev(`(() => { const r = document.querySelector('.fback').getBoundingClientRect(); return { left: r.left, bottom: innerHeight - r.bottom }; })()`);
  assert(fb.left < 30 && fb.bottom > 60, 'bottom-left, above the menu');
  await page.click('.fback'); await page.waitForTimeout(200);
  assert(await ev(`App.route.name === 'home'`), 'the back button goes back');
  await page.evaluate(() => { App.forceFull = false; });
  /* ask before exit */
  await page.evaluate(() => { window._exit = 0; window.AIECAndroid = { exit: () => { window._exit++; } }; ACT.nav('home'); }); await page.waitForTimeout(150);
  await phoneBack();
  assert(/Exit the app\?/.test(await page.innerText('#ov')), 'Back on the first page asks "Exit the app?"');
  await page.click('#exitBox [data-a="closeSheet"]'); await page.waitForTimeout(100);
  assert(await ev(`App.route.name === 'home' && !App.exiting && window._exit === 0`), 'Stay keeps the app open');
  await page.evaluate(() => { aiecBack(); exitAsk(); }); await page.waitForTimeout(150);
  assert((await page.$$('#exitBox')).length === 1, 'asking twice does not stack boxes');
  await page.click('[data-a="exitApp"]'); await page.waitForTimeout(100);
  assert(await ev(`window._exit === 1`), 'Exit closes the app (Android)');
  /* in a browser: never walk back through the tab's history (that can land on GitHub's 404 page) */
  await page.evaluate(() => { delete window.AIECAndroid; App.exiting = false; window._hist = 0; const g = history.go.bind(history); history.go = n => { window._hist++; }; window._close = window.close; window.close = () => {}; ACT.nav('home'); });
  await page.waitForTimeout(100); await page.evaluate(() => exitAsk()); await page.waitForTimeout(100);
  await page.click('[data-a="exitApp"]'); await page.waitForTimeout(500);
  assert(await ev(`window._hist === 0 && App.route.name === 'closed'`) && /AIEC OS is closed/.test(await page.innerText('main')), 'in a browser, Exit shows "closed" and never leaves the app');
  await page.click('[data-a="reopen"]'); await page.waitForTimeout(200);
  assert(await ev(`App.route.name !== 'closed' && !App.exiting`), '"Open again" brings the app back');
  assert(/AIEC-Elevator-OS\.html/.test(require('fs').readFileSync(require('path').join(__dirname, '..', '404.html'), 'utf8')), 'a wrong address on the site leads to the app (404.html)');
  await page.evaluate(() => { App.exiting = false; });
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('NAV EASE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
