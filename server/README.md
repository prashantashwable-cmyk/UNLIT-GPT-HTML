# AIEC company server (automatic sync, login codes, alerts, backups)

The company server is a locked mailbox. Phones lock (encrypt) every update before sending it, so the server never sees names, prices or photos. It decides only who may put into and take from each box:

- **Inbox:** every connected phone puts its own new records here. Only office phones (Head Quarter / Admin) can read it.
- **One box per person:** only office phones put into it. Only that person's phone can read it, and it gets exactly what that person's file would contain.
- **Removing a person:** removing them in the app deletes their box, and their phone stops at once.

The rules are still checked on every phone, as before. If the server is off, files and paste keep working.

## One-tap setup (easiest)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/prashantashwable-cmyk/UNLIT-GPT-HTML/tree/main/server)

Press the button, log in to Cloudflare (free, no card) and to GitHub, keep the name `aiec-server`, and press **Create and deploy**. Cloudflare copies the server into a repository in your own GitHub account and deploys it. When it finishes, it shows the address. Then do steps 3–5 below.

## Free setup from a phone: about 5 minutes, nothing to create by hand

This uses Cloudflare's free plan (Workers + one Durable Object with its own small database). There is no card, no database to create, no secret to type and no keys to make.

1. Make sure the **Cloudflare Workers and Pages** app on GitHub can see this repository: GitHub → Settings → Applications → Cloudflare → *Only select repositories* → `UNLIT-GPT-HTML`.
2. In Cloudflare go to **Workers & Pages → Create → Connect GitHub**, choose `UNLIT-GPT-HTML`, and fill in:
   - **Project name:** `aiec-server`.
   - **Production branch:** `main`.
   - **Root directory (path):** `server`. This field is under *Advanced settings* or *Build settings*.
   - **Build command:** leave empty. **Deploy command:** `npx wrangler deploy` (the default).
3. Press **Deploy**. When it finishes, it shows the address, like `https://aiec-server.<your-name>.workers.dev`. Open `<that address>/health`; it should show `"ok":true`.
4. On the Head Quarter phone: **Me → Company server**. Type the address and press **Turn on automatic sync**. Leave the secret empty.
   - The first office phone that does this claims the server for the company. Nobody else can claim it afterwards.
5. Still on that screen, press **Make the recovery code**. Write it on paper. Nightly locked backups start, and a new phone can restore the whole company with the server address and this code.

From then on, every change pushed to the repository is published to the server automatically.

**Free plan limits:** the free plan is plenty for a team of about 20–30 phones that use the app during the working day. If it ever runs short, Cloudflare stops requests for the rest of the day. It never charges unless you move to a paid plan yourself.

**Optional:** a setup secret can still be set (`npx wrangler secret put ADMIN_SECRET`). With a secret set, turning the server on, or listing backups without the recovery code, needs it.

## Second way: D1 database and R2 bucket (computer needed)

Use `wrangler-d1.toml` and `worker.mjs` (`npx wrangler deploy -c wrangler-d1.toml`). It needs a D1 database id written into the file and, for backups, an R2 bucket. Cloudflare asks for a card before it lets you create one. The steps below are for this way.

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
4. Make the storage for backups (free up to 10 GB):
   `npx wrangler r2 bucket create aiec-backup`
5. Make the tables:
   `npx wrangler d1 execute aiec-mailbox --remote --file=schema.sql`
6. Choose a long **setup secret** (at least 20 letters and numbers). Write it on paper and keep it safe. Then store it on Cloudflare:
   `npx wrangler secret put ADMIN_SECRET`
   It is never written in any file.
7. Make the keys for alerts (once) and store them on Cloudflare. The command prints the keys and the exact commands to run:
   `node vapid.mjs`
8. Put the server online:
   `npx wrangler deploy`
   It prints the server address, like `https://aiec-mailbox.<your-name>.workers.dev`.
   Later you can attach your own domain (for example `sync.allindiaelevators.in`) in the Cloudflare dashboard.
9. Check it: open `<server address>/health` in a browser. It should show `"ok":true` and `"push":true`.

If you set the server up before alerts, login codes and backups were added, run steps 4, 5 and 7 (they only add what is new), then `npx wrangler deploy`.

## Turn it on in the app

1. On the Head Quarter or Admin phone: **Me → Company server**.
2. Type the server address and the setup secret, then press **Turn on automatic sync**.
3. Send each person their file once (Users → send file). The file now also carries their connection, so from then on their phone syncs by itself.
4. Other office phones: send them the full office file once. They connect by themselves.

The status line shows ✅ synced (with the time), 📴 waiting for internet, ⚠️ server not reached, or ⛔ this phone was removed.

## A new phone without sending a file: login code

1. In the app: Users → the person → **Login code for a new phone**.
2. Type their mobile number and press **Make the code**.
3. Tell them the 6-digit code **on a phone call**.
4. On the new phone they choose **I have a login code from the office**, then type the server address, their mobile number and the code.

How the code is protected:
- **What the server keeps:** their data waits on the server locked with the code, so the server cannot read it.
- **One use only:** the code works once, for 2 days.
- **Wrong tries:** after 5 wrong tries it is deleted.
- **The server address is filled in for them** if they opened the company's join link or QR (made after the server was turned on).

## Alerts

- **Every connected phone asks to be woken.** It does this once notifications are allowed on that phone (Android app installed from the website, or iPhone 16.4+ with the app on the home screen).
- **An alert carries no text and no names.** It only shows "New work". The details load when the person opens the app with their PIN.
- **When phones are woken:**
  - an SOS or any safety incident report (hazard, injury, near miss) wakes the office phones at once;
  - other news wakes a phone at most once every 10 minutes.
