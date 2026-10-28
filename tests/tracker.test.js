/* Lift papers for every lift (ending soonest on top, 60/30/7-day marks, filters) and drawing versions
   (customer sees them after QC approval and the token payment, with their name on the screen and no printing). */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const pages = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'drawing', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);

  /* the tracker */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('me'); }); await page.waitForTimeout(150);
  assert(await page.$('[data-a="nav"][data-v="stattracker"]'), 'the office opens "Lift papers: all lifts" from Me');
  await page.evaluate(() => go('stattracker')); await page.waitForTimeout(150);
  let txt = await page.innerText('main');
  assert(/PUNE\/LIFT\/001/.test(txt) && /days left/.test(txt), 'licences are listed with the days left');
  const order = await page.$$eval('main .card b.stid', bs => bs.map(b => b.textContent));
  const days = await ev(`${JSON.stringify(order)}.map(id => liftLicenceDays(S.projects[id])).filter(d => d != null)`);
  assert(days.every((d, i) => !i || days[i - 1] <= d), 'the licence ending soonest is on top');
  assert(await ev('licChip(5).includes("c-bad") && licChip(20).includes("c-warn") && licChip(45).includes("c-info") && licChip(200).includes("c-ok") && /Ended 3 days ago/.test(licChip(-3))'), '7, 30 and 60 day marks; an ended licence says so');
  await page.click('[data-a="statF"][data-v="miss"]'); await page.waitForTimeout(150);
  txt = await page.innerText('main');
  const missIds = await ev(`Object.values(S.projects).filter(P => P.stage !== 'lost' && stageIdx(P.stage) >= stageIdx('signed') && statMissing(P).length).map(P => P.id)`);
  assert(missIds.length && missIds.every(id => txt.includes(id)) && /Missing/.test(txt), 'the "papers missing" filter shows the lifts with missing papers');
  assert(await page.$('[data-a="wizOpen"][data-v^="statutory|"]'), 'papers can be recorded from the list');
  await page.evaluate(() => { loginAs(S.users.PSALES); go('stattracker'); }); await page.waitForTimeout(100);
  assert(!(await page.$('[data-a="statF"]')), 'sales does not open the tracker');

  /* drawings */
  const H = 'AIEC-P003';
  assert(await ev(`S.projects["${H}"].drawings.versions.length === 1 && !S.projects["${H}"].drawings.versions[0].ev.length`), 'the release records the first drawing number');
  assert((await act('DRAWING_ADDED', H, { ref: 'DWG-X', ev: [] }, 'PADMIN')).err === 'err_dwg_pages', 'a photo of the pages is needed');
  assert((await act('DRAWING_ADDED', H, { ref: 'DWG-X', ev: await pages(1) }, 'PTECH')).ok === false, 'only the office adds drawings');
  assert((await act('DRAWING_ADDED', 'AIEC-P006', { ref: 'DWG-X', ev: await pages(1) }, 'PADMIN')).err === 'err_stage', 'not before the job is released');
  const r1 = await ev(`S.projects["${H}"].drawings.ref`);
  assert((await act('DRAWING_ADDED', H, { ref: r1, ev: await pages(2) }, 'PADMIN')).ok && await ev(`S.projects["${H}"].drawings.versions.length === 1 && S.projects["${H}"].drawings.versions[0].ev.length === 2`), 'pages for the released drawing number are added to it');
  assert((await act('DRAWING_ADDED', H, { ref: r1, ev: await pages(1) }, 'PADMIN')).err === 'err_dup_id', 'the same number is not added twice');
  assert((await act('DRAWING_ADDED', H, { ref: 'DWG-P003-R2', note: 'Pit depth changed', ev: await pages(2) }, 'PADMIN')).ok && await ev(`S.projects["${H}"].drawings.ref === "DWG-P003-R2" && S.projects["${H}"].drawings.versions.length === 2`), 'a new version becomes current; the old one stays');

  await page.evaluate(H => { loginAs(S.users.PADMIN); go('drawings', { pid: H }); }, H); await page.waitForTimeout(150);
  txt = await page.innerText('main');
  assert(/DWG-P003-R2/.test(txt) && /Current version/.test(txt) && /Older versions/.test(txt) && await page.$('[data-a="wizOpen"][data-v^="drawingAdd|"]'), 'the office sees the current and older versions and can add one');
  await page.evaluate(H => { loginAs(S.users[S.projects[H].tech]); ACT.permsDone(); Notify.hide(); go('project', { pid: H }); }, H); await page.waitForTimeout(150);
  await page.evaluate(H => { go('drawings', { pid: H }); }, H); await page.waitForTimeout(150);
  txt = await page.innerText('main');
  assert(/DWG-P003-R2/.test(txt) && !/Older versions/.test(txt) && !(await page.$('[data-a="wizOpen"][data-v^="drawingAdd|"]')), 'the technician sees only the current version');
  assert(await ev(`(App.set.accPend["practice:" + S.projects["${H}"].tech] || []).some(x => x.w === "drawings" && x.r === "${H}")`), 'the technician\'s opening of the drawings is logged');

  /* the customer */
  const C = await ev('Object.values(S.projects).find(P => P.customer === "PCUST").id');
  await act('DRAWING_ADDED', C, { ref: 'DWG-C-R2', ev: await pages(1) }, 'PADMIN');
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); go('docs'); }); await page.waitForTimeout(150);
  assert(await page.$(`[data-a="openDrawings"][data-v="${C}"]`), 'the customer has a Drawings tile in Papers');
  await page.click(`[data-a="openDrawings"][data-v="${C}"]`); await page.waitForTimeout(150);
  txt = await page.innerText('main');
  assert(/DWG-C-R2/.test(txt) && /View only/.test(txt) && !/Older versions/.test(txt), 'the customer sees the current drawing, view only');
  assert(await ev('document.body.classList.contains("guard") && !!document.querySelector(".wm")'), 'their name is on the screen and printing is blocked');
  await page.evaluate(() => go('home')); await page.waitForTimeout(100);
  assert(!(await ev('document.body.classList.contains("guard")')), 'the rest of the customer app is normal');
  assert(await ev(`(P => drawLock(Object.assign({}, P, { stage: "qc_site" }), { role: "customer" }) === "dwg_lock_qc" && drawLock(Object.assign({}, P, { payments: [] }), { role: "customer" }) === "dwg_lock_token" && !drawLock(P, { role: "customer" }) && !drawLock(Object.assign({}, P, { payments: [] }), { role: "tech" }))(S.projects["${C}"])`), 'locked for the customer until QC approves the site and the token is found in the bank');
  await page.evaluate(C => { const P = S.projects[C]; P._p = P.payments; P.payments = []; go('drawings', { pid: C }); }, C); await page.waitForTimeout(100);
  assert(/token payment/.test(await page.innerText('main')) && !/DWG-C-R2/.test(await page.innerText('main')), 'a locked customer sees why, not the drawing');
  await page.evaluate(C => { const P = S.projects[C]; P.payments = P._p; delete P._p; }, C);

  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'stattracker', {}], ['PADMIN', 'stattracker', { f: 'miss' }], ['PADMIN', 'drawings', { pid: H }], ['PCUST', 'drawings', { pid: C }], ['PCUST', 'home', {}], ['PSENIOR', 'drawings', { pid: H }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async H => { LANG = 'mr'; loginAs(S.users.PADMIN); await wiz('drawingAdd', H); }, H); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('TRACKER PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
