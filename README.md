# AIEC Elevator OS

**ALL INDIA ELEVATORS COMPANY — lead-to-handover work manager**

One downloadable HTML file (`AIEC-Elevator-OS.html`) that runs on any Android phone or PC browser, **works without internet**, and guides every person through their next task with pictures, big buttons, audio and Marathi / Hindi / English.

![Screens](docs/screens.jpg)

---

## Quick start

| | |
|---|---|
| **मराठी** | `AIEC-Elevator-OS.html` फाइल फोनवर डाउनलोड करा → Chrome मध्ये उघडा → भाषा निवडा → **सराव मोड** दाबा (सर्व PIN `1111`) किंवा **नवीन कंपनी सेटअप** करा. मोठे बटण "माझे पुढचे काम सुरू करा" दाबा. 🔊 दाबून ऐका. |
| **हिंदी** | `AIEC-Elevator-OS.html` फ़ाइल फ़ोन पर डाउनलोड करें → Chrome में खोलें → भाषा चुनें → **अभ्यास मोड** दबाएँ (सभी PIN `1111`) या **नई कंपनी सेटअप** करें। बड़ा बटन "मेरा अगला काम शुरू करें" दबाएँ। 🔊 दबाकर सुनें। |
| **English** | Download `AIEC-Elevator-OS.html` → open it in Chrome → choose a language → tap **Practice mode** (every PIN is `1111`) or **New company setup**. Tap the big **Start My Next Task** button. Tap 🔊 to listen. |

**Real company use:** the Owner creates the company, then adds each person under **Me → People & roles**. Every person gets a role and a 4-digit PIN from the Owner/Admin — nobody can choose their own role.

**Install as an app (required for real use):** real company work only opens inside the installed app; opening the link in a normal browser tab shows an install screen (Practice mode still works there for demos). The installed app also asks the phone to keep its data permanently.

**Hosting:** host the repository on GitHub Pages (Settings → Pages → deploy from branch) and open the link in Chrome → **Add to Home screen**. The service worker (`sw.js`) then keeps the app working offline. Opening the HTML file directly also works; installation is only for convenience.

---

## What it does

### One project record, one state machine
Every lift job has one project ID (e.g. `AIEC-2610-K7Q`). Every action — a photo, a call, a quotation, a payment check, a signature — is saved as an **event** (who, role, when, what, reason, evidence). The project status is **rebuilt from those events**, so the home screen, task list, map, chat, timeline, documents and dashboards always show the same status. Nothing is silently edited: corrections create a new event and keep the old value.

### The complete lead-to-handover workflow
| Phase | Stage | Who acts |
|---|---|---|
| 📍 Lead | New site (photos + GPS + contact) | Field worker |
| | Check new lead → accept or send back with reason | Sales |
| 🤝 Sales | Call / WhatsApp, record outcome and follow-up date | Sales |
| | Lift needs (floors, capacity, door type, SS/MS, power) | Sales |
| | Quotation from pricing rules, versioned | Sales |
| | Approval when discount > limit or margin < floor | Owner / Admin (not the author) |
| | Send quotation, get decision (yes / lower price / later / no) | Sales |
| ✍️ Deal | Agreement prepared from approved quotation | Sales |
| | Agreement signed (customer, or in person with Sales as witness) | Customer / Sales |
| | Token payment recorded → **verified by Finance** | Sales → Finance |
| 🏗️ Site | Illustrated checklist: shaft, pit, 3-phase power, cleaning, light, barricades — photo for each | Customer / Sales |
| | Site inspection: measurements, checks, photos → Approved / Corrections / Visit again | QC |
| | Corrections with photo proof → re-inspection | Customer / Sales → QC |
| | Release drawings, assign supplier and technician | Admin / Owner |
| 🚚 Material | Packing checklist, seal number, vehicle, photos | Supplier |
| | Arrival: GPS, seal number seen, seal intact, condition, photos (mismatch = incident) | Technician / Supplier |
| | Arrival payment recorded → **verified by Finance** | Sales → Finance |
| | Material handover — **blocked until payment is verified and incidents are closed**; customer + technician sign | Technician |
| 🔧 Install | 12 SOP steps in order, photo/video for each, "I can't do this step" → blocker routed to the right role | Technician |
| | Final inspection: pass/fail checks; any fail → correction tasks → re-inspection | QC / Technician |
| 🔑 Handover | Final payment recorded → **verified by Finance** | Sales → Finance |
| | Signatures from customer, technician and QC | each person |
| | Handover certificate, warranty end date, AMC visit schedule | Admin / Owner / QC |

