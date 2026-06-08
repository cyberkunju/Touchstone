const fs = require('fs');
const t = fs.readFileSync('test_screenshots/batch_report.txt', 'utf8');
const lines = t.split(/\r?\n/);
let cur = '';
for (const l of lines) {
  const m = l.match(/\[(\d+)\/20\] (.+?) ===/);
  if (m) { cur = `${m[1]}:${m[2]}`; console.log('\n=== ' + cur); continue; }
  const f = l.match(/\[(Confirmed|Invalid)\] (.+)/);
  if (f) console.log('   [' + f[1] + '] ' + f[2]);
}
