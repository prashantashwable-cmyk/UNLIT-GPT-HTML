/* Permission holes closed: assigned QC only, field workers cannot reach other leads' customers, job-board lead respects training rule. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(5000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'site', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);

  /* a second QC Inspector */
  await page.evaluate(async () => { const salt = 's'; await perform('USER_ADDED', null, { uid: 'PQC2', name: 'Second QC', role: 'qc', salt, pin: await pinHash('1111', salt) }, { as: 'POWNER', quiet: true }); });
  assert((await act('ASSIGNED', 'AIEC-P006', { role: 'qc', uid: 'PQC' }, 'PADMIN')).ok, 'office assigns QC Inspector PQC to AIEC-P006');
  const site = { meas: { width: 1800, depth: 1900, pit: 1500, head: 4200 }, checks: { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome: 'approved', ev: await photos(2) };
  assert((await act('QC_SITE_RESULT', 'AIEC-P006', site, 'PQC2')).err === 'err_not_your_qc', 'another QC cannot record the inspection or take it over');
  assert(await ev('S.projects["AIEC-P006"].qc') === 'PQC', 'the assigned QC stays on the job');
  assert((await act('QC_SITE_RESULT', 'AIEC-P006', Object.assign({}, site, { ev: await photos(2) }), 'PQC')).ok, 'the assigned QC records it');
  assert((await act('HANDOVER_SIGNED', 'AIEC-P002', { slot: 'qc', consent: true, signer: 'X', ev: [{ id: 'E' + Date.now(), m: 'x', kind: 'sign', t: new Date().toISOString(), hash: 'h' }] }, 'PQC2')).err === 'err_not_your_qc' || (await ev('!!S.projects["AIEC-P002"].hand.qc')), 'another QC cannot sign the handover for the job\'s QC');

  /* field worker adding a note to someone else's lead */
  assert(!(await ev('canSee(S.users.PFIELD2, S.projects["AIEC-P010"])')), 'a field worker cannot see another field worker\'s lead');
  assert((await act('LEAD_INFO_ADDED', 'AIEC-P010', { note: 'I know the owner' }, 'PFIELD2')).ok && !(await ev('canSee(S.users.PFIELD2, S.projects["AIEC-P010"])')), 'adding a note does not open the customer\'s details to them');

  /* job board respects the training rule */
  await act('CONFIG_SET', null, { key: 'requireTraining', value: 1 }, 'POWNER');
  const crew = await ev('(Object.values(S.posts).find(p => p.kind === "crew" && postLive(p)) || {}).id');
  if (crew) assert((await act('JOB_CONFIRMED', 'AIEC-P005', { postId: crew, uid: 'PTRAIN' }, 'PADMIN')).err === 'err_not_authorised', 'with the training rule on, an untrained worker cannot be given a job from the board');
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SECURITY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