### After handover and around the workflow
| Part | What it does |
|---|---|
| 💬 WhatsApp messages | 7 ready messages (introduction, quotation, follow-up, payment reminder, site preparation, service visit, AMC renewal) in Marathi / Hindi / English. The app fills in the name, project number, amount and date, then opens WhatsApp. Every sent message is logged on the project, and Sales records "replied" or "no reply". Owner/Admin can change or add messages (**Me → WhatsApp messages**). |
| 🛠️ AMC service | Service visits are scheduled from the handover date. The technician does a 7-point check with a photo; any failed check creates a repair ticket automatically. The contract can be renewed for 1–3 years, which adds new visits. |
| 🎫 Problem tickets | The customer, Sales, a technician or the office reports a breakdown, complaint or request → the office assigns a person and a date → that person fixes it with a note and photo → the customer or office confirms, or reopens it. Overdue tickets are sent up to the Owner/Admin. |
| ⏫ Escalation ladder | Every waiting task is measured from the day it started. **Level 1** (after 1 day): the person sees ⏰ Reminder. **Level 2** (after 3 days): it goes to the Admin as "Work is stuck". **Level 3** (after 7 days, or when the office already acted twice and it is still stuck): it goes to the Owner. The ladder covers every stage, payments to check, work problems, security problems, unanswered questions, overdue follow-ups, tickets, service visits, renewals, technician pay and onboarding. **Me → Escalations** lists everything by level. The Owner/Admin records what they did: *I spoke to them*, *New date agreed* (up to 7 days), or *Give to another person* (the job or ticket moves and the clock restarts). Each action is saved in the record. All days are business rules. |
| 👥 Two-person approval | When switched on (Business rules → Control), risky actions need a second Owner/Admin: approving a quote below the margin floor, reversing a payment, closing a security problem, reopening a lost deal, making someone Owner/Admin, and changing technician pay. The person who asks cannot approve it. |
| 🪪 Automatic onboarding | When a person is added, onboarding starts by itself. Their checklist has the profile (phone, area, skills), the documents the office must check (ID and address, plus safety certificate for technicians and QC) and the training for their role. The person sees their steps and a progress bar on the home screen; the office gets a "Check new worker's documents" task. If a person is not ready after 7 days, it goes to the Admin; after 14 days, to the Owner. When every step is done they show as ✅ Ready for work. Directory with search and filters (role, availability, not complete). The app stores only checked / not checked for documents, never the document. |
| 🎓 Training | 5 short modules (app, safety, leads, installation, customers). Each has 3 spoken lessons and 3 picture-answer questions, and needs 2 of 3 right to pass. Optional rule: only technicians who have finished onboarding can be given a job. |
| 💰 Technician weekly pay | Pay is worked out from saved work: each installation step with proof, a bonus when the final inspection passes first time, and each service visit (amounts are a business rule). Owner/Admin approves each finished week (any change needs a reason). Finance pays and records the bank reference; the approver cannot pay. The technician sees every line and can ask a question. |
| 🏆 Good work board | Monthly points for quality work checked by another person: valid leads, deals won, inspections passed first time, installations within target days, and service visits. There are no points for speed alone. |
| 🙋 Ask for help | Type or speak a question. The app searches AIEC's own training, installation steps, site-preparation notes and common questions on the phone and reads the answer aloud. It is not an AI chatbot and works offline. |
| 🗺️ Address from GPS | With internet, the new-site screen suggests the address for the GPS point (OpenStreetMap Nominatim) in the chosen language. The person checks it before using it. |
| 📷 Reused photo check | A photo that is the same as, or nearly the same as, one used before is flagged ("Same photo used before") for a person to review. |

### Enforced role permissions
* Each event type has an allowed role list and allowed stages (see **Me → What can I do?**; Owner/Admin see the full matrix).
* Project-level access: a field worker sees only their sites, a supplier only their orders (no customer phone, no prices), a technician only assigned jobs (no margins), a customer only their own lift (no internal notes, approvals or margins).
* Separation of duties: the person who records a payment cannot confirm it; the author of a quotation cannot approve it.
* Payment gates: stages only move forward when **Finance** confirms a payment with a bank reference. A screenshot is never treated as proof.
* The **same check runs again** for every event loaded from another phone's file. Entries that break the rules are refused and listed under **Me → Refused entries**.

