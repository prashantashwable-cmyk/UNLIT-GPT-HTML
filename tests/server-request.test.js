/* Join requests on the company server: anyone may drop a locked request in (limited per network), only office phones
   read them, and only an office phone may set the public key the requests are locked with. */
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { handle, memoryStore, sha256hex } = await import('../server/core.mjs');
  const store = memoryStore(), env = {}, tok = 'o'.repeat(40), per = 'p'.repeat(40);
  const call = (method, path, body, headers = {}) => handle(new Request('http://x' + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: body ? JSON.stringify(body) : undefined }), env, store);
  const key = 'B' + 'a'.repeat(86);
  assert((await call('GET', '/pubkey')).status === 404, 'before the office sets it up there is no public key');
  assert((await call('POST', '/request', { blob: 'abc.def.ghi' })).status === 404, 'requests are refused until the office is ready');
  assert((await call('POST', '/setup', { officeHash: await sha256hex(tok) })).status === 200, 'the office claims the server');
  assert((await call('PUT', '/pubkey', { key })).status === 401, 'nobody else may set the public key');
  await call('PUT', '/box/U1', { hash: await sha256hex(per) }, { Authorization: 'Bearer ' + tok });
  assert((await call('PUT', '/pubkey', { key }, { Authorization: 'Bearer ' + per, 'X-Box': 'U1' })).status === 403, 'a person\'s phone may not set it either');
  assert((await call('PUT', '/pubkey', { key: 'short' }, { Authorization: 'Bearer ' + tok })).status === 400, 'a wrong key is refused');
  assert((await call('PUT', '/pubkey', { key }, { Authorization: 'Bearer ' + tok })).status === 200, 'the office sets its public key');
  assert((await (await call('GET', '/pubkey')).json()).key === key, 'anyone can fetch the public key');
  assert((await call('PUT', '/box/requests', { hash: await sha256hex(per) }, { Authorization: 'Bearer ' + tok })).status === 400, 'no person box can be called "requests"');

  assert((await call('POST', '/request', { blob: 'x'.repeat(401 * 1024) }, { 'X-Forwarded-For': '1.1.1.1' })).status === 413, 'a request over 400 KB is refused');
  assert((await call('POST', '/request', { blob: 'not allowed!' }, { 'X-Forwarded-For': '1.1.1.1' })).status === 413, 'a request that is not a locked blob is refused');
  const ok = await call('POST', '/request', { blob: 'abc.def.ghi' }, { 'X-Forwarded-For': '2.2.2.2' });
  assert(ok.status === 200 && store.msgs.some(m => m.box === 'requests'), 'a new person\'s locked request is kept');
  let last; for (let i = 0; i < 6; i++) last = await call('POST', '/request', { blob: 'abc.def.ghi' }, { 'X-Forwarded-For': '3.3.3.3' });
  assert(last.status === 429, 'one network cannot flood the office with requests');

  assert((await call('GET', '/recv/requests')).status === 401, 'a stranger cannot read requests');
  assert((await call('GET', '/recv/requests', null, { Authorization: 'Bearer ' + per, 'X-Box': 'U1' })).status === 403, 'a person\'s phone cannot read requests');
  const r = await (await call('GET', '/recv/requests', null, { Authorization: 'Bearer ' + tok })).json();
  assert(r.msgs.length >= 2, 'the office reads them');
  console.log('SERVER REQUEST PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
