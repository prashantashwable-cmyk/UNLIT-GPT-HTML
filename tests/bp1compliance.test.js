/* Blueprint B1 — Maharashtra Lifts Act 2026 records: third-party insurance in the lift's register (with renewal
   reminders), an accident or entrapment must be reported to the Lift Inspector and police within 24 hours before
   the incident can be closed, a printable digital log book per lift, and the Act note on the register. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const P = await ev(`Object.values(S.projects).find(P => P.stage === 'amc').id`);
  /* insurance */
  assert((await act('STATUTORY_SET', P, { item: 'insurance', insurer: 'New India Assurance', no: '', expiry: '2027-10-01' }, 'PADMIN')).err === 'err_fill', 'insurance needs a policy number');
  assert((await act('STATUTORY_SET', P, { item: 'insurance', insurer: 'New India Assurance', no: 'POL-1', expiry: '2026-01-01' }, 'PADMIN')).err === 'err_fill', 'an insurance already ended is refused');
  const soon = await ev(`addDays(20)`);
  assert((await act('STATUTORY_SET', P, { item: 'insurance', insurer: 'New India Assurance', no: 'POL-778', cover: '₹10 lakh', expiry: soon }, 'PADMIN')).ok, 'third-party insurance is recorded');
  assert(await ev(`needs(S.projects['${P}']).some(n => n.k === 'insurance_due')`), 'insurance ending within the warning days gives a renewal task');
  await page.evaluate(p => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: p, tab: 'info' }); }, P); await page.waitForTimeout(300);
  const reg = await page.textContent('main');
  assert(/Third-party insurance/.test(reg) && /POL-778/.test(reg) && /Working licence/.test(reg), 'the register shows insurance and the working licence');
  assert(/in force from 1 Nov 2026/.test(reg) && /lawyer/.test(reg), 'it says which Act applies and that a lawyer must confirm');
  /* accident: 24 hours */
  assert((await act('INCIDENT_RAISED', P, { iid: 'x', type: 'entrapment', note: 'Two people stuck 40 minutes, one fainted' }, 'PADMIN')).ok, 'an entrapment is recorded');
  const iid = await ev(`S.projects['${P}'].incidents.slice(-1)[0].id`);
  const tk = await ev(`needs(S.projects['${P}']).find(n => n.k === 'report_accident')`);
  assert(tk && tk.urgent && tk.iid === iid, 'it starts an urgent "report to Inspector and police (24 hours)" task');
  assert((await act('INCIDENT_RESOLVED', P, { iid, note: 'ok', cause: 'door lock', fix: 'replaced', ev: [{ id: 'E1', m: 'x', kind: 'photo', label: 'work', t: new Date().toISOString(), gps: null, hash: 'h1', dev: 'p', q: {} }] }, 'PADMIN')).err === 'err_report_first', 'it cannot be closed before it is reported');
  assert(await ev(`(() => { const e = validate(S, { id: 'old1', n: 1, t: nowISO(), by: 'PADMIN', type: 'INCIDENT_RESOLVED', pid: '${P}', data: { iid: '${iid}', note: 'ok', cause: 'door lock', fix: 'replaced', ev: [{ id: 'E0', m: 'x', kind: 'photo', label: 'work', t: nowISO(), gps: null, hash: 'h0', dev: 'p', q: {} }] }, dev: 'old', v: 1 }); return e && (e.k || e); })()`) === null, 'a closing recorded by an older version of the app stays valid: the new rule never rewrites history');
  assert((await act('INCIDENT_REPORTED', P, { iid, inspector: '', police: 'Kothrud PS', at: '2026-11-11T10:00' }, 'PADMIN')).err === 'err_fill', 'the report needs both the Inspector and the police');
  assert((await act('INCIDENT_REPORTED', P, { iid, inspector: 'Electrical Inspector Pune, ref EI/88', police: 'Kothrud PS, NC 12/26', at: '2026-11-11T10:00' }, 'PADMIN')).ok, 'the report is recorded');
  assert(!(await ev(`needs(S.projects['${P}']).some(n => n.k === 'report_accident')`)), 'the 24-hour task goes');
  assert((await act('INCIDENT_RESOLVED', P, { iid, note: 'Lift checked and approved', cause: 'door lock', fix: 'replaced lock', ev: [{ id: 'E2', m: 'x', kind: 'photo', label: 'work', t: new Date().toISOString(), gps: null, hash: 'h2', dev: 'p', q: {} }] }, 'PADMIN')).ok, 'after the report, root cause and fix close it');
  /* log book */
  await page.evaluate(p => go('logbook', { uid: p }), P); await page.waitForTimeout(250);
  const lb = await page.innerText('main');
  assert(/Lift log book/.test(lb) && /Third-party insurance/.test(lb) && /stuck in the lift/.test(lb) && /Reported to Inspector and police/.test(lb) && /Incident closed/.test(lb), 'the log book lists insurance, the incident, the report and the closing in date order');
  assert(!!(await page.$('[data-a="print"]')), 'the log book can be printed');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP1 COMPLIANCE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
