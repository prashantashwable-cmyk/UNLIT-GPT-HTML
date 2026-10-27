/* Practice mode: sample data is created through the same rules engine; every role sees its own tasks. */
const path = require('path');
const { launch, tap, miss, pin, OUT } = require('./lib');
(async () => {
  const { browser, page, errors } = await launch();
  const shot = n => page.screenshot({ path: path.join(OUT, `practice_${n}.png`), fullPage: false });
  await shot('01_welcome');
  await tap(page, '[data-a="nav"][data-v="lang"]');
  await tap(page, '[data-a="setLang"][data-v="mr"]');
  await shot('02_lang');
  await tap(page, '[data-a="afterLang"]');
  await shot('03_intro');
  await tap(page, '[data-a="introSkip"]');
  await shot('04_setup');
  await tap(page, '[data-a="practice"]', { wait: 3000 });
  await shot('05_login');
  const users = await page.$$eval('[data-a="loginUser"]', b => b.map(x => [x.dataset.v, x.innerText.replace(/\n/g, ' ')]));
  console.log('users', users.length, users.map(u => u[1]).join(' | '));
  for (const [uid, name] of users) {
    await tap(page, `[data-a="loginUser"][data-v="${uid}"]`);
    await pin(page);
    if (await page.$('[data-a="permsDone"]')) await tap(page, '[data-a="permsDone"]');
    const tasks = await page.$$eval('.task[data-a="openTask"]', b => b.map(x => x.querySelector('b').innerText));
    console.log('ROLE', name, '=> tasks:', tasks.length, tasks.join(' ; '));
    await shot('home_' + uid);
    for (const tab of ['projects', 'map', 'chat', 'me', 'docs']) {
      if (await page.$(`.nav [data-v="${tab}"]`)) { await tap(page, `.nav [data-v="${tab}"]`); }
    }
    await tap(page, '.nav [data-v="home"]');
    const first = await page.$('[data-a="openTask"][data-v="0"]');
    if (first) { await first.click(); await page.waitForTimeout(300); await shot('task_' + uid); }
    await page.evaluate(() => ACT.logout());
    await page.waitForTimeout(200);
  }
  const rej = await page.evaluate(() => S.rejected.map(r => r.ev.type + ':' + errText(r.err)));
  console.log('REJECTED', rej.length, rej.join(' | '));
  const stages = await page.evaluate(() => Object.values(S.projects).map(P => P.id + '=' + P.stage).join(' '));
  console.log('STAGES', stages);
  console.log('MISSING', (await miss(page)).join(', '));
  console.log('ERRORS', errors.join('\n') || 'none');
  const missing = await miss(page);
  if (rej.length || missing.length || errors.length || users.length !== 15) { console.error('FAILED'); process.exit(1); }
  console.log('PRACTICE PASSED');
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
