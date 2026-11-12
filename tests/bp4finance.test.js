/* Blueprint B4 — finance interest, consent only: the enquiry form asks "Need finance?" with its own consent tick
   (separate from the quotation, stored with its text version); a customer can record interest and withdraw it from
   their page; the office keeps a list and records referrals made by hand with the outcome; the app never shows rates,
   EMI or approvals; finance records travel only to the finance role and that customer. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(7000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, data, as) => page.evaluate(([type, data, as]) => perform(type, null, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, data, as]);
  /* public enquiry */
  await page.evaluate(() => { App.me = null; App.form = { rqName: 'Sunita P', rqPhone: '9876500011', rqAddr: 'Wakad, Pune' }; go('enquiry'); }); await page.waitForTimeout(200);
  assert(/Need finance for the lift\?/.test(await page.innerText('main')), 'the enquiry form asks about finance');
  await page.click('[data-a="enqFin"][data-v="yes"]'); await page.waitForTimeout(100);
  assert(/only so they can contact me about a loan/.test(await page.innerText('main')), 'choosing Yes shows a separate consent text');
  await page.click('[data-a="enqMake"]'); await page.waitForTimeout(150);
  assert(await ev(`App.route.name === 'enquiry'`) && /Tick the finance consent/.test(await page.innerText('main')), 'Yes without the tick is not sent');
  await page.click('[data-a="enqFinOk"]'); await page.waitForTimeout(100);
  await page.click('[data-a="enqMake"]'); await page.waitForTimeout(200);
  const msg = await ev(`App.reqOut.msg`), o = await ev(`reqDecode(App.reqOut.msg)`);
  assert(o.fin && o.fin.want === 'yes' && o.fin.ok === true && o.fin.v === 1, 'the request carries the consent and its text version');
  /* office pastes it */
  await page.evaluate(m => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); App.form = { reqText: m, pasteOk: true }; go('paste'); }, msg); await page.waitForTimeout(200);
  await page.click('[data-a="pasteEnq"]'); await page.waitForTimeout(400);
  const fe = await ev(`Object.values(S.finance).find(f => f.eid === '${o.rid}')`);
  assert(fe && fe.name === 'Sunita P' && fe.v === 1 && await ev(`!('fin' in S.enquiries['${o.rid}'])`), 'the finance interest is stored apart from the enquiry, with its consent version');
  /* customer from their page */
  const cp = await ev(`custPid(S.users.PCUST)`);
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); ACT.nav('home'); }); await page.waitForTimeout(300);
  assert(/Finance \(loan\) interest/.test(await page.innerText('main')) && !!(await page.$('[data-v^="finInterest|"]')), 'the customer page offers finance interest');
  assert((await act('FIN_INTEREST', { fid: 'FAAAA1111', pid: cp, want: 'yes', consent: false, v: 1 }, 'PCUST')).err === 'err_fn_consent', 'never without consent');
  const other = await ev(`Object.keys(S.projects).find(id => id !== '${cp}')`);
  assert((await act('FIN_INTEREST', { fid: 'FAAAA2222', pid: other, want: 'yes', consent: true, v: 1 }, 'PCUST')).err === 'err_access', 'a customer only for their own lift');
  const r3 = await act('FIN_INTEREST', { fid: 'FAAAA3333', pid: cp, want: 'unsure', amount: 600000, consent: true, v: 1 }, 'PCUST'); assert(r3.ok, (r3.ok ? '' : JSON.stringify(r3) + ' ') + 'the customer records interest with consent');
  assert((await act('FIN_INTEREST', { fid: 'FAAAA4444', pid: cp, want: 'yes', consent: true, v: 1 }, 'PCUST')).err === 'err_already', 'once per job while active');
  await page.evaluate(() => ACT.nav('home')); await page.waitForTimeout(200);
  assert(/Consent given on/.test(await page.innerText('main')) && !!(await page.$('[data-a="finWithdraw"]')), 'their page shows the consent and a Withdraw button');
  /* office list and referral */
  await page.evaluate(() => { loginAs(S.users.PFIN); ACT.permsDone(); Notify.hide(); go('finList'); }); await page.waitForTimeout(200);
  let txt = await page.innerText('main');
  assert(/does not give loans, rates, EMI or approvals/.test(txt) && /Sunita P/.test(txt) && /₹6,00,000|6,00,000/.test(txt), 'Finance sees the list with the RBI note');
  assert(!/\d+(\.\d+)?\s*%\s*(p\.a|interest)|EMI of|approved for/i.test(txt), 'no rates, EMI amounts or approvals are shown');
  assert(await ev(`S.finance.FAAAA3333.name === S.projects['${cp}'].contact.name && !!S.finance.FAAAA3333.phone`), 'a customer\'s record carries the job\'s contact name and phone');
  assert((await act('FIN_REFERRED', { fid: 'FAAAA3333', bank: '', outcome: 'referred' }, 'PFIN')).err === 'err_fill', 'a referral names the bank');
  assert((await act('FIN_REFERRED', { fid: 'FAAAA3333', bank: 'SBI Wakad branch', outcome: 'referred', note: 'gave papers by hand' }, 'PFIN')).ok, 'Finance records a referral made by hand');
  assert((await act('FIN_REFERRED', { fid: 'FAAAA3333', bank: 'SBI Wakad branch', outcome: 'disbursed' }, 'PSALES')).err, 'Sales cannot record outcomes');
  /* withdraw */
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); ACT.nav('home'); }); await page.waitForTimeout(250);
  await page.click('[data-a="finWithdraw"]'); await page.waitForTimeout(150); await page.click('[data-a="finWithdrawGo"]'); await page.waitForTimeout(300);
  assert(await ev(`!!S.finance.FAAAA3333.withdrawn && S.finance.FAAAA3333.name === '' && S.finance.FAAAA3333.phone === ''`), 'withdrawing removes the name and phone from the finance record');
  assert((await act('FIN_REFERRED', { fid: 'FAAAA3333', bank: 'HDFC', outcome: 'referred' }, 'PFIN')).err === 'err_fn_withdrawn', 'a withdrawn person cannot be referred');
  assert(await ev(`(() => { const S2 = rebuild(EVENTS); return !!S2.finance.FAAAA3333.withdrawn && S2.finance.FAAAA3333.hist.length === 1; })()`), 'all of it survives a rebuild');
  /* the office buttons, tapped (a form that crashes on opening cannot hide behind a rule test) */
  await page.evaluate(() => { loginAs(S.users.PFIN); ACT.permsDone(); Notify.hide(); go('finList'); }); await page.waitForTimeout(250);
  await page.click(`main [data-v="finRefer||fid|${fe.id}"]`); await page.waitForTimeout(350);
  assert(/Bank or finance company/.test(await page.innerText('main')), '"Record referral" opens its form');
  await page.fill('main [data-k="bank"]', 'HDFC Baner'); await page.click('main .tile[data-a="pick"][data-k="outcome"][data-v="referred"]'); await page.waitForTimeout(100); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`S.finance['${fe.id}'].outcome === 'referred' && S.finance['${fe.id}'].bank === 'HDFC Baner'`), 'the referral is saved through the form');
  assert((await act('FIN_INTEREST', { fid: 'FAAAA5555', eid: '${o.rid}'.replace(/^\$.*/, ''), want: 'yes', consent: true, v: 1 }, 'PCUST')).err, 'a customer login cannot attach finance interest to an enquiry');
  await page.evaluate(() => go('finList')); await page.waitForTimeout(250);
  await page.click(`main [data-a="finWithdraw"][data-v="${fe.id}"]`); await page.waitForTimeout(200);
  assert(/asks AIEC to stop sharing/.test(await page.innerText('#ov')), 'the office can withdraw for a person who phones in');
  await page.click('[data-a="finWithdrawGo"]'); await page.waitForTimeout(350);
  assert(await ev(`!!S.finance['${fe.id}'].withdrawn && S.finance['${fe.id}'].name === ''`), 'the withdrawal removes their name and phone');
  /* who receives finance records */
  const packs = await page.evaluate(cp => { App.me = S.users.PADMIN; const f = uid => exportPack('person', uid).events.filter(e => e.type.startsWith('FIN_')).length; return { fin: f('PFIN'), tech: f('PTECH'), sales: f('PSALES'), cust: f('PCUST') }; }, cp);
  assert(packs.fin >= 4 && packs.tech === 0 && packs.cust === 3, 'finance records go to Finance and to that customer only: ' + JSON.stringify(packs));
  /* KPI */
  assert(await ev(`(() => { const g = kpiData(7).find(x => x[0] === 'finance'); return g && g[1][0][1] >= 2 && g[1][1][1] >= 1; })()`), 'the KPI board counts finance interest and referrals');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP4 FINANCE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
