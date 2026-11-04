/* Site damage (v4 journey): the crew reports damage or loss with a photo; the office decides who caused it; a builder
   charge gives a charge note (not a tax invoice) and pauses installation until it is paid (or the Owner waives it);
   a crew charge is a pay deduction the person can question; the agreement now says so. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'damage', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]`);
  const J = await ev(`Object.values(S.projects).find(P => P.stage === 'installing').id`), T = await ev(`S.projects["${J}"].tech`);
  const sopCheck = () => ev(`(e => e && (e.k || e))(validate(S, { id: 'x', t: nowISO(), by: "${T}", type: 'SOP_STEP_DONE', pid: "${J}", data: { step: sopNext(S.projects["${J}"]) }, dev: 'x' }))`);
  const before = await sopCheck();
  assert((await act('DAMAGE_REPORTED', J, { did: 'D-AAA1', item: 'Landing doors', note: 'Floor 2 sill bent by tile mason', ev: [] }, T)).err === 'err_photos', 'a damage report needs a photo');
  assert((await act('DAMAGE_REPORTED', J, { did: 'D-AAA1', item: 'Landing doors', note: 'Floor 2 sill bent by tile mason', ev: await ph() }, T)).ok, 'the technician reports damage on site');
  assert(await ev(`needs(S.projects["${J}"]).some(n => n.k === 'decide_damage' && n.urgent)`), 'the office must decide who caused it');
  assert((await act('DAMAGE_DECIDED', J, { did: 'D-AAA1', who: 'builder', note: 'Mason confirmed' }, 'PADMIN')).err === 'err_amount', 'a builder charge needs the amount');
  assert((await act('DAMAGE_DECIDED', J, { did: 'D-AAA1', who: 'builder', amount: 18500, note: 'Mason confirmed' }, 'PADMIN')).ok, 'the office charges the builder');
  assert(await sopCheck() === 'err_charge_due', 'installation pauses while the charge is not paid (before: ' + (before || 'ok') + ')');
  assert(await ev(`needs(S.projects["${J}"]).some(n => n.k === 'charge_due')`), 'Finance is asked to settle it');
  await page.evaluate(J => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('doc', { pid: J, kind: 'charge' }); }, J); await page.waitForTimeout(250);
  assert(/Site damage charge note/.test(await page.innerText('#app')) && /not a tax invoice/.test(await page.innerText('main')), 'a charge note is printed, clearly not a tax invoice');
  const cid = await ev(`S.projects["${J}"].charges[0].id`);
  assert((await act('CHARGE_SETTLED', J, { cid, how: 'waived', note: 'Goodwill' }, 'PADMIN')).err === 'err_role', 'only the Owner can waive a charge');
  assert((await act('CHARGE_SETTLED', J, { cid, how: 'paid' }, 'PADMIN')).err === 'err_ref', 'a payment needs its bank reference');
  assert((await act('CHARGE_SETTLED', J, { cid, how: 'paid', ref: 'UTR-77812' }, 'PADMIN')).ok && await sopCheck() !== 'err_charge_due', 'once paid, installation can go on');
  /* crew */
  await act('DAMAGE_REPORTED', J, { did: 'D-AAA2', item: 'Wire ropes set', note: 'Cut while unpacking', ev: await ph() }, T);
  assert((await act('DAMAGE_DECIDED', J, { did: 'D-AAA2', who: 'crew', amount: 2000, uid: 'PCUST', note: 'x' }, 'PADMIN')).err === 'err_pick_person', 'a crew charge must name someone on this job');
  assert((await act('DAMAGE_DECIDED', J, { did: 'D-AAA2', who: 'crew', amount: 2000, uid: T, note: 'Cut with a blade while unpacking' }, 'PADMIN')).ok, 'the office charges the crew member');
  assert(await ev(`earnings("${T}").some(e => e.what === 'earn_damage' && e.amount === -2000)`), 'it appears as a deduction in that person\'s pay, which they can question');
  assert(/in your custody/.test(await ev(`agreeKeyPoints(S.projects["${J}"])`)) || await ev(`!!(S.projects["${J}"].agreement && S.projects["${J}"].agreement.signed && S.projects["${J}"].agreement.signed.t < JOURNEY_FROM)`), 'new agreements say who is responsible for material at site (older signed ones are unchanged)');
  await page.evaluate(J => go('project', { pid: J, tab: 'info' }), J); await page.waitForTimeout(250);
  assert(/Damage or loss on site/.test(await page.innerText('main')), 'the job shows damage reports and decisions');
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, J]) => { LANG = l; App.set.lang = l; go('project', { pid: J, tab: 'info' }); }, [lang, J]); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY D PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
