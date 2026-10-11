import './style.css';
import { assemble, type Program } from './emu/assembler';
import { CF, DF, IF, Machine, OF, PF, SF, TF, ZF, AF } from './emu/cpu';
import template from './examples/template.asm?raw';
import ex1 from './examples/somma-sottrazione.asm?raw';
import ex2 from './examples/input-moltiplicazione.asm?raw';
import ex3 from './examples/scan-print-num.asm?raw';
import ex4 from './examples/memoria-diretta.asm?raw';

const EXAMPLES: [string, string][] = [
  ['Template vuoto', template],
  ['Somma e sottrazione', ex1],
  ['Input e moltiplicazione', ex2],
  ['scan_num / print_num', ex3],
  ['Accesso diretto alla memoria', ex4],
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const code = $<HTMLTextAreaElement>('code');
const backdrop = $('backdrop');
const gutter = $('gutter');
const messages = $('messages');
const consoleEl = $('console');
const statusEl = $('status');
const hint = $('input-hint');
const speed = $<HTMLInputElement>('speed');

let program: Program | null = null;
let machine: Machine | null = null;
let timer: number | null = null;
let errorLines = new Map<number, string>();
const breakpoints = new Set<number>();
let prevRegs = new Uint16Array(8);
let prevSegs = new Uint16Array(4);
let prevIp = 0;
let prevFlags = 0;
let prevMem = new Uint8Array(256);

const STORE = 'assembl-easy:code';
try {
  code.value = localStorage.getItem(STORE) ?? template;
} catch {
  code.value = template;
}

// ---------- editor ----------
function lineCount() {
  return code.value.split('\n').length;
}

function renderEditor() {
  const n = lineCount();
  const cur = machine && machine.status !== 'halted' && machine.status !== 'error' ? machine.currentLine : null;
  let g = '';
  let b = '';
  for (let i = 1; i <= n; i++) {
    const cls = ['gl'];
    if (breakpoints.has(i)) cls.push('bp');
    if (errorLines.has(i)) cls.push('err');
    g += `<div class="${cls.join(' ')}" data-line="${i}">${i}</div>`;
    const bc = ['bl'];
    if (errorLines.has(i)) bc.push('err');
    if (cur === i) bc.push('cur');
    if (breakpoints.has(i)) bc.push('bpl');
    b += `<div class="${bc.join(' ')}"${errorLines.has(i) ? ` title="${esc(errorLines.get(i)!)}"` : ''}>&nbsp;</div>`;
  }
  gutter.innerHTML = g;
  backdrop.innerHTML = b;
  syncScroll();
}

function syncScroll() {
  gutter.scrollTop = code.scrollTop;
  backdrop.scrollTop = code.scrollTop;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

code.addEventListener('scroll', syncScroll);
code.addEventListener('input', () => {
  try {
    localStorage.setItem(STORE, code.value);
  } catch {
    /* modalità privata */
  }
  // il sorgente è cambiato: l'esecuzione corrente non è più valida
  stopRun();
  machine = null;
  program = null;
  errorLines = new Map();
  messages.innerHTML = '';
  setStatus('Modificato', 'idle');
  renderEditor();
  renderState();
});
code.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = code.selectionStart;
    code.setRangeText('    ', s, code.selectionEnd, 'end');
    code.dispatchEvent(new Event('input'));
  }
});
gutter.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
  if (!el) return;
  const ln = Number(el.dataset.line);
  if (breakpoints.has(ln)) breakpoints.delete(ln);
  else breakpoints.add(ln);
  renderEditor();
});

