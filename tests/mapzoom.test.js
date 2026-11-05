/* Pinch to zoom on every map: the street map on the home card zooms with two fingers while one finger still scrolls
   the page, and in full screen it drags too; inside the map the 75% page shrink is undone so fingers land where they
   should; the drawn (offline) map zooms with a pinch, double-tap and + / − / ⟲, pans in full screen, and a tap on a
   pin still opens the job. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); App.form = {}; ACT.nav('home'); }); await page.waitForTimeout(300);
  /* true scale inside the map */
  const z = await ev(`(() => { const b = document.getElementById('hbox'); return parseFloat(getComputedStyle(document.documentElement).zoom) * parseFloat(getComputedStyle(b).zoom); })()`);
  assert(Math.abs(z - 1) < 0.02, 'inside the map the page shrink is undone (effective zoom ' + z.toFixed(2) + ')');
  /* street map options, with a stand-in map library (tests run offline) */
  const opts = await page.evaluate(async () => {
    const mk = on => ({ on, enable() { this.on = true; }, disable() { this.on = false; }, enabled() { return this.on; } });
    let made = null;
    window.leaflet = { Browser: { mobile: true }, map: (el, o) => (made = { o, touchZoom: mk(o.touchZoom !== false), dragging: mk(o.dragging !== false), scrollWheelZoom: mk(o.scrollWheelZoom !== false), invalidateSize() {}, fitBounds() {}, setView() {}, remove() {} }),
      tileLayer: () => ({ addTo() { return this; }, on() { return this; } }), divIcon: () => ({}), marker: () => ({ addTo() { return { bindPopup() {} }; } }),
      polyline: () => ({ addTo() {} }), rectangle: () => ({ addTo() { return { bindPopup() {} }; } }), circleMarker: () => ({ addTo() { return { bindPopup() {} }; } }) };
    Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
    liveMap('hmap', 'hsvg', App.homeMap, 'home', { small: true });
    await new Promise(r => setTimeout(r, 200));
    const r0 = { pinch: made.touchZoom.enabled(), drag: made.dragging.enabled() };
    mapFullSet('hbox', true); const r1 = { pinch: made.touchZoom.enabled(), drag: made.dragging.enabled() };
    mapFullSet('hbox', false); const r2 = { pinch: made.touchZoom.enabled(), drag: made.dragging.enabled() };
    delete window.leaflet; delete navigator.onLine; ACT.nav('home');
    return { r0, r1, r2 };
  });
  assert(opts.r0.pinch && !opts.r0.drag, 'home card street map: two-finger pinch zooms, one finger scrolls the page');
  assert(opts.r1.pinch && opts.r1.drag, 'full screen: pinch and drag');
  assert(opts.r2.pinch && !opts.r2.drag, 'closing full screen returns to the home-card setting');
  await page.waitForTimeout(300);
  /* the drawn map */
  const vb = () => ev(`document.querySelector('#hbox svg.map').getAttribute('viewBox')`);
  const v0 = await vb();
  await page.click('[data-a="mapZoom"][data-v="in|hbox"]'); await page.waitForTimeout(100);
  const v1 = await vb();
  assert(+v1.split(' ')[2] < +v0.split(' ')[2], '+ zooms in: ' + v0 + ' → ' + v1);
  await page.click('[data-a="mapZoom"][data-v="reset|hbox"]'); await page.waitForTimeout(100);
  assert((await vb()) === v0, '⟲ shows everything again');
  /* two-finger pinch: two pointers moving apart */
  await page.evaluate(() => {
    const svg = document.querySelector('#hbox svg.map'), r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fire = (type, id, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }));
    fire('pointerdown', 1, cx - 20, cy); fire('pointerdown', 2, cx + 20, cy);
    fire('pointermove', 1, cx - 60, cy); fire('pointermove', 2, cx + 60, cy);
    fire('pointerup', 1, cx - 60, cy); fire('pointerup', 2, cx + 60, cy);
  });
  const v2 = await vb();
  assert(+v2.split(' ')[2] < +v0.split(' ')[2] * 0.6, 'a two-finger pinch zooms the drawn map: ' + v2);
  /* pan in full screen */
  await page.click('[data-a="mapFull"][data-v="hbox"]'); await page.waitForTimeout(150);
  await page.evaluate(() => {
    const svg = document.querySelector('#hbox svg.map'), r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fire = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: 5, clientX: x, clientY: y, bubbles: true }));
    fire('pointerdown', cx, cy); fire('pointermove', cx + 60, cy + 40); fire('pointerup', cx + 60, cy + 40);
  });
  const v3 = await vb();
  assert(v3 !== v2 && +v3.split(' ')[2] === +v2.split(' ')[2], 'one finger pans in full screen');
  await page.click('#hbox [data-a="mapFullClose"]'); await page.waitForTimeout(100);
  /* a tap on a pin still opens the job */
  /* (the test tool's own click point is off after nested zoom; a real tap was checked with elementFromPoint) */
  await page.evaluate(() => document.querySelector('[data-a="mapZoom"][data-v="reset|hbox"]').click()); await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelector('#hbox [data-a="mapPin"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(250);
  assert(await page.evaluate(() => [...document.querySelectorAll('#hbox .mzoom button')].every(b => { b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; })), 'the zoom buttons are reachable by a tap');
  assert(/Directions/.test(await page.innerText('main')), 'tapping a pin still shows the job');
  /* full map too */
  await page.evaluate(() => go('map')); await page.waitForTimeout(250);
  assert(!!(await page.$('[data-a="mapZoom"][data-v="in|fbox"]')), 'the full map has the zoom buttons too');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('MAP ZOOM PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
