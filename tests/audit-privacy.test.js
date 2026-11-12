/* What each phone receives (the person's file), checked on real second and third phones:
   a rival company's quotation travels without its price and terms; company status reasons and check notes go only to
   the office and that company; the office's capacity note stays in the office; a company that lost stops receiving the
   job at the award; the winning company gets the customer's contact only through the consent record; the customer's
   name on a signed layout is hidden from outside parties; ledger changes reach Finance and the company concerned;
   a field made private later never breaks the signature of an older record. */
const { launch, signGad } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(8000);
  const ev = f => pa.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => pa.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const file = uid => pa.evaluate(uid => { App.me = S.users.PADMIN; return JSON.stringify(exportPack('person', uid)); }, uid);
  const phone = async () => { const L = await launch(); await L.page.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); }); return L; };
  const photos = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'site', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);

  /* a Marketplace job with two quotations */
  const N = await ev(`Object.values(S.projects).find(P => P.stage === 'new').id`), phoneNo = await ev(`S.projects['${N}'].contact.phone`);
  await act('LEAD_ACCEPTED', N, {}, 'PSALES'); await act('MODEL_SET', N, { model: 'market' }, 'PADMIN'); await act('RFQ_SENT', N, { to: ['PPART1', 'PPART2'] }, 'PADMIN');
  const Q = { base: 913377, tax: 162000, freight: 20000, install: 70000, oem: 'RIVALMAKE machine', civil: 'excl', elec: 'incl', excl: 'civil', days: 40, ms: [10, 30, 30, 25, 5], warranty: 12, amc: 18000, valid: 30 };
  assert((await act('PQUOTE_SENT', N, Q, 'PPART1')).ok && (await act('PQUOTE_SENT', N, Object.assign({}, Q, { base: 880000, oem: 'Own make' }), 'PPART2')).ok, '(two companies quote on a Marketplace job)');
  let f2 = await file('PPART2'), rival = JSON.parse(f2).events.find(e => e.type === 'PQUOTE_SENT' && e.by === 'PPART1');
  assert(rival && rival.cut && rival.data.base == null && rival.data.oem == null && !f2.includes('913377') && !f2.includes('RIVALMAKE') && f2.includes('880000'), 'a company\'s file carries the rival quotation without its price, make or terms; its own quotation is complete');
  const B = await phone(), pb = B.page;
  let rb = await pb.evaluate(txt => importText(txt), f2);
  assert(rb.ok && rb.rejected === 0 && await pb.evaluate(n => { const m = S.projects[n].mkt; return m.quotes.PPART1.cut === true && m.quotes.PPART2.base === 880000 && canSee(S.users.PPART2, S.projects[n]); }, N), 'on that company\'s phone the file is accepted in full and the rival quotation is only a marker');
  await pb.evaluate(n => { loginAs(S.users.PPART2); try { ACT.permsDone(); Notify.hide(); } catch (e) { } go('mktCompare', { uid: n }); }, N); await pb.waitForTimeout(300);
  assert(/Own make/.test(await pb.innerText('main')) && !/RIVALMAKE|9,13,377/.test(await pb.innerText('body')), 'its comparison screen shows only its own quotation');

  /* office notes about companies, and the capacity note */
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART1', status: 'CONDITIONAL', reason: 'SECRETREASON extra QC' }, 'PADMIN');
  await act('PARTNER_DD_SET', null, { uid: 'PPART1', item: 'safety', ok: false, note: 'SECRETNOTE no harness' }, 'PADMIN');
  const got = {}; for (const u of ['PCUST', 'PFIELD', 'PQC', 'PTECH', 'PSENIOR', 'PSUP', 'PPART2', 'PPART1', 'PSALES', 'PFIN']) got[u] = /SECRETREASON|SECRETNOTE/.test(await file(u));
  assert(!got.PCUST && !got.PFIELD && !got.PQC && !got.PTECH && !got.PSENIOR && !got.PSUP && !got.PPART2 && got.PPART1 && got.PSALES && got.PFIN, 'a company\'s status reason and check notes go to the office and that company only: ' + JSON.stringify(got));
  const C6 = 'AIEC-P006';
  await act('QC_SITE_RESULT', C6, { meas: { width: 1800, depth: 1900, pit: 1500, head: 4200 }, door: { w: 800, h: 2000 }, floors: Array(59).fill(3000), checks: { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome: 'approved', ev: await photos(2) }, 'PQC');
  if (await ev(`gadNeeded(S.projects['${C6}'])`)) await act('GAD_SIGNED', C6, { ticks: { ffl: true, power: true, pit: true, scaffold: true }, powerBy: await ev('addDays(5)'), consent: true, signer: 'SECRETSIGNER Joshi', ev: await ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`) }, 'PSALES');
  const hadGad = await ev(`!!S.projects['${C6}'].gad`);
  assert((await act('CAPACITY_CHECKED', C6, { note: 'SECRETCAP crew free Monday' }, 'PADMIN')).ok && (await act('USER_ADDED', null, { uid: 'CCUST', name: 'Mr. Joshi', role: 'customer', projectId: C6, salt: 'practice', pin: await ev('S.users.PCUST.pin') }, 'PADMIN')).ok, '(a capacity check is recorded and the job\'s customer gets a login)');
  assert((await act('RELEASED', C6, { supplier: 'PSUP', tech: 'PSENIOR', drawings: 'DWG-1', materials: await ev(`materialList(S.projects['${C6}'].req)`) }, 'PADMIN')).ok, '(the job is released, so the supplier, the lead and their company receive it)');
  const cap = {}; for (const u of ['CCUST', 'PSUP', 'PSENIOR', 'PPART1']) { const t = await file(u); cap[u] = { has: JSON.parse(t).events.some(e => e.pid === C6), cap: t.includes('SECRETCAP'), sign: t.includes('SECRETSIGNER') }; }
  assert(Object.values(cap).every(x => x.has && !x.cap) && (!hadGad || (!cap.PSUP.sign && !cap.PSENIOR.sign && !cap.PPART1.sign)), 'the capacity note and the customer\'s name on the signed layout do not leave the office: ' + JSON.stringify(cap));

  /* award: the loser's phone closes the job and gets nothing more; the winner gets the contact only by consent */
  assert((await act('MK_PICKED', N, { partner: 'PPART1' }, 'PSALES')).ok && (await act('MK_ANSWER', N, { yes: true }, 'PPART1')).ok, '(the job is awarded to the other company)');
  let f1 = await file('PPART1');
  assert(!JSON.stringify(JSON.parse(f1).events.filter(e => e.pid === N)).includes(phoneNo), 'before the consent step the winning company\'s file has no customer phone');
  assert((await act('MK_INTRODUCED', N, { name: 'Mr. Pawar', phone: phoneNo, consent: true }, 'PSALES')).ok && (await act('MK_PAY_RECORDED', N, { payId: 'MPAAAA0001', ms: 0, amount: 116538, utr: 'UTR0001' }, 'PPART1')).ok && (await act('MK_PAY_VERIFIED', N, { payId: 'MPAAAA0001', ok: true }, 'PFIN')).ok && (await act('COMM_STATUS', null, { cid: 'CMPAAAA0001', status: 'INVOICED', ref: 'BILL-9' }, 'PADMIN')).ok, '(contact shared, first payment confirmed, commission billed)');
  f2 = await file('PPART2');
  const later = JSON.parse(f2).events.filter(e => e.pid === N).map(e => e.type);
  assert(later.includes('MK_ANSWER') && !later.some(k => /^MK_(INTRODUCED|PAY)/.test(k)) && !f2.includes(phoneNo) && !f2.includes('BILL-9'), 'the company that lost receives the award and nothing after it: no contact, no payments, no ledger');
  rb = await pb.evaluate(txt => importText(txt), f2);
  assert(rb.ok && rb.rejected === 0 && await pb.evaluate(n => { const P = S.projects[n]; return P.mkt.accepted.by === 'PPART1' && !canSee(S.users.PPART2, P) && !P.mkt.pays.length && !P.mkt.contact && !myTasks(S.users.PPART2).some(x => x.pid === n); }, N), 'on its phone the job closes: awarded to another company, hidden, no task left');
  f1 = await file('PPART1');
  const Cc = await phone(), pc = Cc.page, rc = await pc.evaluate(txt => importText(txt), f1);
  assert(rc.ok && rc.rejected === 0 && await pc.evaluate(([n, ph]) => { const P = S.projects[n]; return P.mkt.contact.phone === ph && P.mkt.quotes.PPART2.cut === true && S.comm.CMPAAAA0001.status === 'INVOICED' && P.contact.phone !== ph; }, [N, phoneNo]), 'the winning company\'s phone has the contact from the consent record, the rival quotation as a marker, and its commission status');
  assert((await file('PFIN')).includes('BILL-9'), 'a ledger change made by Admin reaches a Finance phone');
  await B.browser.close(); await Cc.browser.close(); await A.browser.close();

  /* signatures: a field made private later stays readable in an older signed record, and that record still verifies */
  const R = await launch(), pr = R.page;
  await pr.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; App.set.mode = 'real'; await loadMode('real'); App.form = { org: 'Test Lifts', name: 'Asha Owner', pin1: '123456', pin2: '123456' }; await ACT.createOrg(); });
  await pr.waitForTimeout(500);
  const sg = await pr.evaluate(async () => {
    const me = App.me.uid, pub = (S.keys[me] || []).find(k => k.ok).pub;
    const mk = () => ({ id: App.set.dev + '-' + rid(6), n: 999, t: nowISO(), by: me, type: 'GAD_SIGNED', pid: 'X-1', data: { signer: 'Mr. Old Customer', powerBy: '2026-12-01', consent: true }, dev: App.set.dev, v: EV_V });
    const keep = PRIVATE_V2.GAD_SIGNED; delete PRIVATE_V2.GAD_SIGNED;            /* as the app was before this version */
    const old = await Sign.sign(mk()); PRIVATE_V2.GAD_SIGNED = keep;
    const oldOk = await Sign.verify(old, pub), oldCut = redact(old, ['signer']);
    const fresh = await Sign.sign(mk()), cut = redact(fresh, ['signer']); await finishPack({ events: [cut] });
    return { signed: !!old.sig && !!old.sig.s, oldOk, oldKept: oldCut === old && old.data.signer === 'Mr. Old Customer', freshOk: await Sign.verify(fresh, pub), cutHidden: cut.data.signer == null && !!cut.cut, cutOk: await Sign.verify(cut, pub) };
  });
  assert(sg.signed && sg.oldOk && sg.oldKept, 'a record signed before the name became private still verifies and is left whole (its signature cannot hide the name): ' + JSON.stringify(sg));
  assert(sg.freshOk && sg.cutHidden && sg.cutOk, 'a record signed now hides the name for outside parties and still verifies');
  await R.browser.close(); console.log('AUDIT PRIVACY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
