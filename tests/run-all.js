/* Runs every test one after another. Usage: npm test */
const { spawnSync } = require('child_process');
const path = require('path');
const files = ['practice-roles.test.js', 'voice-guide.test.js', 'install-gate.test.js', 'screen-scale.test.js', 'lead-to-handover.e2e.test.js', 'sync.test.js', 'permissions-denied.test.js', 'operations.test.js', 'escalation.test.js', 'notifications.test.js', 'home-fold.test.js', 'ladder.test.js', 'market.test.js', 'fairness.test.js', 'sync2.test.js', 'security.test.js', 'security2.test.js', 'partner.test.js', 'safety.test.js', 'privacy.test.js', 'statutory.test.js', 'quality.test.js', 'sales.test.js', 'sales2.test.js', 'material.test.js', 'tickets.test.js', 'office.test.js', 'reports.test.js', 'extras.test.js', 'finish.test.js', 'wake.test.js', 'smallteam.test.js', 'branches.test.js', 'checkin.test.js', 'mhandcust.test.js', 'supplierbills.test.js', 'recon.test.js', 'tracker.test.js', 'history.test.js', 'chatplan.test.js', 'hq.test.js', 'gate.test.js', 'server-sync.test.js', 'server-code.test.js', 'server-push.test.js', 'server-backup.test.js', 'server-report.test.js', 'server-free.test.js', 'server-request.test.js', 'joinflow.test.js', 'custlead.test.js', 'firstweek.test.js', 'waits.test.js', 'layout.test.js'];
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
