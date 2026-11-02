# AIEC Elevator OS — Android app

The Android app is the same AIEC Elevator OS, opened full screen inside the phone app. Every update pushed to GitHub reaches every phone by itself; a new APK is needed only when this `android/` folder changes.

What the Android app adds to the web app:
- camera, microphone and GPS permissions (asked the first time they are needed);
- phone, WhatsApp, SMS, e-mail and Google Maps links open in their own apps;
- backup and company files are saved to **Downloads**; "Open file" works;
- **Print** makes a PDF (quotes, certificates, safety logs);
- the back button goes back inside the app (press twice on the first page to close);
- full screen, Marathi / Hindi / English messages, a retry screen when there is no internet on the very first open.

## 1. Get the APK (no computer setup needed)
1. Open the repository on GitHub → **Actions** → **android**.
2. Open the newest green run → at the bottom, **Artifacts** → **AIEC-Elevator-OS-apk** → download.
3. Unzip it: inside are `AIEC-Elevator-OS.apk` and `INSTALL.txt`.
4. To build again at any time: **Actions → android → Run workflow**.

## 2. Install it on a phone
1. Send the APK to the phone (WhatsApp to yourself, Google Drive or a cable).
2. Open it. Android asks to allow "Install unknown apps" for that app → allow → **Install**.
3. Open **AIEC Elevator OS**. Allow Camera, Location and Microphone when asked.

### If it says "App not installed"
1. **An older AIEC app is already on the phone** (the usual cause). Builds before number 4 were each signed with a different
   key, so Android refuses to replace them. Uninstall the old one once: **Settings → Apps → AIEC Elevator OS → Uninstall**,
   then install again. From now on every build is signed with the same key (`aiec-test.jks`) and installs over the last one.
2. **The .zip was opened instead of the .apk.** Unzip first, then tap `AIEC-Elevator-OS.apk`.
3. **Play Protect blocked it** → **More details → Install anyway**.
4. **The download was cut off or the phone is full** → download again; keep at least 100 MB free.
5. A Play Store copy and a GitHub copy cannot replace each other (different keys): uninstall one before installing the other.

This APK is for testing and for giving to your own team. Its key `android/aiec-test.jks` (password `aiectest`) is public
in this repository on purpose — never use it for the Play Store. For the Play Store use step 3.

## 3. Play Store (signed)
1. Make your company signing key once (keep it safe — losing it means you can never update the app):
   `keytool -genkeypair -v -keystore aiec.jks -alias aiec -keyalg RSA -keysize 2048 -validity 10000`
2. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `AIEC_KEYSTORE_B64` = the file made Base64 (`base64 -w0 aiec.jks`)
   - `AIEC_KEYSTORE_PASSWORD`, `AIEC_KEY_ALIAS` (`aiec`), `AIEC_KEY_PASSWORD`
3. Run **Actions → android → Run workflow**. Download **AIEC-Elevator-OS-playstore** → upload the `.aab` file in Google Play Console (one-time $25 developer account).
4. Package name (permanent): `com.allindiaelevators.os`.

## 4. Open in Android Studio (optional)
**File → Open** → choose this `android` folder → wait for Gradle → **Build → Build APK(s)**.

## Honest limits (need native work later)
- Alarms (trapped person, escalations) still ring only while the app is open or recently used. Ringing a closed phone needs Firebase Cloud Messaging plus the company server sending pushes.
- Screenshots are not blocked yet (`FLAG_SECURE`); the web app's name watermark still applies for outside companies.
- The very first open needs the internet; after that the app works offline as before.
- Each build's number is the GitHub run number (shown as version `1.0.N` in Settings → Apps).
