/* Every screen for every role at 320px wide with Extra-large text, in Marathi and Hindi: no horizontal scroll, no missing words, no errors. */
const { launch, tap, miss, pin } = require('./lib');
(async () => {
  const { browser, page, errors } = await launch({ viewport: { width: 320, height: 640 } });
  const W8 = ms => page.waitForTimeout(ms);
  const over = [];
  const check = async label => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, route: App.route.name }));
    if (r.sw > r.w + 1) {
      const wide = await page.evaluate(() => [...document.querySelectorAll('#app *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map(e => e.tagName + '.' + e.className + ' ' + (e.innerText || '').slice(0, 30)));
      over.push(`${label} [${r.route}] ${r.sw}>${r.w} :: ${wide.join(' | ')}`);
    }
  };
  await page.evaluate(() => { App.set.lang = 'mr'; LANG = 'mr'; App.set.introDone = true; App.set.size = 'xl'; document.documentElement.dataset.size = 'xl'; });
  await page.evaluate(() => enterPractice()); await W8(3500);
  for (const lang of ['mr', 'hi']) {
    await page.evaluate(l => { LANG = l; App.set.lang = l; }, lang);
    const users = await page.evaluate(() => Object.values(S.users).map(u => u.uid));
    for (const uid of users) {
      await page.evaluate(() => ACT.logout()); await W8(100);
      await check('login');
      await tap(page, `[data-a="loginUser"][data-v="${uid}"]`); await pin(page);
      if (await page.$('[data-a="permsDone"]')) { await check('perms ' + uid); await tap(page, '[data-a="permsDone"]'); }
      await check('home ' + uid);
      for (const s of ['projects', 'map', 'chat', 'me', 'docs', 'perm', 'about', 'data', 'users', 'rules', 'audit', 'problems', 'report']) {
        await page.evaluate(v => ACT.nav(v), s); await W8(80); await check(s + ' ' + uid);
      }
      const pids = await page.evaluate(() => visibleProjects(App.me).map(P => P.id));
      for (const p of pids.slice(0, 4)) {
        for (const tab of ['info', 'timeline', 'chat', 'photos', 'money', 'docs']) { await page.evaluate(([p, tb]) => go('project', { pid: p, tab: tb }), [p, tab]); await W8(60); await check(`project ${p} ${tab} ${uid}`); }
        for (const k of ['quote', 'agreement', 'handover']) { await page.evaluate(([p, k]) => go('doc', { pid: p, kind: k }), [p, k]); await W8(60); await check(`doc ${p} ${k} ${uid}`); }
      }
      /* open each task's first screen, walk forward one step where possible */
      const n = await page.evaluate(() => myTasks(App.me).length);
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => ACT.nav('home')); await W8(80);
        await page.evaluate(i => openTask(App.tasks[i]), i); await W8(250);
        await check(`task#${i} ${uid}`);
        if (await page.$('[data-a="wizNext"]')) { await tap(page, '[data-a="wizNext"]', { wait: 150 }); await check(`task#${i} next ${uid}`); }
        await page.evaluate(() => { W = null; });
      }
    }
  }
  console.log('OVERFLOW', over.length ? '\n' + over.join('\n') : 'none');
  console.log('MISSING', (await miss(page)).join(', ') || 'none');
  console.log('ERRORS', errors.join('\n') || 'none');
  const missing = await miss(page);
  await browser.close();
  if (over.length || missing.length || errors.length) { console.error('FAILED'); process.exit(1); }
  console.log('LAYOUT PASSED');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
