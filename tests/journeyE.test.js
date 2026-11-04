/* Measured installation steps (v4 journey): rails need the gauge at every bracket level within the set tolerance;
   the counterweight a balance % inside the set band; wiring the earthing resistance below the set limit; the final
   test the ARD battery and every limit switch and the overload sensor. Out-of-limit numbers stop the step. Older jobs
   are unchanged. QC sees the numbers at the final inspection. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const J = await ev(`Object.values(S.projects).find(P => P.stage === 'installing').id`);
  const why = (step, rd) => page.evaluate(([J, step, rd]) => { const w = readWhyNot(S.projects[J], step, rd, nowISO()); return w && (w.k || w); }, [J, step, rd]);
  assert(await why(3, { nominal: 1600, levels: [1600, 1600, 1600, 1600] }) === null, 'an older job does not ask for numbers');
  await page.evaluate(J => { S.projects[J].t = nowISO(); }, J);
  const st = await ev(`Math.max(2, +S.projects["${J}"].req.stops || 2)`);
  assert(await why(3, { nominal: 1600, levels: [1600] }) === 'err_read_dbg', 'the rail gauge is needed at every bracket level (' + st + ')');
  assert(await why(3, { nominal: 1600, levels: Array(st).fill(1600).map((x, i) => i === 1 ? 1601.6 : x) }) === 'err_dbg_tol', 'a level more than ±1 mm from the drawing stops the step');
  assert(await why(3, { nominal: 1600, levels: Array(st).fill(1600.4) }) === null, 'within ±1 mm it passes');
  assert(await why(6, { balance: 55 }) === 'err_bal' && await why(6, { balance: 47 }) === null, 'counterweight balance must be 45–50%');
  assert(await why(9, { ohm: 3.2 }) === 'err_earth' && await why(9, { ohm: 0.9 }) === null, 'earthing above the limit stops the wiring step');
  assert(await why(11, { ard: 24, sw: { final: 'yes', terminal: 'yes', slowdown: 'no', overload: 'yes' } }) === 'err_limit_sw', 'every limit switch and the overload sensor must work');
  assert((await page.evaluate(() => perform('CONFIG_SET', null, { key: 'dbgTol', value: 2 }, { as: 'POWNER', quiet: true }).then(r => r.ok))) && await why(3, { nominal: 1600, levels: Array(st).fill(1600).map((x, i) => i === 1 ? 1601.6 : x) }) === null, 'the engineer can set the rail tolerance (±2 mm)');
  /* the wizard shows the reading step, and QC sees the numbers */
  await page.evaluate(J => { const P = S.projects[J]; P.sop[3] = Object.assign({}, P.sop[3] || { t: nowISO(), by: P.tech, ev: [] }, { read: { nominal: 1600, levels: [1600.2, 1600.4] } }); loginAs(S.users.PQC); }, J);
  await page.evaluate(async J => { const P = S.projects[J]; P.stage = 'qc_final'; await wiz('qcfinal', J); }, J); await page.waitForTimeout(200);
  assert(/1600\.2 \/ 1600\.4 mm/.test(await page.innerText('#app')), 'the final inspection lists the measured numbers');
  await page.evaluate(async J => { W = null; const P = S.projects[J]; P.stage = 'installing'; loginAs(S.users[P.tech]); await wiz('sopstep', J, { step: 6 }); W.ctx.ph = [{ id: 'x' }]; W.sid = 'read'; render(); }, J); await page.waitForTimeout(200);
  assert(/Counterweight balance/.test(await page.innerText('#app')), 'the step asks for the numbers');
  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; render(); }, lang); await page.waitForTimeout(150); }
  await page.evaluate(() => { W = null; go('home'); });
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY E PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
