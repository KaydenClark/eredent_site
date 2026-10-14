// Capture real footage of the Kiros site, frame-stepped, for the explainer.
// Usage: node explainer/capture.mjs <site-url> [shot ...]
// Runs a visible Chromium window so WebGL uses the real GPU (headless would render in software).
// Stops the page's own animation loop and advances frames with kiros.tick, so every frame is exactly 1/30 s apart.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const PLAYWRIGHT_FROM = process.env.PLAYWRIGHT_FROM || 'E:/GPT_OS/downloads/agent-tools/spector.js/mcp/package.json';
const { chromium } = createRequire(PLAYWRIGHT_FROM)('playwright');

const url = process.argv[2];
if (!url) { console.error('usage: node explainer/capture.mjs <site-url> [shot ...]'); process.exit(2); }
const OUT = path.resolve('explainer/out/footage');
const DT = 1 / 30;

// Each shot: a setup run once in the page, then `frames` frames with a per-frame step.
const SHOTS = {
  orbit: { frames: 150, setup: `await kiros.goPlace('orbit'); kiros.tick(240, ${DT});`,
    step: `kiros.rig.t.lon -= 0.25;` },
  descent: { frames: 210, setup: `await kiros.goPlace('orbit'); kiros.tick(240, ${DT}); kiros.rig.flyTo(46, -28, 420e3, 0, null);`,
    step: `` },
  north: { frames: 150, setup: `await kiros.goPlace('north'); kiros.tick(300, ${DT});`,
    step: `kiros.rig.t.lon += 0.025; kiros.rig.t.alt *= 0.999;` },
  forest: { frames: 150, setup: `kiros.applyLook('noon'); await kiros.goPlace('s-forest'); kiros.tick(600, ${DT});`,
    step: `kiros.rig.nav.heading -= 0.08;` },
};

const wanted = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(SHOTS);
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--window-size=980,640'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
await page.goto(url.replace(/\/?$/, '/') + '?nowelcome');
// The dev server reloads the page whenever a source file changes (other sessions may be editing), which wipes the
// page state. So every shot re-checks the page is ready and retries from its setup if a reload hit mid-shot.
async function ready() {
  await page.waitForFunction(() => typeof window.kiros?.tick === 'function' && !!window.kiros.goPlace, null, { timeout: 90000 });
  await page.evaluate(() => {
    if (window.__captureReady) return;
    const st = document.createElement('style');
    st.textContent = 'body *{visibility:hidden!important} canvas#view{visibility:visible!important}';
    document.head.append(st);
    kiros.renderer.setAnimationLoop(null); kiros.tick(30, 1 / 30);
    window.__captureReady = true;
  });
}

for (const name of wanted) {
  const shot = SHOTS[name]; if (!shot) { console.error('unknown shot', name); continue; }
  const dir = path.join(OUT, name);
  for (let attempt = 1; ; attempt++) {
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    try {
      await ready();
      await page.evaluate(`(async () => { ${shot.setup} })()`);
      const t0 = Date.now();
      for (let i = 0; i < shot.frames; i++) {
        await page.evaluate(`if (!window.__captureReady) throw new Error('page reloaded'); ${shot.step} kiros.tick(1, ${DT});`);
        await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
      }
      const view = await page.evaluate(() => kiros.rig.view);
      console.log(`${name}: ${shot.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s (attempt ${attempt}), ends at`, JSON.stringify(view));
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.error(`${name}: attempt ${attempt} failed (${e.message.split(/\r?\n/)[0]}); retrying`);
      await page.waitForTimeout(3000);
    }
  }
}
await browser.close();
