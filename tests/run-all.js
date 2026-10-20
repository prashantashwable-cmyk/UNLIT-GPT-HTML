/* Runs every test one after another. Usage: npm test */
const { spawnSync } = require('child_process');
const path = require('path');
const files = ['practice-roles.test.js', 'voice-guide.test.js', 'install-gate.test.js', 'screen-scale.test.js', 'lead-to-handover.e2e.test.js', 'sync.test.js', 'permissions-denied.test.js', 'layout.test.js'];
let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
