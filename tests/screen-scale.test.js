/* Screen size 20%–150%: applies to the whole page, is remembered, and a normal-size reset button is always reachable below 60%. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(3500);
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); ACT.nav('me'); }); await page.waitForTimeout(200);
  await page.click('details[data-fold="me_set"] > summary'); await page.waitForTimeout(150);
  assert(await page.evaluate(() => App.set.fold.me_set === true), 'settings open with one tap and stay open');
  for (let i = 0; i < 3; i++) await page.click('[data-a="scaleStep"][data-v="10"]');
  assert(await page.evaluate(() => getScale() === 130 && document.documentElement.style.zoom === '1.3'), '+ button raises the scale to 130%');
  for (let i = 0; i < 4; i++) await page.click('[data-a="scaleStep"][data-v="10"]');
  assert(await page.evaluate(() => getScale()) === 150, 'scale stops at 150%');
  await page.fill('#f_scale', '20'); await page.dispatchEvent('#f_scale', 'change');
  assert(await page.evaluate(() => getScale() === 20 && !!document.getElementById('scaleReset')), 'slider goes down to 20% and shows the reset button');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling at 20%');
  await page.reload(); await page.waitForTimeout(800);
  assert(await page.evaluate(() => getScale() === 20 && !!document.getElementById('scaleReset')), 'the chosen size is remembered after reopening');
  await page.click('#scaleReset'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => getScale() === 100 && !document.getElementById('scaleReset')), 'reset button returns to 100%');
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SCALE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
