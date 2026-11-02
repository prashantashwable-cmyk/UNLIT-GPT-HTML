/* Buttons and rules agree: for every action, every role and every practice job, the quick check that shows a button
   (allowed) gives the same answer as the full rule check (validate) on who may do it and at which stage. A button that
   shows and then says "not allowed" confuses people in the field. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const out = await page.evaluate(() => {
    const GATE = ['err_role', 'err_access', 'err_stage', 'err_no_project'];
    /* here the answer depends on what is filled in (which payment, whose pay, which crew member, which incident type),
       so the button shows and the rule decides on the details */
    const DATA = { INCIDENT_RAISED: 'err_stage', STAGE_BACK: 'err_stage', PAY_DISPUTED: 'err_access', PAYMENT_RECORDED: 'err_stage', CUSTOMER_RATED: 'err_access', CREW_RATED: 'err_access', LEAD_CREATED: 'err_access', RATING_APPEALED: 'err_access' };
    const people = []; const seen = new Set();
    for (const u of Object.values(S.users)) if (u.active && !seen.has(u.role)) { seen.add(u.role); people.push(u); }
    const projects = Object.values(S.projects), bad = []; let n = 0;
    for (const u of people) {
      loginAs(u);
      for (const [type, R] of Object.entries(RULES)) {
        if (['ORG_CREATED', 'USER_ADDED'].includes(type)) continue;
        for (const P of R.project ? projects : [null]) {
          n++;
          const a = allowed(type, P || undefined);
          const e = validate(S, { id: 'chk', n: 0, t: nowISO(), by: u.uid, type, pid: P ? P.id : null, data: {}, dev: 'chk' });
          const k = e && (e.k || e), gate = !GATE.includes(k);
          if (a && !gate && DATA[type] === k) continue;
          if (a !== gate) bad.push(`${u.role}:${type}:${P ? P.id + '/' + P.stage : '-'} button=${a} rule=${k || 'ok'}`);
        }
      }
    }
    return { n, bad, roles: people.map(u => u.role) };
  });
  assert(out.roles.length >= 9, 'checked every role: ' + out.roles.join(', '));
  assert(out.n > 10000, 'checked ' + out.n + ' action × role × job combinations');
  assert(!out.bad.length, 'a button shows exactly when the rule allows that person at that stage' + (out.bad.length ? ` (${out.bad.length} differ): ` + out.bad.slice(0, 12).join(' | ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('RULES AGREE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
