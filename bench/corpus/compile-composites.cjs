/**
 * E2 PHOTO-CONTEXT COMPOSITOR — capture realism WITHOUT losing truth.
 *
 * Takes already-certified corpus documents and re-photographs them into
 * procedural real-world scenes (desk wood, fabric, dark table) with
 * perspective, vignette, hand shadow and ambient color cast. The document's
 * truth manifest carries over untouched — geometry is the only thing that
 * changed, and the engine is supposed to survive geometry.
 *
 * Usage: node bench/corpus/compile-composites.cjs [--quick]
 * Output: test_cases/composites/<family>__<file>__<scene>.jpg + manifest.json
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCENES = [
  {
    name: 'desk',
    bg: `repeating-linear-gradient(87deg,#8a6b4d 0 18px,#94755a 18px 44px,#856546 44px 61px)`,
    tilt: 'perspective(2000px) rotateX(9deg) rotateY(-4deg)',
    vignette: 0.35, cast: 'rgba(255,220,160,0.08)',
  },
  {
    name: 'fabric',
    bg: `radial-gradient(ellipse at 30% 20%, #3f4652, #262b33 70%)`,
    tilt: 'perspective(1800px) rotateX(-7deg) rotateY(6deg) rotate(4deg)',
    vignette: 0.5, cast: 'rgba(150,170,255,0.07)',
  },
  {
    name: 'lowlight',
    bg: `linear-gradient(160deg,#2b2620,#171310)`,
    tilt: 'perspective(2200px) rotateX(5deg) rotate(-6deg)',
    vignette: 0.65, cast: 'rgba(255,180,90,0.12)',
  },
];

/** Sample of certified families to composite (file → truth passthrough). */
const SOURCES = [
  { family: 'passports', dir: 'passports/synthetic', pick: /_clean\.png$/ },
  { family: 'id_cards', dir: 'id_cards/synthetic', pick: /_clean\.png$/ },
  { family: 'licenses', dir: 'licenses/synthetic', pick: /_clean\.png$/ },
  { family: 'docs', dir: 'docs/synthetic', pick: /^inv\d+_clean\.png$/ },
];

(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const OUT = path.join(root, 'test_cases', 'composites');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const manifest = [];

  for (const src of SOURCES) {
    const dir = path.join(root, 'test_cases', src.dir);
    const srcManifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const files = srcManifest.filter((e) => src.pick.test(e.file));
    const take = quick ? files.slice(0, 1) : files.slice(0, 4);
    for (const entry of take) {
      const imgB64 = fs.readFileSync(path.join(dir, entry.file)).toString('base64');
      const scenes = quick ? SCENES.slice(0, 1) : SCENES;
      for (const scene of scenes) {
        const outFile = `${src.family}__${entry.file.replace(/\.\w+$/, '')}__${scene.name}.jpg`;
        await page.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 1 });
        await page.setContent(`<!doctype html><html><body style="margin:0">
<div style="width:1500px;height:1100px;background:${scene.bg};display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
  <div style="transform:${scene.tilt};box-shadow:0 26px 60px rgba(0,0,0,.5)">
    <img src="data:image/png;base64,${imgB64}" style="display:block;max-width:1150px;max-height:820px"/>
  </div>
  <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${scene.vignette}) 100%)"></div>
  <div style="position:absolute;inset:0;pointer-events:none;background:${scene.cast}"></div>
  <div style="position:absolute;right:-60px;bottom:-80px;width:420px;height:520px;border-radius:45%;background:rgba(0,0,0,.28);filter:blur(38px);transform:rotate(-24deg)"></div>
</div></body></html>`, { waitUntil: 'load' });
        await page.screenshot({ path: path.join(OUT, outFile), type: 'jpeg', quality: 82 });
        manifest.push({
          file: outFile,
          class: `composite_${entry.class}`,
          degradation: `scene_${scene.name}`,
          sourceFamily: src.family,
          sourceFile: entry.file,
          truth: entry.truth,
          expect: entry.expect,
        });
        process.stdout.write(`✓ ${outFile}\n`);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`Composites: ${manifest.length} → ${OUT}`);
})();
