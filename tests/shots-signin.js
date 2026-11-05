/* Screenshots of the sign-in and first-use screens (L1-L5) on a phone-sized window at the default zoom, in English
   and, for the wordiest screens, Hindi and Marathi. Saves PNGs and a contact sheet (index.html) to tests/out/shots/
   and fails if a screen scrolls sideways, a bottom-menu label wraps, a word is missing or the page throws.
   Run after each build: npm run shots */
const path = require('path');
const fs = require('fs');
const { launch, miss } = require('./lib');
const DIR = path.join(__dirname, 'out', 'shots');
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
const ALL = ['en', 'hi', 'mr'];
(async () => {
  const { browser, page, errors } = await launch({ deviceScaleFactor: 2 });
  const W8 = ms => page.waitForTimeout(ms);
  const ev = (f, a) => page.evaluate(f, a);
  const problems = [], made = [];
  await ev(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await W8(6000);
  const login = async uid => { await ev(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.lastErr = null; go('home'); }, uid); await W8(200); };
  const check = async name => {
    const r = await ev(() => {
      const sw = document.documentElement.scrollWidth, w = window.innerWidth;
      const wide = sw > w + 1 ? [...document.querySelectorAll('#app *, #ov *')].filter(e => e.getBoundingClientRect().right > w + 1).slice(0, 3).map(e => e.tagName + ' ' + (e.innerText || '').slice(0, 30)) : [];
      /* a menu label that wraps onto two lines, or is cut */
      const wrap = [...document.querySelectorAll('nav.nav button')].filter(b => { const tn = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).pop(); if (!tn) return false; const rg = document.createRange(); rg.selectNodeContents(tn); return rg.getClientRects().length > 1 || b.scrollWidth > b.clientWidth + 1; }).map(b => b.innerText.replace(/\s+/g, ' ').trim());
      return { over: sw > w + 1 ? `${sw}>${w} ${wide.join(' | ')}` : '', wrap };
    });
    if (r.over) problems.push(`${name}: scrolls sideways: ${r.over}`);
    if (r.wrap.length) problems.push(`${name}: menu label wraps: ${r.wrap.join(', ')}`);
  };
  /* set: puts the app on the screen; langs: which languages to shoot it in */
  const shot = async (group, name, set, langs = ['en']) => {
    for (const l of langs) {
      await ev(l => { LANG = l; App.set.lang = l; }, l);
      await set(); await W8(250);
      /* a refusal message from an earlier screen must not cover this one */
      if (!/refusal/.test(name)) await ev(() => { const el = document.getElementById('toast'); if (el) el.innerHTML = ''; });
      const file = `${group}_${name}_${l}.png`;
      await check(file);
      await page.screenshot({ path: path.join(DIR, file) });
      made.push({ group, file, label: name.replace(/_/g, ' ') + ' (' + l + ')' });
    }
    await ev(() => { LANG = 'en'; App.set.lang = 'en'; closeSheet(); });
  };
  const goScreen = (name, p) => async () => { await ev(([n, p]) => { closeSheet(); go(n, p || {}); }, [name, p]); };

  /* ---- L1: rough price before sign-in ---- */
  await ev(() => { App.me = null; App.form = {}; });
  await shot('L1', 'customer_door', goScreen('door', { kind: 'cust' }), ALL);
  await shot('L1', 'four_questions', async () => { await ev(() => { App.me = null; App.form = {}; go('priceGuess'); }); }, ALL);
  const filled = async () => { await ev(() => { App.me = null; App.form = { pgArea: 'Kothrud, Pune', pgKind: 'house', pgStops: '4', pgPeople: '6', pgCabin: 'ss', pgShown: true }; go('priceGuess'); }); await W8(150); await ev(() => window.scrollTo(0, document.body.scrollHeight)); };
  await shot('L1', 'price_range', filled, ALL);
  await shot('L1', 'enquiry_filled', async () => { await ev(() => { App.me = null; App.form = { pgArea: 'Kothrud, Pune', pgKind: 'house', pgStops: '4', pgPeople: '6', pgCabin: 'ss', pgShown: true }; ACT.pgBook('in'); }); });
  await shot('L1', 'out_of_area', async () => { await ev(() => { S.config.serveAreas = 'Pune, PCMC'; App.me = null; App.form = { pgArea: 'Nagpur', pgKind: 'apartment', pgStops: '5', pgPeople: '8', pgCabin: 'ms', pgShown: true }; go('priceGuess'); }); await W8(100); await ev(() => window.scrollTo(0, document.body.scrollHeight)); });
  await ev(() => { S.config.serveAreas = ''; });

  /* ---- L3: menus per role ---- */
  await login('PTECH');
  for (const [k, n] of [['home', 'today'], ['stock', 'material'], ['steps', 'steps'], ['damage', 'damage'], ['mywork', 'pay']]) await shot('L3', 'tech_' + n, goScreen(k), k === 'home' || k === 'mywork' ? ALL : ['en']);
  await login('PCUST');
  for (const [k, n] of [['home', 'my_lift'], ['mypay', 'pay'], ['docs', 'papers'], ['chat', 'help']]) await shot('L3', 'customer_' + n, goScreen(k), k === 'home' ? ALL : ['en']);
  await login('PSALES');
  await shot('L3', 'sales_call_next', goScreen('callnext'), ALL);

  /* ---- L5: first day ---- */
  await ev(async () => { const salt = 's'; await perform('USER_ADDED', null, { uid: 'USHOT1', name: 'Nitin New', role: 'tech', salt, pin: await pinHash('1111', salt) }, { as: 'PADMIN', quiet: true }); });
  await login('USHOT1');
  for (const n of [1, 2, 3]) await shot('L5', 'tour_tech_step' + n, async () => { await ev(n => { App.set.tour = Object.assign({}, App.set.tour, { [App.mode + 'USHOT1']: String(n) }); go('home'); window.scrollTo(0, 0); }, n); }, ALL);
  await shot('L5', 'checklist_needed_for', async () => { await ev(() => { App.set.tour[App.mode + 'USHOT1'] = 'done'; App.set.fold = Object.assign({}, App.set.fold, { onb: true }); go('home'); }); await W8(100); await ev(() => { const el = document.querySelector('[data-fold="onb"]'); if (el) el.scrollIntoView(); }); }, ALL);
  await login('PCUST');
  await shot('L5', 'tour_customer_step3', async () => { await ev(() => { App.set.tour = Object.assign({}, App.set.tour, { [App.mode + 'PCUST']: '3' }); go('home'); window.scrollTo(0, 0); }); }, ALL);
  await ev(() => { App.set.tour[App.mode + 'PCUST'] = 'done'; });

  /* ---- L4: safer sign-in ---- */
  await login('POWNER');
  await shot('L4', 'pin_again', async () => { await ev(() => { App.forceRecheck = true; App.pinAt = 0; go('home'); perform('CONFIG_SET', null, { key: 'sundayWork', value: 1 }); }); });
  await ev(() => { closeSheet(); App.forceRecheck = false; });
  await shot('L4', 'fingerprint_setting', async () => { await ev(() => { Bio.ok = true; App.set.fold = Object.assign({}, App.set.fold, { me_set: true }); go('me'); }); await W8(100); await ev(() => { const h = [...document.querySelectorAll('h3')].find(x => /👆/.test(x.textContent)); if (h) { h.closest('.card').scrollIntoView(); window.scrollBy(0, -70); } }); });
  await shot('L4', 'pin_screen_fingerprint', async () => { await ev(() => { (App.set.bio = App.set.bio || {})[App.mode + 'PTECH'] = 'AQID'; App.me = null; go('pin', { uid: 'PTECH' }); }); });
  await ev(() => { delete App.set.bio[App.mode + 'PTECH']; Bio.ok = false; });
  await login('PADMIN');
  await shot('L4', 'two_phone_alert', async () => { await ev(async () => { const d0 = App.set.dev; App.set.dev = 'PHONE-B-shot'; await perform('DEVICE_USED', null, {}, { as: 'PTECH', quiet: true }); App.set.dev = d0; wiz('devAlert', null, { uid: 'PTECH' }); }); });

  /* ---- L2: clear states and refusals ---- */
  await login('PSALES');
  await shot('L2', 'refusal_names_person', async () => { await ev(() => { go('home'); perform('LEGAL_SET', null, { uid: 'PTECH', k: 'height', no: 'X1', expiry: '2026-12-01' }); }); });
  await ev(() => perform('LEGAL_SET', null, { uid: 'PTECH', k: 'height', no: 'WAH-1', expiry: '2026-10-01' }, { as: 'PADMIN', quiet: true }));
  await login('PTECH');
  await shot('L2', 'work_blocked', async () => { await ev(() => { App.lastErr = null; go('home'); window.scrollTo(0, 0); }); }, ALL);
  await ev(() => perform('PIN_ALERT', null, { n: 3 }, { as: 'PSALES', quiet: true }));
  await login('PADMIN');
  await shot('L2', 'pin_alert_task', async () => { await ev(() => wiz('pinAlert', null, { uid: 'PSALES' })); });
  await ev(() => perform('USER_UPDATED', null, { uid: 'PFIELD', active: false }, { as: 'POWNER', quiet: true }));
  await shot('L2', 'access_stopped', async () => { await ev(() => { W = null; App.me = null; App.set.lastUser = 'PFIELD'; go('gate'); }); }, ALL);
  await shot('L2', 'name_missing_help', async () => { await ev(() => { App.me = null; go('door', { kind: 'staff' }); }); await W8(100); await ev(() => { const d = document.querySelector('main details'); if (d) { d.open = true; d.scrollIntoView(); } }); });

  /* ---- HM: the map on the first page ---- */
  for (const uid of ['PTECH', 'PCUST', 'PADMIN', 'PFIELD', 'PSALES']) {
    await login(uid);
    await shot('HM', 'home_map_' + uid.slice(1).toLowerCase(), async () => { await ev(() => { App.form = {}; go('home'); }); await W8(150); await ev(() => { const el = document.getElementById('hsvg'); if (el) { el.closest('.card').scrollIntoView(); window.scrollBy(0, -80); } }); }, uid === 'PTECH' || uid === 'PCUST' ? ALL : ['en']);
  }
  await login('PTECH');
  await shot('HM', 'pin_tapped_tech', async () => { await ev(() => { const g = document.querySelector('#hsvg [data-a="mapPin"]'); App.form.mp = g && g.dataset.v; go('home'); }); await W8(150); await ev(() => { const el = document.getElementById('hsvg'); if (el) { el.closest('.card').scrollIntoView(); window.scrollBy(0, -80); } }); });

  /* ---- NV: full-screen map, log out, own back, exit ---- */
  await login('PTECH');
  await shot('NV', 'map_full_screen', async () => { await ev(() => { ACT.nav('home'); }); await W8(150); await ev(() => ACT.mapFull('hbox')); }, ALL);
  await ev(() => mapFullSet('hbox', false));
  await shot('NV', 'logout_ask', async () => { await ev(() => { closeSheet(); ACT.nav('home'); ACT.logoutAsk(); }); }, ALL);
  await ev(() => closeSheet());
  await shot('NV', 'own_back_full_screen', async () => { await ev(() => { App.forceFull = true; go('me'); }); });
  await ev(() => { App.forceFull = false; });
  await shot('NV', 'exit_ask', async () => { await ev(() => { closeSheet(); ACT.nav('home'); exitAsk(); }); }, ALL);
  await ev(() => closeSheet());

  /* contact sheet */
  const groups = ['NV', 'HM', 'L1', 'L3', 'L5', 'L4', 'L2'], titles = { NV: 'Full-screen map, Log out, Back, Exit', HM: 'Map on the first page', L1: 'L1 · Rough price before sign-in', L2: 'L2 · Clear states and refusals', L3: 'L3 · Menus per role', L4: 'L4 · Safer sign-in', L5: 'L5 · First day' };
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in screenshots</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f4f4;color:#111}h2{margin:24px 0 8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:8px;padding:6px;box-shadow:0 1px 3px #0002}img{width:100%;border-radius:4px;display:block}figcaption{font-size:12px;margin-top:4px}.bad{background:#fee;border:1px solid #c00;padding:8px;border-radius:6px}</style></head><body>
<h1>Sign-in and first-use screens</h1><p>${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · phone 390×844 · default zoom</p>
${problems.length ? `<div class="bad"><b>Problems</b><br>${problems.map(p => p.replace(/</g, '&lt;')).join('<br>')}</div>` : '<p>✅ No sideways scrolling, no wrapped menu labels.</p>'}
${groups.map(g => `<h2>${titles[g]}</h2><div class="g">${made.filter(m => m.group === g).map(m => `<figure><a href="${m.file}"><img src="${m.file}" loading="lazy" alt=""></a><figcaption>${m.label}</figcaption></figure>`).join('')}</div>`).join('')}
</body></html>`;
  fs.writeFileSync(path.join(DIR, 'index.html'), html);
  const mm = await miss(page);
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e));
  await browser.close();
  console.log(`${made.length} screenshots in ${DIR}`);
  if (mm.length) problems.push('missing words: ' + mm.join(' '));
  if (errs.length) problems.push('page errors: ' + errs.slice(0, 3).join(' | '));
  if (problems.length) { console.error('PROBLEMS\n' + problems.join('\n')); process.exit(1); }
  console.log('SHOTS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
