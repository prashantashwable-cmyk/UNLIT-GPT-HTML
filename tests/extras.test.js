/* Undo (own simple records, 5 minutes, nothing after), time-and-place stamp on photos, voice notes in chat,
   critical alerts that ring until someone says "I am on it". */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as, t) => page.evaluate(([type, pid, data, as, t]) => perform(type, pid, data, { as: as || undefined, quiet: true, t: t || undefined }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err), id: r.ev && r.ev.id })), [type, pid, data, as, t]);
  const P = 'AIEC-P007';
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');

  /* undo */
  await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); });
  const c1 = await act('CHAT_POSTED', P, { text: 'Wrong job, sorry' });
  assert(c1.ok && await ev('App.lastDone') === c1.id && await ev(`canUndo("${c1.id}")`), 'after a simple record, the person can take it back');
  await page.evaluate(P => go('project', { pid: P, tab: 'chat' }), P); await page.waitForTimeout(200);
  assert(await page.$(`[data-a="undo"][data-v="${c1.id}"]`), 'their own last chat message has an Undo button');
  assert((await act('UNDONE', P, { target: c1.id }, 'PADMIN')).err === 'err_undo_own', 'nobody else can take it back');
  assert((await act('UNDONE', P, { target: c1.id }, null, await ev(`new Date(Date.parse(S.byId["${c1.id}"].t) + 6 * 60000).toISOString()`))).err === 'err_undo_late', 'not after 5 minutes');
  await page.click(`[data-a="undo"][data-v="${c1.id}"]`); await page.waitForTimeout(300);
  assert(await ev(`!S.projects["${P}"].chat.some(m => m.id === "${c1.id}") && !!S.undone["${c1.id}"] && EVENTS.some(e => e.id === "${c1.id}")`), 'the message is gone from the job; the record and its undo stay in the history');
  const c2 = await act('CHAT_POSTED', P, { text: 'Visit on Monday' });
  await act('CHAT_POSTED', P, { text: 'Noted' }, 'PADMIN');
  assert((await act('UNDONE', P, { target: c2.id })).err === 'err_undo_after', 'not after someone else did something on the job');
  const pay = await ev('EVENTS.find(e => e.type === "PAYMENT_RECORDED").id');
  assert((await act('UNDONE', null, { target: pay }, await ev(`S.byId["${pay}"].by`))).err === 'err_undo_type', 'money, signatures and approvals are never undone');
  const c3 = await act('CHAT_POSTED', P, { text: 'Another try' });
  await page.evaluate(() => go('done', { title: 'Done', what: 'x', next: 'y' })); await page.waitForTimeout(150);
  await page.click(`[data-a="undo"][data-v="${c3.id}"]`); await page.waitForTimeout(300);
  assert(await ev('App.route.name') === 'home' && await ev(`!!S.undone["${c3.id}"]`), 'the done screen offers Undo too');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length && Object.keys(S.undone).length === 2; }), 'everything rebuilds the same, with nothing refused');

  /* photo stamp */
  await page.evaluate(() => { App.route = { name: 'project', p: { pid: 'AIEC-P003' } }; window._cam = Cam.open({ label: 'Test', tag: 'work' }); }); await page.waitForTimeout(800);
  await page.click('[data-x="sample"]'); await page.waitForTimeout(600); await page.click('[data-x="use"]'); await page.waitForTimeout(7500);
  const st = await page.evaluate(async () => { const m = await window._cam; const data = await getMedia(m.m); const img = new Image(); img.src = data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const lum = y0 => { const d = x.getImageData(0, y0, c.width, 4).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
    return { stamp: m.stamp, orig: !!m.orig && m.orig !== m.hash, same: (await sha256(data)) === m.hash, bottom: lum(c.height - 6), top: lum(4) }; });
  assert(st.stamp && st.orig && st.same, 'a photo is stored with its stamp; its check code matches the stamped photo and the original\'s code is kept');
  assert(st.bottom < st.top - 40, 'the stamp band is drawn across the bottom of the photo: ' + Math.round(st.bottom) + ' vs ' + Math.round(st.top));

  /* voice notes */
  await page.evaluate(P => { loginAs(S.users.PSALES); go('project', { pid: P, tab: 'chat' }); }, P); await page.waitForTimeout(200);
  assert(await page.$('[data-a="chatVoice"]'), 'the chat has a voice note button');
  await page.click('[data-a="chatVoice"]'); await page.waitForTimeout(600);
  assert(/microphone/i.test(await page.innerText('body')) || await ev('!!document.querySelector("#ov .overlay")'), 'without a microphone the person is told why (or recording starts)');
  await page.evaluate(() => { if (App.ovClose) App.ovClose(); $('#ov').innerHTML = ''; });
  const wav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  await page.evaluate(async ([P, wav]) => { const m = await putMedia(wav); await perform('CHAT_POSTED', P, { text: '', ev: [{ id: 'E' + rid(10), m, kind: 'audio', label: 'voice', t: nowISO(), gps: null, hash: await sha256(wav), dev: 'test', q: {}, dur: 3 }] }, { quiet: true }); go('project', { pid: P, tab: 'chat' }); }, [P, wav]); await page.waitForTimeout(400);
  assert(await ev('[...document.querySelectorAll(".audio-note audio")].some(a => a.src.startsWith("data:audio"))'), 'a voice-only message plays in the chat');

  /* critical alerts */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); App.notifyLog = []; Notify.save('quiet', true); Notify.save('qFrom', '00:00'); Notify.save('qTo', '23:59'); go('home'); });
  await act('TICKET_OPENED', 'AIEC-P001', { tid: 'T-CR', kind: 'breakdown', sev: 'trapped', src: 'call', text: 'Child stuck' }, 'PSALES');
  await page.evaluate(() => Notify.check()); await page.waitForTimeout(200);
  assert(await ev('App.critOpen.length') === 1 && await page.$('.critbar') && /I am on it/.test(await page.innerText('.critbar')), 'a red bar stays on every screen for the critical item');
  await page.evaluate(() => go('projects')); await page.waitForTimeout(100);
  assert(await page.$('.critbar'), '…also on other screens');
  await page.evaluate(() => Notify.check()); await page.evaluate(() => Notify.check());
  assert(await ev('App.notifyLog.filter(x => x.crit).length') === 3, 'it rings again at every check, even in quiet hours');
  await page.click('[data-a="critAck"]'); await page.waitForTimeout(150);
  await page.evaluate(() => Notify.check());
  assert(!(await page.$('.critbar')) && await ev('App.notifyLog.filter(x => x.crit).length') === 3, 'after "I am on it" it stops for this person');
  assert(await page.evaluate(() => { loginAs(S.users.PSALES); Notify.check({ silent: true }); return App.critOpen.length === 1; }), 'others who have not answered (Sales) still get it');
  await page.evaluate(() => Notify.save('quiet', false));

  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PSALES', 'project', { pid: P, tab: 'chat' }], ['POWNER', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); Notify.check({ silent: true }); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async P => { LANG = 'mr'; loginAs(S.users.PSALES); await perform('CHAT_POSTED', P, { text: 'x' }, { quiet: true }); go('done', { title: 'x', what: 'y', next: 'z' }); }, P); await page.waitForTimeout(100);
  await page.evaluate(async () => { const p = VoiceRec.open(); await new Promise(r => setTimeout(r, 300)); if (App.ovClose) App.ovClose(); return true; });
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('EXTRAS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
