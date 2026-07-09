import { decodeMrzFromLattices } from '../src/beam/mrz-beam';
import type { Lattice } from '../src/beam/lattice';
import { readFileSync } from 'node:fs';

const dump = JSON.parse(readFileSync('.staging/failing_lattices.json', 'utf8'));
const doc = dump['id_cards__td2_id03_clean__fabric.jpg'];
console.log('truth mrzLines:', doc.truth.mrzLines);

for (const model of ['v5-server', 'v6-small', 'v6-medium']) {
  const lines = doc.models[model];
  console.log(`\n=== ${model}: ${lines.length} line(s) ===`);
  if (lines.length === 0) continue;
  const lattices: Lattice[] = lines.map((l: { lattice: Lattice }) => l.lattice);
  const res = decodeMrzFromLattices(lattices, { trace: (m) => console.log('  trace:', m) });
  if (res) {
    console.log('  DECODED', res.format, res.lines);
    console.log('  parse DOB/expiry:', res.parse.fields.dateOfBirth, res.parse.fields.expiryDate);
    console.log('  ambiguities:', res.ambiguities.map((a) => `${a.kind}:${a.field}`));
    // Phantom signature: per-char raw posteriors of the winning path
    const flat = res.lines.join('');
    console.log('  weakest path chars:');
    // re-run decode internals unavailable — approximate: report lattice steps whose top1 is blank
    let blankTop = 0;
    for (const lat of lattices) for (const step of lat) if (step[0][0] === '') blankTop++;
    console.log(`  steps with blank top-1: ${blankTop} / ${lattices.reduce((s, l) => s + l.length, 0)}; decoded ${flat.length} chars`);
  } else {
    console.log('  REFUSED (null)');
  }
}
