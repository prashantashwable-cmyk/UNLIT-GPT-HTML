/* Real company use only inside the installed app; practice mode works in the browser. */
const { chromium, APP } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function open(installed) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (installed) await page.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q); });
  await page.goto(APP); await page.waitForTimeout(400);
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; go('setup'); });
  await page.waitForTimeout(200);
  return { browser, page, errors };
}
(async () => {
  let { browser, page, errors } = await open(false);
  assert(await page.evaluate(() => !!document.querySelector('[data-a="copyUrl"]')) && /Install the app/.test(await page.innerText('header')), 'browser (not installed): real setup is replaced by the install screen');
  await page.evaluate(() => go('newOrg')); await page.waitForTimeout(150);
  assert(!(await page.$('[data-a="createOrg"]')), 'cannot reach "create company" without installing');
  await page.click('[data-a="practice"]'); await page.waitForTimeout(3500);
  assert(await page.evaluate(() => App.mode === 'practice' && App.route.name === 'login' && !!document.querySelector('[data-a="loginUser"]')), 'practice mode still works in the browser');
  await page.evaluate(() => ACT.exitPractice()); await page.waitForTimeout(300);
  assert(/Install the app/.test(await page.innerText('header')), 'leaving practice shows the install screen again');
  if (errors.length) throw new Error(errors.join('; '));
  await browser.close();

  ({ browser, page, errors } = await open(true));
  assert(await page.$('[data-a="nav"][data-v="newOrg"]'), 'installed app: real company setup is available');
  if (errors.length) throw new Error(errors.join('; '));
  await browser.close();
  console.log('INSTALL GATE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
