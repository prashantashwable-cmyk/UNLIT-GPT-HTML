/* Owner money-at-risk strip and field ergonomics (v4 journey): the Owner/Admin home shows money spent beyond what
   the customer paid (target ₹0), sites waiting on builder civil work, QC waits and AMCs ending in 60 days, each opening
   its list; field staff are offered the sunlight look with full-size buttons once. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  /* a job that has cost more than the customer has paid */
  const J = await ev(`(P => { (P.expenses = P.expenses || []).push({ id: 'X-RISK1', cat: 'transport', amount: paidTotal(P) + 50000, note: 'test', ev: [], by: 'PTECH', t: nowISO(), decided: { ok: true, by: 'PFIN', t: nowISO() } }); return P.id; })(Object.values(S.projects).find(P => P.stage === 'installing'))`);
  const rk = await ev(`riskOf(S.projects["${J}"])`);
  assert(rk.risk >= 50000 && rk.out - rk.inn === rk.risk, 'money at risk = spent − received: ' + rk.risk);
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(300);
  const txt = await page.innerText('main');
  assert(/Money and work at risk/.test(txt) && /Spent more than received/.test(txt) && /Waiting on builder/.test(txt) && /AMC ending in 60 days/.test(txt), 'the Owner sees the four numbers on the home screen');
  await page.click('[data-a="nav2"][data-v="risk|risk"]'); await page.waitForTimeout(250);
  assert((await page.innerText('main')).includes('at risk') && await page.$(`[data-a="openProject"][data-v="${J}"]`), 'tapping it lists each site with spent, received and at risk');
  /* field */
  await page.evaluate(() => { App.set.sunAsked = false; App.set.theme = 'auto'; applyTheme(); loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(250);
  assert(/Working outdoors\?/.test(await page.innerText('main')), 'a technician is offered Sunlight mode');
  await page.click('[data-a="sunYes"]'); await page.waitForTimeout(250);
  assert(await ev(`document.documentElement.dataset.theme === 'contrast' && getScale() === 100 && App.set.sunAsked`), 'one tap: high-contrast look and full-size (100%) buttons; not asked again');
  assert(await ev(`(b => !b || parseFloat(getComputedStyle(b).minHeight) >= 56)(document.querySelector('.btn'))`), 'buttons are at least 56 px tall');
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY H PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
