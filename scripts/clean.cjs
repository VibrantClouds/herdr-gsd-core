const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === '.git') continue;
    if (e.isDirectory()) {
      if (e.name === 'dist') fs.rmSync(p, { recursive: true, force: true });
      else walk(p);
    } else if (e.name.endsWith('.tsbuildinfo')) fs.rmSync(p, { force: true });
  }
}
walk(root);
