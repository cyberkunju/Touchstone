import { decodeMrzFromLattices } from '../src/beam/mrz-beam';
import type { Lattice } from '../src/beam/lattice';

const TD3_L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const TD3_L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

function sep(): Lattice[number] { return [['', 0.92]]; }
function cleanLat(line: string): Lattice {
  const out: Lattice = [];
  for (const ch of line) { out.push([[ch, 0.96], ['', 0.04]]); out.push(sep()); }
  return out;
}

for (let weakCount = 0; weakCount <= 5; weakCount++) {
  const lat = cleanLat(TD3_L2);
  for (let pos = 13; pos < 13 + weakCount; pos++) {
    const truth = TD3_L2[pos];
    lat[2 * pos] = [['', 0.55], [truth, 0.25], [truth === '8' ? '1' : '8', 0.2]];
  }
  const res = decodeMrzFromLattices([cleanLat(TD3_L1), lat]);
  console.log(`weak=${weakCount}: ${res ? 'DECODED ambiguities=' + JSON.stringify(res.ambiguities.map(a => a.kind + ':' + a.field)) : 'NULL'}`);
}
