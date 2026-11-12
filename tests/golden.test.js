/* Golden history: records stay on phones for years and travel between phones, so today's records must mean the same
   thing to every future version of the app. A saved set of version-1 records must rebuild to exactly the same jobs after
   any rule change; a record from a newer app is never guessed at. */
const fs = require('fs');
const path = require('path');
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-v1.json'), 'utf8'));
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const got = await page.evaluate(g => {
    const st = rebuild(JSON.parse(JSON.stringify(g.events)));
    return { rejected: st.rejected.map(x => x.ev.type + ':' + (x.err.k || x.err)), stages: Object.fromEntries(Object.values(st.projects).map(P => [P.id, P.stage])), users: Object.keys(st.users).length,
      sop: Object.fromEntries(Object.values(st.projects).map(P => [P.id, Object.keys(P.sop).length])), pays: Object.fromEntries(Object.values(st.projects).map(P => [P.id, P.payments.map(x => x.status).join(',')])) };
  }, gold);
  assert(gold.events.length > 300 && gold.events.every(e => e.v === 1), 'the golden history has ' + gold.events.length + ' version-1 records');
  assert(!got.rejected.length, 'every saved record is still accepted' + (got.rejected.length ? ': ' + got.rejected.slice(0, 5).join(' ') : ''));
  assert(JSON.stringify(got.stages) === JSON.stringify(gold.expect.stages), 'every job is at the same stage as when it was saved');
  assert(got.users === gold.expect.users, 'the same people');
  assert(JSON.stringify(got.sop) === JSON.stringify(gold.expect.sop), 'the same installation steps done');
  assert(JSON.stringify(got.pays) === JSON.stringify(gold.expect.pays), 'the same payments and their checks');

  /* new records carry the version; a record from a newer app is refused with a clear message, never misread */
  const v = await page.evaluate(async () => { const r = await perform('CHAT_POSTED', 'AIEC-P003', { text: 'hello' }, { as: 'PADMIN', quiet: true }); return r.ok && r.ev.v; });
  assert(v === 2 && await page.evaluate(() => EV_V === 2), 'a new record is stamped with the record version (2 since the Lifts Act rules)');
  const newer = await page.evaluate(() => { const e = validate(S, { id: 'X-1', n: 1, t: nowISO(), by: 'PADMIN', type: 'CHAT_POSTED', pid: 'AIEC-P003', data: { text: 'from the future' }, dev: 'X', v: EV_V + 1 }); return e && (e.k || e); });
  assert(newer === 'err_newer_app' && /newer version of the app/.test(await page.evaluate(() => t('err_newer_app'))), 'a record made by a newer app is refused with "update the app"');
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('GOLDEN HISTORY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
