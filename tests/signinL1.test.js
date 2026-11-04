/* Rough price before sign-in (v4): the customer door offers four plain questions; the answer is a range from the
   office's own price list marked "not a quotation"; booking a visit carries the answers into the normal enquiry; an
   area the company does not serve is told so politely and can still leave a number. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  await page.evaluate(() => { App.me = null; App.form = {}; go('door', { kind: 'cust' }); }); await page.waitForTimeout(250);
  assert(await page.$('[data-a="nav"][data-v="priceGuess"]'), 'the customer door offers "Rough price in 4 questions"');
  await page.click('[data-a="nav"][data-v="priceGuess"]'); await page.waitForTimeout(250);
  assert(await page.evaluate(() => App.route.name === 'priceGuess' && !App.me), 'it opens without sign-in');
  await page.click('[data-a="pgShow"]'); await page.waitForTimeout(150);
  assert(/Please|fill/i.test(await page.innerText('#ferr')), 'all four answers are asked before a price is shown');
  await page.fill('[data-f="pgArea"]', 'Kothrud, Pune');
  for (const v of ['pgKind|house', 'pgStops|4', 'pgPeople|6', 'pgCabin|ss']) { await page.click(`[data-a="pgSet"][data-v="${v}"]`); await page.waitForTimeout(80); }
  await page.click('[data-a="pgShow"]'); await page.waitForTimeout(200);
  const txt = await page.innerText('main');
  const m = txt.match(/₹([\d,]+) – ₹([\d,]+)/); assert(m, 'a price range is shown: ' + (m && m[0]));
  const lo = +m[1].replace(/,/g, ''), hi = +m[2].replace(/,/g, '');
  assert(lo > 100000 && hi > lo && lo % 5000 === 0 && hi % 5000 === 0, 'the range is sensible and rounded');
  assert(/Not a quotation/.test(txt) && /measures the site/.test(txt), 'it says plainly it is not a quotation, and why');
  const same = await page.evaluate(() => { const r = pgRange({ pgStops: 4, pgKind: 'house', pgPeople: 6, pgCabin: 'ss' }); const q = calcQuote(priceCfg(), { type: 'manual', stops: 4, capacity: 6, finish: 'ss' }, 0).total; return r.lo === Math.floor(q / 5000) * 5000; });
  assert(same, 'the low end comes from the office price list (the same calculator as real quotes)');
  const more = await page.evaluate(() => pgRange({ pgStops: 8, pgKind: 'house', pgPeople: 6, pgCabin: 'ss' }).lo > pgRange({ pgStops: 4, pgKind: 'house', pgPeople: 6, pgCabin: 'ss' }).lo);
  assert(more, 'more floors cost more');
  await page.click('[data-a="pgBook"][data-v="in"]'); await page.waitForTimeout(250);
  const f = await page.evaluate(() => ({ r: App.route.name, a: App.form.rqAddr, fl: App.form.rqFloors, who: App.form.rqWho, note: App.form.rqNote }));
  assert(f.r === 'enquiry' && f.a === 'Kothrud, Pune' && f.fl === '4' && f.who === 'owner' && /Rough price seen: House/.test(f.note), 'booking opens the enquiry with the answers filled in');
  await page.fill('[data-f="rqName"]', 'Meera Joshi'); await page.fill('[data-f="rqPhone"]', '9876543210');
  await page.click('[data-a="enqMake"]'); await page.waitForTimeout(250);
  const o = await page.evaluate(() => reqDecode(App.reqOut.msg));
  assert(o && o.kind === 'enq' && /Rough price seen/.test(o.note) && o.floors === 4, 'the enquiry the office receives carries the rough price and answers');
  /* an area the company does not serve */
  await page.evaluate(() => { S.config.serveAreas = 'Pune, PCMC'; App.form = { pgArea: 'Nagpur', pgKind: 'apartment', pgStops: '5', pgPeople: '8', pgCabin: 'ms', pgShown: true }; go('priceGuess'); }); await page.waitForTimeout(200);
  const u = await page.innerText('main');
  assert(/do not install in Nagpur yet/.test(u) && !/₹/.test(u), 'an unserved area is told politely, with no price');
  await page.click('[data-a="pgBook"][data-v="out"]'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => App.route.name === 'enquiry' && /Outside our service area: Nagpur/.test(App.form.rqNote)), 'they can still leave their number, marked outside the area');
  assert(await page.evaluate(() => pgServed('Kothrud, Pune') && pgServed('pcmc') && !pgServed('Mumbai')), 'served areas match by name');
  await page.evaluate(() => { S.config.serveAreas = ''; }); assert(await page.evaluate(() => pgServed('Anywhere')), 'an empty list means all areas are served');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SIGN-IN L1 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
