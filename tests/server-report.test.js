/* Lift sticker → office through the company server: the resident's report is locked with the office's public key, so only
   office phones can read it. "Lift stopped" wakes the office at once. The office opens a ticket in one tap. */
const { launch, miss, APP } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  const srv = await startLocal(0, { ADMIN_SECRET: 'test-secret-123' }), url = 'http://127.0.0.1:' + srv.port;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  await pa.evaluate(u => Sync.enable(u, 'test-secret-123'), url); await syncNow(pa);
  const pid = await pa.evaluate(() => Object.values(S.projects).find(P => P.lift && P.lift.code).id);

  /* the sticker carries the server and the office's public key (only for an https server) */
  await pa.evaluate(pid => ACT.liftQr(pid), pid); await pa.waitForTimeout(200);
  assert(await pa.evaluate(pid => !/[?&#]s=/.test(liftUrl(S.projects[pid])), pid), 'a server without https is never printed on stickers');
  const link = await pa.evaluate(([pid, u]) => { const c = Sync.cfg(); c.url = 'https://sync.example.in'; const l = liftUrl(S.projects[pid]); c.url = u; return l; }, [pid, url]);
  const q = new URLSearchParams(link.split('#')[1]);
  assert(q.get('s') === 'https://sync.example.in' && /^[A-Za-z0-9_-]{80,90}$/.test(q.get('k')), 'the sticker link carries the server address and the office\'s public lock key');

  /* a resident scans it (the test points the link at the local server) */
  const R = await launch(), pr = R.page;
  const hash = link.split('#')[1].replace(encodeURIComponent('https://sync.example.in'), encodeURIComponent(url));
  await pr.goto('about:blank'); await pr.goto(APP + '#' + hash); await pr.waitForTimeout(1500);
  await pr.evaluate(u => { LANG = 'en'; App.set.lang = 'en'; App.qr.srv = u; render(); }, url); /* the page itself only takes https addresses from a link */
  await pr.click('[data-a="qrReport"]'); await pr.click('[data-a="qrProblem"][data-v="stopped"]'); await pr.waitForTimeout(100);
  await pr.fill('#qrPhone', '9876501234');
  assert(await pr.$('[data-a="qrServer"]'), 'the resident page offers "Send to the office now"');
  await pr.click('[data-a="qrServer"]'); await pr.waitForTimeout(800);
  assert(/Received by the company's server/.test(await pr.innerText('main')) && /also call/.test(await pr.innerText('main')), 'the resident sees it reached the server, and is still told to call if someone is trapped');
  const stored = JSON.stringify(srv.store.msgs.filter(m => m.box === 'reports'));
  assert(stored.length > 10 && !stored.includes('9876501234') && !stored.includes('stopped'), 'the server keeps it locked: no phone number, no problem text');

  /* the office receives it */
  await syncNow(pa);
  assert(await pa.evaluate(() => openReports().length === 1 && openReports()[0].phone === '9876501234' && openReports()[0].problem === 'stopped'), 'the office phone opens the report');
  await pa.evaluate(() => go('home')); await pa.waitForTimeout(150);
  assert(await pa.$('[data-a="nav"][data-v="reports"]') && /Resident reports \(1\)/.test(await pa.innerText('main')), 'the office home shows the report');
  await pa.evaluate(() => go('reports')); await pa.waitForTimeout(150);
  await pa.click('[data-a="rpTicket"]'); await pa.waitForTimeout(300);
  assert(await pa.evaluate(() => W && W.id === 'ticket' && W.ctx.src === 'qr' && /Resident report/.test(W.ctx.text)), 'one tap opens the ticket form filled in');
  const rid = await pa.evaluate(() => W.ctx.report);
  await pa.evaluate(async ([pid, rid]) => { W = null; await perform('TICKET_OPENED', pid, { tid: 'T-' + rid.slice(2), kind: S.projects[pid].stage === 'amc' ? 'breakdown' : 'complaint', src: 'qr', text: 'Lift stopped (resident)', report: rid }, { quiet: true }); }, [pid, rid]);
  assert(await pa.evaluate(() => openReports().length === 0), 'once the ticket is open, the report leaves the list');

  /* limits */
  let last = 0; for (let i = 0; i < 12; i++) last = await fetch(url + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blob: 'abc.def.ghi' }) }).then(r => r.status);
  assert(last === 429, 'one network cannot flood the office with reports');
  assert(await pr.evaluate(() => { const a = parseQr('#q=L-ABC234&s=http%3A%2F%2Fevil.in&k=xyz'); const b = parseQr('#q=L-ABC234&s=javascript%3Aalert(1)'); return a.srv === '' && a.rk === '' && b.srv === ''; }), 'a sticker link with a non-https server or a broken key is ignored');

  for (const lang of ['en', 'hi', 'mr']) {
    await pa.evaluate(lang => { LANG = lang; App.set.lang = lang; go('reports'); }, lang); await pa.waitForTimeout(60);
    if (await pa.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll (' + lang + ')');
    await pr.evaluate(lang => { LANG = lang; App.set.lang = lang; render(); }, lang); await pr.waitForTimeout(60);
    if (await pr.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on resident page (' + lang + ')');
  }
  const m1 = await miss(pa), rt = await pr.innerText('main');
  assert(!m1.length && !/\b(qr|rp|qp)_[a-z_]+\b/.test(rt), 'no missing words' + (m1.length ? ': ' + m1.join(' ') : ''));
  await srv.close(); for (const x of [A, R]) await x.browser.close();
  console.log('SERVER REPORT PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
