/* Phones agree after sharing files: levels and training travel to every staff phone, own work stays, company time zone, job-board privacy. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const setup = async opts => { const L = await launch(opts); await L.page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; }); return L; };
const importInto = async (page, pack) => page.evaluate(async txt => { App.set.mode = 'practice'; await loadMode('practice'); const r = await importText(txt); return { r, rej: S.rejected.map(x => x.ev.type + ':' + JSON.stringify(x.err)) }; }, JSON.stringify(pack));
(async () => {
  const A = await setup({ timezoneId: 'Asia/Kolkata' }); const pa = A.page;
  await pa.evaluate(() => enterPractice()); await pa.waitForTimeout(5000);
  const act = (type, pid, data, as) => pa.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const pack = uid => pa.evaluate(uid => { App.me = S.users.PADMIN; return exportPack('person', uid); }, uid);

  /* the office promotes and checks people; reassigns a finished job */
  for (const [key, value] of Object.entries({ lvSeniorJobs: 0, lvSeniorPass: 0, lvSeniorStars: 0, lvSeniorReviews: 0, lvSeniorTrust: 0, lvSeniorDays: 0 })) await act('CONFIG_SET', null, { key, value }, 'POWNER');
  await pa.evaluate(() => { S.reviewsHeld = S.reviewsHeld; });
  const promo = await act('PROMOTED', null, { uid: 'PTECH', to: 'senior', note: 'Test', checks: [{ k: 'x', ok: true }] }, 'PADMIN');
  assert(promo.ok, 'office promotes the Technician to Senior: ' + JSON.stringify(promo));
  await act('ASSIGNED', 'AIEC-P002', { role: 'tech', uid: 'PSENIOR' }, 'PADMIN');
  const weekA = await pa.evaluate(() => weeksFor('PTECH').map(w => w.week + ':' + w.total).join());

  /* supplier phone: sees the new level */
  const B = await setup({ timezoneId: 'UTC' }); const pb = B.page;
  const rb = await importInto(pb, await pack('PSUP'));
  assert(rb.r.ok && rb.rej.length === 0, 'supplier file imports cleanly: ' + rb.rej.join(' '));
  assert(await pb.evaluate(() => gradeOf('PTECH')) === 'senior', 'the promotion made at the office is known on the supplier\'s phone');
  assert(await pb.evaluate(() => Object.values(S.workers).every(w => !w.profile.phone || w === S.workers.PSUP)), 'other people\'s phone numbers are not in the supplier\'s file');
  assert(await pb.evaluate(() => !EVENTS.some(e => e.type.startsWith('JOB_'))), 'suppliers do not receive the job board');

  /* technician phone after the job he finished was moved to someone else */
  const C = await setup({ timezoneId: 'UTC' }); const pc = C.page;
  const rc = await importInto(pc, await pack('PTECH'));
  assert(rc.r.ok && rc.rej.length === 0, 'technician file imports cleanly: ' + rc.rej.join(' '));
  assert(await pc.evaluate(() => weeksFor('PTECH').map(w => w.week + ':' + w.total).join()) === weekA, 'the technician\'s own work and pay weeks are complete on his phone (UTC) and match the office (India)');
  const others = await pc.evaluate(() => EVENTS.filter(e => e.type === 'JOB_APPLIED' && e.by !== 'PTECH').map(e => e.data));
  assert(others.every(d => !d.note && !d.gps), 'other workers\' application notes and locations are not shared');

  /* customer phone */
  const D = await setup({}); const pd = D.page;
  const rd = await importInto(pd, await pack('PCUST'));
  assert(rd.r.ok && rd.rej.length === 0 && await pd.evaluate(() => !EVENTS.some(e => e.type.startsWith('JOB_'))), 'customers do not receive the job board, and their file imports cleanly');

  /* "only trained technicians" switched on: releasing a job is accepted on other phones */
  await act('CONFIG_SET', null, { key: 'requireTraining', value: 1 }, 'POWNER');
  const ok6 = await pa.evaluate(async () => {
    const P = S.projects['AIEC-P006'];
    const g = await perform('QC_SITE_RESULT', P.id, { meas: { width: 1800, depth: 1900, pit: 1500, head: 4200 }, checks: { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome: 'approved', ev: [1, 2].map(() => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'site', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} })) }, { as: 'PQC', quiet: true });
    const r = await perform('RELEASED', P.id, { supplier: 'PSUP', tech: 'PSENIOR', drawings: 'DWG-1', materials: materialList(P.req || { stops: 4, type: 'auto', capacity: '6', finish: 'ss' }) }, { as: 'PADMIN', quiet: true });
    return [g.ok, r.ok, r.err];
  });
  assert(ok6[1], 'office releases AIEC-P006 to the trained Senior: ' + JSON.stringify(ok6));
  const E = await setup({}); const pe = E.page;
  const re = await importInto(pe, await pack('PSUP'));
  assert(re.rej.length === 0 && await pe.evaluate(() => S.projects['AIEC-P006'] && S.projects['AIEC-P006'].stage === 'material_order'), 'with the training rule on, the supplier\'s phone accepts the release and can dispatch: ' + re.rej.join(' '));

  /* company time zone */
  const wk = async page => page.evaluate(() => weekKey('2026-10-18T19:00:00.000Z')); /* Monday 00:30 in India */
  assert(await wk(pa) === '2026-10-19' && await wk(pb) === '2026-10-19', 'pay weeks follow India time on every phone, whatever the phone\'s own time zone');

  /* full file: no differences */
  const F = await setup({ timezoneId: 'America/New_York' }); const pf = F.page;
  const full = await pa.evaluate(() => exportPack('full'));
  const rf = await importInto(pf, full);
  const snap = page => page.evaluate(() => JSON.stringify({ g: Object.keys(S.users).map(u => gradeOf(u)), s: Object.keys(S.users).map(u => activeStrikes(u)), e: Object.keys(S.users).map(u => earnings(u).length), w: Object.keys(S.users).map(u => weeksFor(u).map(x => x.week).join()), st: Object.values(S.projects).map(P => P.stage) }));
  assert(rf.rej.length === 0 && await snap(pa) === await snap(pf), 'a full file gives exactly the same levels, strikes, pay weeks and stages on a phone in another time zone');
  for (const L of [A, B, C, D, E, F]) { if (L.errors.length) { console.error(L.errors.join('\n')); process.exit(1); } await L.browser.close(); }
  console.log('SYNC2 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
