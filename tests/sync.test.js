/* Phone-to-phone sharing: office -> new phone, office -> technician (person file), technician -> office (own updates only). */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const A = await launch(); const pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; });
  await pa.evaluate(() => enterPractice()); await pa.waitForTimeout(3500);
  await pa.evaluate(() => { App.me = S.users.PADMIN; });
  const full = await pa.evaluate(() => JSON.stringify(exportPack('full')));
  const forTech = await pa.evaluate(() => JSON.stringify(exportPack('person', 'PTECH')));
  const stagesA = await pa.evaluate(() => Object.values(S.projects).map(P => P.id + ':' + P.stage).sort().join(','));

  /* new office phone joins with the full file */
  const B = await launch(); const pb = B.page;
  const rb = await pb.evaluate(async txt => { App.set.mode = 'practice'; await loadMode('practice'); return importText(txt); }, full);
  const stagesB = await pb.evaluate(() => Object.values(S.projects).map(P => P.id + ':' + P.stage).sort().join(','));
  assert(rb.ok && rb.rejected === 0 && stagesA === stagesB, 'full file gives the same project states on a new phone');

  /* technician phone gets only their projects; other people cannot log in there */
  const C = await launch(); const pc = C.page;
  const rc = await pc.evaluate(async txt => { App.set.mode = 'practice'; await loadMode('practice'); return importText(txt); }, forTech);
  const techView = await pc.evaluate(() => ({ all: Object.keys(S.projects).length, mine: Object.values(S.projects).filter(P => P.tech === 'PTECH').length, pins: Object.values(S.users).filter(u => u.pin).map(u => u.uid) }));
  console.log('tech file', JSON.stringify(rc), JSON.stringify(techView));
  assert(rc.ok && rc.rejected === 0, 'person file imports cleanly');
  assert(techView.all === techView.mine, 'technician file contains only the technician\'s projects');
  assert(techView.pins.length === 1 && techView.pins[0] === 'PTECH', 'only the technician can log in on that phone');

  /* technician works offline, then sends updates; a forged finance entry is slipped in */
  const upd = await pc.evaluate(async () => {
    App.me = S.users.PTECH;
    const P = Object.values(S.projects).find(x => x.stage === 'installing');
    const r = await perform('SOP_STEP_DONE', P.id, { step: sopNext(P), ev: [{ id: 'E-test', m: 'Mx', kind: 'photo', t: nowISO(), hash: 'x', q: {} }] }, { quiet: true });
    const pack = exportPack('person', 'PTECH');
    pack.events.push({ id: 'FORGE-FIN', n: 999, t: nowISO(), by: 'PFIN', type: 'PAYMENT_STATUS', pid: P.id, data: { payId: 'x', status: 'confirmed', ref: 'fake' }, dev: 'X' });
    return { ok: r.ok, pack: JSON.stringify(pack), pid: P.id };
  });
  assert(upd.ok, 'technician completes an installation step offline');
  const before = await pa.evaluate(p => Object.keys(S.projects[p].sop).length, upd.pid);
  const ra = await pa.evaluate(txt => importText(txt), upd.pack);
  const after = await pa.evaluate(p => Object.keys(S.projects[p].sop).length, upd.pid);
  console.log('office import', JSON.stringify(ra), before, '->', after);
  assert(ra.added === 1 && after === before + 1, 'office accepts the technician\'s own step');
  assert(ra.rejected === 1, 'office refuses the forged finance entry inside the technician\'s file');

  /* practice and real files never mix */
  const D = await launch(); const pd = D.page;
  const rd = await pd.evaluate(txt => importText(txt), full);
  assert(!rd.ok, 'a practice file cannot be loaded into real company data');

  for (const x of [A, B, C, D]) { if (x.errors.length) console.log('ERRORS', x.errors.join('\n')); await x.browser.close(); }
  console.log('SYNC PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
