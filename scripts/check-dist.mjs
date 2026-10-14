// Fails if a production build would publish private source material (run after `vite build`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dir = process.argv[2] || 'dist';
const bad = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : check(p); } };
function check(p) {
  const rel = relative(dir, p).split(sep).join('/');
  if (/^sources\//.test(rel) || /^textures\/(oct10\/|overlay_)/.test(rel) || /source_comparison|kiros_meta_oct10/.test(rel)) bad.push(`${rel}: dev-only data`);
  if (/\.(js|html|json|css)$/.test(rel)) {
    const t = readFileSync(p, 'utf8');
    for (const [re, what] of [[/drive\.google\.com|docs\.google\.com/, 'Google Drive/Docs link'], [/kiros-workshop|mountWorkshop/, 'workshop module']]) if (re.test(t)) bad.push(`${rel}: ${what}`);
  }
  if (/\.(jpe?g)$/.test(rel) && /^assets\//.test(rel)) bad.push(`${rel}: bundled image (workshop thumbnail?)`);
}
walk(dir);
if (bad.length) { console.error('Private material in the build:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`check-dist: ${dir} is clean`);
