/* Joining through the company server: a new person applies in the app with photos, Admin checks the profile, asks for more
   details, the person fixes and sends again, Admin approves, and the person's phone gets in by itself. A refused person
   sees the reason; their photos leave the office phone. The server never sees the details. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  /* AIEC_SERVER_URL runs the same test against a real server engine */
  const ext = process.env.AIEC_SERVER_URL, srv = ext ? { close: async () => { }, store: null } : await startLocal(0, {}), url = ext || 'http://127.0.0.1:' + srv.port;
  const slow = ms => ext ? ms * 8 : ms;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const main = pg => pg.innerText('main');

  /* the office (Admin) turns the server on; its phone publishes the key requests are locked with */
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  assert(await pa.evaluate(u => Sync.enable(u, ''), url) == null, 'the office turns the server on');
  await syncNow(pa);
  const pub = await fetch(url + '/pubkey').then(r => r.json());
  assert(pub.key && pub.key === await pa.evaluate(() => App.rkPub), 'the office phone published its public lock key');
  assert(await pa.evaluate(() => new URLSearchParams(joinUrl().split('#')[1]).get('k') === App.rkPub), 'the join link and poster carry the key too');

  /* a new technician applies from their own phone */
  const B = await launch(), pb = B.page;
  const applicant = async (pg, srvUrl) => pg.evaluate(async u => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); App.me = null; App.defaultSrv = u; go('gate'); }, srvUrl);
  await applicant(pb, url); await pb.waitForTimeout(200);
  await pb.click('[data-a="door"][data-v="join"]'); await pb.click('[data-a="joinRole"][data-v="tech"]'); await pb.waitForTimeout(150);
  assert(await pb.$('[data-a="jrPhoto"][data-v="rqPhotoM"]') && await pb.$('[data-a="jrPhoto"][data-v="rqIdM"]') && await pb.$('[data-a="jrSkill"]'), 'the form asks for a photo, an ID photo and skills');
  assert(/Send to the office/.test(await pb.innerText('.foot')), 'with a server the button sends straight to the office');
  const fillBase = async (pg, name, phone) => {
    await pg.fill('[data-f="rqName"]', name); await pg.fill('[data-f="rqPhone"]', phone); await pg.fill('[data-f="rqArea"]', 'Pune East');
    await pg.fill('[data-f="rqPin1"]', '2468'); await pg.fill('[data-f="rqPin2"]', '2468');
  };
  await fillBase(pb, 'Ravi Patil', '9876512345');
  await pb.fill('[data-f="rqExp"]', '4'); await pb.fill('[data-f="rqEmp"]', 'Shree Lifts'); await pb.fill('[data-f="rqRefName"]', 'Suresh'); await pb.fill('[data-f="rqRefPhone"]', '9822011111');
  await pb.click('[data-a="jrSkill"][data-v="install"]'); await pb.click('[data-a="jrSkill"][data-v="wiring"]');
  await pb.click('[data-a="joinMake"]'); await pb.waitForTimeout(200);
  assert(/Add your photo and the ID photo/.test(await main(pb)), 'it cannot be sent without the photos');
  const addPhotos = pg => pg.evaluate(async () => { for (const k of ['rqPhotoM', 'rqIdM']) App.form[k] = await putMedia(await shrinkPhoto(samplePhoto(k), 640, 0.6)); render(); });
  /* the camera works on the start page too (no one is logged in yet) */
  await pb.click('[data-a="jrPhoto"][data-v="rqPhotoM"]');
  await pb.waitForFunction(() => { const v = document.querySelector('#ov video'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await pb.click('#ov [data-x="shot"]'); await pb.waitForTimeout(300); await pb.click('#ov [data-x="use"]');
  await pb.waitForFunction(() => !document.querySelector('#ov .overlay') && App.form.rqPhotoM, null, { timeout: 15000 });
  assert(await pb.evaluate(async () => { const d = await getMedia(App.form.rqPhotoM); return /^data:image\/jpeg/.test(d) && d.length < 200000; }), 'a photo taken with the camera is made small for sending');
  await addPhotos(pb); await pb.waitForTimeout(150);
  assert(await pb.$$eval('main img[data-m]', xs => xs.length) === 2, 'the two photos show on the form');
  await pb.click('[data-a="joinMake"]'); await pb.waitForTimeout(slow(1500));
  assert(await pb.evaluate(() => App.route.name) === 'myReq' && /Sent to the office/.test(await main(pb)), 'the person sees "Sent to the office" and waits');
  const stored = srv.store ? JSON.stringify(srv.store.msgs.filter(m => m.box === 'requests')) : 'x'.repeat(2000);
  assert(stored.length > 1000 && !stored.includes('9876512345') && !stored.includes('Ravi') && !stored.includes('Shree'), 'the server keeps it locked: no name, no number');
  await pb.evaluate(() => myReqPoll()); await pb.waitForTimeout(300);
  assert(!(await pb.evaluate(() => myJoin().st)), 'no answer yet while the office has not decided');

  /* the office sees it on the home screen and checks the profile */
  await syncNow(pa);
  await pa.evaluate(() => go('home')); await pa.waitForTimeout(200);
  assert(/Join requests \(1\)/.test(await main(pa)), 'Admin\'s home shows the join request');
  await pa.click('[data-a="nav"][data-v="joins"]'); await pa.waitForTimeout(150);
  await pa.click('[data-a="jqOpen"]'); await pa.waitForTimeout(400);
  const prof = await main(pa);
  assert(/Ravi Patil/.test(prof) && /Shree Lifts/.test(prof) && /Suresh/.test(prof) && /Installation|install/i.test(prof), 'the profile shows the details, last company, reference and skills');
  assert(/New number/.test(prof) && /Mobile number looks right/.test(prof) && /Photo and ID photo are there/.test(prof), 'the automatic checks are shown');
  assert(await pa.$$eval('main img[data-m]', xs => xs.filter(x => x.src.startsWith('data:image')).length) === 2, 'Admin sees both photos');
  await pa.click('[data-a="jqOk"]'); await pa.waitForTimeout(200);
  assert(/First call the number/.test(await main(pa)) && !(await pa.evaluate(() => Object.keys(S.joins).length)), 'Admin cannot approve before calling the person');
  await pa.click('[data-a="jqMore"]'); await pa.waitForTimeout(150);
  assert(!(await pa.evaluate(() => Object.keys(S.joins).length)), 'asking for more needs a note');
  await pa.fill('[data-f="jcNote"]', 'Send a clearer ID photo'); await pa.click('[data-a="jqMore"]'); await pa.waitForTimeout(slow(800));
  const rid1 = await pa.evaluate(() => App.joinReqs[0].rid);
  assert(await pa.evaluate(r => S.joins[r] && S.joins[r].more, rid1), 'the request is sent back for more details');

  /* the person sees what is missing, fixes it and sends again */
  await pb.evaluate(() => myReqPoll()); await pb.waitForTimeout(slow(1500));
  assert(await pb.evaluate(() => myJoin().st) === 'more' && /Send a clearer ID photo/.test(await main(pb)), 'the person sees the office needs more details, with the note');
  await pb.click('[data-a="myReqFix"]'); await pb.waitForTimeout(200);
  assert(await pb.inputValue('[data-f="rqName"]') === 'Ravi Patil' && /Send a clearer ID photo/.test(await main(pb)), 'the form opens filled in, with the office\'s note');
  await pb.fill('[data-f="rqPin1"]', '2468'); await pb.fill('[data-f="rqPin2"]', '2468');
  await addPhotos(pb); await pb.click('[data-a="joinMake"]'); await pb.waitForTimeout(slow(1500));
  assert(await pb.evaluate(() => App.route.name) === 'myReq' && !(await pb.evaluate(() => myJoin().st)), 'the fixed request is sent and waits again');

  /* Admin approves the fixed request */
  await syncNow(pa);
  assert(await pa.evaluate(() => pendingJoins().length) === 1, 'only the new request is waiting; the first one is decided');
  await pa.evaluate(() => go('joins')); await pa.waitForTimeout(150); await pa.click('[data-a="jqOpen"]'); await pa.waitForTimeout(300);
  assert(/Sent again after the office asked for more details/.test(await main(pa)), 'Admin sees it is the fixed request');
  await pa.click('[data-a="jcCalled"]'); await pa.click('[data-a="jqOk"]'); await pa.waitForTimeout(slow(1500));
  const uid = await pa.evaluate(() => S.joins[App.joinReqs[0].rid] && S.joins[App.joinReqs[0].rid].uid);
  assert(uid && await pa.evaluate(u => S.users[u].active && S.users[u].role === 'tech' && S.workers[u].profile.phone === '9876512345' && S.workers[u].profile.skills.includes('wiring'), uid), 'the technician is added with their phone and skills');
  assert(await pa.evaluate(u => Sync.cfg().boxes.includes(u), uid), 'their server box is made at once');

  /* the person's phone gets in by itself */
  await pb.evaluate(() => myReqPoll()); await pb.waitForTimeout(slow(2500));
  assert(await pb.evaluate(u => App.me && App.me.uid === u, uid), 'the new technician\'s phone opens the app as them');
  assert(await pb.evaluate(u => Sync.cfg() && Sync.cfg().role === 'person' && Sync.cfg().box === u, uid), 'and is connected to the company server');
  assert(await syncNow(pb) === 'ok', 'their phone syncs');
  assert(await pb.evaluate(async u => S.users[u].pin === await pinHash('2468', S.users[u].salt), uid), 'their own PIN works');

  /* a second request from the same number is refused; the office sees the warning; photos leave the office phone */
  const C = await launch(), pc = C.page;
  await applicant(pc, url); await pc.waitForTimeout(200);
  await pc.click('[data-a="door"][data-v="join"]'); await pc.click('[data-a="joinRole"][data-v="field"]'); await pc.waitForTimeout(150);
  await fillBase(pc, 'Ravi P', '9876512345'); await addPhotos(pc); await pc.click('[data-a="joinMake"]'); await pc.waitForTimeout(slow(1500));
  await syncNow(pa);
  await pa.evaluate(() => go('joins')); await pa.waitForTimeout(150); await pa.click('[data-a="jqOpen"]'); await pa.waitForTimeout(300);
  assert(/already belongs to Ravi Patil/.test(await main(pa)), 'Admin is warned the number already belongs to someone in the company');
  const photos = await pa.evaluate(() => [App.joinReqs[0].photo, App.joinReqs[0].idPhoto]);
  await pa.click('[data-a="jqNo"]'); await pa.waitForTimeout(150);
  assert(!(await pa.evaluate(() => S.joins[App.joinReqs[0].rid])), 'refusing needs a reason');
  await pa.fill('[data-f="jcNote"]', 'Already working with us'); await pa.click('[data-a="jqNo"]'); await pa.waitForTimeout(slow(800));
  assert(await pa.evaluate(async ks => !(await KV.get(App.ns + 'm:' + ks[0])) && !(await KV.get(App.ns + 'm:' + ks[1])), photos), 'the refused person\'s photos are deleted from the office phone');
  await pc.evaluate(() => myReqPoll()); await pc.waitForTimeout(slow(1500));
  assert(await pc.evaluate(() => myJoin().st) === 'no' && /Already working with us/.test(await main(pc)), 'the person sees "Not approved" with the reason');
  await pc.evaluate(() => go('gate')); await pc.waitForTimeout(150);
  assert(/Your join request/.test(await main(pc)), 'the start page shows their request and answer');

  /* without a server the old way (WhatsApp) still works */
  const D = await launch(), pd = D.page;
  await applicant(pd, ''); await pd.evaluate(() => { App.set.lastSrv = ''; }); await pd.waitForTimeout(200);
  await pd.click('[data-a="door"][data-v="join"]'); await pd.click('[data-a="joinRole"][data-v="tech"]'); await pd.waitForTimeout(150);
  assert(!(await pd.$('[data-a="jrPhoto"]')) && /Make my request/.test(await pd.innerText('.foot')), 'without a server the form stays as before');
  await fillBase(pd, 'Anil', '9876500001'); await pd.click('[data-a="joinMake"]'); await pd.waitForTimeout(300);
  assert(await pd.evaluate(() => App.route.name) === 'reqSent', 'and the request goes by WhatsApp as before');

  for (const [pg, scr] of [[pa, () => go('joinCheck', { rid: App.joinReqs[0].rid })], [pc, () => go('myReq')], [pb, () => { App.form = {}; go('joins'); }]]) {
    for (const lang of ['en', 'hi', 'mr']) {
      await pg.evaluate(([lang, f]) => { LANG = lang; App.set.lang = lang; (new Function('return ' + f))()(); }, [lang, scr.toString()]); await pg.waitForTimeout(80);
      if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll (' + lang + ')');
    }
  }
  for (const pg of [pa, pb, pc, pd]) { const m = await miss(pg); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : '')); }
  const errs = [...A.errors, ...B.errors, ...C.errors, ...D.errors].filter(e => !/net::|Failed to fetch|ERR_/.test(e));
  assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await srv.close(); for (const x of [A, B, C, D]) await x.browser.close();
  console.log('JOIN FLOW PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
