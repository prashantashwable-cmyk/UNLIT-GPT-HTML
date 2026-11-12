/* One customer sign-off before material (v4 journey): the measured sizes, the lift and the cabin finish, who does
   which work, and four civil promises (floor level within 5 mm, power and earthing by a date, dry pit, scaffolding),
   signed once; material cannot be ordered before it; a printable layout-and-civil-scope sheet. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const sign = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);
  /* (a new job waiting at "site checked": a practice job is put there) */
  const P = await ev(`(P => { P.stage = 'site_ok'; P.t = nowISO(); P.po = null; P.gad = null; return P.id; })(Object.values(S.projects).find(P => P.stage === 'material_order' && lastSiteOk(P)))`);
  assert(await ev(`needs(S.projects["${P}"]).some(n => n.k === 'sign_gad') && !needs(S.projects["${P}"]).some(n => n.k === 'release')`), 'the customer is asked to sign before the office can release material');
  const rel = await act('RELEASED', P, { supplier: 'PSUP', tech: 'PTECH', drawings: 'DWG-X1', materials: await ev(`materialList(S.projects["${P}"].req)`) }, 'PADMIN');
  assert(rel.err === 'err_gad_first', 'material cannot be ordered before the sign-off');
  const base = { ticks: { ffl: true, power: true, pit: true }, powerBy: '2026-12-01', consent: true, signer: 'Mr. Shinde', ev: await sign() };
  assert((await act('GAD_SIGNED', P, base, 'PSALES')).err === 'err_gad_ticks', 'all four promises are needed');
  assert((await act('GAD_SIGNED', P, Object.assign({}, base, { ticks: { ffl: true, power: true, pit: true, scaffold: true }, ev: [] }), 'PSALES')).err === 'err_sign', 'a signature is needed');
  assert((await act('GAD_SIGNED', P, Object.assign({}, base, { ticks: { ffl: true, power: true, pit: true, scaffold: true } }), 'PSALES')).ok, 'signed on Sales\' phone in front of the customer');
  assert(await ev(`(g => g.inPerson && g.powerBy === '2026-12-01' && !!g.meas && S.projects["${P}"].finishOk.ok)(S.projects["${P}"].gad)`), 'the sizes measured, the finish and the promises are kept with the signature');
  assert(await ev(`needs(S.projects["${P}"]).some(n => n.k === 'release')`), 'now the office can release material');
  await page.evaluate(P => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('doc', { pid: P, kind: 'gad' }); }, P); await page.waitForTimeout(250);
  const txt = await page.innerText('main');
  assert(/Sizes measured on site/.test(txt) && /Your work \(civil\)/.test(txt) && /will not change by more than 5 mm/.test(txt) && /Signed by Mr. Shinde/.test(txt), 'the printable sheet shows sizes, who does what, the promises and the signature');
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, P]) => { LANG = l; App.set.lang = l; go('doc', { pid: P, kind: 'gad' }); }, [lang, P]); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY C PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
