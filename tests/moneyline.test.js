/* Money in one line on the home screen: "You will get ₹X on Sunday" once the office approves; this week so far; what waits
   for approval; the last payment. A technician in a company sees the value of their work and who pays them. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const line = uid => page.evaluate(u => { loginAs(S.users[u]); ACT.permsDone(); Notify.hide(); go('home'); const c = [...document.querySelectorAll('main .card')].find(x => x.innerText.includes('💰')); return c ? c.innerText : ''; }, uid);
  let l = await line('PQC');
  assert(/Waiting for the office to approve: ₹/.test(l), 'QC sees what waits for approval: ' + l.replace(/\n/g, ' | '));
  const w = await page.evaluate(() => { const w = weeksFor('PQC').find(x => x.week < weekKey(nowISO()) && !x.pay && x.total > 0); return { week: w.week, total: w.total }; });
  const ok = await page.evaluate(w => perform('PAY_APPROVED', null, { uid: 'PQC', week: w.week, computed: w.total, amount: w.total }, { as: 'PADMIN', quiet: true }).then(r => r.ok), w);
  assert(ok, 'the office approves a week');
  l = await line('PQC');
  assert(new RegExp('You will get ₹[\\d,]+ on Sunday').test(l), 'QC sees "You will get ₹X on Sunday": ' + l.split('\n')[0]);
  const paid = await page.evaluate(w => perform('PAY_PAID', null, { uid: 'PQC', week: w.week, ref: 'UTR123456' }, { as: 'PFIN', quiet: true }).then(r => r.ok || r.err), w);
  l = await line('PQC');
  assert(paid === true && /Last paid: ₹/.test(l), 'after Finance pays, the line shows the last payment: ' + paid);
  const c = await line('PTECH');
  assert(/Your work this week is worth ₹[\d,]+\. .+ pays you\./.test(c), 'a technician in a company sees the value of the work and who pays them');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('MONEY LINE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
