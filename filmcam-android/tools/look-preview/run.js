// Renders presets through the app's real shaders in headless Chromium (WebGL2 = GLSL ES 3.00).
//   python3 extract.py ../..            -> data.json (shaders + presets pulled from the Kotlin)
//   node run.js photo.jpg out '[{"name":"cine","cam":"cine800t","w":960,"h":540}]'
// Job fields: cam (preset id), w/h (working frame), optional targetW/targetH/targetRot/frameRot,
// mrt (use the camera variant of the develop pass), override (look fields to change).
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
(async () => {
  const [,, img, outDir, jobsJson] = process.argv;
  const DATA = JSON.parse(fs.readFileSync(__dirname + '/data.json'));
  const jobs = JSON.parse(jobsJson);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<html><body style="margin:0;background:#000"></body></html>');
  await page.addScriptTag({ content: fs.readFileSync(__dirname + '/page.js', 'utf8') });
  const mime = img.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const imgUrl = `data:${mime};base64,` + fs.readFileSync(img).toString('base64');
  let failed = 0;
  for (const job of jobs) {
    try {
      const r = await page.evaluate(async ([D, u, j]) => runFilm(D, u, j.cam, j), [DATA, imgUrl, job]);
      fs.writeFileSync(`${outDir}/${job.name}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
      console.log(job.name, r.err === 0 ? 'ok' : `glError ${r.err}`);
      if (r.err !== 0) failed++;
    } catch (e) { console.log(job.name, 'FAILED', e.message.slice(0, 2000)); failed++; }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
