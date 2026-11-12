/* Test helpers. Needs Playwright with Chromium: npm install (see package.json). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const APP = 'file://' + path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
async function launch(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 18.5204, longitude: 73.8567, accuracy: 10 }, timezoneId: 'Asia/Kolkata', permissions: ['geolocation', 'camera', 'microphone'], deviceScaleFactor: 1, ...opts });
  /* tests run offline: the street map's library and tiles are unreachable, so the app must fall back cleanly */
  await ctx.route(/^https:\/\/(unpkg\.com|tile\.openstreetmap\.org)\//, r => r.abort('internetdisconnected'));
  /* AIEC_SHIFT_DAYS=60 runs a test as if today were 60 days later: rules that start on fixed dates must never break
     the practice company or the tests as time passes */
  const shift = +process.env.AIEC_SHIFT_DAYS || 0;
  if (shift) await ctx.addInitScript(days => { const R = Date, ms = days * 864e5; class D2 extends R { constructor(...a) { if (a.length === 0) super(R.now() + ms); else super(...a); } static now() { return R.now() + ms; } } window.Date = D2; }, shift);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.evaluate(() => { App.set.devNoInstallGate = true; render(); });
  await page.evaluate(() => { window.__miss = new Set(); const o = t; window.t = (k, v) => { if (!L[k]) window.__miss.add(k); return o(k, v); }; });
  return { browser, ctx, page, errors };
}
const tap = async (page, sel, opt = {}) => { await page.locator(sel).first().click(opt); await page.waitForTimeout(opt.wait || 120); };
async function miss(page) { return page.evaluate(() => [...window.__miss]); }
async function pin(page, p = '1111') { for (const d of p) await tap(page, `.pinpad button[data-v="${d}"]`, { wait: 60 }); await page.waitForTimeout(300); }
/* jobs under the newer journey need the customer's signed layout before material is released; older jobs do not */
const signGad = (page, pid, as = 'PADMIN') => page.evaluate(([pid, as]) => { const P = S.projects[pid]; return gadNeeded(P) && P.stage === 'site_ok' ? perform('GAD_SIGNED', pid, { ticks: Object.fromEntries(GAD_TICKS.map(k => [k, true])), powerBy: addDays(5), consent: true, signer: 'Customer', ev: [{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }] }, { as: as, quiet: true }).then(r => r.ok) : true; }, [pid, as]);
module.exports = { launch, tap, miss, pin, signGad, APP, OUT, chromium };
