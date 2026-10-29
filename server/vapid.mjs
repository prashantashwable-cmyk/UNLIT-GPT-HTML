/* Make the keys for push alerts (once):  node vapid.mjs
   Then store them on Cloudflare with the commands it prints. The private key is shown once; it is never written to a file. */
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)), jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log('VAPID_PUBLIC  = ' + b64u(raw));
console.log('VAPID_PRIVATE = ' + jwk.d);
console.log('\nRun these and paste each value when asked:\n  npx wrangler secret put VAPID_PUBLIC\n  npx wrangler secret put VAPID_PRIVATE\n  npx wrangler secret put VAPID_SUBJECT   (for example mailto:office@yourcompany.in)');
