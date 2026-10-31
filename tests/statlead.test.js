/* Permits and lift licences have one owner (the statutory liaison Admin chooses), installation waits for the permission to
   erect, and the approved contractor's certificate of fitness is made from the final QC record. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const has = (uid, k, pid) => page.evaluate(([uid, k, pid]) => myTasks(S.users[uid]).some(n => n.k === k && (!pid || n.pid === pid)), [uid, k, pid]);
  const today = await page.evaluate(() => todayStr());

  /* a job about to be installed without a permit */
  const pid = await page.evaluate(() => Object.values(S.projects).find(P => ['site_ok', 'material_order', 'dispatched', 'arrived'].includes(P.stage) && !statOf(P).permit)?.id || Object.values(S.projects).find(P => P.stage === 'installing').id);
  await page.evaluate(p => { const P = S.projects[p]; if (P.statutory) delete P.statutory.permit; }, pid);
  assert(await has('PADMIN', 'record_permit', pid) && !(await has('PFIN', 'record_permit', pid)), 'with no liaison, Admin records the permit');

  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('users'); }); await page.waitForTimeout(250);
  assert(/Statutory liaison \(permits and licences\): Not chosen: Admin does it/.test(await page.innerText('main')), 'People shows who owns permits and licences');
  await page.click('[data-a="stlPick"]'); await page.waitForTimeout(150); await page.click('#ov [data-a="stlSet"][data-v="PFIN"]'); await page.waitForTimeout(300);
  assert(await page.evaluate(() => S.statLead === 'PFIN'), 'Admin picks a liaison');
  assert(await has('PFIN', 'record_permit', pid) && !(await has('PADMIN', 'record_permit', pid)), 'the permit task now goes to the liaison only');
  assert((await act('STATUTORY_SET', pid, { item: 'permit', no: 'X', date: today }, 'PSALES')).err === 'err_access', 'others cannot record it');

  /* installation waits for the permit */
  const ip = await page.evaluate(() => Object.values(S.projects).find(P => P.stage === 'installing'));
  const inst = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.stage === 'installing'); const keep = P.statutory; P.statutory = Object.assign({}, keep); delete P.statutory.permit; const save = P.sop; P.sop = {};
    const ds = S.config.dailySafety; S.config.dailySafety = 0; const k = needs(P).map(n => n.k), v = validate(S, { type: 'SOP_STEP_DONE', pid: P.id, by: P.tech, t: nowISO(), data: { step: 0, ev: [1, 2, 3, 4].map(i => ({ id: 'EZ' + i, m: 'x', kind: 'photo', label: 'sop', t: nowISO(), gps: null, hash: 'h' + i, dev: 'practice', q: {} })) } }); P.statutory = keep; P.sop = save; S.config.dailySafety = ds; return { k, v: v && (v.k || v) }; });
  assert(inst.k.includes('wait_permit') && inst.k.includes('record_permit') && inst.v === 'err_permit_first', 'without a permit the technician waits and the first installation step is refused: ' + JSON.stringify(inst));
  assert((await act('STATUTORY_SET', pid, { item: 'permit', no: 'EP/PUNE/1/2026', date: today }, 'PFIN')).ok && !(await has('PFIN', 'record_permit', pid)), 'the liaison records the permit and the task closes');
  assert(await page.evaluate(() => { const r = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'older installation records stay valid');

  /* certificate of fitness from the final QC record */
  const H = await page.evaluate(() => Object.values(S.projects).find(P => lastPass(P)).id);
  await page.evaluate(p => { loginAs(S.users.PADMIN); go('doc', { pid: p, kind: 'cert' }); }, H); await page.waitForTimeout(300);
  const c = await page.innerText('main');
  assert(/certificate of fitness/i.test(c) && /erected by the approved contractor/.test(c) && /Contractor licence no\./.test(c) && /Signature and stamp/.test(c), 'the certificate shows the statement, contractor, licence and signature line');
  assert(await page.evaluate(p => { const q = lastPass(S.projects[p]); return document.querySelector('main').innerText.includes(fmtD(q.t)) && document.querySelector('main').innerText.includes(userName(q.by)); }, H), 'it carries the final QC date and inspector from the record');
  await page.evaluate(p => { loginAs(S.users.PFIN); go('doc', { pid: p, kind: 'cert' }); }, H); await page.waitForTimeout(200);
  assert(/certificate of fitness/i.test(await page.innerText('main')), 'the liaison can open it');
  await page.evaluate(p => { loginAs(S.users.PSUP); go('doc', { pid: p, kind: 'cert' }); }, H); await page.waitForTimeout(200);
  assert(!/certificate of fitness/i.test(await page.innerText('main')), 'a supplier cannot');

  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, p]) => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('doc', { pid: p, kind: 'cert' }); }, [lang, H]); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('STATUTORY LIAISON PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
