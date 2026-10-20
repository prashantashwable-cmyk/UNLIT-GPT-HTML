/* Camera and location permission denied: the app explains how to fix it and still lets the user continue safely. */
const { chromium, APP } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP); await page.waitForTimeout(400);
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(3500);
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); wiz('lead', null); });
  await page.waitForTimeout(300);
  await page.click('[data-a="pick"][data-k="safe"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(200);
  await page.click('[data-a="cam"][data-k="b"]'); await page.waitForTimeout(1500);
  const camTxt = await page.innerText('#ov');
  console.log('camera screen:', camTxt.replace(/\n+/g, ' | ').slice(0, 200));
  assert(/permission|not available/i.test(camTxt) && /Try again/.test(camTxt), 'camera denied shows how to fix and Try again');
  assert(/Practice photo/.test(camTxt), 'practice mode offers a practice photo');
  assert(!/upload|gallery|file/i.test(camTxt), 'no file-manager upload offered for evidence');
  await page.click('#ov [data-x="sample"]'); await page.waitForTimeout(400); await page.click('#ov [data-x="use"]'); await page.waitForTimeout(800);
  const n = await page.evaluate(() => W.ctx.b.length);
  assert(n === 1, 'practice photo saved into the step');
  /* location denied: step explains and still allows typing the address */
  await page.evaluate(() => { W.ctx.s = W.ctx.b.slice(); W.sid = 'loc'; render(); });
  await page.waitForTimeout(2500); await page.evaluate(() => render());
  const loc = await page.innerText('main');
  console.log('location screen:', loc.replace(/\n+/g, ' | ').slice(0, 220));
  assert(/Location permission is off|Could not find location|Finding your location/.test(loc), 'location problem explained');
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  assert(/GPS location or type the address/.test(await page.innerText('main')), 'cannot continue with neither GPS nor address');
  await page.fill('#f_address', 'Near water tank, Katraj'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  assert(await page.evaluate(() => W.sid) === 'contact', 'typed address lets the user continue');
  console.log('ERRORS', errors.join('\n') || 'none');
  await browser.close();
  if (errors.length) { console.error('FAILED'); process.exit(1); }
  console.log('PERMISSIONS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