- **Only real phone push services are called** (Google, Apple, Mozilla, Microsoft).

## Backups and the recovery code

- **Make the recovery code (Head Quarter only):** Me → Company server → **Make the recovery code**. Write the code on paper at once, and keep it with the setup secret, away from the office phones. It is shown only once.
- **Nightly backups:** from then on an office phone uploads a locked backup of the whole company (records and photos) once a day. The newest 7 are kept.
- **Who can open a backup:** nobody without the recovery code, not even the server or Cloudflare.
- **If every office phone is lost:** on a new phone, choose **Restore the company from backup** on the first screen. Type the server address, the setup secret and the recovery code. The whole company comes back, and the phone becomes an office phone on the server again.
- **Changing the code:** a new code is used from then on. Keep the old code too for older backups.

## Lift QR stickers report straight to the office

- **Print stickers after the server is on.** Stickers printed after the server is turned on (with an https address) carry the server address and the office's public lock key. Older stickers keep working with call, WhatsApp and SMS.
- **What the resident does:** after choosing the problem, the resident can press **Send to the office now**. The report (lift, problem, optional phone number) is locked on their phone, so only office phones can open it. The server cannot read it.
- **How fast the office hears:** "Lift stopped" wakes the office phones at once; other problems at most every 10 minutes.
- **Calling stays first:** the trapped-person button still calls the rescue number. A report is extra, never a replacement for a call.
- **On the office phone:** the reports appear on the home screen (**Resident reports**). One tap opens a ticket filled in, and the report then leaves the list on every office phone.
- **Limits:** one network can send at most 10 reports a minute.
- **Use your own domain before printing many stickers.** Moving the server later means reprinting them.

## Try it on a laptop first

`ADMIN_SECRET=choose-a-secret node local.mjs 8787`

This runs the same server at `http://127.0.0.1:8787`, keeping everything in memory, so it is lost when stopped. It is for testing only.

## Keep it safe

- The setup secret and the Cloudflare login belong to the company. Give a developer their own Cloudflare login that you can remove.
- **If every office phone is lost:** restore from the nightly backup with the recovery code (see Backups). Also keep a monthly full file from the office phone (Me → share data → full file) on the Head Quarter laptop, as a second copy outside the server.
- Messages older than 120 days are deleted from the server. The phones keep everything.

## Limits

- **Rules are checked on the phones.** The server only controls who may read or write each box; it does not check the business rules.
- **Alerts depend on the phone.** Android's battery saver can delay alerts, and phones without notification permission are not woken.
- **Login codes are told by phone call.** There is no SMS; the office tells the code on a call. This avoids SMS costs and the TRAI DLT registration that SMS needs.
- **Photos only reach a new phone from the last 120 days.** A new phone gets photos only from messages the server still keeps. Older photos stay on the office phones.

---

# AIEC कंपनी सर्व्हर (आपोआप सिंक, लॉगिन कोड, सूचना)

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

**नवीन फोनसाठी लॉगिन कोड:**
1. लोक → व्यक्ती → **नवीन फोनसाठी लॉगिन कोड** → मोबाइल नंबर टाका.
2. 6 अंकी कोड **फोन कॉलवर** सांगा.
3. तो कोड एकदाच आणि 2 दिवस चालतो. 5 चुकीच्या प्रयत्नांनंतर तो पुसला जातो.

**सूचना (अलर्ट):**
- `node vapid.mjs` चालवा आणि त्यात दिलेल्या आज्ञा चालवा.
- SOS किंवा कोणतीही सुरक्षा घटना (धोका, इजा) नोंदल्यास ऑफिस फोनला लगेच सूचना जाते.
- इतर बातमीची सूचना 10 मिनिटांत एकदाच येते.
- सूचनेत कोणतेही नाव किंवा माहिती नसते.

**बॅकअप आणि रिकव्हरी कोड:**
- `npx wrangler r2 bucket create aiec-backup` चालवा.
- हेड क्वार्टर: मी → कंपनी सर्व्हर → **रिकव्हरी कोड तयार करा**. कोड कागदावर लिहून सेटअप सीक्रेटसोबत सुरक्षित ठेवा. तो एकदाच दिसतो.
- दररोज संपूर्ण कंपनीचा कुलूपबंद बॅकअप सर्व्हरवर जातो. शेवटचे 7 ठेवले जातात.
- सर्व ऑफिस फोन हरवले तर: नवीन फोनवर पहिल्या स्क्रीनवर **बॅकअपमधून कंपनी परत आणा** निवडा. सर्व्हर पत्ता, सेटअप सीक्रेट आणि रिकव्हरी कोड टाका.

**लिफ्ट QR स्टिकरवरून थेट ऑफिसला:**
- सर्व्हर सुरू केल्यानंतर छापलेल्या स्टिकरवर रहिवासी **आत्ता ऑफिसला पाठवा** दाबू शकतो.
- अहवाल कुलूपबंद जातो; फक्त ऑफिस फोन तो उघडू शकतात.
- "लिफ्ट बंद" झाल्यास ऑफिसला लगेच सूचना जाते.
- ऑफिसच्या मुख्य स्क्रीनवर **रहिवाशांचे अहवाल** दिसतात. एका टॅपने तिकीट उघडते.
- अडकलेल्या व्यक्तीसाठी आधी कॉलच करायचा.
