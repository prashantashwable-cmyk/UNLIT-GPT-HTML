/* Customer trust: the quote prints what it assumes and what civil work usually costs, the agreement shows the cancellation
   charges before signing, a variation shows the agreed and the new price side by side, the warranty card with a claim
   button, all papers in one file, and a late job tells the customer why and with whom before they ask. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const doc = async (as, pid, kind) => { await page.evaluate(([as, pid, kind]) => { loginAs(S.users[as]); ACT.permsDone(); Notify.hide(); go('doc', { pid, kind }); }, [as, pid, kind]); await page.waitForTimeout(250); return page.innerText('main'); };

  /* quote: assumptions and civil work */
  const Q = await ev('Object.values(S.projects).find(P => P.quotes.length && !(P.qcSite || []).some(x => x.meas)).id');
  const qt = await doc('PADMIN', Q, 'quote');
  assert(/Assumed until the site check/.test(qt) && /Shaft and pit of standard size|shaft is not ready/i.test(qt), 'the quote says what it assumes until the site check');
  assert(/Civil work is not in this price\. It usually costs ₹\s?60,000 to ₹\s?1,50,000/.test(qt), 'the quote shows the usual civil-work cost instead of only "not included"');

  /* agreement: cancellation charges */
  const A = await ev('Object.values(S.projects).find(P => P.agreement).id');
  assert((await act('CONFIG_SET', null, { key: 'cancelBefore', value: 10 }, 'POWNER')).ok && (await act('CONFIG_SET', null, { key: 'cancelAfter', value: 40 }, 'POWNER')).ok, 'the owner sets what is kept on cancelling');
  const ag = await doc('PADMIN', A, 'agreement');
  assert(/before the material is ordered, 10% of what you paid is kept/.test(ag) && /After the material is ordered, 40%/.test(ag), 'the agreement shows the cancellation charges before signing');

  /* variation: agreed vs new */
  const vc = await ev(`(P => { const keep = P.variation; P.variation = { status: 'proposed', amount: 25000, note: 'Pit deeper', low: [], meas: {} }; loginAs(S.users.PADMIN); const h = varCard(P); P.variation = keep; return h; })(S.projects["${A}"])`);
  assert(/Agreed price ₹[\d,]+ → new price ₹[\d,]+ \(\+\d+(\.\d)?%\)/.test(vc.replace(/<[^>]+>/g, '')), 'a variation shows the agreed and the new price side by side');

  /* warranty card and claim */
  const D = 'AIEC-P001', cust = await ev(`S.projects["${D}"].customer || ""`);
  assert(await ev(`inWarranty(S.projects["${D}"]) && !inWarranty(S.projects["AIEC-P002"])`), 'a handed-over lift is under warranty; one not yet handed over is not');
  const wc = await doc('PADMIN', D, 'warranty');
  assert(/Warranty card/.test(wc) && /days of warranty left/.test(wc) && /Covered/.test(wc) && /Not covered/.test(wc) && /Who to call/.test(wc) && /Serial numbers \(for claims\)/.test(wc), 'the warranty card: dates, days left, covered, not covered, who to call, serials');
  assert((await act('TICKET_OPENED', 'AIEC-P002', { tid: 'T-W1', kind: 'warranty', sev: 'routine', src: 'call', text: 'Door noisy' }, 'PADMIN')).err === 'err_warranty_over', 'no warranty claim before handover');
  assert((await act('TICKET_OPENED', D, { tid: 'T-W2', kind: 'warranty', sev: 'routine', src: 'call', text: 'Door operator failed' }, 'PADMIN')).ok, 'a warranty claim becomes a ticket with its time limit');
  if (cust) {
    await page.evaluate(c => { loginAs(S.users[c]); ACT.permsDone(); Notify.hide(); go('home'); }, cust); await page.waitForTimeout(300);
    const h = await page.innerText('main');
    assert(/days of warranty left/.test(h) && /Raise a warranty claim/.test(h), 'the customer\'s home shows the warranty and a claim button');
    await page.click('[data-a="wizOpen"][data-v$="|kind|warranty"]'); await page.waitForTimeout(300);
    assert(await ev('W && W.ctx.kind === "warranty"'), 'the claim button opens the ticket with "warranty claim" already chosen');
  }
  const bd = await doc('PADMIN', D, 'bundle');
  assert(/Handover/i.test(bd) && /Warranty card/.test(bd) && /Government papers/.test(bd) && /Service history/.test(bd) && /stay in the app after the job is closed/.test(bd), 'all papers in one printable file, kept after the job closes');
  assert(await ev(`(loginAs(S.users.PSALES), projDocs(S.projects["${D}"]).includes('doc_bundle') === false && !/data-v="bundle"/.test(projDocs(S.projects["${D}"])))`), 'the full bundle (with the certificate) is not shown to roles that cannot see the certificate');

  /* a late job explains itself to the customer */
  const L = await ev('Object.values(S.projects).find(P => P.stage === "installing" && P.mhand).id');
  const lc = await ev(`(P => { const keep = P.mhand.t, bl = P.blockers; P.blockers = []; P.mhand.t = new Date(Date.now() - (S.config.installDays + 6) * 864e5).toISOString(); loginAs(S.users.PADMIN); const h = lateCard(P); P.mhand.t = keep; P.blockers = bl; return h.replace(/<[^>]+>/g, ' '); })(S.projects["${L}"])`);
  assert(/Running \d+ days late/.test(lc) && /Now waiting for:/.test(lc) && /(office has been told|This step is with you)/.test(lc), 'a job running late says by how much, what it waits for and with whom: ' + lc.trim().slice(0, 120));
  assert(await ev(`(P => custPause(P) ? lateCard(P) === "" : true)(S.projects["${L}"])`), 'a job paused for a blocker shows the pause, not "late"');
  assert(await ev(`lateCard(S.projects["AIEC-P001"]) === ""`), 'a finished job shows nothing');

  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, D]) => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('doc', { pid: D, kind: 'bundle' }); }, [lang, D]); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('CUSTOMER TRUST PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
