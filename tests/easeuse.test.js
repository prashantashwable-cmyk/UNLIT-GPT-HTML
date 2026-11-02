/* Ease of use (OCT file): tap a job number anywhere to open the job, tap a name to see who it is; full screen on start
   (installed app, after the first tap) with a switch; a bright colourful theme; "My day" per role that ticks itself. */
const fs = require('fs');
const path = require('path');
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const man = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  assert(JSON.stringify(man.display_override) === '["fullscreen","standalone"]' && man.display === 'standalone', 'the installed app asks for full screen, falling back to the normal app window');
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));

  /* job numbers become links */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-P003', tab: 'chat' }); }); await page.waitForTimeout(300);
  await page.evaluate(async () => { await perform('CHAT_POSTED', 'AIEC-P003', { text: 'Same supplier delay as AIEC-P002 last week' }, { as: 'PADMIN', quiet: true }); render(); }); await page.waitForTimeout(300);
  const link = await page.$('.pidlink[data-v="AIEC-P002"]');
  assert(link, 'a job number written in a chat message becomes a link');
  await link.click(); await page.waitForTimeout(300);
  assert(await ev('App.route.name === "project" && App.route.p.pid === "AIEC-P002"'), 'tapping it opens that job');
  await page.evaluate(() => { loginAs(S.users.PCUST); go('home'); }); await page.waitForTimeout(250);
  assert(!(await ev('[...document.querySelectorAll(".pidlink")].some(b => !canSee(App.me, S.projects[b.dataset.v]))')), 'only jobs the person may open become links');

  /* names open a person card */
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('project', { pid: 'AIEC-P003', tab: 'info' }); }); await page.waitForTimeout(300);
  const ul = await page.evaluate(() => { const el = [...document.querySelectorAll('main .ulink[data-a="personOpen"]')].find(e => e.checkVisibility()); if (el) el.setAttribute('id', 'ulvis'); return !!el; });
  assert(ul, 'names on the job page can be tapped');
  await page.click('#ulvis'); await page.waitForTimeout(250);
  assert(/stars|Company:|Open profile/.test(await page.innerText('#ov')), 'tapping a name shows who it is (level, stars, company)');
  await page.evaluate(() => closeSheet());
  assert(await ev('!document.querySelector("button .ulink[data-a], a .ulink[data-a]")'), 'names inside a button do not steal the button\'s tap');

  /* full screen switch and colourful theme */
  await page.evaluate(() => { go('me'); const d = document.querySelector('details[data-fold="me_set"]'); if (d) d.open = true; }); await page.waitForTimeout(250);
  const st = await page.innerText('main');
  assert(/Full screen/.test(st) && /Start in full screen/.test(st), 'settings has a full-screen switch');
  assert(/Bright & colourful/.test(st), 'and a bright colourful theme');
  await page.evaluate(() => { App.set.theme = 'color'; applyTheme(); render(); }); await page.waitForTimeout(150);
  assert(await ev('document.documentElement.dataset.theme === "color" && getComputedStyle(document.documentElement).getPropertyValue("--info").trim() === "#2f5bea"'), 'the colourful theme applies its colours');
  await page.evaluate(() => { App.set.theme = 'auto'; applyTheme(); });

  /* my day */
  for (const [uid, re] of [['PTECH', /Check in at the site[\s\S]*Daily safety check[\s\S]*End of day/], ['PFIELD', /Start the shift[\s\S]*Add sites with photos[\s\S]*End the shift/], ['PADMIN', /Nothing urgent left[\s\S]*Close the day/], ['POWNER', /this week's numbers[\s\S]*Decisions waiting/]]) {
    await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; go('home'); }, uid); await page.waitForTimeout(250);
    assert(re.test(await page.innerText('#routine')), '"My day" for ' + uid);
  }
  await page.evaluate(async () => { await perform('SHIFT_STARTED', null, { safe: true, gps: { lat: 18.52, lng: 73.85, acc: 9 } }, { as: 'PFIELD', quiet: true }); loginAs(S.users.PFIELD); go('home'); }); await page.waitForTimeout(250);
  assert(/✅ Start the shift/.test(await page.innerText('#routine')), 'it ticks itself when the person does the step');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PTECH); go('home'); }, lang); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('EASE OF USE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
