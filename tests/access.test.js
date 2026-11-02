/* Screen readers and keyboards: the whole screen is not re-announced on every change, focus moves to the new screen's
   title after navigation, messages are still announced; a loading screen is painted before the big script runs; a
   safe content security policy; HTML built with hx`...` escapes names by default. */
const fs = require('fs');
const path = require('path');
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html'), 'utf8');
  const app = html.indexOf('<div id="app">'), script = html.indexOf('<script>');
  assert(app > 0 && app < script && /class="splash"[\s\S]*Loading/.test(html.slice(app, script)), 'a loading screen is in the page before the app script, in Marathi, Hindi and English');
  assert(/http-equiv="Content-Security-Policy" content="object-src 'none'; base-uri 'none'; form-action 'none'"/.test(html), 'a content security policy blocks plugins, base-URL tricks and form posting');
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  assert(await page.evaluate(() => !document.getElementById('app').hasAttribute('aria-live') && document.getElementById('toast').getAttribute('aria-live') === 'assertive'), 'the whole screen is not re-read on every change; messages still are');
  assert(await page.evaluate(() => !document.querySelector('#app .splash')), 'the loading screen is gone once the app has started');
  const f = await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('projects'); const a = document.activeElement; return a && a.tagName + ':' + a.textContent; });
  assert(/^H1:/.test(f), 'after moving to a screen, focus is on its title: ' + f);
  const x = await page.evaluate(() => hx`<b>${'<img src=x onerror=alert(1)> Patil & Sons'}</b>${raw('<i>ok</i>')}${['<u>1</u>']}`);
  assert(x === '<b>&lt;img src=x onerror=alert(1)&gt; Patil &amp; Sons</b><i>ok</i><u>1</u>', 'hx`` escapes every value unless marked raw: ' + x);
  /* inside the Android app: counts as installed; files and printing go to the phone */
  const an = await page.evaluate(async () => {
    const before = isInstalled(); const calls = [];
    Object.defineProperty(navigator, 'userAgent', { value: navigator.userAgent + ' AIECAndroid/1.0', configurable: true });
    window.AIECAndroid = { saveFile: (n, m, b) => calls.push(['save', n, m, atob(b)]), print: tt => calls.push(['print', tt]) };
    const after = isInstalled(); await saveText('test.json', '{"a":1}', 'application/json'); loginAs(S.users.PADMIN); ACT.print();
    delete window.AIECAndroid; return { before, after, calls };
  });
  assert(!an.before && an.after, 'inside the Android app the web app counts as installed (no install prompt)');
  assert(an.calls.some(c => c[0] === 'save' && c[1] === 'test.json' && c[3] === '{"a":1}') && an.calls.some(c => c[0] === 'print'), 'files are saved and pages printed through the Android app');
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('ACCESS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
