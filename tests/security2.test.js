/* Security and data safety with real company data: slow PIN hashing, 6-digit PINs, signed records, new-phone approval, forged files refused, backups, chunked storage, photo archive. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const setup = async () => { const L = await launch(); await L.page.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; App.set.mode = 'real'; await loadMode('real'); }); return L; };
const imp = (page, pack) => page.evaluate(async txt => importText(txt), JSON.stringify(pack));
(async () => {
  /* office phone: new company with a 6-digit Owner PIN */
  const A = await setup(); const pa = A.page;
  await pa.evaluate(async () => { App.form = { org: 'Test Lifts', name: 'Asha Owner', pin1: '123456', pin2: '123456' }; await ACT.createOrg(); });
  await pa.waitForTimeout(1500);
  const owner = await pa.evaluate(() => App.me.uid);
  assert(await pa.evaluate(uid => S.users[uid].pin.startsWith('p2$') && S.users[uid].pinLen === 6, owner), 'the Owner\'s 6-digit PIN is stored with slow hashing (PBKDF2)');
  assert(await pa.evaluate(uid => S.keys[uid] && S.keys[uid].length === 1 && S.keys[uid][0].ok, owner), 'the Owner\'s phone gets a signing key on first login');
  assert(await pa.evaluate(uid => EVENTS.filter(e => e.by === uid).every(e => e.sig && e.sig.s), owner), 'every Owner record on this phone is signed, including the ones made before the key existed');

  /* an older 4-digit PIN (old quick hash) is upgraded at the next login */
  const tech = 'UTECH1';
  await pa.evaluate(async uid => { const salt = 'abc'; await perform('USER_ADDED', null, { uid, name: 'Ravi Tech', role: 'tech', salt, pin: await legacyPinHash('1111', salt) }); }, tech);
  assert(await pa.evaluate(async uid => { App.form.pin = '1111'; await tryPin(uid); return App.me.uid === uid && S.users[uid].pin.startsWith('p2$'); }, tech), 'an old PIN still works once and is upgraded to slow hashing');
  await pa.waitForTimeout(1200);
  assert(await pa.evaluate(uid => S.keys[uid] && S.keys[uid][0].ok && EVENTS.some(e => e.type === 'PIN_UPGRADED' && e.by === uid && e.sig), tech), 'the upgrade is a signed record');
  await pa.evaluate(uid => { App.me = S.users[uid]; }, owner);
  assert(await pa.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'pinDigits', value: 6 }); return newPin().length === 6; }), 'the Owner can switch new PINs to 6 digits');

  /* backup reminder */
  assert(await pa.evaluate(() => { App.set.lastExport = { real: new Date(Date.now() - 8 * 864e5).toISOString() }; return myTasks(App.me).some(n => n.k === 'backup_due'); }), 'office is reminded to save a backup when data has not been shared for a week');

  /* office file for another office phone: only office logins travel */
  const full = await pa.evaluate(() => finishPack(exportPack('full', null, { logins: 'office' })));
  const techAdd = full.events.find(e => e.type === 'USER_ADDED' && e.data.uid === tech), techUp = full.events.find(e => e.type === 'PIN_UPGRADED' && e.by === tech);
  assert(!techAdd.data.pin && techAdd.cut && techUp.data.pin === null && full.sig, 'an office-only full file removes the technician\'s PIN and is signed by the Owner');
  assert(!JSON.stringify(full).includes('phOf'), 'no private details hide inside the signatures');
  const R = await setup();
  const rr = await imp(R.page, full);
  assert(rr.ok && rr.rejected === 0, 'a fresh office phone accepts the full file: every signature checks even with PINs removed');

  /* technician's own phone */
  const personFile = await pa.evaluate(uid => finishPack(exportPack('person', uid)), tech);
  const B = await setup(); const pb = B.page;
  const rb = await imp(pb, personFile);
  assert(rb.ok && rb.rejected === 0, 'the technician\'s phone accepts the file from the office');
  assert(await pb.evaluate(async uid => { App.form.pin = '1111'; await tryPin(uid); return App.me && App.me.uid === uid; }, tech), 'the technician logs in on their phone with the same PIN');
  await pb.waitForTimeout(1500);
  assert(await pb.evaluate(uid => S.keys[uid].length === 2 && !S.keys[uid][1].ok, tech), 'a second phone for the same person waits for office approval');
  await pb.evaluate(uid => perform('WORKER_PROFILE', null, { uid, phone: '9822011111', area: 'Pune', availability: 'available', skills: ['install'] }), tech);
  const mine = await pb.evaluate(() => finishPack(exportPack('person', App.me.uid)));

  /* forged and changed records are refused */
  const forged = JSON.parse(JSON.stringify(full)); forged.kind = 'full'; delete forged.sig;
  forged.events = [{ id: 'X-forged1', n: 1, t: new Date().toISOString(), by: owner, type: 'CONFIG_SET', pid: null, data: { key: 'pinDigits', value: 4 }, dev: 'evil' }];
  const rf = await imp(pa, forged);
  assert(rf.added === 0 && rf.rejected === 1 && await pa.evaluate(() => +S.config.pinDigits === 6), 'a file with an unsigned record claiming to be from the Owner is refused');
  const tampered = JSON.parse(JSON.stringify(full)); delete tampered.sig;
  const real = (await pa.evaluate(uid => JSON.parse(JSON.stringify(EVENTS.find(e => e.by === uid && e.type === 'CONFIG_SET'))), owner));
  tampered.events = [Object.assign(real, { id: real.id + 'b', data: { key: 'pinDigits', value: 4 } })];
  const rt = await imp(pa, tampered);
  assert(rt.added === 0 && rt.rejected === 1, 'a signed record that was changed is refused');

  /* new phone: office approves, then the same file is accepted */
  const r1 = await imp(pa, mine);
  assert(r1.added === 1 && r1.unsigned === 1 && await pa.evaluate(uid => !S.workers[uid] || !S.workers[uid].profile.phone, tech), 'before approval only the new-phone notice is accepted; the profile from that phone is held back');
  const task = await pa.evaluate(() => myTasks(App.me).find(n => n.k === 'approve_key'));
  assert(task && task.uid === tech, 'the office gets an "approve a new phone" task');
  await pa.evaluate(async n => { ACT.keySheet(n.uid + '|' + n.kid); await ACT.keyApprove(n.uid + '|' + n.kid); }, task);
  const r2 = await imp(pa, mine);
  assert(r2.added === 1 && r2.rejected === 0 && await pa.evaluate(uid => S.workers[uid].profile.phone === '9822011111', tech), 'after approval the same file is accepted');
  const back = await pa.evaluate(uid => finishPack(exportPack('person', uid)), tech);
  await imp(pb, back);
  assert(await pb.evaluate(uid => S.keys[uid].every(k => k.ok), tech), 'the approval reaches the technician\'s phone');

  /* storage in chunks */
  const n = await pa.evaluate(async () => { for (let i = 0; i < 520; i++) await perform('CONFIG_SET', null, { key: 'pinDigits', value: 6 }, { noSave: true, quiet: true }); await saveAll(); return EVENTS.length; });
  assert(await pa.evaluate(async n => { const c = await KV.get(App.ns + 'evn'); await loadMode('real'); return c === Math.ceil(n / 500) && EVENTS.length === n; }, n), 'records are saved in chunks of 500 and load back complete');
  const C = await setup(); const pc = C.page;
  assert(await pc.evaluate(async evs => { await KV.set('r:events', evs); await loadMode('real'); return EVENTS.length === evs.length && !(await KV.get('r:events')) && (await KV.get('r:evn')) === Math.ceil(evs.length / 500); }, await pa.evaluate(() => EVENTS.slice(0, 700))), 'data saved by an older version (one big key) moves to chunks on load');

  /* no repeat sound when there are many tasks */
  assert(await pa.evaluate(() => { const o = myTasks; window.myTasks = () => Array.from({ length: 600 }, (_, i) => ({ k: 'call', pid: 'X' + i, roles: ['owner'] })); Notify.check({ silent: true }); const again = Notify.check(); window.myTasks = o; return again.length === 0; }), 'with 600 tasks a second check does not ring again');

  /* archive old photos (practice data has handed-over lifts with photos) */
  const D = await launch(); const pd = D.page;
  await pd.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pd.waitForTimeout(5000);
  const arch = await pd.evaluate(async () => {
    App.me = S.users.POWNER; Object.values(S.projects).forEach(P => { if (P.done) P.done.t = new Date(Date.now() - 800 * 864e5).toISOString(); });
    const keys = archiveKeys(24); if (!keys.length) return { keys: 0 };
    let saved = null; const o = saveFile; window.saveFile = async (name, pack) => { saved = pack; return true; };
    await ACT.archiveGo(24); window.saveFile = o;
    const gone = !(await KV.get(App.ns + 'm:' + keys[0])) && App.archived.has(keys[0]);
    const img = document.createElement('img'); img.dataset.m = keys[0]; const box = document.createElement('div'); box.appendChild(img); loadImages(box); await new Promise(r => setTimeout(r, 200));
    const placeholder = box.textContent === '📦';
    const r = await importText(JSON.stringify(saved));
    return { keys: keys.length, gone, placeholder, saved: Object.keys(saved.media).length, back: !!(await getMedia(keys[0])) && !App.archived.has(keys[0]), r };
  });
  assert(arch.keys > 0 && arch.saved > 0 && arch.gone, 'old photos are saved to a file and removed from the phone: ' + JSON.stringify(arch));
  assert(arch.placeholder, 'an archived photo shows a 📦 placeholder');
  assert(arch.back && arch.r.ok, 'loading the photo file brings the photos back');

  for (const L of [A, R, B, C, D]) { if (L.errors.length) { console.error(L.errors.join('\n')); process.exit(1); } await L.browser.close(); }
  console.log('SECURITY2 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
