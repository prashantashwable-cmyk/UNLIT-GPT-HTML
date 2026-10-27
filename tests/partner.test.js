/* Licensed Partner Companies: the company holds the licence, gets jobs from the board with its own team, is paid a weekly bill; AIEC approves its technicians. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const addUser = (data, as) => page.evaluate(async ([data, as]) => { const salt = 's'; const r = await perform('USER_ADDED', null, Object.assign({ salt, pin: await pinHash('1111', salt) }, data), { as, quiet: true }); return { ok: r.ok, err: r.err && (r.err.k || r.err) }; }, [data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k + ':' + (n.uid || n.pid || '')), uid);

  assert(await ev('S.rejected.length === 0 && Object.values(S.users).filter(u => u.role === "partner").length === 2'), 'practice data has two licensed partner companies and no refused records');
  assert(await ev('["PTECH", "PSENIOR", "PHELP", "PTRAIN"].every(u => companyOf(u) === "PPART1" && S.users[u].memberOk)'), 'the practice installers work for Shree Lift Works');
  assert(await ev('["AIEC-P001", "AIEC-P003", "AIEC-P005"].every(p => S.projects[p].partner === "PPART1")'), 'jobs given to its technicians are held by the company');

  /* the company adds its own technician; AIEC approves */
  assert((await addUser({ uid: 'PNEW1', name: 'Kiran Tech', role: 'tech', grade: 'helper' }, 'PPART1')).ok, 'the company adds a technician (starting level Helper)');
  assert((await addUser({ uid: 'PNEW2', name: 'Too High', role: 'tech', grade: 'senior' }, 'PPART1')).err === 'err_grade', 'a company cannot give a high starting level');
  assert((await addUser({ uid: 'PNEW3', name: 'Not Tech', role: 'sales' }, 'PPART1')).err.startsWith('err_role'), 'a company can only add technicians');
  assert(await ev('companyOf("PNEW1") === "PPART1" && !S.users.PNEW1.memberOk && techWhyNot("PNEW1") === "err_member_pending"'), 'the new technician waits for AIEC approval');
  assert((await act('CREW_ADDED', 'AIEC-P005', { uid: 'PNEW1' }, 'PPART1')).err === 'err_member_pending', 'a technician waiting for approval cannot be sent to a site');
  assert((await tasks('PADMIN')).includes('approve_member:PNEW1'), 'the Admin gets "approve a company\'s technician"');
  assert(!(await act('MEMBER_APPROVED', null, { uid: 'PNEW1' }, 'PPART1')).ok, 'the company cannot approve its own technician');
  assert((await act('MEMBER_APPROVED', null, { uid: 'PNEW1' }, 'PADMIN')).ok && await ev('techWhyNot("PNEW1") === null'), 'after Admin approval the technician can be placed');
  assert((await act('CREW_ADDED', 'AIEC-P005', { uid: 'PNEW1' }, 'PPART1')).ok, 'the company adds its approved technician as crew on its own job');

  /* another company's people cannot be mixed in */
  assert((await addUser({ uid: 'POM1', name: 'Om Senior', role: 'tech', grade: 'senior', company: 'PPART2' }, 'POWNER')).ok, 'the Owner adds a technician directly into Om Elevator Services (approved at once)');
  assert((await act('CREW_ADDED', 'AIEC-P005', { uid: 'POM1' }, 'PADMIN')).err === 'err_other_company', 'a technician of another company cannot join this company\'s job');
  assert((await act('TEAM_SET', 'AIEC-P005', { lead: 'PTECH', crew: [] }, 'PPART2')).err === 'err_access', 'a company cannot change the team on a job it does not hold');

  /* licence */
  assert(await ev('jobWhyNot("PPART2", S.posts[S.postOrder.find(id => S.posts[id].kind === "service")])') === null, 'Om Elevator Services (licence valid 20 more days, a Senior) may apply for the service visit');
  assert((await tasks('PPART2')).some(x => x.startsWith('licence_renew')) && (await tasks('PADMIN')).some(x => x.startsWith('licence_renew:PPART2')), 'licence ending in 20 days: reminders for the company and the office');
  assert((await act('PARTNER_PROFILE', null, { uid: 'PPART2', licNo: 'MH/LIFT/2021/0642', licHolder: 'Om Elevator Services', licExpiry: '2027-12-31' }, 'PPART2')).ok, 'the company types its renewed licence date');
  assert(await ev('!licenceOk("PPART2") && jobWhyNot("PPART2", S.posts[S.postOrder.find(id => S.posts[id].kind === "service")]) === "why_licence"'), 'a licence changed by the company needs AIEC to check the copy again before new jobs');
  await act('DOC_VERIFIED', null, { uid: 'PPART2', doc: 'license', status: 'verified' }, 'PADMIN');
  assert(await ev('licenceOk("PPART2") && licDays("PPART2") > 300'), 'after AIEC checks the renewed licence, jobs are open again');

  /* jobs go to the company with its team */
  const lead = await ev('S.postOrder.find(id => S.posts[id].kind === "lead")');
  assert((await act('JOB_APPLIED', 'AIEC-P007', { postId: lead, note: '' }, 'PTECH')).err === 'err_access' || (await act('JOB_APPLIED', 'AIEC-P007', { postId: lead }, 'PTECH')).ok === false, 'a technician cannot apply alone; the company applies');
  assert((await act('JOB_APPLIED', 'AIEC-P007', { postId: lead, team: { lead: 'PSENIOR', crew: ['POM1'] } }, 'PPART2')).err === 'err_other_company', 'a company cannot offer another company\'s technician');
  assert((await act('JOB_APPLIED', 'AIEC-P007', { postId: lead, team: { lead: 'POM1', crew: [] } }, 'PPART2')).ok, 'Om Elevator Services applies with its own Senior as lead');
  const ranked = await page.evaluate(id => rankApplicants(S.posts[id]).map(x => x.uid + ':' + x.count), lead);
  assert(ranked[0].startsWith('PPART1'), 'applicants are ranked by company record (Shree Lift Works has the reviews): ' + ranked.join(' '));
  assert((await act('JOB_CONFIRMED', 'AIEC-P007', { postId: lead, uid: 'PPART1' }, 'PADMIN')).ok, 'the office confirms Shree Lift Works');
  assert(await ev('S.projects["AIEC-P007"].partner === "PPART1" && S.projects["AIEC-P007"].tech === "PSENIOR" && S.projects["AIEC-P007"].crew.join() === "PTRAIN"'), 'the company holds the job; its chosen lead and crew are on it');
  assert((await act('TEAM_SET', 'AIEC-P007', { lead: 'PTECH', crew: ['PHELP'] }, 'PPART1')).ok && await ev('S.projects["AIEC-P007"].tech === "PTECH"'), 'the company changes its own team on the job');
  assert((await act('JOB_POSTED', 'AIEC-P005', { postId: 'J-crew1', kind: 'crew', ref: '', slots: 1, start: '2026-12-01', card: { area: 'Wakad' } }, 'PADMIN')).err === 'err_crew_company', 'no crew posts: the company brings its own crew');

  /* big jobs need a company with a record */
  assert((await addUser({ uid: 'PPART3', name: 'New Lift Co', role: 'partner' }, 'POWNER')).ok, 'a third company is added');
  await act('PARTNER_PROFILE', null, { uid: 'PPART3', licNo: 'MH/LIFT/2026/0001', licHolder: 'New Lift Co', licExpiry: '2028-01-01' }, 'PADMIN');
  await act('DOC_VERIFIED', null, { uid: 'PPART3', doc: 'license', status: 'verified' }, 'PADMIN');
  await addUser({ uid: 'PNEWS', name: 'New Senior', role: 'tech', grade: 'senior', company: 'PPART3' }, 'POWNER');
  assert((await act('JOB_POSTED', 'AIEC-P003', { postId: 'J-big1', kind: 'lead', ref: '', slots: 1, start: '2026-12-01', card: await ev('postCard(S.projects["AIEC-P003"])') }, 'PADMIN')).ok, 'office posts the big hospital job');
  assert(await ev('jobWhyNot("PPART3", S.posts["J-big1"])') === 'why_company_big', 'a company with no finished jobs cannot take a big job');
  assert(await ev('companyBig("PPART1") && companyJobs("PPART1").length >= 2 && companyStars("PPART1").count >= 3'), 'Shree Lift Works has the record for big jobs');

  /* weekly bill to the company */
  assert(await ev('weeksFor("PPART1").some(w => w.total > 0 && w.lines.every(l => l.who)) && weeksFor("PTECH").length === 0'), 'AIEC pays the company its members\' work; the technician has no separate pay week');
  const week = await ev('weeksFor("PPART1").find(w => w.total > 0 && w.week < weekKey(nowISO())).week');
  assert((await tasks('POWNER')).concat(await tasks('PADMIN')).some(x => x === 'approve_pay:PPART1') && !(await tasks('POWNER')).concat(await tasks('PADMIN')).some(x => x === 'approve_pay:PTECH'), 'pay approval is for the company, not the technician');
  const tot = await ev(`weeksFor("PPART1").find(w => w.week === "${week}").total`);
  assert((await act('PAY_APPROVED', null, { uid: 'PPART1', week, computed: tot, adjust: 0, amount: tot, reason: '' }, 'POWNER')).ok, 'the Owner approves the company bill');
  assert((await act('PAY_DISPUTED', null, { uid: 'PPART1', week, reason: 'Crew job missing' }, 'PPART1')).ok, 'the company can question its bill');
  const before = await ev('weeksFor("PPART1").reduce((a, w) => a + w.total, 0)');
  assert((await act('MEMBER_REMOVED', null, { uid: 'PTECH', reason: 'Left the company' }, 'PPART1')).ok, 'the company removes a technician who left');
  assert(await ev('weeksFor("PPART1").reduce((a, w) => a + w.total, 0)') === before, 'work done while he was with the company stays on the company bill');
  assert((await tasks('PPART1')).some(x => x.startsWith('fill_team:AIEC-P004')) && (await tasks('PADMIN')).some(x => x === 'reassign_work:PTECH' || x.startsWith('reassign_work')), 'his jobs ask the company to put someone else on them');
  assert(await ev('companyWorkCard("PTECH").length > 0'), 'the technician still sees the value of his past work, paid to the company');

  /* sync: the company\'s phone */
  const pack = await page.evaluate(() => { App.me = S.users.PADMIN; return exportPack('person', 'PPART1'); });
  const B = await launch(); const pb = B.page;
  const rb = await pb.evaluate(async txt => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.mode = 'practice'; await loadMode('practice'); const r = await importText(txt); return { r, rej: S.rejected.length, rejs: S.rejected.map(x => x.ev.type + ':' + JSON.stringify(x.err)), jobs: EVENTS.filter(e => e.type.startsWith('JOB_')).length, seen: visibleProjects(S.users.PPART1).map(P => P.id) }; }, JSON.stringify(pack));
  assert(rb.r.ok && rb.rej === 0 && rb.jobs > 0 && rb.seen.includes('AIEC-P003'), 'the company file imports cleanly with the job board and its jobs: ' + JSON.stringify(rb));
  await B.browser.close();

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PPART1', 'worker', { uid: 'PPART1' }], ['PPART1', 'jobs', {}], ['PPART1', 'earn', { uid: 'PPART1' }], ['PPART1', 'home', {}], ['PADMIN', 'worker', { uid: 'PNEW1' }], ['PTECH', 'home', {}], ['PTECH', 'earn', { uid: 'PTECH' }], ['PADMIN', 'workers', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang}) as ${uid}`);
  }
  await page.evaluate(() => { LANG = 'mr'; loginAs(S.users.PPART2); wiz('apply', null, { postId: S.postOrder.find(id => S.posts[id].kind === 'service') }); }); await page.waitForTimeout(150);
  assert(await page.$('[data-a="pick"][data-k="lead"]'), 'applying shows the company\'s technicians to choose from');
  await page.evaluate(() => { loginAs(S.users.PPART1); wiz('team', 'AIEC-P007'); }); await page.waitForTimeout(150);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('PARTNER PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
