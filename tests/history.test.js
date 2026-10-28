/* History as a tree: each stage opens into the steps done in it; each step opens its details.
   Customers see only customer-safe steps, never internal reasons or office decisions. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const C = await ev('Object.values(S.projects).find(P => P.customer === "PCUST").id');
  const open = async (uid, pid) => { await page.evaluate(([uid, pid]) => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go('project', { pid, tab: 'timeline' }); }, [uid, pid]); await page.waitForTimeout(200); };

  /* grouping */
  assert(await page.evaluate(C => { loginAs(S.users.PADMIN); const g = histTree(S.projects[C]), ids = g.flatMap(x => x.evs.map(e => e.id)); return ids.length === S.projects[C].log.length && new Set(ids).size === ids.length; }, C), 'office: every record of the job is in exactly one stage');
  assert(await page.evaluate(C => { loginAs(S.users.PADMIN); return histTree(S.projects[C]).every(g => g.evs.every(e => e.t >= g.h.t || g === histTree(S.projects[C])[0])); }, C), 'each step sits under the stage it happened in');

  /* the customer */
  await open('PCUST', C);
  assert(await page.$('main details.tl-i'), 'the customer\'s history shows stages that open');
  const firstOpen = await page.$$eval('main details.tl-i', ds => ds.map(d => d.open));
  assert(firstOpen[0] === true && firstOpen.slice(1).every(o => !o), 'the newest stage is open, the others closed');
  const inst = await page.$$('main details.tl-i');
  let instIdx = -1; for (let i = 0; i < inst.length; i++) if (/Installation|installing/i.test(await inst[i].evaluate(d => d.querySelector('summary').innerText))) { instIdx = i; break; }
  assert(instIdx >= 0, 'there is an installation stage');
  await inst[instIdx].evaluate(d => d.querySelector('summary').click()); await page.waitForTimeout(200);
  const steps = await inst[instIdx].evaluate(d => [...d.querySelectorAll('.tl-step')].map(b => b.innerText));
  assert(steps.some(s => /Installation step|step/i.test(s)), 'opening installation lists the installation steps');
  const custTypes = await page.$$eval('main .tl-step', bs => bs.map(b => S.byId[b.dataset.v].type));
  const bad = await page.evaluate(ts => ts.filter(x => !CUST_TL.includes(x) && !Object.values(S.byId).some(e => e.type === x && e.by === 'PCUST')), custTypes);
  assert(!bad.length && !custTypes.includes('RELEASED') && !custTypes.includes('PAY_APPROVED') && !custTypes.includes('QUOTE_CREATED'), 'the customer never sees office steps' + (bad.length ? ': ' + bad.join(' ') : ''));
  await page.evaluate(() => { App.form = App.form || {}; render(); }); await page.waitForTimeout(150);
  const after = await page.$$eval('main details.tl-i', ds => ds.map(d => d.open));
  assert(after[instIdx] === true, 'an opened stage stays open after the screen redraws');
  const stepBtn = await page.$('main details.tl-i[open] .tl-step');
  await stepBtn.click(); await page.waitForTimeout(250);
  const sh = await page.innerText('#ov');
  assert(/When/.test(sh) && /Done by/.test(sh) && !/Reason/.test(sh), 'a step opens its details: when and who; no reasons for the customer');
  await page.evaluate(() => closeSheet());
  const hid = await ev(`Object.values(S.byId).find(e => e.pid === "${C}" && e.type === "RELEASED").id`);
  await page.evaluate(id => ACT.tlEv(id), hid); await page.waitForTimeout(100);
  assert(!(await page.innerText('#ov')).trim(), 'an office step cannot be opened by the customer');

  /* the office */
  await open('PADMIN', C);
  const offTypes = await page.$$eval('main .tl-step', bs => bs.map(b => S.byId[b.dataset.v].type));
  assert(offTypes.includes('RELEASED'), 'the office sees all steps');
  const withPh = await ev(`Object.values(S.byId).find(e => e.pid === "${C}" && e.type === "SOP_STEP_DONE").id`);
  await page.evaluate(id => ACT.tlEv(id), withPh); await page.waitForTimeout(300);
  assert(/Photos and signatures/.test(await page.innerText('#ov')) && await page.$('#ov .photos'), 'an installation step shows its photos');
  await page.evaluate(() => closeSheet());

  for (const lang of ['en', 'hi', 'mr']) for (const uid of ['PCUST', 'PADMIN', 'PSENIOR']) {
    await page.evaluate(([lang, uid, C]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); go('project', { pid: C, tab: 'timeline' }); document.querySelectorAll('main details.tl-i').forEach(d => d.open = true); }, [lang, uid, C]); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll (${lang}, ${uid})`);
  }
  await page.evaluate(id => ACT.tlEv(id), withPh); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('HISTORY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
