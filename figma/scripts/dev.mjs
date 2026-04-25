import { watch } from 'fs';
import { exec } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let building = false;
let queued = false;

function build() {
  if (building) { queued = true; return; }
  building = true;
  const t = Date.now();
  process.stdout.write('[dev] building...\n');
  exec('npm run build', { cwd: root }, (err, _stdout, stderr) => {
    building = false;
    if (err) {
      process.stderr.write(`[dev] build failed:\n${stderr}\n`);
    } else {
      process.stdout.write(`[dev] done in ${Date.now() - t}ms\n`);
    }
    if (queued) { queued = false; build(); }
  });
}

build();

watch(resolve(root, 'src'), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  process.stdout.write(`[dev] changed: ${filename}\n`);
  build();
});

process.stdout.write(`[dev] watching src/ — close plugin & reopen in Figma after each build\n`);