// ---------- stato ----------
function setStatus(text: string, kind: 'idle' | 'ok' | 'run' | 'wait' | 'err') {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function hex(v: number, n: number) {
  return v.toString(16).toUpperCase().padStart(n, '0');
}

function renderRegs() {
  const el = $('regs');
  const m = machine;
  const r = m ? m.regs : new Uint16Array(8);
  const s = m ? m.segs : new Uint16Array(4);
  const ip = m ? m.ip : 0;
  const ch = (a: number, b: number) => (m && a !== b ? ' changed' : '');
  const pair = (name: string, i: number) => {
    const v = r[i];
    return `<div class="reg${ch(v, prevRegs[i])}"><span class="rn">${name}</span><span class="rv">${hex(v, 4)}</span>
      <span class="rh">${hex(v >> 8, 2)}</span><span class="rl">${hex(v & 0xff, 2)}</span><span class="rd">${v}</span></div>`;
  };
  const single = (name: string, v: number, p: number) =>
    `<div class="reg${ch(v, p)}"><span class="rn">${name}</span><span class="rv">${hex(v, 4)}</span><span class="rd">${v}</span></div>`;
  el.innerHTML =
    `<div class="reg head"><span class="rn"></span><span class="rv">hex</span><span class="rh">H</span><span class="rl">L</span><span class="rd">dec</span></div>` +
    pair('AX', 0) + pair('BX', 3) + pair('CX', 1) + pair('DX', 2) +
    `<div class="sep-row"></div>` +
    single('SI', r[6], prevRegs[6]) + single('DI', r[7], prevRegs[7]) +
    single('BP', r[5], prevRegs[5]) + single('SP', r[4], prevRegs[4]) +
    `<div class="sep-row"></div>` +
    single('CS', s[1], prevSegs[1]) + single('IP', ip, prevIp) +
    single('SS', s[2], prevSegs[2]) + single('DS', s[3], prevSegs[3]) + single('ES', s[0], prevSegs[0]);

  const f = m ? m.flags : 2;
  const flag = (n: string, bit: number) => {
    const on = (f & bit) !== 0;
    const was = (prevFlags & bit) !== 0;
    return `<span class="flag${on ? ' on' : ''}${on !== was ? ' changed' : ''}" title="${n}">${n}<i>${on ? 1 : 0}</i></span>`;
  };
  $('flags').innerHTML = [
    flag('CF', CF), flag('PF', PF), flag('AF', AF), flag('ZF', ZF), flag('SF', SF),
    flag('TF', TF), flag('IF', IF), flag('DF', DF), flag('OF', OF),
  ].join('');
}

function memBase(): number {
  const sel = ($('mem-seg') as HTMLSelectElement).value as 'ds' | 'es' | 'ss' | 'cs';
  const m = machine;
  const seg = m ? m[sel] : program ? program.dataSeg : 0x0700;
  const off = parseInt(($('mem-off') as HTMLInputElement).value, 16) || 0;
  return ((seg << 4) + (off & 0xffff)) & 0xfffff;
}

function renderMem() {
  const el = $('mem');
  const base = memBase();
  const m = machine;
  let html = '';
  const sel = ($('mem-seg') as HTMLSelectElement).value as 'ds' | 'es' | 'ss' | 'cs';
  const seg = m ? m[sel] : program ? program.dataSeg : 0x0700;
  const off0 = parseInt(($('mem-off') as HTMLInputElement).value, 16) || 0;
  const cur = new Uint8Array(256);
  for (let r = 0; r < 16; r++) {
    html += `<div class="mrow"><span class="ma">${hex(seg, 4)}:${hex((off0 + r * 16) & 0xffff, 4)}</span>`;
    let ascii = '';
    for (let c = 0; c < 16; c++) {
      const v = m ? m.rd8(base + r * 16 + c) : program ? readStatic(base + r * 16 + c) : 0;
      cur[r * 16 + c] = v;
      const changed = v !== prevMem[r * 16 + c] && !!m;
      html += `<span class="mb${v === 0 ? ' z' : ''}${changed ? ' changed' : ''}">${hex(v, 2)}</span>`;
      ascii += v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '.';
    }
    html += `<span class="mc">${ascii}</span></div>`;
  }
  el.innerHTML = html;
  prevMem = cur;
}

function readStatic(addr: number): number {
  if (!program) return 0;
  for (const s of program.segments) {
    const a = s.base * 16;
    if (addr >= a && addr < a + s.bytes.length) return s.bytes[addr - a];
  }
  return 0;
}

function renderConsole() {
  consoleEl.textContent = machine ? machine.out : '';
  consoleEl.scrollTop = consoleEl.scrollHeight;
  hint.textContent = machine?.status === 'waiting' ? '← in attesa di input: scrivi qui' : '';
}

function renderState() {
  renderRegs();
  renderMem();
  renderConsole();
  renderEditor();
  updateStatus();
  if (machine) {
    prevRegs = machine.regs.slice();
    prevSegs = machine.segs.slice();
    prevIp = machine.ip;
    prevFlags = machine.flags;
  }
  scrollToCurrent();
}

function scrollToCurrent() {
  const ln = machine?.currentLine;
  if (!ln) return;
  const lh = 20;
  const y = (ln - 1) * lh;
  if (y < code.scrollTop || y > code.scrollTop + code.clientHeight - lh * 2) {
    code.scrollTop = Math.max(0, y - code.clientHeight / 2);
    syncScroll();
  }
}

function updateStatus() {
  if (!machine) return;
  switch (machine.status) {
    case 'ready': setStatus(`Pronto · ${machine.steps} istruzioni`, 'ok'); break;
    case 'running': setStatus('In esecuzione…', 'run'); break;
    case 'waiting': setStatus('In attesa di un tasto…', 'wait'); break;
    case 'halted': setStatus(`Terminato · ${machine.steps} istruzioni`, 'ok'); break;
    case 'error': setStatus(`Errore: ${machine.error}`, 'err'); break;
  }
}

// ---------- azioni ----------
function compile(): boolean {
  stopRun();
  const src = code.value;
  program = assemble(src);
  errorLines = new Map();
  for (const e of program.errors) if (!errorLines.has(e.line)) errorLines.set(e.line, e.message);
  if (!program.ok) {
    machine = null;
    messages.innerHTML = program.errors
      .map((e) => `<div class="msg" data-line="${e.line}"><b>Riga ${e.line}</b> — ${esc(e.message)}</div>`)
      .join('');
    setStatus(`${program.errors.length} error${program.errors.length === 1 ? 'e' : 'i'} di assemblaggio`, 'err');
    renderEditor();
    renderState();
    return false;
  }
  messages.innerHTML = '<div class="msg ok">Assemblaggio riuscito.</div>';
  machine = new Machine(program);
  renderState();
  return true;
}

function ensureMachine(): boolean {
  return machine !== null || compile();
}

function stopRun() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (machine && machine.status === 'running') machine.status = 'ready';
}

