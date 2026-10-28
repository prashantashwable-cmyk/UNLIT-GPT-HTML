/* Quality: shaft limits with a signed variation quote before release, co-worker check of safety-critical steps, surprise QC. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'work'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  const H = 'AIEC-P003';
  const step = async () => act('SOP_STEP_DONE', H, { step: await ev(`sopNext(S.projects["${H}"])`), ev: await photos(1) }, 'PSENIOR');

  assert(await ev('S.rejected.length === 0 && (S.projects["AIEC-P001"].peerLog || []).length === 3'), 'practice data: finished lifts had their 3 safety-critical steps checked by a co-worker');

  /* co-worker check */
  await act('SITE_CHECKED_IN', H, { day: await ev('safeDay()'), gps: await ev(`S.projects["${H}"].site.gps`) }, 'PSENIOR');
  await act('SAFETY_CHECKED', H, { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) }, 'PSENIOR');
  while (await ev(`sopNext(S.projects["${H}"])`) < 9) assert((await step()).ok, 'step ' + await ev(`sopNext(S.projects["${H}"])`) + ' done');
  assert((await step()).err === 'err_peer_check', 'after the doors step, the next step waits for a co-worker\'s check');
  assert((await tasks('PSENIOR', H)).includes('wait_peer') && (await tasks('PTECH', H)).includes('peer_check'), 'the lead waits; another technician of the company gets "check a co-worker\'s step"');
  assert(await ev(`canSee(S.users.PTECH, S.projects["${H}"]) && peerWhyNot("PSENIOR", S.projects["${H}"]) === "err_own_job" && peerWhyNot("PHELP", S.projects["${H}"]) === "err_cant_lead"`), 'the checker can open the job; the lead cannot check his own step and a Helper is not senior enough');
  assert((await act('PEER_CHECKED', H, { step: 8, ok: false }, 'PTECH')).err === 'err_reason', '"not right" needs a reason');
  assert((await act('PEER_CHECKED', H, { step: 8, ok: false, note: 'Interlock on 3rd floor not closing' }, 'PTECH')).ok && await ev(`sopNext(S.projects["${H}"])`) === 8, 'not right: the step must be done again');
  assert((await step()).ok && (await act('PEER_CHECKED', H, { step: 8, ok: true }, 'PQC')).ok && (await step()).ok, 'after the redo a QC Inspector checks it, and work goes on');
  assert(!(await ev('JSON.stringify(myTasks(S.users.PSENIOR).filter(n => n.k === "escalated"))').then(x => /wait_peer/.test(x))), 'waiting for a check is never counted against the lead');

  /* shaft limits and variation */
  const P6 = 'AIEC-P006';
  const site = async (meas, variation) => act('QC_SITE_RESULT', P6, { meas, checks: { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome: 'approved', variation, ev: await photos(2, 'site') }, 'PQC');
  assert((await site({ width: 1300, depth: 1900, pit: 1500, head: 4200 })).err === 'err_tolerance', 'a shaft narrower than the minimum cannot simply be approved');
  assert((await site({ width: 1300, depth: 1900, pit: 1500, head: 4200 }, true)).ok && await ev(`S.projects["${P6}"].variation.status`) === 'needed', 'QC approves it with a variation quote');
  assert((await tasks('PSALES', P6)).includes('make_variation'), 'Sales is asked to make the variation quote');
  const rel = () => page.evaluate(P6 => perform('RELEASED', P6, { supplier: 'PSUP', tech: 'PTECH', drawings: 'DWG-1', materials: materialList(S.projects[P6].req || { stops: 4, type: 'auto', capacity: '6', finish: 'ss' }) }, { as: 'PADMIN', quiet: true }).then(r => r.err), P6);
  assert(await rel() === 'err_variation', 'material cannot be released before the variation is signed');
  const final0 = await ev(`S.projects["${P6}"].schedule.final`);
  assert((await act('VARIATION_PROPOSED', P6, { note: 'Smaller car (4 persons) to fit the 1300 mm shaft', amount: -25000 }, 'PSALES')).ok, 'Sales proposes a smaller car with a lower price');
  assert((await act('VARIATION_SIGNED', P6, { consent: true, signer: 'Mr. Joshi', ev: [{ id: 'E' + Date.now(), m: 'x', kind: 'sign', t: new Date().toISOString(), hash: 'h' }] }, 'PSALES')).ok, 'the customer signs in person');
  assert(await ev(`S.projects["${P6}"].schedule.final`) === final0 - 25000 && !(await rel()), 'the final payment changes and material can now be released');

  /* surprise QC */
  assert((await act('SURPRISE_SET', H, { date: await ev('todayStr()') }, 'PADMIN')).ok, 'the office plans a surprise inspection for today');
  assert((await tasks('PQC', H)).includes('surprise_qc') && !(await tasks('PSENIOR', H)).includes('surprise_qc'), 'QC sees it; the technician does not');
  const f = await page.evaluate(H => { App.me = S.users.PADMIN; return exportPack('person', 'PSENIOR').events.find(e => e.type === 'SURPRISE_SET' && e.pid === H); }, H);
  assert(f && f.data.date == null, 'the date is not in the technician\'s file');
  const s0 = await ev('activeStrikes("PSENIOR")');
  assert((await act('SURPRISE_DONE', H, { ok: false, note: 'No harness on the top floor', ev: await photos(2) }, 'PQC')).ok && await ev('activeStrikes("PSENIOR")') === s0 + 1, 'a problem found in a surprise inspection is a strike for the lead');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'project', { pid: P6, tab: 'info' }], ['PSENIOR', 'cl', { pid: H, kind: 'sop' }], ['PTECH', 'home', {}], ['PQC', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; loginAs(S.users.PQC); S.projects['AIEC-P008'].stage = 'qc_site'; await wiz('qcsite', 'AIEC-P008'); W.ctx.meas = { width: 1200, depth: 1200, pit: 900, head: 3000 }; W.step = 1; render(); }); await page.waitForTimeout(100);
  await page.evaluate(() => { W.step = 4; render(); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PTECH); await wiz('peer', 'AIEC-P003', { step: 9 }); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PADMIN); await wiz('surpriseSet', 'AIEC-P003'); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('QUALITY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
