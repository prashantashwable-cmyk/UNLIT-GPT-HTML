/* Bank statement match: Finance loads a bank CSV; lines are matched to pending customer payments by the UTR in the narration,
   else by the same amount within 3 days. Nothing is confirmed until a person presses Confirm. */
const { launch, miss } = require('./lib');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);

  /* two pending payments: P007's token (UPI ref) and P004's arrival payment (cheque, its number not in the bank text) */
  const tok = await ev(`S.projects["AIEC-P007"].payments.find(p => p.status === "pending")`);
  const amt = await ev(`S.projects["AIEC-P004"].schedule.arrival`);
  assert((await act('PAYMENT_RECORDED', 'AIEC-P004', { payId: 'PAY-R1', purpose: 'arrival', amount: amt, method: 'cheque', ref: '004512' }, 'PSALES')).ok, 'an arrival payment is waiting');
  const d1 = tok.t.slice(0, 10), d2 = await ev(`S.projects["AIEC-P004"].payments.find(p => p.id === "PAY-R1").t.slice(0, 10)`);
  const dmy = d => d.split('-').reverse().join('/');
  const csv = ['HDFC BANK LTD,,,,', 'Statement of account,,,,', 'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    `${dmy(d1)},"UPI/${tok.ref}/SHARMA, RAHUL",${tok.ref},,"${tok.amount.toLocaleString('en-IN')}.00",1000000`,
    `${dmy(d2)},CLG CHQ DEPOSIT HDFC0001234,000000,,${amt}.00,2000000`,
    `${dmy(d2)},NEFT-UNKNOWN PARTY,N123,,77777.00,2077777`,
    `${dmy(d2)},ATM CASH WITHDRAWAL,,5000.00,,2072777`].join('\r\n');
  const lines = await page.evaluate(c => statementLines(c), csv);
  assert(lines.length === 3 && lines[0].amount === tok.amount && lines[0].date === d1 && /SHARMA, RAHUL/.test(lines[0].text), 'the bank file is read: 3 credits, quoted commas and Indian dates handled, withdrawals left out');
  assert((await page.evaluate(() => statementLines('Txn Date,Description,Amount,Dr/Cr\n2024-05-01,UPI X,500,CR\n2024-05-02,Fee,20,DR').length)) === 1, 'a bank file with one amount column and Dr/Cr is read too');
  assert((await page.evaluate(() => statementLines('just,some,text').length)) === 0, 'a file that is not a statement gives nothing');

  /* the screen */
  await page.evaluate(() => { loginAs(S.users.PFIN); ACT.permsDone(); Notify.hide(); go('recon'); }); await page.waitForTimeout(150);
  const f = path.join(os.tmpdir(), 'aiec-stmt-' + process.pid + '.csv'); fs.writeFileSync(f, csv);
  await page.setInputFiles('#reconFile', f); await page.waitForTimeout(500); fs.unlinkSync(f);
  let txt = await page.innerText('main');
  assert(/Suggested matches \(2\)|\(2\)/.test(txt) && (await page.$$('[data-a="reconOk"]')).length === 2, 'two suggestions are shown');
  assert(await page.$(`[data-a="reconOk"][data-v^="AIEC-P007|${tok.id}|"]`) && await page.$('[data-a="reconOk"][data-v^="AIEC-P004|PAY-R1|"]'), 'one by the UPI reference, one by amount and date');
  assert(/NEFT-UNKNOWN PARTY/.test(txt), 'the bank line that matches nothing is listed for a person to look at');
  assert(await ev(`S.projects["AIEC-P007"].payments.find(p => p.id === "${tok.id}").status === "pending"`), 'nothing is confirmed by itself');
  await page.click('[data-a="reconSkip"][data-v="PAY-R1"]'); await page.waitForTimeout(150);
  assert((await page.$$('[data-a="reconOk"]')).length === 1 && /CLG CHQ DEPOSIT/.test(await page.innerText('main')), '"Not this" moves the line to the unmatched list');
  await page.click(`[data-a="reconOk"][data-v^="AIEC-P007|${tok.id}|"]`); await page.waitForTimeout(400);
  assert(await ev(`(p => p.status === "confirmed" && /^STMT /.test(p.hist[p.hist.length - 1].ref))(S.projects["AIEC-P007"].payments.find(p => p.id === "${tok.id}"))`), 'Confirm marks the payment as found in the bank, with the statement line as the reference');
  assert(!(await page.$$('[data-a="reconOk"]')).length, 'the confirmed one leaves the list');

  /* sales records payments, so it does not open the bank match */
  await page.evaluate(() => { loginAs(S.users.PSALES); go('recon'); }); await page.waitForTimeout(100);
  assert(!(await page.$('#reconFile')), 'the bank match is for Finance and the office only');

  for (const lang of ['en', 'hi', 'mr']) {
    await page.evaluate(lang => { LANG = lang; App.set.lang = lang; loginAs(S.users.PFIN); Notify.hide(); go('recon'); }, lang); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on recon (${lang})`);
  }
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('RECON PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
