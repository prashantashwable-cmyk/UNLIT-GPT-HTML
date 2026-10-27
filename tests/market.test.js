/* Job marketplace: licensed partner companies apply with their own team (area only on the card), QC Inspectors apply for inspections, the office picks the best match. */
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
  assert(/lead/.test(posts) && /service/.test(posts) && /qc/.test(posts) && !/crew/.test(posts), 'practice has open lead, service and inspection posts: ' + posts);

  /* who may apply */
  const leadSmall = await ev('Object.values(S.posts).find(p => p.kind === "lead" && p.status === "open").id');
  assert(await ev(`S.posts["${leadSmall}"].card.size`) !== 'big' && !(await why('PPART1', leadSmall)), 'a licensed company with a free lead may apply');
  assert(await why('PTECH', leadSmall) === 'why_company' && await why('PSENIOR', leadSmall) === 'why_company', 'technicians do not apply alone: their company applies');
  assert(await why('PPART2', leadSmall) === 'why_no_team', 'a company with no approved technician cannot apply');
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'maxActiveJobs', value: 1 }, { as: 'POWNER', quiet: true }); });
  assert(await why('PPART1', leadSmall) === 'why_busy', 'when every lead of the company has the most jobs allowed, it cannot take more');
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'maxActiveJobs', value: 3 }, { as: 'POWNER', quiet: true }); });
  const qcPost = await ev('Object.values(S.posts).find(p => p.kind === "qc").id');
  assert(!(await why('PQC', qcPost)) && await why('PPART1', qcPost) === 'why_qc_only', 'inspections are for AIEC QC Inspectors only, never the installing company');
  assert((await post('AIEC-P003', 'crew', '', 2)).ok === false, 'no crew posts: the company brings its own crew');

  /* card shows area only; a company cannot open the project before it gets the job */
  const svc = await ev('Object.values(S.posts).find(p => p.kind === "service").id');
  await page.evaluate(async () => { const salt = 's'; await perform('USER_ADDED', null, { uid: 'POM1', name: 'Om Senior', role: 'tech', grade: 'senior', company: 'PPART2', salt, pin: await pinHash('1111', salt) }, { as: 'POWNER', quiet: true }); });
  assert(!(await why('PPART2', svc)), 'after the Owner adds an approved Senior to Om Elevator Services, it may apply for service');
  await page.evaluate(() => { loginAs(S.users.PPART2); ACT.permsDone(); Notify.hide(); go('jobs', {}); }); await page.waitForTimeout(200);
  const txt = await page.innerText('main');
  assert(/Pune/.test(txt) && !/Gokhale Residency/.test(txt) && !/9822000001/.test(txt), 'the job card shows the area only, no building name, customer or phone');
  assert(/≈ ₹500/.test(txt) && /AIEC pays your company/.test(txt), 'pay shown is what AIEC pays the company');
  assert(!(await ev('canSee(S.users.PPART2, S.projects["AIEC-P001"])')), 'the company cannot open the project before it gets the job');

  /* apply through the screen with the team */
  await page.click(`[data-a="wizOpen"][data-v="apply||postId|${svc}"]`); await page.waitForTimeout(250);
  await page.click('[data-a="pick"][data-k="lead"][data-v="POM1"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(200);
  await page.fill('#f_note', 'Our senior lives nearby'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev(`S.posts["${svc}"].apps.PPART2 && S.posts["${svc}"].apps.PPART2.team.lead === "POM1"`), 'the company applies, naming its Senior');
  assert((await act('JOB_APPLIED', 'AIEC-P001', { postId: svc, team: { lead: 'POM1', crew: [] } }, 'PPART2')).err === 'err_already', 'one application per company');
  assert((await act('JOB_WITHDRAWN', 'AIEC-P001', { postId: svc }, 'PPART2')).ok && (await act('JOB_APPLIED', 'AIEC-P001', { postId: svc, team: { lead: 'POM1', crew: [] } }, 'PPART2')).ok, 'withdraw and apply again');
  assert((await act('JOB_APPLIED', 'AIEC-P001', { postId: svc, team: { lead: 'PTRAIN', crew: [] } }, 'PPART1')).err === 'err_cant_lead', 'a Trainee cannot be named to lead the work');
  assert((await act('JOB_APPLIED', 'AIEC-P001', { postId: svc, team: { lead: 'PSENIOR', crew: [] } }, 'PPART1')).ok, 'Shree Lift Works applies too');

  /* office picks: best company record first */
  const rank = await page.evaluate(id => rankApplicants(S.posts[id]).map(x => x.uid), svc);
  assert(rank[0] === 'PPART1', 'the company with the better record is suggested first: ' + rank.join(' > '));
  assert((await act('JOB_CONFIRMED', 'AIEC-P001', { postId: svc, uid: 'PPART3' }, 'PADMIN')).err === 'err_not_applied', 'only companies that applied can be given the job');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  assert(await ev(`myTasks(App.me).some(n => n.k === 'pick_applicant' && n.postId === '${svc}')`), 'the Admin gets "Choose who gets the job"');
  await page.evaluate(id => wiz('pick', 'AIEC-P001', { postId: id }), svc); await page.waitForTimeout(250);
  assert(/Suggested/.test(await page.innerText('main')) && /Om Senior/.test(await page.innerText('main')), 'the pick screen marks the suggested company and shows each team');
  await page.click('[data-a="pick"][data-k="uid"][data-v="PPART2"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev('S.projects["AIEC-P001"].svcOwner[0] === "POM1" && canSee(S.users.PPART2, S.projects["AIEC-P001"]) && canSee(S.users.POM1, S.projects["AIEC-P001"])'), 'the company\'s Senior gets the visit; company and technician can now open the project');
  const cel = await page.evaluate(() => { loginAs(S.users.PPART2); Notify.hide(); const n = (App.notifyLog || []).length; Notify.check(); return (App.notifyLog || []).slice(n).map(x => x.title); });
  assert(cel.some(x => /got the job/.test(x)), 'the company hears "You got the job": ' + cel.join(' | '));
  const shot = await ev('[{ id: "E" + rid(10), m: "x", kind: "photo", label: "amc", t: nowISO(), gps: null, hash: "h" + rid(8), dev: "practice", q: {} }]');
  assert((await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks: { ride: 'pass', doors: 'pass', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' }, ev: shot }, 'POM1')).ok, 'the company\'s technician saves the visit');
  assert(await ev('weeksFor("PPART2").some(w => w.lines.some(l => l.what === "earn_amc_visit" && l.who === "POM1"))'), 'the visit is on Om Elevator Services\' bill');

  /* lead post: the company's team goes on the job */
  assert((await act('JOB_CONFIRMED', 'AIEC-P007', { postId: leadSmall, uid: 'PPART1' }, 'PADMIN')).ok && await ev('S.projects["AIEC-P007"].tech === "PSENIOR" && S.projects["AIEC-P007"].crew.join() === "PTRAIN" && S.projects["AIEC-P007"].partner === "PPART1"'), 'lead post → the company holds the job with its lead and crew');
  assert((await act('JOB_APPLIED', 'AIEC-P003', { postId: qcPost }, 'PQC')).ok && (await act('JOB_CONFIRMED', 'AIEC-P003', { postId: qcPost, uid: 'PQC' }, 'PADMIN')).ok && await ev('S.projects["AIEC-P003"].qc') === 'PQC', 'inspection post → that QC is set for the job');
  const tid = await ev('S.projects["AIEC-P001"].tickets.find(x => x.status === "open").id');
  const rep = await post('AIEC-P001', 'repair', tid, 1);
  assert(rep.ok && (await act('JOB_APPLIED', 'AIEC-P001', { postId: rep.id, team: { lead: 'PSENIOR', crew: [] } }, 'PPART1')).ok && (await act('JOB_CONFIRMED', 'AIEC-P001', { postId: rep.id, uid: 'PPART1' }, 'PADMIN')).ok && await ev(`S.projects["AIEC-P001"].tickets.find(x => x.id === "${tid}").owner`) === 'PSENIOR', 'repair post → the ticket goes to the company\'s technician');
  assert((await post('AIEC-P006', 'qc', 'site', 1)).ok && (await post('AIEC-P006', 'qc', 'site', 1)).err === 'err_post_open', 'the same work cannot be posted twice while open');

  /* limits, closing, escalation, rebuild */
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'maxOpenApps', value: 1 }, { as: 'POWNER', quiet: true }); });
  const p2 = await post('AIEC-P005', 'qc', 'final', 1), p3 = await post('AIEC-P004', 'qc', 'final', 1);
  assert((await post('AIEC-P005', 'qc', 'site', 1)).ok === false, 'a site inspection cannot be posted after the site is approved');
  assert((await act('JOB_APPLIED', 'AIEC-P005', { postId: p2.id }, 'PQC')).ok && (await act('JOB_APPLIED', 'AIEC-P004', { postId: p3.id }, 'PQC')).err === 'err_too_many_apps', 'nobody can apply to everything (open applications limit)');
  assert((await act('JOB_CLOSED', 'AIEC-P004', { postId: p3.id, reason: 'Not needed' }, 'PADMIN')).ok && await ev(`S.posts["${p3.id}"].status`) === 'closed', 'the office can close a post');
  await page.evaluate(() => { const p = Object.values(S.posts).find(x => x.pid === 'AIEC-P006' && x.status === 'open'); p.t = new Date(Date.now() - 3 * 864e5).toISOString(); });
  assert(await ev('myTasks(S.users.PADMIN).some(n => n.k === "post_nobody") || myTasks(S.users.POWNER).some(n => n.k === "escalated" && n.ref === "post_nobody")'), 'a post nobody applied for goes back to the office');
  assert(await page.evaluate(() => { const a = JSON.stringify(Object.values(S.posts).map(p => [p.id, p.status, p.picked])); S = rebuild(EVENTS.slice()); return a === JSON.stringify(Object.values(S.posts).map(p => [p.id, p.status, p.picked])) && !S.rejected.length; }), 'posts rebuild the same from events');
  const pack = await page.evaluate(() => { App.me = S.users.PADMIN; const p = exportPack('person', 'PPART2'); return { posts: p.events.filter(e => e.type === 'JOB_POSTED').length, sees7: p.events.some(e => e.type === 'LEAD_CREATED' && e.pid === 'AIEC-P007'), notes: p.events.filter(e => e.type === 'JOB_APPLIED' && e.by !== 'PPART2').every(e => !e.data.note && !e.data.gps) }; });
  assert(pack.posts >= 4 && !pack.sees7 && pack.notes, 'a company\'s file carries every job post, not projects it is not on, and not other companies\' notes');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PPART1', 'jobs', {}], ['PPART1', 'jobs', { src: 'mine' }], ['PQC', 'jobs', {}], ['PADMIN', 'posts', {}], ['PSENIOR', 'home', {}], ['PADMIN', 'project', { pid: 'AIEC-P005' }], ['PPART1', 'project', { pid: 'AIEC-P007' }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { loginAs(S.users.PADMIN); wiz('post', 'AIEC-P005', {}); }); await page.waitForTimeout(150);
  await page.evaluate(() => { loginAs(S.users.PPART1); const p = Object.values(S.posts).find(x => x.status === 'open' && x.kind !== 'qc'); if (p) wiz('apply', null, { postId: p.id }); }); await page.waitForTimeout(150);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('MARKET PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
