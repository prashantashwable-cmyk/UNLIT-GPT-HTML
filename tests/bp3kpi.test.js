/* Blueprint B3 — pilot limit and KPI board: jobs released to material and not yet handed over are "live"; at the limit
   (setting, default 5) the next job is released only after the office records a capacity check (a task asks for it);
   the dashboard shows "n of 5 live jobs"; a KPI board for the last 7 or 30 days from the blueprint's KPI list. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  assert(await ev(`S.config.pilotCap === 5`), 'the pilot limit is 5 live jobs by default');
  const live = await ev(`liveJobs(S)`);
  /* set the limit to what is live now, so the next release meets it */
  assert((await act('CONFIG_SET', null, { key: 'pilotCap', value: live }, 'POWNER')).ok, `the limit can be changed (set to ${live})`);
  const R = await ev(`(() => { const P = Object.values(S.projects).find(P => P.stage === 'site_ok') || null; return P && P.id; })()`);
  let pid = R;
  if (!pid) { pid = await ev(`Object.values(S.projects).find(P => ['signed','site_prep','qc_site'].includes(P.stage)).id`); await page.evaluate(p => { S.projects[p].stage = 'site_ok'; }, pid); }
  assert(await ev(`capFull(S, S.projects['${pid}'])`), 'at the limit a waiting job is held');
  const n = await ev(`needs(S.projects['${pid}']).map(x => x.k)`);
  assert(n.includes('capacity_check') && !n.includes('release'), 'the office is asked for a capacity check instead of the release: ' + n.join(','));
  const relErr = await ev(`(() => { const e = validate(S, { id: 'r1', n: 1, t: nowISO(), by: 'PADMIN', type: 'RELEASED', pid: '${pid}', data: { supplier: 'PSUP', tech: 'PTECH', drawings: 'x', materials: ['m_rails'] }, dev: 'x', v: 1 }); return e && (e.k || e); })()`);
  assert(relErr === 'err_pilot_cap' || relErr === 'err_gad_first' || relErr === 'err_variation', 'the release is refused at the limit (' + relErr + ')');
  assert((await act('CAPACITY_CHECKED', pid, { note: 'ok' }, 'PADMIN')).err === 'err_cap_note', 'the check needs a real note');
  assert((await act('CAPACITY_CHECKED', pid, { note: 'Ramesh crew free after P003 handover on Monday' }, 'PSALES')).err, 'Sales cannot record it');
  assert((await act('CAPACITY_CHECKED', pid, { note: 'Ramesh crew free after P003 handover on Monday' }, 'PADMIN')).ok, 'Admin records the capacity check');
  assert(!(await ev(`capFull(S, S.projects['${pid}'])`)) && !(await ev(`needs(S.projects['${pid}']).some(x => x.k === 'capacity_check')`)), 'that job can now be released');
  assert(await ev(`EVENTS.some(e => e.type === 'CAPACITY_CHECKED' && e.pid === '${pid}' && /Ramesh/.test(e.data.note))`) && (!R || await ev(`!!rebuild(EVENTS).projects['${pid}'].capOk`)), 'the check is kept as a record' + (R ? ' and survives a rebuild' : ''));
  assert((await act('CONFIG_SET', null, { key: 'pilotCap', value: 0 }, 'POWNER')).ok && !(await ev(`capFull(S, null)`)), '0 means no limit');
  await act('CONFIG_SET', null, { key: 'pilotCap', value: 5 }, 'POWNER');
  /* dashboard and KPI board */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('kpi'); }); await page.waitForTimeout(300);
  let txt = await page.innerText('main');
  assert(new RegExp(`\\d+ of 5 live jobs`).test(txt), 'the board shows live jobs against the limit');
  assert(/New leads/.test(txt) && /Lead to order/.test(txt) && /QC rework/.test(txt) && /Safety incidents/.test(txt) && /Jobs posted that got an applicant/.test(txt), 'the board has the blueprint KPIs');
  await page.click('[data-a="kpiDays"][data-v="30"]'); await page.waitForTimeout(200);
  assert(await ev(`App.route.name === 'kpi' && App.route.p.days === 30`), 'it switches to the last 30 days');
  assert(await ev(`kpiData(30)[0][1][0][1] >= kpiData(7)[0][1][0][1]`), '30 days count at least as many leads as 7');
  assert(await ev(`/data-v="kpi"/.test(dashboard(true)) && /live jobs/.test(dashboard(true))`), 'the dashboard has the live-jobs line and a KPI board button');
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); go('kpi'); }); await page.waitForTimeout(200);
  assert(await ev(`App.route.name === 'kpi' ? !/KPI board/.test(document.querySelector('main').innerText) : true`), 'field staff do not see the board');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP3 KPI PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
