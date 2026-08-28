#!/usr/bin/env node
// TPHYS(JS) <-> transient.py(Python) parity runner (audit D1 P0-3).
// usage: node tphys_parity.mjs <input.json> <output.json>
// input:  {"body": <trackPayload>, "ctx": {rc:{...}, kw:{...}}}
// output: {status, finished, traceLen, steps, summary, warnings}
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = process.env.TPHYS_HTML || path.join(__dirname, 'dwb-pro-allinone.html');
const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('usage: node tphys_parity.mjs <in.json> <out.json>'); process.exit(2); }

const html = fs.readFileSync(htmlPath, 'utf8');
const marker = 'const TPHYS = (function(){';
const start = html.indexOf(marker);
if (start < 0) { console.error('TPHYS closure not found'); process.exit(2); }
let end = html.indexOf('\n})();', start);
if (end < 0) { console.error('TPHYS close not found'); process.exit(2); }
end += '\n})();'.length;
const src = html.slice(start, end);

const sandbox = { console: console, Math: Math, JSON: JSON, isFinite: isFinite, NaN: NaN, Infinity: Infinity, Number: Number };
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.__TPHYS = TPHYS;', sandbox);
const TPHYS = sandbox.__TPHYS;

const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const res = TPHYS.run(input.body, input.ctx);
const out = {
  status: res.status,
  finished: !!res.finished,
  traceLen: (res.trace || []).length,
  steps: res.steps || 0,
  summary: res.summary || {},
  warnings: res.warnings || []
};
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('TPHYS ok: ' + JSON.stringify(out.summary));
