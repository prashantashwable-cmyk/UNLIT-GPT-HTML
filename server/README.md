# AIEC company server (stage 1: automatic sync)

The company server is a locked mailbox. Phones lock (encrypt) every update before sending it, so the server never sees names, prices or photos. It decides only who may put into and take from each box:

- **Inbox:** every connected phone puts its own new records here. Only office phones (Head Quarter / Admin) can read it.
- **One box per person:** only office phones put into it. Only that person's phone can read it, and it gets exactly what that person's file would contain.
- **Removing a person:** removing them in the app deletes their box, and their phone stops at once.

The rules are still checked on every phone, as before. If the server is off, files and paste keep working.

## What you need

- A Cloudflare account in the company's name, with two-step login turned on. Free plan is enough to start.
- A computer with Node.js 18 or newer, for the one-time setup.
- 15 minutes.

## Setup (one time)

1. Open a terminal in this `server` folder.
2. Log in to Cloudflare:
   `npx wrangler login`
3. Make the database:
   `npx wrangler d1 create aiec-mailbox`
   Copy the `database_id` it prints into `wrangler.toml` (replace `PASTE-YOUR-DATABASE-ID-HERE`).
4. Make the tables:
   `npx wrangler d1 execute aiec-mailbox --remote --file=schema.sql`
5. Choose a long **setup secret** (at least 20 letters and numbers). Write it on paper and keep it safe. Then store it on Cloudflare:
   `npx wrangler secret put ADMIN_SECRET`
   It is never written in any file.
6. Put the server online:
   `npx wrangler deploy`
   It prints the server address, like `https://aiec-mailbox.<your-name>.workers.dev`.
   Later you can attach your own domain (for example `sync.allindiaelevators.in`) in the Cloudflare dashboard.
7. Check it: open `<server address>/health` in a browser. It should show `"ok":true`.

## Turn it on in the app

1. On the Head Quarter or Admin phone: **Me → Company server**.
2. Type the server address and the setup secret, then press **Turn on automatic sync**.
3. Send each person their file once (Users → send file). The file now also carries their connection, so from then on their phone syncs by itself.
4. Other office phones: send them the full office file once. They connect by themselves.

The status line shows ✅ synced (with the time), 📴 waiting for internet, ⚠️ server not reached, or ⛔ this phone was removed.

## Try it on a laptop first

`ADMIN_SECRET=choose-a-secret node local.mjs 8787`

This runs the same server at `http://127.0.0.1:8787`, keeping everything in memory, so it is lost when stopped. It is for testing only.

## Keep it safe

- The setup secret and the Cloudflare login belong to the company. Give a developer their own Cloudflare login that you can remove.
- **If every office phone is lost:**
  - The company key is gone with them, so nobody can open the locked messages on the server.
  - Keep a monthly backup file from the office phone (Me → share data → full file) on the Head Quarter laptop.
  - To start again, load that file on a new office phone, then turn the server on again with the setup secret.
- Messages older than 120 days are deleted from the server. The phones keep everything.

## Limits of stage 1

- **Rules are checked on the phones.** The server only controls who may read or write each box; it does not check the business rules.
- **Each phone must open the app to sync.** Alerts that wake a closed app come in stage 3.
- **A new phone still needs its file once.** Login by SMS code comes in stage 2.

---

# AIEC कंपनी सर्व्हर (टप्पा 1: आपोआप सिंक)

कंपनी सर्व्हर हा कुलूपबंद पेटीसारखा आहे. प्रत्येक फोन अपडेट पाठवण्यापूर्वी त्याला कुलूप (एन्क्रिप्ट) लावतो. त्यामुळे सर्व्हरला नावे, किमती किंवा फोटो दिसत नाहीत. कोण कोणत्या पेटीत टाकू आणि घेऊ शकतो, एवढेच सर्व्हर ठरवतो.

**लागणारे:**
- कंपनीच्या नावाने Cloudflare खाते (दोन-टप्प्यांचे लॉगिन सुरू);
- Node.js असलेला संगणक;
- 15 मिनिटे.

**पायऱ्या:**
1. `npx wrangler login`
2. `npx wrangler d1 create aiec-mailbox`. येणारा `database_id` `wrangler.toml` मध्ये टाका.
3. `npx wrangler d1 execute aiec-mailbox --remote --file=schema.sql`
4. लांब **सेटअप सीक्रेट** निवडा, कागदावर लिहून सुरक्षित ठेवा, आणि `npx wrangler secret put ADMIN_SECRET`.
5. `npx wrangler deploy`. येणारा सर्व्हर पत्ता लिहून ठेवा.
6. ॲपमध्ये: **मी → कंपनी सर्व्हर**. पत्ता आणि सीक्रेट टाकून **आपोआप सिंक सुरू करा** दाबा.
7. प्रत्येकाला एकदा त्यांची फाइल पाठवा. त्यानंतर त्यांचा फोन आपोआप सिंक होईल.

**महत्त्वाचे:**
- सीक्रेट आणि Cloudflare लॉगिन कंपनीचे आहेत.
- दर महिन्याला ऑफिस फोनची पूर्ण फाइल हेड क्वार्टरच्या लॅपटॉपवर ठेवा.
