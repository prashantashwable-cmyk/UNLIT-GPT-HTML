/* Builder and society (role-wise specs): one site with many lifts (site → tower → lift), each lift its own job, the
   slowest lift shown for the site; a society committee votes on quotation versions, the cost per flat is shown, a
   committee sheet and a residents' notice are printed; builders can keep a retention paid after handover; the
   customer confirms the cabin finish in two taps. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);

  /* many lifts at one site */
  const B = await ev(`Object.values(S.projects).find(P => P.stage === 'new').id`);
  assert((await act('LEAD_CREATED', 'AIEC-TST-1', { copyOf: B, name: 'X', phone: '9822012345' }, 'PFIELD')).err === 'err_access', 'only the office copies a lift to the same site');
  await page.evaluate(async B => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); await wiz('copyLift', B); W.ctx.name = 'Green Park'; W.ctx.tower0 = 'Tower A'; W.ctx.tower = 'Tower B'; render(); }, B); await page.waitForTimeout(200);
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  const g = await ev(`S.projects["${B}"].group && S.projects["${B}"].group.gid`);
  const lifts = await ev(`groupLifts("${g}").map(P => P.id + ':' + P.group.tower + ':' + (P.copyOf || ''))`);
  assert(g && lifts.length === 2 && lifts.some(x => x.endsWith(':Tower B:' + B)), 'a second lift is added to the same site as its own job: ' + lifts.join(', '));
  assert(await ev(`(N => N.site.address === S.projects["${B}"].site.address && N.contact.phone === S.projects["${B}"].contact.phone && N.stage === 'new')(S.projects[groupLifts("${g}").find(P => P.id !== "${B}").id])`), 'it copies the site and contact, without new photos');
  await page.evaluate(g => { loginAs(S.users.PADMIN); go('group', { gid: g }); }, g); await page.waitForTimeout(250);
  let txt = await page.innerText('#app');
  assert(/Green Park/.test(txt) && /Tower A/.test(txt) && /Tower B/.test(txt) && /slowest/.test(txt), 'the site page shows the lifts tower by tower and the slowest one');

  /* society */
  const Q = await ev(`(P => { const q = lastQuote(P); if (!q.sent) q.sent = { t: nowISO(), by: 'PSALES' }; return P.id; })(Object.values(S.projects).find(P => P.quotes.length && stageIdx(P.stage) < stageIdx('signed') && P.stage !== 'lost'))`);
  assert((await act('SOC_SET', Q, { members: ['Mr. Patil (Chairman)', 'Mrs. Kale (Secretary)', 'Mr. Rao'], quorum: 2, flats: 5, free: 5 }, 'PSALES')).err === 'err_flats', 'flats that pay nothing must be fewer than all flats');
  assert((await act('SOC_SET', Q, { members: ['Mr. Patil (Chairman)', 'Mrs. Kale (Secretary)', 'Mr. Rao'], quorum: 2, flats: 40, free: 4 }, 'PSALES')).ok, 'the committee, quorum and flats are set');
  const v = await ev(`lastQuote(S.projects["${Q}"]).v`), total = await ev(`lastQuote(S.projects["${Q}"]).total`);
  assert((await act('SOC_VOTED', Q, { name: 'Somebody', v }, 'PSALES')).err === 'err_choose', 'only committee members vote');
  assert((await act('SOC_VOTED', Q, { name: 'Mr. Patil (Chairman)', v }, 'PSALES')).ok && (await act('SOC_VOTED', Q, { name: 'Mr. Rao', v: 'none', note: 'Too costly' }, 'PSALES')).ok, 'members vote for a quotation or "none"');
  assert(await ev(`(x => x[${v}] === 1 && x.none === 1)(socVotes(S.projects["${Q}"]))`) && await ev(`perFlat(S.projects["${Q}"], ${total}) === Math.round(${total} / 36)`), 'votes are counted and the cost per flat leaves out the flats that pay nothing');
  await page.evaluate(Q => { loginAs(S.users.PADMIN); go('doc', { pid: Q, kind: 'committee' }); }, Q); await page.waitForTimeout(250);
  txt = await page.innerText('main');
  assert(/Options and votes/.test(txt) && /Per flat/.test(txt) && /Payment schedule|payment/i.test(txt), 'the committee sheet shows options, votes, cost per flat and payments');
  await page.evaluate(Q => go('doc', { pid: Q, kind: 'notice' }), Q); await page.waitForTimeout(250);
  txt = await page.innerText('main');
  assert(/NOTICE/.test(txt) && /will be closed from/.test(txt) && /use the stairs/.test(txt), 'a residents\' notice is ready to print');

  /* retention */
  const sch = await ev(`paySchedule(Object.assign({}, S.config, { retentionPct: 5, retentionDays: 90, cabinPct: 0 }), 1000000)`);
  assert(sch.retention === 50000 && sch.retDays === 90 && sch.token + sch.arrival + sch.final + sch.retention === 1000000, 'a 5% retention is kept out of the final payment: ' + JSON.stringify(sch));
  assert((await act('CONFIG_SET', null, { key: 'retentionPct', value: 25 }, 'POWNER')).err === 'err_cfg_range', 'retention is at most 20%');
  const A = await ev(`Object.values(S.projects).find(P => P.stage === 'amc').id`);
  await page.evaluate(A => { const P = S.projects[A]; P.schedule.retention = 25000; P.schedule.retDays = 90; P.done.t = new Date(Date.now() - 30 * 864e5).toISOString(); }, A);
  assert((await act('PAYMENT_RECORDED', A, { purpose: 'retention', amount: 25000, method: 'bank', ref: 'UTR1', payId: 'PAY-RT1' }, 'PSALES')).err === 'err_ret_not_yet', 'the retention cannot be collected before its date');
  await page.evaluate(A => { S.projects[A].done.t = new Date(Date.now() - 100 * 864e5).toISOString(); }, A);
  assert(await ev(`needs(S.projects["${A}"]).some(n => n.k === 'record_payment' && n.purpose === 'retention')`), 'when it is due, Sales is asked to collect it');

  /* cabin finish */
  const F = await ev(`(P => { P.t = nowISO(); return P.id; })(Object.values(S.projects).find(P => P.req && P.req.finish && ['won', 'agreement', 'signed', 'site_prep', 'site_ok'].includes(P.stage)))`);
  assert(await ev(`needs(S.projects["${F}"]).some(n => n.k === 'approve_finish')`), 'the customer (or Sales for them) is asked to confirm the cabin finish');
  assert((await act('FINISH_APPROVED', F, { ok: false }, 'PSALES')).err === 'err_reason', '"change it" needs what to change');
  assert((await act('FINISH_APPROVED', F, { ok: false, note: 'Gold, not steel' }, 'PSALES')).ok && await ev(`needs(S.projects["${F}"]).some(n => n.k === 'finish_change')`), 'a change request goes to Sales');
  assert((await act('FINISH_APPROVED', F, { ok: true }, 'PSALES')).ok && !(await ev(`needs(S.projects["${F}"]).some(n => ['approve_finish', 'finish_change'].includes(n.k))`)), 'once confirmed, the task goes');

  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, Q, g]) => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('doc', { pid: Q, kind: 'committee' }); go('group', { gid: g }); }, [lang, Q, g]); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BUILDER PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
