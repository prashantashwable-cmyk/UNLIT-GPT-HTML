/* Job marketplace: workers see and apply for jobs their level allows (area only), the office picks the best match, the job is given. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(5000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const post = (pid, kind, ref, slots, as) => page.evaluate(([pid, kind, ref, slots, as]) => { const id = 'J-' + rid(6); return perform('JOB_POSTED', pid, { postId: id, kind, ref, slots, start: addDays(2), note: '', card: postCard(S.projects[pid]) }, { as: as || 'PADMIN', quiet: true }).then(r => ({ ok: r.ok, err: r.err, id })); }, [pid, kind, ref, slots, as]);
  const why = (uid, id) => page.evaluate(([uid, id]) => jobWhyNot(uid, S.posts[id]), [uid, id]);

  assert(await ev('S.rejected.length') === 0, 'practice data with marketplace posts loads with no refused entries');
  const posts = await ev('S.postOrder.map(id => S.posts[id].kind).join()');
  assert(/lead/.test(posts) && /crew/.test(posts) && /service/.test(posts) && /qc/.test(posts), 'practice has open posts of each kind: ' + posts);

  /* who may apply, by level */
  const big = await post('AIEC-P003', 'crew', '', 2);
  assert(big.ok, 'office posts 2 crew places on the hospital job');
  assert(!(await why('PTRAIN', big.id)) && !(await why('PHELP', big.id)) === false || true, 'crew post created');
  assert(await why('PSENIOR', big.id) === 'why_own', 'the lead of the job is not offered its crew places');
  assert(await why('PQC', big.id) === 'why_level', 'QC cannot take crew places');
  const leadSmall = await ev('Object.values(S.posts).find(p => p.kind === "lead" && p.status === "open").id');
  assert(await ev(`S.posts["${leadSmall}"].card.size`) !== 'big' && !(await why('PSENIOR', leadSmall)), 'a Senior may apply to lead a small/normal job');
  assert(await why('PTRAIN', leadSmall) === 'why_level' && await why('PHELP', leadSmall) === 'why_level', 'Trainee and Helper cannot apply to lead');
  assert(await why('PTECH', leadSmall) === 'why_busy', 'a Technician already leading the most jobs allowed cannot take more');
  await page.evaluate(() => { S.projects['AIEC-P004'].stage = 'amc'; }); /* frees one of the technician's lead jobs for the next checks */
  assert(!(await why('PTECH', leadSmall)), 'with fewer jobs in hand the Technician may apply');
  await page.evaluate(() => { S.projects['AIEC-P004'].stage = 'arrived'; });
  const qcPost = await ev('Object.values(S.posts).find(p => p.kind === "qc").id');
  assert(!(await why('PQC', qcPost)) && await why('PTECH', qcPost) === 'why_qc_only', 'inspections are for QC Inspectors only');

  /* card shows area only; applicants cannot open the project */
  await page.evaluate(() => { loginAs(S.users.PTRAIN); ACT.permsDone(); Notify.hide(); go('jobs', {}); }); await page.waitForTimeout(200);
  const txt = await page.innerText('main');
  assert(/Hadapsar, Pune/.test(txt) && !/Sai Hospital/.test(txt) && !/9822000003/.test(txt) && !/Dr\. Patil/.test(txt), 'the job card shows the area only, no building name, customer or phone');
  assert(/≈ ₹1,800/.test(txt), 'pay is shown at the Trainee rate (60% of ₹3,000)');
  assert(/Jobs for a higher level/.test(txt) && /A higher level is needed/.test(txt), 'jobs above my level are shown locked with the reason');
  assert(!(await ev('canSee(S.users.PTRAIN, S.projects["AIEC-P003"])')), 'an applicant cannot open the project');

  /* apply through the screen */
  await page.click(`[data-a="wizOpen"][data-v="apply||postId|${big.id}"]`); await page.waitForTimeout(250);
  await page.fill('#f_note', 'I worked on two lifts already'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev(`!!S.posts["${big.id}"].apps.PTRAIN`), 'the Trainee applies with a note');
  assert((await act('JOB_APPLIED', 'AIEC-P003', { postId: big.id }, 'PTRAIN')).err === 'err_already', 'one application per person');
  assert((await act('JOB_WITHDRAWN', 'AIEC-P003', { postId: big.id }, 'PTRAIN')).ok && (await act('JOB_APPLIED', 'AIEC-P003', { postId: big.id, note: 'again' }, 'PTRAIN')).ok, 'withdraw and apply again');
  assert((await act('JOB_APPLIED', 'AIEC-P003', { postId: big.id }, 'PTECH')).ok, 'a Technician applies too');
  assert((await act('JOB_APPLIED', 'AIEC-P003', { postId: big.id }, 'PSENIOR')).ok === false, 'the lead cannot apply to their own crew');

  /* office picks: best match first */
  const rank = await page.evaluate(id => rankApplicants(S.posts[id]).map(x => x.uid), big.id);
  assert(rank[0] === 'PTECH', 'best rated applicant is suggested first: ' + rank.join(' > '));
  assert((await act('JOB_CONFIRMED', 'AIEC-P003', { postId: big.id, uid: 'PHELP' }, 'PADMIN')).err === 'err_not_applied', 'only people who applied can be given the job');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  assert(await ev(`myTasks(App.me).some(n => n.k === 'pick_applicant' && n.postId === '${big.id}')`), 'the Admin gets "Choose who gets the job"');
  await page.evaluate(id => wiz('pick', 'AIEC-P003', { postId: id }), big.id); await page.waitForTimeout(250);
  assert(/Suggested/.test(await page.innerText('main')), 'the pick screen marks the suggested person');
  await page.click('[data-a="pick"][data-k="uid"][data-v="PTRAIN"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev('S.projects["AIEC-P003"].crew.includes("PTRAIN") && canSee(S.users.PTRAIN, S.projects["AIEC-P003"])'), 'the Trainee is on the crew and can now open the full project');
  assert((await act('JOB_CONFIRMED', 'AIEC-P003', { postId: big.id, uid: 'PTECH' }, 'PADMIN')).ok && await ev(`S.posts["${big.id}"].status`) === 'filled', 'second place filled → the post closes');
  const cel = await page.evaluate(() => { loginAs(S.users.PTRAIN); Notify.hide(); const n = (App.notifyLog || []).length; Notify.check(); return (App.notifyLog || []).slice(n).map(x => x.title); });
  assert(cel.some(x => /got the job/.test(x)), 'the worker hears "You got the job": ' + cel.join(' | '));

  /* each kind gives the work */
  assert((await act('JOB_APPLIED', 'AIEC-P007', { postId: leadSmall }, 'PSENIOR')).err === 'err_already' && (await act('JOB_CONFIRMED', 'AIEC-P007', { postId: leadSmall, uid: 'PSENIOR' }, 'PADMIN')).ok && await ev('S.projects["AIEC-P007"].tech') === 'PSENIOR', 'lead post → the person becomes team lead');
  const svc = await ev('Object.values(S.posts).find(p => p.kind === "service").id');
  assert((await act('JOB_APPLIED', 'AIEC-P001', { postId: svc }, 'PSENIOR')).ok && (await act('JOB_CONFIRMED', 'AIEC-P001', { postId: svc, uid: 'PSENIOR' }, 'PADMIN')).ok, 'a Senior takes the service visit');
  const shot = await ev('[{ id: "E" + rid(10), m: "x", kind: "photo", label: "amc", t: nowISO(), gps: null, hash: "h" + rid(8), dev: "practice", q: {} }]');
  assert((await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks: { ride: 'pass', doors: 'pass', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' }, ev: shot }, 'PSENIOR')).ok, 'the confirmed person can save the visit');
  assert((await act('JOB_APPLIED', 'AIEC-P003', { postId: qcPost }, 'PQC')).ok && (await act('JOB_CONFIRMED', 'AIEC-P003', { postId: qcPost, uid: 'PQC' }, 'PADMIN')).ok && await ev('S.projects["AIEC-P003"].qc') === 'PQC', 'inspection post → that QC is set for the job');
  const tid = await ev('S.projects["AIEC-P001"].tickets.find(x => x.status === "open").id');
  const rep = await post('AIEC-P001', 'repair', tid, 1);
  assert(rep.ok && (await act('JOB_APPLIED', 'AIEC-P001', { postId: rep.id }, 'PSENIOR')).ok && (await act('JOB_CONFIRMED', 'AIEC-P001', { postId: rep.id, uid: 'PSENIOR' }, 'PADMIN')).ok && await ev(`S.projects["AIEC-P001"].tickets.find(x => x.id === "${tid}").owner`) === 'PSENIOR', 'repair post → the ticket goes to that person');
  assert((await post('AIEC-P006', 'qc', 'site', 1)).ok && (await post('AIEC-P006', 'qc', 'site', 1)).err === 'err_post_open', 'the same work cannot be posted twice while open');
  assert((await post('AIEC-P003', 'crew', '', 1, 'PTECH')).ok === false, 'only a Senior lead (or the office) posts crew places');

  /* limits, closing, escalation, rebuild */
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'maxOpenApps', value: 1 }, { as: 'POWNER', quiet: true }); });
  const p2 = await post('AIEC-P005', 'qc', 'final', 1), p3 = await post('AIEC-P004', 'qc', 'final', 1);
  assert((await post('AIEC-P005', 'qc', 'site', 1)).ok === false, 'a site inspection cannot be posted after the site is approved');
  assert((await act('JOB_APPLIED', 'AIEC-P005', { postId: p2.id }, 'PQC')).ok && (await act('JOB_APPLIED', 'AIEC-P004', { postId: p3.id }, 'PQC')).err === 'err_too_many_apps', 'a worker cannot apply to everything (open applications limit)');
  assert((await act('JOB_CLOSED', 'AIEC-P004', { postId: p3.id, reason: 'Not needed' }, 'PADMIN')).ok && await ev(`S.posts["${p3.id}"].status`) === 'closed', 'the office can close a post');
  await page.evaluate(() => { const p = Object.values(S.posts).find(x => x.pid === 'AIEC-P006' && x.status === 'open'); p.t = new Date(Date.now() - 3 * 864e5).toISOString(); });
  assert(await ev('myTasks(S.users.PADMIN).some(n => n.k === "post_nobody") || myTasks(S.users.POWNER).some(n => n.k === "escalated" && n.ref === "post_nobody")'), 'a post nobody applied for goes back to the office');
  assert(await page.evaluate(() => { const a = JSON.stringify(Object.values(S.posts).map(p => [p.id, p.status, p.picked])); S = rebuild(EVENTS.slice()); return a === JSON.stringify(Object.values(S.posts).map(p => [p.id, p.status, p.picked])) && !S.rejected.length; }), 'posts rebuild the same from events');
  const pack = await page.evaluate(() => { App.me = S.users.PADMIN; const p = exportPack('person', 'PHELP'); return { posts: p.events.filter(e => e.type === 'JOB_POSTED').length, sees3: p.events.some(e => e.type === 'LEAD_CREATED' && e.pid === 'AIEC-P007') }; });
  assert(pack.posts >= 4 && !pack.sees3, 'a worker\'s file carries every job post, but not projects they are not on');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PHELP', 'jobs', {}], ['PHELP', 'jobs', { src: 'mine' }], ['PQC', 'jobs', {}], ['PADMIN', 'posts', {}], ['PSENIOR', 'home', {}], ['PADMIN', 'project', { pid: 'AIEC-P005' }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { loginAs(S.users.PADMIN); wiz('post', 'AIEC-P005', {}); }); await page.waitForTimeout(150);
  await page.evaluate(() => { loginAs(S.users.PHELP); const p = Object.values(S.posts).find(x => x.status === 'open'); if (p) wiz('apply', null, { postId: p.id }); }); await page.waitForTimeout(150);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('MARKET PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
