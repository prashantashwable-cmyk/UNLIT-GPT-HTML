/* Test helpers. Needs Playwright with Chromium: npm install (see package.json). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const APP = 'file://' + path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
async function launch(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 18.5204, longitude: 73.8567, accuracy: 10 }, permissions: ['geolocation', 'camera', 'microphone'], deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__miss = new Set(); const o = t; window.t = (k, v) => { if (!L[k]) window.__miss.add(k); return o(k, v); }; });
  return { browser, ctx, page, errors };
}
const tap = async (page, sel, opt = {}) => { await page.locator(sel).first().click(opt); await page.waitForTimeout(opt.wait || 120); };
async function miss(page) { return page.evaluate(() => [...window.__miss]); }
async function pin(page, p = '1111') { for (const d of p) await tap(page, `.pinpad button[data-v="${d}"]`, { wait: 60 }); await page.waitForTimeout(300); }
module.exports = { launch, tap, miss, pin, APP, OUT, chromium };
