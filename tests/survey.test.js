/* Site check and technical decisions (role-wise specs): door opening and floor heights are measured; "customer not at
   site" and "site not safe" are recorded with a photo, a reason and a new date instead of fake numbers; "cannot be
   fitted as sold" stops the job until the office decides (check again, or change the design by a variation that says
   how many days it adds); a site check is never edited, a mistake becomes version 2 with a reason; a new drawing is used
   only after a second office person approves it, and older versions are marked replaced. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'site'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const P = await ev(`Object.values(S.projects).find(P => P.stage === 'qc_site').id`), Q = await ev(`S.projects["${P}"].qc || 'PQC'`);
  const meas = { width: 1800, depth: 1900, pit: 1500, head: 4200 }, checks = { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' };
  const gaps = await ev(`floorGaps(S.projects["${P}"])`), floors = Array(gaps).fill(3000);

  /* measured details */
  assert((await act('QC_SITE_RESULT', P, { meas, floors, checks, outcome: 'approved', ev: await photos(2) }, Q)).err === 'err_door', 'the door opening must be measured');
  assert((await act('QC_SITE_RESULT', P, { meas, door: { w: 800, h: 2000 }, floors: floors.slice(1), checks, outcome: 'approved', ev: await photos(2) }, Q)).err === 'err_floors', 'every floor-to-floor height must be measured (' + gaps + ')');

  /* could not check */
  const ns = { outcome: 'revisit', why: 'no_show', revisit: await ev('addDays(2)'), ev: await photos(1, 'door') };
  assert((await act('QC_SITE_RESULT', P, ns, Q)).err === 'err_reason', '"customer not at site" needs a reason');
  assert((await act('QC_SITE_RESULT', P, Object.assign({}, ns, { note: 'Gate locked, phone off' }), Q)).ok, '…and is saved with one photo of the locked door and a new date, without measurements');
  assert(await ev(`S.projects["${P}"].stage === 'qc_site' && S.projects["${P}"].qcSite.slice(-1)[0].why === 'no_show'`), 'the job waits for the next visit, and the record says why');

  /* cannot be fitted */
  const nf = { meas, door: { w: 800, h: 2000 }, floors, checks, outcome: 'not_feasible', ev: await photos(2) };
  assert((await act('QC_SITE_RESULT', P, nf, Q)).err === 'err_reason', '"cannot be fitted" needs the reason');
  assert((await act('QC_SITE_RESULT', P, Object.assign({}, nf, { note: 'Beam across the shaft at 3rd floor' }), Q)).ok, '"cannot be fitted as sold" is recorded');
  assert((await act('QC_SITE_RESULT', P, Object.assign({}, nf, { outcome: 'approved', ev: await photos(2) }), Q)).err === 'err_wait_decision', 'no new site check until the office decides');
  assert(await ev(`needs(S.projects["${P}"]).some(n => n.k === 'decide_infeasible' && n.roles.includes('admin'))`), 'the office gets an urgent "decide" task');
  assert((await act('INFEASIBLE_DECIDED', P, { decision: 'redesign' }, 'PADMIN')).err === 'err_reason', 'the decision needs a reason');
  assert((await act('INFEASIBLE_DECIDED', P, { decision: 'redesign', note: 'Machine-room-less lift fits' }, 'PADMIN')).ok
    && await ev(`S.projects["${P}"].stage === 'site_ok' && S.projects["${P}"].variation.status === 'needed' && !!S.projects["${P}"].variation.why`), 'changing the design opens a variation that carries the QC\'s reason');
  assert((await act('VARIATION_PROPOSED', P, { note: 'MRL machine', amount: 40000, days: 200 }, 'PADMIN')).err === 'err_cfg_range', 'extra days must be 0 to 180');
  assert((await act('VARIATION_PROPOSED', P, { note: 'MRL machine', amount: 40000, days: 6 }, 'PADMIN')).ok && await ev(`S.projects["${P}"].variation.days === 6`), 'the variation says how many working days it adds');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); }); await page.evaluate(pid => go('project', { pid, tab: 'info' }), P); await page.waitForTimeout(300);
  assert(await ev(`varCard(S.projects["${P}"]).includes('6 working days')`), 'the customer sees the extra days before signing');
  assert((await act('QC_SITE_CORRECTED', P, { meas, door: { w: 800, h: 2000 }, floors, reason: 'x' }, 'PADMIN')).err === 'err_stage', 'there is nothing to correct without an approved site check');

  /* version 2 */
  /* (the practice company has no job waiting at "site checked"; one is put there for this check) */
  const C = await ev(`(P => { if (P) P.stage = 'site_ok'; return P ? P.id : ''; })(Object.values(S.projects).find(P => P.stage === 'material_order' && lastSiteOk(P) && lastSiteOk(P).door))`);
  assert(C, 'a job with an approved site check: ' + C);
  const by = await ev(`lastSiteOk(S.projects["${C}"]).by`), other = await ev(`(Object.values(S.users).find(u => u.role === 'qc' && u.uid !== "${by}") || {}).uid || ''`);
  const gC = await ev(`floorGaps(S.projects["${C}"])`), fixData = { meas: Object.assign({}, meas, { pit: 1450 }), door: { w: 800, h: 2000 }, floors: Array(gC).fill(3050) };
  if (other) { await page.evaluate(u => { S.users[u].active = true; }, other); assert((await act('QC_SITE_CORRECTED', C, Object.assign({}, fixData, { reason: 'Pit re-measured' }), other)).err === 'err_access', 'only the QC who checked it (or the office) corrects it'); }
  assert((await act('QC_SITE_CORRECTED', C, fixData, by)).err === 'err_reason', 'a correction needs a reason');
  const before = await ev(`S.projects["${C}"].qcSite.length`);
  assert((await act('QC_SITE_CORRECTED', C, Object.assign({}, fixData, { reason: 'Pit re-measured with laser' }), by)).ok, 'the QC corrects a measurement');
  assert(await ev(`(q => q.length === ${before} + 1 && q[q.length - 1].v === 2 && q[q.length - 1].fix && q[q.length - 2].meas.pit !== 1450 && q[q.length - 1].meas.pit === 1450)(S.projects["${C}"].qcSite)`), 'version 1 stays as it was; version 2 holds the new value and the reason');
  assert(await ev(`payLines("${by}").filter(e => e.pid === "${C}" && e.what === 'earn_qc_insp').length === S.projects["${C}"].qcSite.filter(x => !x.fix && x.by === "${by}").length`), 'a correction is not paid as another inspection');
  await page.evaluate(pid => go('project', { pid, tab: 'info' }), C); await page.waitForTimeout(250);
  assert(/Version 2/.test(await page.innerText('main')), 'the job page shows "Version 2" with the reason');

  /* drawings */
  const D = await ev(`Object.values(S.projects).find(P => P.drawings && !['lost'].includes(P.stage) && !dwgDrafts(P).length).id`);
  const first = await ev(`dwgCurrent(S.projects["${D}"]).ref`);
  assert((await act('DRAWING_ADDED', D, { ref: 'DWG-' + D + '-R9', ev: await photos(1, 'drawing') }, 'PADMIN')).ok, 'the office uploads a new drawing version');
  assert(await ev(`dwgCurrent(S.projects["${D}"]).ref === "${first}" && dwgDrafts(S.projects["${D}"]).length === 1`), 'the team keeps working from the approved version while the new one waits');
  assert(await ev(`needs(S.projects["${D}"]).some(n => n.k === 'approve_drawing' && n.not === 'PADMIN')`), 'another office person gets "approve the new drawing"');
  assert((await act('DRAWING_APPROVED', D, { ref: 'DWG-' + D + '-R9' }, 'PADMIN')).err === 'err_same_person', 'the uploader cannot approve their own drawing while someone else can');
  assert((await act('DRAWING_APPROVED', D, { ref: 'DWG-' + D + '-R9' }, 'POWNER')).ok && await ev(`dwgCurrent(S.projects["${D}"]).ref === 'DWG-${D}-R9' && dwgStates(S.projects["${D}"]).includes('superseded')`), 'once approved it is the one to use; the old one is marked replaced');
  await page.evaluate(pid => { loginAs(S.users.PADMIN); go('drawings', { pid }); }, D); await page.waitForTimeout(250);
  assert(/Approved: work from this/.test(await page.innerText('main')) && /Replaced: do not use/.test(await page.innerText('main')), 'the drawings page labels each version');

  /* the wizard */
  const W2 = await ev(`(Object.values(S.projects).find(P => P.stage === 'qc_site' && !P.infeasible) || {}).id || ''`);
  if (W2) {
    await page.evaluate(async pid => { const P = S.projects[pid]; loginAs(S.users[P.qc || 'PQC']); await wiz('qcsite', pid); W.step = 1; render(); }, W2); await page.waitForTimeout(200);
    assert(/Customer not at site/.test(await page.innerText('#app')) && /Site not safe to check/.test(await page.innerText('#app')), 'the site check starts with "could you check the site?"');
  }
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, pid]) => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('drawings', { pid }); }, [lang, D]); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SURVEY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