const CHUNKS = [1, 5, 25, 250, 20000]; // istruzioni per tick, in base allo slider
const DELAYS = [400, 150, 50, 16, 0];

function runLoop() {
  if (!machine) return;
  const lvl = Number(speed.value);
  machine.run(CHUNKS[lvl], breakpoints);
  renderState();
  if (machine.status === 'running') {
    timer = window.setTimeout(runLoop, DELAYS[lvl]);
  } else {
    timer = null;
    if (machine.status === 'waiting') consoleEl.focus();
  }
}

$('btn-compile').addEventListener('click', () => compile());
$('btn-run').addEventListener('click', () => {
  if (!ensureMachine() || !machine) return;
  if (machine.status === 'halted' || machine.status === 'error') machine.reset();
  if (timer !== null) return;
  machine.status = 'running';
  runLoop();
});
$('btn-step').addEventListener('click', () => {
  if (!ensureMachine() || !machine) return;
  stopRun();
  if (machine.status === 'halted' || machine.status === 'error') return;
  machine.step();
  renderState();
  if (machine.status === 'waiting') consoleEl.focus();
});
$('btn-back').addEventListener('click', () => {
  if (!machine) return;
  stopRun();
  machine.stepBack();
  renderState();
});
$('btn-stop').addEventListener('click', () => {
  stopRun();
  renderState();
});
$('btn-reset').addEventListener('click', () => {
  if (!ensureMachine() || !machine) return;
  stopRun();
  machine.reset();
  prevRegs = machine.regs.slice();
  prevMem = new Uint8Array(256);
  renderState();
});
messages.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
  if (!el) return;
  const ln = Number(el.dataset.line);
  const lines = code.value.split('\n');
  let pos = 0;
  for (let i = 0; i < ln - 1; i++) pos += lines[i].length + 1;
  code.focus();
  code.setSelectionRange(pos, pos + (lines[ln - 1]?.length ?? 0));
});

// input da tastiera nello "schermo"
consoleEl.addEventListener('keydown', (e) => {
  if (!machine) return;
  let k: string | null = null;
  if (e.key === 'Enter') k = '\r';
  else if (e.key === 'Backspace') k = '\b';
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) k = e.key;
  if (k === null) return;
  e.preventDefault();
  machine.sendKey(k);
  if (machine.status === 'waiting') {
    // riprende: il tasto verrà consumato dall'istruzione in attesa
    machine.status = 'running';
    timer = window.setTimeout(runLoop, 0);
  }
});

// scorciatoie
window.addEventListener('keydown', (e) => {
  if (e.key === 'F5') {
    e.preventDefault();
    $('btn-run').click();
  } else if (e.key === 'F8') {
    e.preventDefault();
    (e.shiftKey ? $('btn-back') : $('btn-step')).click();
  } else if (e.key === 'F9') {
    e.preventDefault();
    compile();
  }
});

// memoria
$('mem-seg').addEventListener('change', renderMem);
$('mem-off').addEventListener('input', renderMem);

// esempi / file
const exSel = $<HTMLSelectElement>('examples');
exSel.innerHTML =
  '<option value="">Esempi…</option>' + EXAMPLES.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join('');
exSel.addEventListener('change', () => {
  if (exSel.value === '') return;
  if (code.value.trim() && !confirm('Sostituire il codice attuale con l\'esempio?')) {
    exSel.value = '';
    return;
  }
  code.value = EXAMPLES[Number(exSel.value)][1];
  exSel.value = '';
  breakpoints.clear();
  code.dispatchEvent(new Event('input'));
});
const fileInput = $<HTMLInputElement>('file-input');
$('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  code.value = await f.text();
  fileInput.value = '';
  breakpoints.clear();
  code.dispatchEvent(new Event('input'));
});
$('btn-save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code.value], { type: 'text/plain' }));
  a.download = 'programma.asm';
  a.click();
  URL.revokeObjectURL(a.href);
});

void DF;
renderEditor();
renderState();
setStatus('Premi Compila (F9) o Run (F5)', 'idle');
