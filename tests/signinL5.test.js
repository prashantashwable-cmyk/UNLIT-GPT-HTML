/* First day by role: a 3-step tour after the first sign-in (where work appears, how to finish one, where help is),
   worded for the role, skippable and remembered; people who already use the app never see it. Missing profile or
   ID items show what each one holds back, so the person knows what they can already do; a company told it has no
   team for a job sees each technician and what is still missing. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go('home'); }, uid); await page.waitForTimeout(250); };
  /* a brand-new technician */
  assert((await page.evaluate(async () => { const salt = 'n'; const r = await perform('USER_ADDED', null, { uid: 'UNEW1', name: 'Nitin New', role: 'tech', salt, pin: await pinHash('1111', salt) }, { as: 'PADMIN', quiet: true }); return r.ok || r.err; })) === true, 'a new technician is added');
  await as('UNEW1');
  let h = await page.innerText('main');
  assert(/Your first day/.test(h) && /1 of 3/.test(h) && /big buttons/.test(h), 'the tour starts at step 1: where work appears');
  await page.click('[data-a="tourStep"][data-v="2"]'); await page.waitForTimeout(150);
  assert(/press Save/.test(await page.innerText('main')), 'step 2: how to finish one task');
  await page.click('[data-a="tourStep"][data-v="3"]'); await page.waitForTimeout(150);
  assert(/Stuck\?/.test(await page.innerText('main')), 'step 3: where help is');
  await page.click('[data-a="tourStep"][data-v="done"]'); await page.waitForTimeout(150);
  assert(!/Your first day/.test(await page.innerText('main')), 'Got it closes the tour');
  await as('UNEW1'); assert(!/Your first day/.test(await page.innerText('main')), 'it does not come back');
  /* role wording */
  assert(await ev(`tourGroup('customer') === 'cust' && tourGroup('sales') === 'sales' && tourGroup('partner') === 'work' && tourGroup('finance') === 'office'`), 'the tour is worded per role');
  assert(await ev(`/Report a problem/.test(t('tour_cust_3')) && !/SOS/.test(t('tour_cust_3'))`), 'the customer is pointed to what they can actually use');
  /* existing users never see it */
  await as('PTECH'); assert(!/Your first day/.test(await page.innerText('main')), 'a person already using the app does not get the tour');
  /* missing items say what they hold back */
  await as('UNEW1');
  const card = await page.evaluate(() => onbCard('UNEW1'));
  assert(/You can already sign in/.test(card), 'the checklist says what the person can already do');
  assert(/Needed for: being placed on a site/.test(card) && /Needed for: work at height/.test(card), 'each missing item says what it holds back');
  assert(await ev(`onbMissing('UNEW1').length >= 2 && onbMissing('UNEW1').some(x => /Office/.test(x))`), 'the missing list says who does each item');
  /* a company with no ready team sees why per technician */
  const co = await ev(`(Object.values(S.users).find(u => u.role === 'partner' && u.active) || {}).uid`);
  if (co) {
    const r = await page.evaluate(co => { const was = S.config.requireTraining; S.config.requireTraining = 1; const bad = membersOf(co).filter(m => techWhyNot(m) === 'err_not_authorised'); const txt = noTeamWhy(co); S.config.requireTraining = was; return { bad: bad.map(userName), txt }; }, co);
    assert(r.bad.every(n => r.txt.includes(n)) && (!r.bad.length || /Still needed/.test(r.txt)), 'the "no team" reason names each technician who cannot be placed and what is still missing (' + r.bad.length + ')');
  }
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SIGN-IN L5 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
