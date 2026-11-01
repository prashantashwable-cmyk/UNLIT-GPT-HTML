/* Growth: a handed-over customer shares a referral code (by their own tap), the office records it on the new job, and the
   thank-you is due only once that job's material is ordered; a housing society's committee approves by name, time and
   signature, the agreement waits for the quorum, and the resolution is made from the recorded approvals. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  const sgn = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);

  /* referral */
  const D = 'AIEC-P001', code = await ev(`S.projects["${D}"].lift.code`);
  const card = await ev(`(loginAs(S.users.PADMIN), custRefCard(S.projects["${D}"]))`);
  assert(card.includes(code) && /wa\.me\/\?text=/.test(card) && /Share on WhatsApp/.test(card), 'a handed-over customer gets a referral code and a share button (sent by their own tap)');
  const N = await ev('Object.values(S.projects).find(P => ["new", "returned", "accepted", "contacted", "requirements"].includes(P.stage)).id');
  assert((await act('REFERRAL_SET', N, { code: 'NOPE-1' }, 'PADMIN')).err === 'err_ref_code', 'an unknown code is refused');
  assert((await act('REFERRAL_SET', N, { code: ' ' + code.toLowerCase() + ' ' }, 'PADMIN')).ok, 'the office records the friend\'s code on the new job (small letters and spaces are fine)');
  assert((await act('REFERRAL_SET', N, { code }, 'PADMIN')).err === 'err_already', 'only once per job');
  assert((await act('REFERRAL_REWARDED', N, { note: 'UPI 123' }, 'PADMIN')).err === 'err_ref_not_yet', 'no thank-you before the referred job\'s material is ordered');
  assert(!(await tasks('PADMIN', N)).includes('referral_reward'), 'and no task yet');
  await page.evaluate(N => { S.projects[N].stage = 'material_order'; }, N);
  assert((await tasks('PADMIN', N)).includes('referral_reward'), 'once its material is ordered, the office is asked to give the thank-you');
  assert((await act('REFERRAL_REWARDED', N, { note: 'Paid ₹2,000 by UPI, ref 4455' }, 'PADMIN')).ok && !(await tasks('PADMIN', N)).includes('referral_reward'), 'recorded with how it was given');
  assert(/thank-you given/.test(await ev(`custRefCard(S.projects["${D}"])`)), 'the referring customer sees their referral and that the thank-you was given');

  /* society committee */
  const Q = await ev('Object.values(S.projects).find(P => ["quoted", "quote_ready", "quote_approval", "requirements", "contacted", "accepted", "returned", "new"].includes(P.stage) && P.id !== "' + N + '").id');
  assert((await act('SOC_SET', Q, { members: ['A. Patil'], quorum: 1 }, 'PADMIN')).err === 'err_members', 'a committee needs at least 2 members');
  assert((await act('SOC_SET', Q, { members: ['A. Patil', 'a. patil', 'B. Kale'], quorum: 2 }, 'PADMIN')).err === 'err_members', 'no duplicate names');
  assert((await act('SOC_SET', Q, { members: ['A. Patil', 'B. Kale', 'C. Joshi', 'D. Shah', 'E. Rao'], quorum: 6 }, 'PADMIN')).err === 'err_members', 'quorum cannot be more than the members');
  assert((await act('SOC_SET', Q, { members: ['A. Patil', 'B. Kale', 'C. Joshi', 'D. Shah', 'E. Rao'], quorum: 3 }, 'PADMIN')).ok, 'committee of 5, 3 approvals needed');
  assert((await act('SOC_APPROVED', Q, { name: 'A. Patil', ev: [] }, 'PADMIN')).err === 'err_sign', 'each approval needs the member\'s own signature');
  assert((await act('SOC_APPROVED', Q, { name: 'Z. Nobody', ev: await sgn() }, 'PADMIN')).err === 'err_choose', 'only listed members');
  assert((await act('SOC_APPROVED', Q, { name: 'A. Patil', ev: await sgn() }, 'PADMIN')).ok && (await act('SOC_APPROVED', Q, { name: 'B. Kale', ev: await sgn() }, 'PADMIN')).ok, 'two members approve');
  assert((await act('SOC_APPROVED', Q, { name: 'A. Patil', ev: await sgn() }, 'PADMIN')).err === 'err_already', 'a member cannot approve twice');
  /* the agreement waits for the quorum */
  const sigOk = await page.evaluate(Q => { const P = S.projects[Q], keep = P.stage; P.stage = 'agreement'; const r = validate(S, { type: 'AGREEMENT_SIGNED', pid: Q, by: P.sales, t: nowISO(), data: { consent: true, signer: 'Secretary', ev: [{ id: 'EZ1', m: 'x', kind: 'sign', t: nowISO(), hash: 'h' }] } }); P.stage = keep; return r && (r.k || r); }, Q);
  assert(sigOk === 'err_quorum', 'the agreement cannot be signed before the quorum: ' + sigOk);
  await page.evaluate(Q => { S.projects[Q].stage = 'quoted'; }, Q);
  assert((await tasks(await ev(`S.projects["${Q}"].sales`), Q)).includes('soc_approvals'), 'Sales is asked to collect the remaining approvals');
  assert((await act('SOC_APPROVED', Q, { name: 'D. Shah', ev: await sgn() }, 'PADMIN')).ok && await ev(`socOk(S.projects["${Q}"])`), 'the third approval reaches the quorum');
  await page.evaluate(Q => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: Q, tab: 'info' }); }, Q); await page.waitForTimeout(250);
  const pi = await page.innerText('main');
  assert(/Society committee approval/.test(pi) && /Quorum reached/.test(pi) && /A\. Patil/.test(pi), 'the project shows each member, who approved and when');
  await page.evaluate(Q => go('doc', { pid: Q, kind: 'resolution' }), Q); await page.waitForTimeout(250);
  const rs = await page.innerText('main');
  assert(/Committee resolution/.test(rs) && /3 of 5 members approved; 3 needed\. Result: passed/.test(rs) && /Not typed by hand/.test(rs), 'the resolution is made from the recorded approvals');
  /* the approval wizard */
  await page.evaluate(async Q => { await wiz('socApprove', Q); }, Q); await page.waitForTimeout(200);
  const wz = await page.innerText('#app');
  assert(/C\. Joshi/.test(wz) && /E\. Rao/.test(wz) && !/A\. Patil/.test(wz), 'the approval form lists only members who have not approved yet');

  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, Q]) => { LANG = l; App.set.lang = l; go('doc', { pid: Q, kind: 'resolution' }); }, [lang, Q]); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('GROWTH PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
