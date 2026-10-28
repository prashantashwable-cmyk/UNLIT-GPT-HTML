/* Material handover when the customer has the app: the technician counts the items, photographs the storage place and signs;
   the customer then checks the list and signs on their own phone. Installation starts only after the customer's signature. */
const { launch, tap, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const sgn = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);
  const next = async () => { await page.click('[data-a="wizNext"]'); await page.waitForTimeout(250); };
  const sign = async key => {
    await tap(page, `[data-a="sign"][data-k="${key}"]`, { wait: 200 });
    const box = await page.locator('#ov canvas').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 100); await page.mouse.down();
    for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 20 + i * 10, box.y + 100 + Math.sin(i) * 40);
    await page.mouse.up(); await tap(page, '#ov [data-x="ok"]', { wait: 300 });
  };
  const H = 'AIEC-P004', tech = await ev(`S.projects["${H}"].tech`);
  await page.evaluate(async H => { const salt = 'c'; await perform('USER_ADDED', null, { uid: 'MCUST', name: 'Mr. Patil', role: 'customer', projectId: H, salt, pin: await pinHash('1234', salt) }, { as: 'POWNER', quiet: true }); }, H);
  const amt = await ev(`S.projects["${H}"].schedule.arrival`);
  assert((await act('PAYMENT_RECORDED', H, { payId: 'PAY-M1', purpose: 'arrival', amount: amt, method: 'upi', ref: 'UPI55443322' }, 'MCUST')).ok && (await act('PAYMENT_STATUS', H, { payId: 'PAY-M1', status: 'confirmed', ref: 'BANK' }, 'PFIN')).ok, 'the arrival payment is in');
  assert((await tasks(tech)).includes('material_handover'), 'the technician hands over the material');
  const items = await ev(`S.projects["${H}"].materials.map(m => ({ k: m.k, q: m.q, status: 'ok' }))`);
  assert((await act('MATERIAL_HANDED', H, { items, custName: 'Mr. Patil', signer: 'contact', custody: true, ev: (await sgn()).concat(await sgn(), await ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'storage', t: nowISO(), gps: null, hash: 'h' + rid(8) }]`)) }, tech)).err === 'err_cust_signs_app', 'the customer\'s signature is not taken on the technician\'s phone when the customer has the app');

  /* technician's wizard: no customer signature box */
  await page.evaluate(async H => { loginAs(S.users[S.projects[H].tech]); ACT.permsDone(); Notify.hide(); await wiz('mhand', H); W.ctx.store = [{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'storage', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]; render(); }, H); await page.waitForTimeout(150);
  await next(); await next();
  assert(/signs in their own app/.test(await page.innerText('main')) && !(await page.$('[data-a="sign"][data-k="csig"]')), 'the technician is told the customer signs in their own app; no customer signature box');
  await next(); await sign('tsig'); await next(); await page.waitForTimeout(300);
  assert(await ev(`(P => P.stage === "arrived" && P.mhand.wait && P.mhand.techSig && !P.mhand.custSig)(S.projects["${H}"])`), 'saved with the technician\'s signature; installation has not started');
  assert(!(await tasks(tech)).includes('material_handover') && !(await tasks(tech)).includes('safety_check'), 'the technician has nothing more to sign');
  assert((await tasks('MCUST'))[0] === 'mhand_cust_sign', 'the customer\'s first task is to sign for the material');
  await page.evaluate(H => { go('project', { pid: H }); }, H); await page.waitForTimeout(150);
  assert(/Waiting for the customer to sign/.test(await page.innerText('main')), 'the technician\'s job page shows it is waiting for the customer');

  /* the rules */
  assert((await act('MATERIAL_RECEIPT_SIGNED', H, { custName: 'Mr. Patil', custody: true, ev: await sgn() }, 'PCUST')).ok === false, 'another customer cannot sign');
  assert((await act('MATERIAL_RECEIPT_SIGNED', H, { custName: 'Mr. Patil', custody: false, ev: await sgn() }, 'MCUST')).err === 'err_custody', 'the customer must accept to keep the material safe');
  assert((await act('MATERIAL_RECEIPT_SIGNED', H, { custName: 'Mr. Patil', custody: true, ev: [] }, 'MCUST')).err === 'err_sign', 'a signature is needed');

  /* the office is told when the customer has not signed for a day */
  assert(!(await tasks('PADMIN')).includes('mhand_cust_wait'), 'no office reminder at first');
  await page.evaluate(H => { S.projects[H].mhand.t = new Date(Date.now() - 2 * 864e5).toISOString(); }, H);
  assert((await tasks('PADMIN')).includes('mhand_cust_wait'), 'after a day the office is asked to call the customer');
  await page.evaluate(() => { S = rebuild(EVENTS.slice()); });

  /* the customer's phone */
  await page.evaluate(() => { loginAs(S.users.MCUST); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  assert(/Sign for the material received/.test(await page.innerText('main')), 'the customer\'s home shows the task');
  await page.click('[data-a="openTask"][data-v="0"]'); await page.waitForTimeout(300);
  const lt = await page.innerText('main');
  assert(await ev('W && W.id === "mhandCust"') && /Counted by/.test(lt) && await page.$('[data-a="openProjectTab"]'), 'the customer sees the counted list, who counted it, and can ask a question first');
  await next(); await next();
  assert(await ev('!!W && !!document.querySelector("main .err")'), 'cannot go on without accepting and signing');
  await page.click('[data-a="toggle"][data-k="custody"]'); await sign('csig'); await next(); await page.waitForTimeout(400);
  assert(await ev(`(P => P.stage === "installing" && !P.mhand.wait && P.mhand.custSig && P.mhand.custody && P.mhand.techT)(S.projects["${H}"])`), 'the customer signed: installation can start');
  assert((await tasks(tech)).includes('site_checkin') && !(await tasks('MCUST')).includes('mhand_cust_sign'), 'the technician\'s next task is the site check-in');
  assert((await act('MATERIAL_RECEIPT_SIGNED', H, { custName: 'Mr. Patil', custody: true, ev: await sgn() }, 'MCUST')).ok === false, 'signed once');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['hi', 'mr']) {
    await page.evaluate(async ([lang, H]) => { LANG = lang; App.set.lang = lang; loginAs(S.users.MCUST); S.projects[H].mhand.wait = true; await wiz('mhandCust', H); }, [lang, H]); await page.waitForTimeout(100);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll (${lang})`);
    await page.evaluate(async H => { loginAs(S.users[S.projects[H].tech]); go('project', { pid: H }); }, H); await page.waitForTimeout(100);
  }
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('MATERIAL CUSTOMER SIGN PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
