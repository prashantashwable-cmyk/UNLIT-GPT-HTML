/* New customer: the rider-style "Start my new lift" steps. An old customer keeps their page and can add another site;
   a stranger sends a new-lift enquiry with photos through the company server, Admin accepts it, and the stranger's phone
   opens as a customer whose new lift is at step Lead. Sales checks every customer-entered site like any new lead. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  const ext = process.env.AIEC_SERVER_URL, srv = ext ? { close: async () => { } } : await startLocal(0, {}), url = ext || 'http://127.0.0.1:' + srv.port;
  const slow = ms => ext ? ms * 8 : ms;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const main = pg => pg.innerText('main');
  const photo = async (pg, key) => {
    await pg.click(`[data-a="cam"][data-k="${key}"]`);
    await pg.waitForFunction(() => { const v = document.querySelector('#ov video'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
    await pg.click('#ov [data-x="shot"]'); await pg.waitForTimeout(300); await pg.click('#ov [data-x="use"]');
    await pg.waitForFunction(() => !document.querySelector('#ov .overlay'), null, { timeout: 15000 }); await pg.waitForTimeout(150);
  };
  const next = async pg => { await pg.click('[data-a="wizNext"]'); await pg.waitForTimeout(250); };
  const pick = (pg, k, v) => pg.click(`[data-a="pick"][data-k="${k}"][data-v="${v}"]`);
  const steps = async (pg, me) => {
    await photo(pg, 'b'); await next(pg);
    await photo(pg, 's'); await next(pg);
    await pg.fill('#f_address', 'Plot 7, Baner Road, Pune'); await pg.waitForTimeout(60); await next(pg);
    await pick(pg, 'shaft', 'yes'); await pg.evaluate(() => { W.ctx.floors = 6; }); await pick(pg, 'bType', 'new'); await pick(pg, 'need', '3m'); await next(pg);
    if (me) { await me(); await next(pg); }
  };

  /* the office (Admin) with the server on */
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  await pa.evaluate(u => Sync.enable(u, ''), url); await syncNow(pa);

  /* an old customer: the page stays; one small button adds another site */
  await pa.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); go('home'); }); await pa.waitForTimeout(300);
  const before = await main(pa);
  assert(/Shree Ganesh Apartment/.test(before) && await pa.$('[data-a="custNewSite"]') && !(await pa.$('.btn-big[data-a="custNewSite"]')), 'the old customer page is as before, with a small "Another lift" button');
  await pa.click('[data-a="custNewSite"]'); await pa.waitForTimeout(300);
  assert(await pa.evaluate(() => W && W.id === 'custLead' && !visSteps().some(s => s.id === 'safe' || s.id === 'contact')), 'the steps have no riding or contact questions');
  await steps(pa);
  assert(await pa.evaluate(() => W.sid === 'review'), 'the customer\'s own name and number are already known, so it goes straight to the check');
  await next(pa); await pa.waitForTimeout(500);
  const pid = await pa.evaluate(() => Object.values(S.projects).find(P => P.lead.bySelf).id);
  assert(await pa.evaluate(p => { const P = S.projects[p]; return P.stage === 'new' && P.customer === 'PCUST' && P.contact.phone === '9822000002' && P.lead.bType === 'new' && P.lead.need === '3m' && P.lead.floors === 6; }, pid), 'the customer\'s site is saved as a new lead, linked to them');
  await pa.evaluate(() => go('home')); await pa.waitForTimeout(200);
  assert(/Plot 7, Baner Road/.test(await main(pa)) && await pa.$(`[data-a="custSite"][data-v="${pid}"]`), 'the page now shows the new site, and the customer can switch between their sites');
  assert(await pa.evaluate(() => Object.values(S.projects).filter(P => custJobs(S.users.PCUST).includes(P.id)).length === 2), 'the customer sees only their own two sites');

  /* the customer can see what they sent and change it until Sales accepts it */
  await pa.evaluate(p => { App.set.custSite = { PCUST: p }; go('home'); }, pid); await pa.waitForTimeout(200);
  assert(/My site details/.test(await main(pa)) && await pa.$(`[data-a="custEditSite"][data-v="${pid}"]`), 'the customer sees their site details with "Change my details"');
  await pa.click(`[data-a="custEditSite"][data-v="${pid}"]`); await pa.waitForTimeout(300);
  assert(await pa.evaluate(() => W.ctx.address === 'Plot 7, Baner Road, Pune' && W.ctx.floors === 6 && W.sid === 'x'), 'the steps open filled in, starting with "more photos"');
  await photo(pa, 'x'); await next(pa); await next(pa);
  await pa.evaluate(() => { W.ctx.floors = 8; }); await pick(pa, 'need', '6m'); await next(pa);
  assert(await pa.evaluate(() => W.sid === 'review'), 'their name and number are not asked again');
  await next(pa); await pa.waitForTimeout(500);
  assert(await pa.evaluate(p => { const P = S.projects[p]; return P.lead.floors === 8 && P.lead.need === '6m' && P.lead.edited && P.evidence.filter(id => S.evidence[id].kind === 'photo').length === 3; }, pid), 'the change and the extra photo are saved on the site');

  /* Sales checks it like any new lead */
  await pa.evaluate(() => { loginAs(S.users.PSALES); Notify.hide(); });
  assert(await pa.evaluate(p => myTasks(App.me).some(x => x.pid === p), pid), 'Sales gets the customer\'s site to check');
  await pa.evaluate(p => wiz('review', p), pid); await pa.waitForTimeout(300);
  const ps = await main(pa);
  assert(/Entered by the customer in the app/.test(ps) && /Maybe the same site as/.test(ps), 'Sales sees it was entered by the customer and a warning that the number matches another site');
  assert(/Changed by the customer/.test(ps), 'Sales sees the customer changed it');
  assert(await pa.evaluate(p => S.projects[p].createdBy === 'PCUST', pid), 'no rider gets lead credit for it');
  await pa.evaluate(p => { W = null; perform('LEAD_ACCEPTED', p, {}, { as: 'PSALES', quiet: true }); loginAs(S.users.PCUST); App.set.custSite = { PCUST: p }; go('home'); }, pid); await pa.waitForTimeout(300);
  assert(!(await pa.$(`[data-a="custEditSite"][data-v="${pid}"]`)) && /Sales is working on it/.test(await pa.evaluate(() => document.querySelector('main').textContent)), 'after Sales accepts, the details are read-only');
  await pa.evaluate(() => { W = null; go('home'); });

  /* a customer with no lift yet sees the rider-style start page */
  await pa.evaluate(() => { S.users.TNEW = { uid: 'TNEW', name: 'Asha Deshmukh', role: 'customer', active: true, projects: [], pinLen: 4 }; App.me = S.users.TNEW; go('home'); }); await pa.waitForTimeout(200);
  const nh = await main(pa);
  assert(await pa.$('.btn-big[data-a="custNewSite"]') && /What happens next/.test(nh) && !/No project is linked/.test(nh), 'a new customer sees "Start my new lift" and what happens next, not a dead end');
  await pa.evaluate(() => { delete S.users.TNEW; loginAs(S.users.PADMIN); });

  /* a stranger: Customer → New lift, through the server */
  const B = await launch(), pb = B.page;
  await pb.evaluate(async u => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); App.me = null; App.defaultSrv = u; go('gate'); }, url); await pb.waitForTimeout(200);
  await pb.click('[data-a="door"][data-v="cust"]'); await pb.waitForTimeout(150);
  assert(await pb.$('[data-a="custNewGuest"]'), 'the customer door offers "New lift (new project)"');
  await pb.click('[data-a="custNewGuest"]'); await pb.waitForTimeout(300);
  await steps(pb, async () => {
    assert(await pb.evaluate(() => W.sid === 'me'), 'a stranger is asked for name, mobile and a PIN');
    await pb.fill('#f_name', 'Asha Deshmukh'); await pb.fill('#f_phone', '9890011223'); await pb.fill('#f_pin1', '1357'); await pb.fill('#f_pin2', '1357'); await pb.waitForTimeout(60);
  });
  await next(pb); await pb.waitForTimeout(slow(2000));
  assert(await pb.evaluate(() => App.route.name) === 'myReq' && /New lift/.test(await main(pb)), 'the enquiry is sent and the person waits on "My request"');
  assert(/What you sent/.test(await main(pb)) && /Plot 7, Baner Road/.test(await main(pb)) && await pb.$$eval('main .photos img', xs => xs.length) >= 2, 'they see what they sent, with the photos');
  await pb.click('[data-a="myReqFix"]'); await pb.waitForTimeout(300);
  assert(await pb.evaluate(() => W && W.ctx.address === 'Plot 7, Baner Road, Pune' && W.ctx.b.length === 1 && W.ctx.name === 'Asha Deshmukh'), 'Change my details opens the steps filled in');
  await next(pb); await next(pb); await next(pb);
  await pb.evaluate(() => { W.ctx.floors = 9; }); await next(pb);
  await pb.fill('#f_pin1', '1357'); await pb.fill('#f_pin2', '1357'); await pb.waitForTimeout(60); await next(pb); await next(pb); await pb.waitForTimeout(slow(2000));
  assert(await pb.evaluate(() => App.route.name === 'myReq' && myJoin().form.floors === 9), 'the changed request is sent');

  await syncNow(pa); await pa.evaluate(() => go('home')); await pa.waitForTimeout(200);
  assert(/New lift enquiries from the app \(1\)/.test(await main(pa)), 'Admin\'s home shows the new-lift enquiry once (the older one is replaced)');
  assert(await pa.evaluate(() => App.joinReqs.filter(x => x.kind === 'enq').length === 2 && App.joinReqs.some(x => x.st === 'replaced')), 'the first one is marked "Replaced by a newer request"');
  await pa.click('[data-a="eqList"]'); await pa.waitForTimeout(150); await pa.click('[data-a="jqOpen"]'); await pa.waitForTimeout(400);
  const eq = await main(pa);
  assert(/Asha Deshmukh/.test(eq) && /Plot 7, Baner Road/.test(eq) && /New building/.test(eq) && /Within 3 months/.test(eq) && /changed their details/.test(eq) && /\b9\b/.test(eq), 'Admin sees the newest details (9 floors), building type and timing');
  assert(await pa.$$eval('main img[data-m]', xs => xs.filter(x => x.src.startsWith('data:image')).length) >= 2, 'and the photos');
  assert(/already a site/.test(eq), 'the same place as the old customer\'s new site is flagged');
  await pa.click('[data-a="jqOk"]'); await pa.waitForTimeout(slow(1500));
  const np = await pa.evaluate(() => { const u = Object.values(S.users).find(x => x.name === 'Asha Deshmukh'); return u && custJobs(u)[0]; });
  assert(np && await pa.evaluate(p => S.projects[p].stage === 'new' && S.projects[p].lead.bySelf && S.projects[p].evidence.length >= 2, np), 'accepting makes a new lead with the photos and a customer login');

  await pb.evaluate(() => myReqPoll()); await pb.waitForTimeout(slow(2500));
  assert(await pb.evaluate(() => App.me && App.me.role === 'customer' && App.me.name === 'Asha Deshmukh'), 'the stranger\'s phone opens as the customer');
  await pb.evaluate(() => go('home')); await pb.waitForTimeout(200);
  assert(/Plot 7, Baner Road/.test(await main(pb)) && await pb.evaluate(p => custPid(App.me) === p, np), 'their page shows their new lift at the first step');
  assert(await pb.evaluate(() => Object.keys(S.projects).length) === 1, 'they see only their own lift');

  for (const [pg, scr] of [[pa, () => go('joinCheck', { rid: App.joinReqs[0].rid })], [pb, () => go('home')], [pa, () => wiz('custLead', null, { guest: true })]]) {
    for (const lang of ['en', 'hi', 'mr']) {
      await pg.evaluate(([lang, f]) => { LANG = lang; App.set.lang = lang; (new Function('return ' + f))()(); }, [lang, scr.toString()]); await pg.waitForTimeout(80);
      if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll (' + lang + ')');
    }
  }
  for (const pg of [pa, pb]) { const m = await miss(pg); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : '')); }
  const errs = [...A.errors, ...B.errors].filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e));
  assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await srv.close(); for (const x of [A, B]) await x.browser.close();
  console.log('CUSTOMER LEAD PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
