/* Measure before price (v4 journey): builder / society / commercial jobs cannot be quoted until the shaft is measured
   at bottom, middle and top, with pit, overhead, wall type, five fixed photos and the customer's signature; the
   smallest reading is the clear size; a low pit or overhead adds the special-design line; brick walls add anchors;
   the quotation says it was measured; a homeowner job is quoted as before. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = labels => ev(`${JSON.stringify(labels)}.map(l => ({ id: 'E' + rid(10), m: 'x', kind: l === 'sign' ? 'sign' : 'photo', label: l, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const newLead = async role => { const pid = await ev('newPid()');
    const r = await act('LEAD_CREATED', pid, { safe: true, ev: await ph(['site', 'site']), address: 'Hinjewadi, Pune', name: 'Kumar Builders', phone: '9822088801', shaft: 'yes', floors: 7, contactRole: role }, 'PFIELD');
    await act('LEAD_ACCEPTED', pid, {}, 'PSALES'); await act('CONTACT_LOGGED', pid, { channel: 'call', outcome: 'interested', note: '' }, 'PSALES');
    await act('REQ_SAVED', pid, { req: { use: 'apartment', stops: 7, capacity: '8', type: 'auto', finish: 'ss', shaft: 'yes', power: 'yes', timeline: '3m' } }, 'PSALES');
    return r.ok ? pid : null; };

  const B = await newLead('builder');
  assert(B && await ev(`bigJob(S.projects["${B}"])`), 'a builder lead is a "big job"');
  assert((await act('QUOTE_CREATED', B, { discountPct: 0 }, 'PSALES')).err === 'err_survey_first', 'it cannot be quoted before the shaft is measured');
  assert(await ev(`needs(S.projects["${B}"]).some(n => n.k === 'pre_survey')`), 'Sales gets "measure the shaft before the quotation"');
  const levels = { bottom: { w: 1820, d: 1910 }, middle: { w: 1800, d: 1900 }, top: { w: 1790, d: 1905 } };
  const photos = await ph(['sv_pit', 'sv_head', 'sv_landing', 'sv_power', 'sv_store']);
  assert((await act('SURVEY_DONE', B, { levels: { bottom: levels.bottom }, pit: 1500, head: 4200, wall: 'rcc', ev: photos.concat(await ph(['sign'])), signer: 'Mr. Kumar' }, 'PSALES')).err === 'err_sv_levels', 'width and depth are needed at bottom, middle and top');
  assert((await act('SURVEY_DONE', B, { levels, pit: 1500, head: 4200, wall: 'rcc', ev: photos.slice(0, 4).concat(await ph(['sign'])), signer: 'Mr. Kumar' }, 'PSALES')).err === 'err_sv_photos', 'all five fixed photos are needed');
  assert((await act('SURVEY_DONE', B, { levels, pit: 1500, head: 4200, wall: 'rcc', ev: photos }, 'PSALES')).err === 'err_reason', 'without the customer\'s signature, a reason is needed');
  assert((await act('SURVEY_DONE', B, { levels, pit: 1300, head: 4200, wall: 'brick', ev: photos.concat(await ph(['sign'])), signer: 'Mr. Kumar' }, 'PSALES')).ok, 'the measured shaft is saved with the customer\'s signature');
  const sv = await ev(`S.projects["${B}"].survey`);
  assert(sv.w === 1790 && sv.d === 1900 && sv.plumb === 30, 'the clear size is the smallest reading and the out-of-plumb is the spread: ' + sv.w + '×' + sv.d + ', ' + sv.plumb + ' mm');
  assert(await ev(`S.projects["${B}"].req.special && S.projects["${B}"].materials.some(m => m.k === 'm_anchors')`), 'a 1300 mm pit marks a special design; brick walls add chemical anchors');
  assert((await act('CONFIG_SET', null, { key: 'costSpecial', value: 90000 }, 'POWNER')).ok, 'the Owner sets the special-design cost');
  assert((await act('QUOTE_CREATED', B, { discountPct: 0 }, 'PSALES')).ok && await ev(`lastQuote(S.projects["${B}"]).lines.some(l => l[0] === 'ql_special')`), 'now it can be quoted, with the special-design line');
  assert(/Measured on site/.test(await ev(`docQuote(S.projects["${B}"])`)), 'the quotation says the shaft was measured, not assumed');

  const H = await newLead('owner');
  assert(!(await ev(`bigJob(S.projects["${H}"])`)) && (await act('QUOTE_CREATED', H, { discountPct: 0 }, 'PSALES')).ok, 'a homeowner job is still quoted on assumptions');

  await page.evaluate(B => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); go('project', { pid: B, tab: 'info' }); }, B); await page.waitForTimeout(250);
  assert(/Shaft measured before price/.test(await page.innerText('main')) && /Out of plumb/.test(await page.innerText('main')), 'the job shows the measured shaft');
  await page.evaluate(async B => { await wiz('survey', B); }, B); await page.waitForTimeout(200);
  assert(/Bottom \(pit level\)/.test(await page.innerText('#app')), 'the measuring screen asks for three heights');
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, B]) => { LANG = l; App.set.lang = l; W = null; go('project', { pid: B, tab: 'info' }); }, [lang, B]); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY A PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
