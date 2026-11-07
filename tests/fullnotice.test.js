/* No "to exit full screen" notice: the installed app opens full screen through its manifest (or the Android app's own
   immersive mode), so the page never asks the browser for full screen unless the person turns it on in Settings. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const asked = await page.evaluate(async () => {
    let n = 0; document.documentElement.requestFullscreen = () => { n++; return Promise.resolve(); };
    window.isInstalledReal = isInstalled; isInstalled = () => true;   /* pretend this is the installed app */
    delete App.set.fullscreen;
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const a = n;
    App.set.fullscreen = true; document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const b = n; App.set.fullscreen = false; isInstalled = window.isInstalledReal;
    return { a, b };
  });
  assert(asked.a === 0, 'by default the app never asks the browser for full screen (no notice)');
  assert(asked.b === 1, 'only when the person turns "Start in full screen" on does it ask');
  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(250);
  assert(await page.evaluate(() => document.querySelector('header .ib-out').textContent.trim() === '🚪'), 'the log-out button uses an icon every phone can show');
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('FULL NOTICE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
