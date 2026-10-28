/* Owner reports: weekly summary (sent on WhatsApp), key numbers with how each is counted, spreadsheets (Owner only, recorded, no customer phones),
   and the list of what the app does by itself. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');

  /* weekly summary */
  const w = await ev('weekSummary()'), byHand = await ev('EVENTS.filter(e => e.type === "LEAD_CREATED" && safeDay(e.t) >= weekSummary().from).length');
  assert(w.leads === byHand && w.from < w.end, 'the week counts the leads added in the last 7 days: ' + w.leads);
  await act('LEAD_CREATED', 'AIEC-W001', { safe: true, ev: await ev('[1,2].map(() => ({ id: "E" + rid(10), m: "x", kind: "photo", label: "b", t: nowISO(), hash: "h" }))'), gps: null, address: 'Baner, Pune', name: 'Mr. X', phone: '9822012399', shaft: 'yes', floors: 4, dupOf: [], consent: { call: 'yes', whatsapp: 'yes' } }, 'PFIELD');
  assert(await ev('weekSummary().leads') === w.leads + 1, 'a new lead is counted at once');
  const kn = await ev('keyNumbers()');
  assert(kn.length === 5 && kn.every(([k, v, d]) => k && v && d), 'five key numbers, each with how it is counted: ' + kn.map(x => x[1]).join(' '));
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(150);
  await page.evaluate(() => go('weekly')); await page.waitForTimeout(250);
  let txt = await page.innerText('main');
  assert(/Sales/.test(txt) && /Payments found in the bank/.test(txt) && /Key numbers/.test(txt) && /Spreadsheets/.test(txt), 'the Owner sees the weekly summary, key numbers and spreadsheets');
  await page.click('[data-a="weekGo"]'); await page.waitForTimeout(150);
  assert(await ev('App.route.p.end < safeDay()'), 'the Owner can look at an earlier week');
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); window._opened = []; window.open = u => { window._opened.push(u); return null; }; go('weekly'); }); await page.waitForTimeout(150);
  await page.click('[data-a="weekShare"]'); await page.waitForTimeout(150);
  const sent = await ev('decodeURIComponent(window._opened[0] || "")');
  assert(sent.startsWith('https://wa.me/?text=') && /Weekly summary/.test(sent) && /Deals won/.test(sent) && /Needs the office/.test(sent), 'the summary is prepared as a WhatsApp message');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('weekly'); }); await page.waitForTimeout(150);
  assert(/Weekly summary/.test(await page.innerText('header')) && !/Spreadsheets/.test(await page.innerText('main')), 'the Admin sees the summary but cannot save spreadsheets');
  await page.evaluate(() => { loginAs(S.users.PTECH); go('weekly'); }); await page.waitForTimeout(150);
  assert(await ev('App.route.name') === 'weekly' && !/Key numbers/.test(await page.innerText('main')), 'a technician cannot open it');

  /* spreadsheets */
  assert((await act('DATA_EXPORTED', null, { kind: 'projects', rows: 3 }, 'PADMIN')).ok === false, 'only the Owner can save a spreadsheet');
  await page.evaluate(() => { S.projects['AIEC-P010'].site.address = '=HYPERLINK("http://x")'; loginAs(S.users.POWNER); go('weekly'); }); await page.waitForTimeout(150);
  await page.click('[data-a="csvGo"][data-v="projects"]'); await page.waitForTimeout(400);
  const csv = await ev('App.lastCsv'), lines = csv.split('\r\n');
  assert(csv.charCodeAt(0) === 0xfeff && lines[0].includes('Project,Stage') && lines.length - 1 === await ev('Object.keys(S.projects).length'), 'the jobs spreadsheet has a header and one row per job');
  assert(!/98220000\d\d/.test(csv) && /Mr\. Gokhale/.test(csv), 'customer names are in it, customer phone numbers are not');
  assert(csv.includes(`"'=HYPERLINK(""http://x"")"`), 'a cell that looks like a formula is saved as plain text');
  assert(await ev('S.exports[0].kind === "projects" && S.exports[0].rows === Object.keys(S.projects).length && S.exports[0].by === "POWNER"'), 'the save is recorded with who and how many rows');
  for (const k of ['payments', 'tickets']) { await page.click(`[data-a="csvGo"][data-v="${k}"]`); await page.waitForTimeout(300); }
  assert(/^﻿Project,Ticket,Kind,Urgency/.test(await ev('App.lastCsv')) && await ev('S.exports.length') === 3, 'payments and tickets spreadsheets too');

  /* what the app does by itself */
  await act('CONFIG_SET', null, { key: 'validityDays', value: 21 }, 'POWNER');
  await page.evaluate(() => go('auto')); await page.waitForTimeout(150);
  txt = await page.innerText('main');
  assert(/valid for 21 days/.test(txt) && /Reminders and escalation/.test(txt) && /Phone clock check/.test(txt), 'the automations list shows today\'s settings');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['POWNER', 'weekly', {}], ['PADMIN', 'weekly', {}], ['POWNER', 'auto', {}], ['POWNER', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { LANG = 'mr'; loginAs(S.users.POWNER); App.lastShareMr = weekText(weekSummary()); go('weekly'); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length && !/\b(wk|kn|auto)_\w+/.test(await ev('App.lastShareMr')), 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('REPORTS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
