/**
 * Generates a deterministic, ICAO-valid synthetic passport specimen image
 * (the 9303 ERIKSSON specimen — no real PII, all check digits correct) into
 * passport_images/_specimen_icao.png. Permanent positive-path gate asset:
 * a legible, compliant MRZ that the beam decoder MUST decode via checksums.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const esc = (s) => s.replace(/</g, '&lt;');

const html = `<!doctype html><html><body style="margin:0">
<div style="width:1400px;height:980px;background:#f4efe6;font-family:Arial;position:relative">
  <div style="padding:28px 40px;font-size:30px;font-weight:bold;letter-spacing:2px">UTOPIA &nbsp; PASSPORT</div>
  <div style="position:absolute;left:40px;top:110px;width:300px;height:380px;background:#c9c2b4;border:2px solid #999"></div>
  <div style="position:absolute;left:380px;top:110px;font-size:24px;line-height:2.1">
    <div><span style="color:#555">Type</span>&nbsp;&nbsp;P&nbsp;&nbsp;&nbsp;<span style="color:#555">Country Code</span>&nbsp;&nbsp;UTO&nbsp;&nbsp;&nbsp;<span style="color:#555">Passport No</span>&nbsp;&nbsp;L898902C3</div>
    <div><span style="color:#555">Surname</span>&nbsp;&nbsp;ERIKSSON</div>
    <div><span style="color:#555">Given Names</span>&nbsp;&nbsp;ANNA MARIA</div>
    <div><span style="color:#555">Nationality</span>&nbsp;&nbsp;UTOPIAN</div>
    <div><span style="color:#555">Date of Birth</span>&nbsp;&nbsp;12/08/1974&nbsp;&nbsp;&nbsp;<span style="color:#555">Sex</span>&nbsp;&nbsp;F</div>
    <div><span style="color:#555">Date of Expiry</span>&nbsp;&nbsp;15/04/2012</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:26px;padding:0 44px;font-family:'Lucida Console','Courier New',monospace;font-size:36px;letter-spacing:0;white-space:pre;line-height:1.7">${esc(L1)}
${esc(L2)}</div>
</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 980, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const out = path.join(__dirname, '..', 'passport_images', '_specimen_icao.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1400, height: 980 } });
  await browser.close();
  console.log('specimen written:', out);
})();
