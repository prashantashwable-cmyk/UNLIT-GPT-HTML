/* Fast start and speed budget. A company with ~200 jobs and ~20,000 records (made from the golden history) must:
   rebuild from a snapshot to exactly the same state as a full replay; never trust a snapshot that does not match (other
   app version, a record inserted before it, an undo after it); start from the snapshot on the real load path; and stay
   inside its time budgets on a phone 4x slower than this machine. */
const fs = require('fs');
const path = require('path');
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const gold = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-v1.json'), 'utf8'));
  const { browser, ctx, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  /* a big company: the golden jobs copied many times under new job numbers */
  const n = await page.evaluate(g => {
    const base = g.events, pids = [...new Set(base.filter(e => e.pid).map(e => e.pid))], big = base.map(e => JSON.parse(JSON.stringify(e)));
    for (let c = 1; big.length < 20000; c++) for (const e of base) if (e.pid) {
      let js = JSON.stringify(e); for (const p of pids) js = js.split(p).join(p + 'C' + c);
      const x = JSON.parse(js); x.id = e.id + '~' + c; big.push(x);
    }
    window.__big = big; return { events: big.length, jobs: new Set(big.filter(e => e.pid).map(e => e.pid)).size };
  }, gold);
  assert(n.events >= 20000 && n.jobs >= 200, `a big company: ${n.jobs} jobs, ${n.events} records`);

  /* snapshot = full replay */
  const eq = await page.evaluate(() => {
    const strip = st => JSON.stringify(Object.assign({}, st, { byId: Object.keys(st.byId).sort() }));
    const all = sortEvents(JSON.parse(JSON.stringify(window.__big)));
    const full = strip(rebuild(all.slice()));
    const cut = Math.floor(all.length * 0.7), first = all.slice(0, cut), st0 = rebuild(first), sn = makeSnap(first, st0);
    const fast = fromSnap(all, sn);
    const r = { same: !!fast && strip(fast) === full, rej: fast ? fast.rejected.length : -1, byIdLinked: !!fast && Object.values(fast.byId).every(e => all.includes(e)) };
    /* refusals */
    r.otherApp = fromSnap(all, Object.assign({}, sn, { fp: 'other' })) === null;
    const ins = all.slice(); ins.splice(10, 0, Object.assign(JSON.parse(JSON.stringify(all[10])), { id: 'INSERTED' }));
    r.inserted = fromSnap(ins, sn) === null;
    r.undo = fromSnap(all.concat([{ id: 'U1', n: 1, t: '2099-01-01T00:00:00.000Z', by: 'PADMIN', type: 'UNDONE', pid: null, data: { target: all[cut + 5].id }, dev: 'x', v: 1 }]), sn) === null;
    r.noUndoSnap = (() => { const st = rebuild(first); st.undone = { x: 1 }; return makeSnap(first, st) === null; })();
    return r;
  });
  assert(eq.same, 'the state rebuilt from a snapshot is exactly the full replay (' + eq.rej + ' records refused in both)');
  assert(eq.byIdLinked, 'records in the restored state are the same objects as the saved records');
  assert(eq.otherApp && eq.inserted && eq.undo && eq.noUndoSnap, 'a snapshot is not trusted after an app update, when an older record arrives by sync, or after an undo');

  /* the real start path */
  const start = await page.evaluate(async () => {
    EVENTS = JSON.parse(JSON.stringify(window.__big)); S = rebuild(EVENTS); await saveAll(); await snapSave(true);
    const full = JSON.stringify(Object.assign({}, S, { byId: Object.keys(S.byId).sort() }));
    await loadMode('practice');
    return { from: App.startedFrom, same: JSON.stringify(Object.assign({}, S, { byId: Object.keys(S.byId).sort() })) === full };
  });
  assert(start.from === 'snapshot' && start.same, 'the app starts from the snapshot and shows the same company');

  /* time budgets on a 4x slower phone */
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const tm = await page.evaluate(async () => {
    const sn = await KV.get(App.ns + 'snap'), ev = sortEvents(JSON.parse(JSON.stringify(window.__big)));
    let t0 = performance.now(); rebuild(ev.slice()); const full = performance.now() - t0;
    t0 = performance.now(); fromSnap(ev, sn); const snap = performance.now() - t0;
    S = rebuild(ev); EVENTS = ev; loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); App.form = {};
    t0 = performance.now(); go('home'); const home = performance.now() - t0;
    return { full: Math.round(full), snap: Math.round(snap), home: Math.round(home) };
  });
  console.log('   timings at 4x slower CPU (ms):', JSON.stringify(tm));
  assert(tm.snap < tm.full * 0.75, `starting from the snapshot is faster than a full replay (${tm.snap} vs ${tm.full} ms)`);
  assert(tm.full < 5000, `full replay of ${n.events} records stays under 5 s (${tm.full} ms) — the safety path`);
  assert(tm.home < 4000, `the office home with ${n.jobs} jobs opens under 4 s (${tm.home} ms)`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  /* something on screen before the big script has run */
  const p2 = await ctx.newPage(), c2 = await ctx.newCDPSession(p2);
  await c2.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p2.goto('file://' + path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html'), { waitUntil: 'commit' });
  const fcp = await p2.evaluate(() => new Promise(r => { const f = () => { const e = performance.getEntriesByName('first-contentful-paint')[0]; if (e) r(Math.round(e.startTime)); else setTimeout(f, 50); }; f(); }));
  assert(fcp < 2500, `first paint (the loading screen) comes within 2.5 s on a slow phone (${fcp} ms)`);
  await p2.close();
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SNAPSHOT AND SPEED PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