### Designed for people who find apps difficult
* One question per screen, "Step 2 of 5" and a progress bar.
* Big buttons (56–78 px) with a picture **and** a word; status always shows an icon and words, never colour alone.
* 🔊 on every screen reads it aloud in Marathi / Hindi / English (uses the phone's text-to-speech); optional auto-read.
* 🎤 lets people speak names, addresses and numbers instead of typing; "Read the number to me" confirms phone numbers.
* Work is saved automatically as a draft; ← never loses work.
* After every action: **What happened** and **What happens next** (and who will do it).
* Screen size 20%–150% (Me → Screen size) scales the whole page; below 60% a normal-size "↺ 100%" button stays on screen. Tested at 320 px width up to 150% with no sideways scrolling.
* Rider safety: lead capture and shift start begin with "Have you stopped in a safe place?" and are blocked if the phone reports movement.
* Practice mode with sample data for every role — separate from real data and never sends calls or messages.

### Evidence
Photos and 10-second videos are taken **only with the in-app camera** (no gallery upload). Each item keeps the original file, a unique ID, time, user, GPS (when available), device info and a SHA-256 fingerprint ("Check the photo is unchanged"). Simple automatic warnings (blurred, dark, no GPS, far from site) are shown as warnings only — a person decides.

### Sharing between phones (no server needed)
**Me → Share data with other phones**
* **Full company file** — for office phones (Owner/Admin).
* **File for one person** — only that person's projects; other people's PINs are removed so nobody else can log in on that phone.
* **Send my updates to office** — the office accepts only the work that person did themself.
Files can be sent by WhatsApp or email. Practice files and real files can never be mixed.

---

## Business rules that need Owner approval
These numbers come from the original brainstorm and are marked **"Proposed — not approved"** everywhere they appear until the Owner approves them in **Me → Business rules** (changing a number requires approval again):

| Rule | Default |
|---|---|
| Prices per component | sample numbers only — enter real costs |
| Margin: start / Sales discount limit / minimum without approval | 60% / 30% / 20% (margin = (price before tax − cost) ÷ price before tax) |
| Token payment | ₹10,000 |
| Payment milestones | 90% of total by material arrival, rest at handover |
| Installation target | 14 days from material handover (planning target, not a penalty) |
| Warranty / AMC visits / quotation validity | 12 months / 4 per year / 30 days |
| Duplicate-lead commission | 10% |

## Honest limits of this version
* **Offline, single file.** Roles are enforced by the app on every action and on every imported file, but there is no company server: data files are not digitally signed, so share them only with trusted staff. A server with signed sync is the recommended next step for full security.
* **Not connected:** payment gateway, bank/EMI partner, WhatsApp delivery and read reports (they need the WhatsApp Business API on a company server; the app opens WhatsApp and records what the person sent), container GPS tracker, motion sensors, CCTV, digital locks. The app never claims they exist; it records what people did and asks Finance to verify money from the bank.
* **No AI decisions.** Automatic checks are simple rules and only warn.
* **Templates:** QC checklists, the 12 installation steps, the agreement text and the handover/NOC text are templates. They must be approved by a qualified lift engineer (Maharashtra Lifts Act and rules) and a lawyer before real use. The app does not issue statutory licences.
* Address from GPS needs internet (OpenStreetMap Nominatim); offline the user types or speaks a landmark.
* Not yet built (later phases of the spec): EMI, hardware (GPS trackers, sensors, CCTV, digital locks), server sync.
* The training lessons, quiz answers and pay amounts are starting templates. The Owner must check them with a qualified lift engineer and with labour and accounting rules.
* Personal data stays on the phone until deleted. The Owner must set a keep-and-delete policy that follows the Digital Personal Data Protection Act, 2023.

---

## Files
| File | Purpose |
|---|---|
| `AIEC-Elevator-OS.html` | **The whole app** — download and open this file |
| `index.html` | Redirects to the app (for web hosting) |
| `manifest.webmanifest`, `sw.js`, `icon*.png`, `icon.svg` | "Add to Home screen" and offline support when hosted over https |
| `tests/` | Automated browser tests |

## For developers
* No build step and no external libraries: HTML, CSS and plain JavaScript in one file. Data is stored in IndexedDB (falls back to localStorage, then memory with a warning).
* Key parts inside the script: `L` (all words in 3 languages), `RULES` + `validate()` (permissions and stage guards), `apply()` (event → state), `needs()` (who must act next), `WIZ` (step-by-step task screens), `SCREENS`.
* Run the tests (Chromium via Playwright):
  ```bash
  npm install
  npx playwright install chromium
  npm test
  ```
  The suite covers: practice data for all 10 sample users; a full real-mode lead-to-handover run through the UI with 9 roles, including rejected quotation, QC corrections, a blocker, a failed final inspection and three verified payments; permission refusals and forged imports; phone-to-phone file sharing; WhatsApp templates, AMC visits and tickets, automatic onboarding, the escalation ladder and office actions, two-person approval, training, weekly pay, helper, address lookup and reused photos; camera/location denied; and every screen at 320 px with Extra-large text in Marathi and Hindi (no overflow, no missing words, no errors).
