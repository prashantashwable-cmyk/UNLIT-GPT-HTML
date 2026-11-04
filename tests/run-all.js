/* Runs every test one after another. Usage: npm test */
const { spawnSync } = require('child_process');
const path = require('path');
const files = ['practice-roles.test.js', 'voice-guide.test.js', 'install-gate.test.js', 'screen-scale.test.js', 'lead-to-handover.e2e.test.js', 'sync.test.js', 'permissions-denied.test.js', 'operations.test.js', 'escalation.test.js', 'notifications.test.js', 'home-fold.test.js', 'ladder.test.js', 'market.test.js', 'fairness.test.js', 'sync2.test.js', 'security.test.js', 'security2.test.js', 'partner.test.js', 'safety.test.js', 'privacy.test.js', 'statutory.test.js', 'quality.test.js', 'sales.test.js', 'sales2.test.js', 'material.test.js', 'tickets.test.js', 'office.test.js', 'reports.test.js', 'extras.test.js', 'finish.test.js', 'wake.test.js', 'smallteam.test.js', 'branches.test.js', 'checkin.test.js', 'mhandcust.test.js', 'supplierbills.test.js', 'recon.test.js', 'tracker.test.js', 'history.test.js', 'chatplan.test.js', 'hq.test.js', 'gate.test.js', 'server-sync.test.js', 'server-code.test.js', 'server-push.test.js', 'server-backup.test.js', 'server-report.test.js', 'server-free.test.js', 'server-request.test.js', 'joinflow.test.js', 'custlead.test.js', 'firstweek.test.js', 'waits.test.js', 'service.test.js', 'pinrecover.test.js', 'bars.test.js', 'statlead.test.js', 'discount.test.js', 'qcrecheck.test.js', 'safetysign.test.js', 'moneyline.test.js', 'replace.test.js', 'static.test.js', 'rulesagree.test.js', 'golden.test.js', 'snapshot.test.js', 'access.test.js', 'bizlogic.test.js', 'homeui.test.js', 'workers.test.js', 'maps.test.js', 'fieldev.test.js', 'easeuse.test.js', 'sitequality.test.js', 'custtrust.test.js', 'supply.test.js', 'growth.test.js', 'survey.test.js', 'liftlife.test.js', 'builder.test.js', 'money.test.js', 'salesfield.test.js', 'jobno.test.js', 'journeyA.test.js', 'journeyB.test.js', 'layout.test.js'];
/* --shard=2/4 runs every 4th file starting with the 2nd, so a pipeline can run parts side by side */
const sh = (process.argv.find(a => a.startsWith('--shard=')) || '').slice(8).split('/').map(Number);
const list = sh.length === 2 && sh[1] > 0 ? files.filter((f, i) => i % sh[1] === sh[0] - 1) : files;
let failed = 0;
for (const f of list) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
