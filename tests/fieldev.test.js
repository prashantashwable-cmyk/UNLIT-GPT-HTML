/* Field evidence (OCT file): the photo stamp carries the site address; one camera session can take several photos; the
   daily safety check adds a front-camera selfie (required from now on, old checks stay valid). */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);

  /* address on the stamp */
  const st = await page.evaluate(() => { loginAs(S.users.PSENIOR); App.route = { name: 'project', p: { pid: 'AIEC-P003' } }; return stampLines({ t: nowISO(), gps: { lat: 18.5, lng: 73.8, acc: 5 }, dev: 'Android 14' }); });
  const addr = await ev('S.projects["AIEC-P003"].site.address');
  assert(st.length === 4 && st[3].includes(addr.slice(0, 20)), 'the photo stamp has time, GPS, person, job, device and the site address: ' + st[3]);

  /* safety selfie */
  const H = 'AIEC-P003', T = 'PSENIOR';
  await act('SITE_CHECKED_IN', H, { day: await ev('safeDay()'), gps: await ev(`S.projects["${H}"].site.gps`) }, T);
  const four = await ev(`SAFETY_ITEMS.filter(([k]) => k !== 'selfie').map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  await page.evaluate(H => { const P = S.projects[H]; if (P.safety) delete P.safety[safeDay()]; }, H);
  assert((await act('SAFETY_CHECKED', H, { ev: four }, T)).err === 'err_safety_photos', 'today the safety check needs the selfie too');
  const sf = await ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_selfie', t: nowISO(), gps: null, hash: 'hs', dev: 'practice', q: {} }]`);
  assert((await act('SAFETY_CHECKED', H, { ev: four.concat(sf) }, T)).ok, 'with the selfie it is accepted');
  assert(await ev('safetyNeeded("2026-10-15T10:00:00.000Z").length === 4'), 'checks made before the selfie was added stay valid with four photos');

  /* the wizard: selfie slot uses the front camera; several photos in one camera session */
  await page.evaluate(async H => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); await wiz('safety', H); }, H); await page.waitForTimeout(300);
  assert(await page.$('[data-a="cam"][data-k="s_selfie"][data-front="1"]'), 'the selfie slot opens the front camera');
  await page.click('[data-a="cam"][data-k="s_scaffold"]'); await page.waitForTimeout(1500);
  const shutter = await page.$('#ov [data-x="shot"]');
  if (shutter) {
    await page.click('#ov [data-x="shot"]'); await page.waitForTimeout(800);
    assert(await page.$('#ov [data-x="more"]'), 'after a photo the camera offers "use and take another"');
    await page.click('#ov [data-x="more"]'); await page.waitForTimeout(2500);
    await page.click('#ov [data-x="shot"]'); await page.waitForTimeout(800);
    await page.click('#ov [data-x="use"]'); await page.waitForTimeout(1500);
    const n = await ev('W.ctx.s_scaffold.length');
    assert(n === 2, 'two photos were taken in one camera session: ' + n);
    const lbl = await ev('W.ctx.s_scaffold.every(e => e.stamp && e.hash && e.m)');
    assert(lbl, 'each one is stamped and fingerprinted');
  } else console.log('note - no fake camera in this browser; multi-photo checked by unit only');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; render(); }, lang); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('FIELD EVIDENCE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
