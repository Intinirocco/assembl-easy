import { assemble, type Program, type Symbol } from '../emu/assembler';
import { AF, CF, DF, IF, Machine, OF, PF, SF, TF, ZF, type TraceEntry } from '../emu/cpu';
import { registerEmulatorLoader } from '../bus';
import { $, esc } from '../ui/dom';
import { CodeEditor } from '../ui/editor';
import template from '../examples/template.asm?raw';
import ex1 from '../examples/somma-sottrazione.asm?raw';
import ex2 from '../examples/input-moltiplicazione.asm?raw';
import ex3 from '../examples/scan-print-num.asm?raw';
import ex4 from '../examples/memoria-diretta.asm?raw';

const FILE_EXAMPLES: [string, string][] = [
  ['Template vuoto', template],
  ['Somma e sottrazione', ex1],
  ['Input e moltiplicazione', ex2],
  ['scan_num / print_num', ex3],
  ['Accesso diretto alla memoria', ex4],
];

const editor = new CodeEditor($('editor-host'), { breakpoints: true });
const breakpoints = editor.breakpoints;
const messages = $('messages');
const consoleEl = $('console');
const statusEl = $('status');
const hint = $('input-hint');
const speed = $<HTMLSelectElement>('speed');

let program: Program | null = null;
let machine: Machine | null = null;
let timer: number | null = null;
let compileTimer: number | null = null;
let errorLines = new Map<number, string>();
let varFmt: 'dec' | 'hex' = 'dec';
let prevRegs = new Uint16Array(8);
let prevSegs = new Uint16Array(4);
let prevIp = 0;
let prevFlags = 0;
let prevMem = new Uint8Array(256);
let prevVars = new Map<string, string>();

const STORE = 'assembl-easy:code';
try {
  editor.value = localStorage.getItem(STORE) ?? template;
} catch {
  editor.value = template;
}

// ---------- formattazione ----------
const hex = (v: number, n: number) => (v >>> 0).toString(16).toUpperCase().padStart(n, '0');
const signed = (v: number, bits: 8 | 16 | 32) => {
  const lim = 2 ** (bits - 1);
  return v >= lim ? v - 2 ** bits : v;
};
const bin = (v: number, bits: number) =>
  v.toString(2).padStart(bits, '0').replace(/(.{4})(?=.)/g, '$1 ');
const printable = (c: number) => (c >= 32 && c < 127 ? String.fromCharCode(c) : '·');

const REG_INFO: Record<string, string> = {
  AX: 'accumulatore', BX: 'base', CX: 'contatore', DX: 'dati',
  SI: 'indice sorgente', DI: 'indice destinazione', BP: 'base pointer', SP: 'stack pointer',
  CS: 'segmento codice', DS: 'segmento dati', SS: 'segmento stack', ES: 'segmento extra', IP: 'puntatore istruzione',
};
const FLAG_INFO: [string, number, string][] = [
  ['CF', CF, 'Carry: riporto o prestito'],
  ['ZF', ZF, 'Zero: il risultato è 0'],
  ['SF', SF, 'Sign: il risultato è negativo'],
  ['OF', OF, 'Overflow: risultato con segno fuori range'],
  ['PF', PF, 'Parity: numero pari di bit a 1 nel byte basso'],
  ['AF', AF, 'Auxiliary carry: riporto dal bit 3'],
  ['DF', DF, 'Direction: direzione delle istruzioni su stringhe'],
  ['IF', IF, 'Interrupt enable'],
  ['TF', TF, 'Trap: esecuzione passo-passo'],
];
const REG16_ORDER = ['AX', 'CX', 'DX', 'BX', 'SP', 'BP', 'SI', 'DI'];
const SEG_ORDER = ['ES', 'CS', 'SS', 'DS'];

function regValue(name: string): { v: number; bits: 8 | 16 } | null {
  const m = machine;
  const r = m ? m.regs : new Uint16Array(8);
  const s = m ? m.segs : new Uint16Array(4);
  if (name === 'IP') return { v: m ? m.ip : 0, bits: 16 };
  let i = REG16_ORDER.indexOf(name);
  if (i >= 0) return { v: r[i], bits: 16 };
  i = SEG_ORDER.indexOf(name);
  if (i >= 0) return { v: s[i], bits: 16 };
  const m8 = /^([ABCD])([HL])$/.exec(name);
  if (m8) {
    const base = REG16_ORDER.indexOf(m8[1] + 'X');
    return { v: m8[2] === 'H' ? r[base] >> 8 : r[base] & 0xff, bits: 8 };
  }
  return null;
}

// ---------- editor ----------
function renderEditor() {
  const m = machine;
  const live = m && m.status !== 'halted' && m.status !== 'error';
  editor.current = live ? m!.currentLine : null;
  const last = m && m.trace.length ? m.trace[m.trace.length - 1] : null;
  editor.last = last && last.line ? last.line : null;
  editor.errors = errorLines;
  editor.render();
}

editor.onChange = () => {
  try {
    localStorage.setItem(STORE, editor.value);
  } catch {
    /* modalità privata */
  }
  // il sorgente è cambiato: l'esecuzione corrente non è più valida
  stopRun();
  machine = null;
  program = null;
  errorLines = new Map();
  messages.innerHTML = '';
  setStatus('Modificato…', 'idle');
  resetPrev();
  renderState();
  if (compileTimer !== null) clearTimeout(compileTimer);
  compileTimer = window.setTimeout(() => {
    compileTimer = null;
    compile();
  }, 600);
};
editor.onBreakpoints = () => renderEditor();

function setStatus(text: string, kind: 'idle' | 'ok' | 'run' | 'wait' | 'err') {
  statusEl.textContent = text;
  statusEl.title = text;
  statusEl.className = `status ${kind}`;
}

function resetPrev() {
  prevRegs = new Uint16Array(8);
  prevSegs = new Uint16Array(4);
  prevIp = 0;
  prevFlags = 0x0002;
  prevMem = new Uint8Array(256);
  prevVars = new Map();
}

// ---------- registri ----------
function renderRegs() {
  const m = machine;
  const r = m ? m.regs : new Uint16Array(8);
  const s = m ? m.segs : new Uint16Array(4);
  const ip = m ? m.ip : 0;
  const chg = (a: number, b: number) => (m && a !== b ? ' chg' : '');
  const idx = (n: string) => REG16_ORDER.indexOf(n);

  // registri generali: valore a 16 bit + parte alta e bassa
  const gen = (name: string) => {
    const v = r[idx(name)];
    const p = prevRegs[idx(name)];
    const L = name[0];
    return `<tr class="rr${chg(v, p)}" data-reg="${name}" title="${REG_INFO[name]}">
      <th>${name}</th><td class="hx">${hex(v, 4)}</td>
      <td class="by${chg(v >> 8, p >> 8)}" data-reg="${L}H" title="${L}H: parte alta">${hex(v >> 8, 2)}</td>
      <td class="by${chg(v & 0xff, p & 0xff)}" data-reg="${L}L" title="${L}L: parte bassa">${hex(v & 0xff, 2)}</td>
      <td class="dc">${v}</td></tr>`;
  };
  const one = (name: string, v: number, p: number) =>
    `<tr class="rr${chg(v, p)}" data-reg="${name}" title="${REG_INFO[name]}">
      <th>${name}</th><td class="hx">${hex(v, 4)}</td><td class="dc">${v}</td></tr>`;

  $('regs').innerHTML = `
    <div class="reg-cols">
      <div>
        <table class="regtbl">
          <thead><tr><th></th><th>Hex</th><th>H</th><th>L</th><th>Dec</th></tr></thead>
          <tbody>${['AX', 'BX', 'CX', 'DX'].map(gen).join('')}</tbody>
        </table>
        <div id="flags" class="flags"></div>
      </div>
      <table class="regtbl">
        <thead><tr><th></th><th>Hex</th><th>Dec</th></tr></thead>
        <tbody>
          ${['SI', 'DI', 'BP', 'SP'].map((n) => one(n, r[idx(n)], prevRegs[idx(n)])).join('')}
          ${one('IP', ip, ip)}
          ${one('CS', s[1], prevSegs[1])}${one('DS', s[3], prevSegs[3])}${one('SS', s[2], prevSegs[2])}${one('ES', s[0], prevSegs[0])}
        </tbody>
      </table>
    </div>`;

  const f = m ? m.flags : 2;
  $('flags').innerHTML = FLAG_INFO.map(([n, bit, info]) => {
    const on = (f & bit) !== 0;
    const was = (prevFlags & bit) !== 0;
    return `<span class="flag${on ? ' on' : ''}${m && on !== was ? ' chg' : ''}" title="${esc(info)}">${n}<i>${on ? 1 : 0}</i></span>`;
  }).join('');
}

// ---------- popup registro ----------
function closeRegPopup() {
  document.getElementById('reg-popup')?.remove();
}

function openRegPopup(name: string) {
  const info = regValue(name);
  if (!info) return;
  closeRegPopup();
  const { v, bits } = info;
  const isSplit = ['AX', 'BX', 'CX', 'DX'].includes(name);
  const title = bits === 8 ? `${name} · parte ${name[1] === 'H' ? 'alta' : 'bassa'} di ${name[0]}X` : `${name} · ${REG_INFO[name]}`;
  const prevVal = (() => {
    const i = REG16_ORDER.indexOf(name);
    if (i >= 0) return prevRegs[i];
    const j = SEG_ORDER.indexOf(name);
    if (j >= 0) return prevSegs[j];
    if (name === 'IP') return prevIp;
    const m8 = /^([ABCD])([HL])$/.exec(name);
    if (m8) {
      const w = prevRegs[REG16_ORDER.indexOf(m8[1] + 'X')];
      return m8[2] === 'H' ? w >> 8 : w & 0xff;
    }
    return null;
  })();

  // riga di bit: indice sopra, valore sotto; spazio ogni 4 bit
  const bitRow = () => {
    let h = '';
    for (let b = bits - 1; b >= 0; b--) {
      const on = (v >> b) & 1;
      h += `<div class="bit${on ? ' on' : ''}${b % 4 === 0 && b !== 0 ? ' nib' : ''}"><i>${b}</i><b>${on}</b></div>`;
    }
    return h;
  };
  const ascii = (n: number) => (n >= 32 && n < 127 ? `'${esc(String.fromCharCode(n))}'` : '—');
  const part = (label: string, n: number) =>
    `<tr><th>${label}</th><td>${hex(n, 2)}h</td><td>${n}</td><td>${signed(n, 8)}</td><td>${bin(n, 8)}</td><td>${ascii(n)}</td></tr>`;

  let body = `
    <div class="rp-main">
      <div class="rp-hex">${hex(v, bits / 4)}<small>h</small></div>
      <div class="rp-vals">
        <div><span>${v}</span> senza segno</div>
        <div><span>${signed(v, bits)}</span> con segno</div>
        ${bits === 8 ? `<div><span>${ascii(v)}</span> ASCII</div>` : ''}
      </div>
    </div>
    <div class="rp-bin">${bin(v, bits)}</div>
    <div class="bits${bits === 16 ? ' b16' : ''}">${bitRow()}</div>`;
  if (isSplit) {
    body += `<table class="rp-parts">
      <thead><tr><th></th><th>Hex</th><th>Dec</th><th>Con segno</th><th>Binario</th><th>ASCII</th></tr></thead>
      <tbody>${part(`${name[0]}H alta`, v >> 8)}${part(`${name[0]}L bassa`, v & 0xff)}</tbody></table>`;
  }
  if (prevVal !== null && prevVal !== v) {
    body += `<p class="rp-prev">Valore precedente: <b>${hex(prevVal, bits / 4)}h</b> (${prevVal})</p>`;
  }
  if (machine && name !== 'CS' && name !== 'IP') {
    body += `<form class="reg-edit" id="reg-edit">
        <input id="reg-new" placeholder="Nuovo valore: 25, 0Ah, 1010b" autocomplete="off" spellcheck="false" />
        <button type="submit" class="primary">Imposta</button>
        <span id="reg-err" class="reg-err"></span>
      </form>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'reg-popup';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal reg-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-close aria-label="Chiudi">✕</button></div>
      ${body}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('[data-close]')) closeRegPopup();
  });
  const form = overlay.querySelector<HTMLFormElement>('#reg-edit');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = (overlay.querySelector('#reg-new') as HTMLInputElement).value.trim();
    const err = overlay.querySelector('#reg-err') as HTMLElement;
    let n: number;
    if (/^-?\d+$/.test(txt)) n = parseInt(txt, 10);
    else if (/^[0-9][0-9a-f]*h$/i.test(txt)) n = parseInt(txt.slice(0, -1), 16);
    else if (/^0x[0-9a-f]+$/i.test(txt)) n = parseInt(txt, 16);
    else if (/^[01]+b$/i.test(txt)) n = parseInt(txt.slice(0, -1), 2);
    else {
      err.textContent = 'Valore non valido';
      return;
    }
    const max = bits === 8 ? 0xff : 0xffff;
    if (n < -(max + 1) / 2 || n > max) {
      err.textContent = `Non entra in ${bits} bit`;
      return;
    }
    n &= max;
    const m = machine!;
    const gi = REG16_ORDER.indexOf(name);
    const si = SEG_ORDER.indexOf(name);
    const m8 = /^([ABCD])([HL])$/.exec(name);
    if (gi >= 0) m.regs[gi] = n;
    else if (si >= 0) m.segs[si] = n;
    else if (m8) {
      const bi = REG16_ORDER.indexOf(m8[1] + 'X');
      m.regs[bi] = m8[2] === 'H' ? (m.regs[bi] & 0xff) | (n << 8) : (m.regs[bi] & 0xff00) | n;
    }
    closeRegPopup();
    renderState();
  });
  (overlay.querySelector('#reg-new') as HTMLInputElement | null)?.focus();
}

$('regs').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-reg]') as HTMLElement | null;
  if (el) openRegPopup(el.dataset.reg!);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeRegPopup();
});

// ---------- variabili ----------
function dataSymbols(): Symbol[] {
  if (!program) return [];
  const segBase = (s: Symbol) => program!.segments.find((x) => x.name === s.seg)?.base ?? 0;
  return [...program.symbols.values()]
    .filter((s) => s.type === 'data')
    .sort((a, b) => segBase(a) - segBase(b) || a.value - b.value);
}

function varAddr(s: Symbol): number {
  const seg = program!.segments.find((x) => x.name === s.seg)!;
  return seg.base * 16 + s.value;
}

function varValueHtml(s: Symbol): { html: string; key: string } {
  const unit = s.size ?? 1;
  const len = s.length ?? unit;
  const a = varAddr(s);
  const rd = machine ? (i: number) => machine!.rd8(a + i) : (i: number) => program!.segments.find((x) => x.name === s.seg)!.bytes[s.value + i] ?? 0;
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) bytes.push(rd(i));
  const key = bytes.join(',');
  if (s.text && unit === 1) {
    const str = bytes.map((c) => (c === 13 ? '⏎' : c === 10 ? '↵' : printable(c))).join('');
    return { html: `<span class="v-str">"${esc(str)}"</span> <span class="muted">${len} byte</span>`, key };
  }
  const count = Math.max(1, Math.floor(len / unit));
  const el = (i: number) => {
    let v = 0;
    for (let b = 0; b < unit; b++) v += bytes[i * unit + b] * 2 ** (8 * b);
    return v;
  };
  const fmt = (v: number) => {
    if (varFmt === 'hex') return hex(v, unit * 2) + 'h';
    const sv = signed(v, (unit * 8) as 8 | 16 | 32);
    return sv !== v ? `${v} <span class="muted">(${sv})</span>` : String(v);
  };
  if (count === 1) {
    const v = el(0);
    const other = varFmt === 'hex' ? String(v) : hex(v, unit * 2) + 'h';
    const asc = unit === 1 && v >= 32 && v < 127 ? ` <span class="muted">'${esc(String.fromCharCode(v))}'</span>` : '';
    return { html: `<b>${fmt(v)}</b> <span class="muted">${other}</span>${asc}`, key };
  }
  const shown = Math.min(count, 16);
  const items = Array.from({ length: shown }, (_, i) => `<span class="cell">${fmt(el(i))}</span>`).join('');
  return { html: `<div class="v-arr">${items}${count > shown ? `<span class="muted">… +${count - shown}</span>` : ''}</div>`, key };
}

function renderVars() {
  const el = $('vars');
  if (!program) {
    el.innerHTML = `<p class="empty-note">Le variabili compaiono quando il programma si assembla senza errori.</p>`;
    return;
  }
  const syms = dataSymbols();
  if (!syms.length) {
    el.innerHTML = `<p class="empty-note">Il programma non dichiara variabili (<code>DB</code> / <code>DW</code>).</p>`;
    return;
  }
  const next = new Map<string, string>();
  const rows = syms
    .map((s) => {
      const unit = s.size ?? 1;
      const count = Math.floor((s.length ?? unit) / unit);
      const type = (unit === 1 ? 'DB' : unit === 2 ? 'DW' : 'DD') + (count > 1 ? `[${count}]` : '');
      const seg = program!.segments.find((x) => x.name === s.seg)!;
      const val = varValueHtml(s);
      const k = s.name ?? '';
      next.set(k, val.key);
      const changed = machine && prevVars.has(k) && prevVars.get(k) !== val.key;
      return `<tr class="var-row${changed ? ' chg' : ''}" data-var="${esc(k)}" title="Mostra in memoria">
        <td class="v-name">${esc(k)}</td><td class="v-type">${type}</td>
        <td class="v-addr">${hex(seg.base, 4)}:${hex(s.value, 4)}</td><td class="v-val">${val.html}</td></tr>`;
    })
    .join('');
  prevVars = next;
  el.innerHTML = `<table class="vtable"><thead><tr><th>Nome</th><th>Tipo</th><th>Indirizzo</th><th>Valore</th></tr></thead><tbody>${rows}</tbody></table>`;
}

$('vars').addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest('[data-var]') as HTMLElement | null;
  if (!row || !program) return;
  const s = dataSymbols().find((x) => x.name === row.dataset.var);
  if (!s) return;
  const seg = program.segments.find((x) => x.name === s.seg)!;
  const sel = $<HTMLSelectElement>('mem-seg');
  if (seg.base === program.dataSeg) sel.value = 'data';
  else {
    let opt = Array.from(sel.options).find((o) => o.value === `seg:${seg.base}`);
    if (!opt) {
      opt = new Option(`Segmento ${hex(seg.base, 4)}`, `seg:${seg.base}`);
      sel.add(opt);
    }
    sel.value = opt.value;
  }
  ($('mem-off') as HTMLInputElement).value = hex(s.value & 0xfff0, 4);
  showTab('mem');
  renderMem();
});

// ---------- memoria e stack ----------
function memSegment(): number {
  const v = $<HTMLSelectElement>('mem-seg').value;
  if (v === 'data') return program ? program.dataSeg : 0x0700;
  if (v.startsWith('seg:')) return Number(v.slice(4));
  const m = machine;
  if (!m) return program ? program.dataSeg : 0x0700;
  return { ds: m.ds, es: m.es, ss: m.ss, cs: m.cs }[v as 'ds' | 'es' | 'ss' | 'cs'];
}

function readByte(addr: number): number {
  if (machine) return machine.rd8(addr);
  if (!program) return 0;
  for (const s of program.segments) {
    const a = s.base * 16;
    if (addr >= a && addr < a + s.bytes.length) return s.bytes[addr - a];
  }
  return 0;
}

function renderMem() {
  const seg = memSegment();
  const off0 = (parseInt(($('mem-off') as HTMLInputElement).value, 16) || 0) & 0xfff0;
  const base = ((seg << 4) + off0) & 0xfffff;
  const varAt = new Map<number, string>();
  for (const s of dataSymbols()) {
    const a = varAddr(s);
    for (let i = 0; i < (s.length ?? 1); i++) varAt.set(a + i, s.name ?? '');
  }
  let html = `<div class="mrow mhead"><span class="ma"></span>${Array.from({ length: 16 }, (_, i) => `<span class="mb">${hex(i, 2)}</span>`).join('')}<span class="mc">ASCII</span></div>`;
  const cur = new Uint8Array(256);
  for (let r = 0; r < 16; r++) {
    html += `<div class="mrow"><span class="ma">${hex(seg, 4)}:${hex((off0 + r * 16) & 0xffff, 4)}</span>`;
    let ascii = '';
    for (let c = 0; c < 16; c++) {
      const addr = base + r * 16 + c;
      const v = readByte(addr);
      cur[r * 16 + c] = v;
      const changed = !!machine && v !== prevMem[r * 16 + c];
      const isVar = varAt.has(addr);
      html += `<span class="mb${v === 0 ? ' z' : ''}${isVar ? ' isvar' : ''}${changed ? ' chg' : ''}"${isVar ? ` title="${esc(varAt.get(addr)!)}"` : ''}>${hex(v, 2)}</span>`;
      ascii += v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '.';
    }
    html += `<span class="mc">${ascii}</span></div>`;
  }
  $('mem').innerHTML = html;
  prevMem = cur;
}

function renderStack() {
  const el = $('stack');
  const m = machine;
  if (!m || !program) {
    el.innerHTML = '<p class="empty-note">Lo stack compare quando il programma è assemblato.</p>';
    return;
  }
  const top = program.stackSP & 0xffff;
  const sp = m.sp;
  if (sp >= top) {
    el.innerHTML = `<p class="empty-note">Stack vuota. <span class="muted">SS:SP = ${hex(m.ss, 4)}:${hex(sp, 4)}</span></p>`;
    return;
  }
  let rows = '';
  let n = 0;
  for (let off = sp; off < top && n < 24; off += 2, n++) {
    const w = m.rd16(m.lin(m.ss, off));
    rows += `<tr class="${off === sp ? 'sp' : ''}"><td>${hex(m.ss, 4)}:${hex(off, 4)}</td><td><b>${hex(w, 4)}h</b></td><td>${w}</td><td>${off === sp ? '← SP (cima)' : ''}</td></tr>`;
  }
  el.innerHTML = `<table class="vtable"><thead><tr><th>Indirizzo</th><th>Valore</th><th>Decimale</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted small">Lo stack cresce verso gli indirizzi bassi: l'ultimo PUSH è in cima.</p>`;
}

// ---------- cronologia ----------
function fmtAddr(addr: number): string {
  if (program) {
    for (const s of program.segments) {
      const a = s.base * 16;
      if (addr >= a && addr < a + s.bytes.length) return `${hex(s.base, 4)}:${hex(addr - a, 4)}`;
    }
  }
  return hex(addr, 5);
}

function varNameAt(addr: number): string | null {
  for (const s of dataSymbols()) {
    const a = varAddr(s);
    if (addr >= a && addr < a + (s.length ?? 1)) return s.name ?? null;
  }
  return null;
}

function effectChips(t: TraceEntry): string {
  const chips: string[] = [];
  for (const c of t.changes) {
    const w = c.size === 8 ? 2 : 4;
    chips.push(`<span class="fx fx-reg"><b>${c.reg}</b> ${hex(c.from, w)} → <strong>${hex(c.to, w)}</strong> <i>(${c.to})</i></span>`);
  }
  for (const f of t.flags) chips.push(`<span class="fx fx-flag">${f.name} → <strong>${f.to ? 1 : 0}</strong></span>`);
  for (const m of t.mem) {
    const name = varNameAt(m.addr);
    const from = m.from.map((b) => hex(b, 2)).join(' ');
    const to = m.to.map((b) => hex(b, 2)).join(' ');
    chips.push(`<span class="fx fx-mem"><b>${name ? esc(name) : 'memoria'}</b> <span class="muted">${fmtAddr(m.addr)}</span> ${from} → <strong>${to}</strong></span>`);
  }
  if (t.out) {
    const txt = t.out === '\u0000clear' ? 'schermo pulito' : `stampa "${t.out.replace(/\r\n/g, '⏎').replace(/\r/g, '⏎').replace(/\n/g, '↵')}"`;
    chips.push(`<span class="fx fx-out">${esc(txt)}</span>`);
  }
  if (t.jump !== null) chips.push(`<span class="fx fx-jump">salta a <strong>${hex(t.jump, 4)}</strong></span>`);
  if (t.error) chips.push(`<span class="fx fx-err">${esc(t.error)}</span>`);
  return chips.length ? chips.join('') : '<span class="muted">nessuna modifica visibile</span>';
}

function renderLog() {
  const box = $('last-step');
  const log = $('log');
  const m = machine;
  if (!m) {
    box.innerHTML = program === null && errorLines.size ? '<div class="ls-msg err">Correggi gli errori di assemblaggio per eseguire il programma.</div>' : '<div class="ls-msg">Scrivi o apri un programma: viene assemblato automaticamente.</div>';
    log.innerHTML = '';
    return;
  }
  const last = m.trace[m.trace.length - 1];
  const nextIns = m.currentInstr;
  let html = '';
  if (m.status === 'error') {
    html += `<div class="ls-msg err"><b>Errore di esecuzione</b><br>${esc(m.error ?? '')}${m.lastLine ? ` <a href="#" data-goto="${m.lastLine}">(riga ${m.lastLine})</a>` : ''}</div>`;
  } else if (m.status === 'halted') {
    html += `<div class="ls-msg ok"><b>Programma terminato</b> dopo ${m.steps} istruzioni.</div>`;
  } else if (m.status === 'waiting') {
    html += `<div class="ls-msg wait"><b>In attesa di input:</b> scrivi nello schermo qui accanto.</div>`;
  }
  if (last) {
    html += `<div class="ls-title">Ultima istruzione eseguita</div>
      <div class="ls-ins"><span class="ln">${last.line ? `riga ${last.line}` : 'routine'}</span><code>${esc(last.text)}</code></div>
      <div class="fxs">${effectChips(last)}</div>`;
  } else if (m.status !== 'error') {
    html += `<div class="ls-msg">Il programma è pronto. Premi <b>Single step</b> per eseguire una istruzione alla volta, oppure <b>Run</b>.</div>`;
  }
  if (nextIns && m.status !== 'halted' && m.status !== 'error') {
    html += `<div class="ls-next">Prossima: <span class="ln">riga ${nextIns.line}</span> <code>${esc(nextIns.text)}</code></div>`;
  }
  box.innerHTML = html;

  const items = m.trace.slice(-60).reverse();
  log.innerHTML = items.length
    ? items
        .map(
          (t) => `<div class="log-row" ${t.line ? `data-goto="${t.line}"` : ''}>
            <span class="n">${t.n}</span><span class="ln">${t.line ? `riga ${t.line}` : '—'}</span><code>${esc(t.text)}</code>
            <div class="fxs">${effectChips(t)}</div></div>`,
        )
        .join('')
    : '';
}

for (const id of ['last-step', 'log']) {
  $(id).addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    editor.selectLine(Number(el.dataset.goto));
  });
}

// ---------- schermo e stato ----------
function renderConsole() {
  consoleEl.textContent = machine ? machine.out : '';
  consoleEl.scrollTop = consoleEl.scrollHeight;
  const waiting = machine?.status === 'waiting';
  hint.textContent = waiting ? '← in attesa di input: scrivi qui' : '';
  consoleEl.classList.toggle('waiting', waiting);
}

function updateStatus() {
  if (!machine) return;
  switch (machine.status) {
    case 'ready': setStatus(`Pronto · ${machine.steps} istruzioni eseguite`, 'ok'); break;
    case 'running': setStatus('In esecuzione…', 'run'); break;
    case 'waiting': setStatus('In attesa di un tasto…', 'wait'); break;
    case 'halted': setStatus(`Terminato · ${machine.steps} istruzioni`, 'ok'); break;
    case 'error': setStatus(`Errore: ${machine.error}`, 'err'); break;
  }
}

function renderState() {
  renderRegs();
  renderVars();
  renderMem();
  renderStack();
  renderLog();
  renderConsole();
  renderEditor();
  updateStatus();
  if (machine) {
    prevRegs = machine.regs.slice();
    prevSegs = machine.segs.slice();
    prevIp = machine.ip;
    prevFlags = machine.flags;
    const ln = machine.currentLine;
    if (ln) editor.scrollToLine(ln);
  }
}

// ---------- azioni ----------
function compile(): boolean {
  stopRun();
  if (compileTimer !== null) {
    clearTimeout(compileTimer);
    compileTimer = null;
  }
  program = assemble(editor.value);
  errorLines = new Map();
  for (const e of program.errors) if (!errorLines.has(e.line)) errorLines.set(e.line, e.message);
  resetPrev();
  if (!program.ok) {
    const errs = program.errors;
    program = null;
    machine = null;
    messages.innerHTML = errs
      .map((e) => `<div class="msg" data-line="${e.line}"><b>Riga ${e.line}</b> — ${esc(e.message)}</div>`)
      .join('');
    setStatus(`${errs.length} error${errs.length === 1 ? 'e' : 'i'} di assemblaggio`, 'err');
    renderState();
    return false;
  }
  messages.innerHTML = '';
  machine = new Machine(program);
  prevRegs = machine.regs.slice();
  prevSegs = machine.segs.slice();
  prevIp = machine.ip;
  prevFlags = machine.flags;
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

const CHUNKS = [1, 5, 25, 250, 20000]; // istruzioni per tick, in base alla velocità
const DELAYS = [500, 200, 60, 16, 0];

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

$('btn-compile').addEventListener('click', () => {
  compile();
});
$('btn-run').addEventListener('click', () => {
  if (!ensureMachine() || !machine) return;
  if (machine.status === 'halted' || machine.status === 'error') {
    machine.reset();
    resetPrev();
  }
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
  resetPrev();
  prevRegs = machine.regs.slice();
  prevSegs = machine.segs.slice();
  prevIp = machine.ip;
  prevFlags = machine.flags;
  renderState();
});
messages.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
  if (!el) return;
  editor.selectLine(Number(el.dataset.line));
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
    machine.status = 'running';
    timer = window.setTimeout(runLoop, 0);
  }
});

// scorciatoie
window.addEventListener('keydown', (e) => {
  if ($('view-emu').hidden) return;
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

// schede e formato variabili
function showTab(name: string) {
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  document.querySelectorAll<HTMLElement>('.tab-body').forEach((b) => (b.hidden = b.dataset.body !== name));
  $('vars-fmt').hidden = name !== 'vars';
}
document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab!)));
$('vars-fmt').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-fmt]') as HTMLElement | null;
  if (!b) return;
  varFmt = b.dataset.fmt as 'dec' | 'hex';
  $('vars-fmt').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  renderVars();
});
$('mem-seg').addEventListener('change', renderMem);
$('mem-off').addEventListener('input', renderMem);

// esempi / file
const exSel = $<HTMLSelectElement>('examples');
exSel.innerHTML =
  '<option value="">Esempi…</option>' + FILE_EXAMPLES.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join('');
exSel.addEventListener('change', () => {
  if (exSel.value === '') return;
  if (editor.value.trim() && !confirm("Sostituire il codice attuale con l'esempio?")) {
    exSel.value = '';
    return;
  }
  setCode(FILE_EXAMPLES[Number(exSel.value)][1]);
  exSel.value = '';
});
const fileInput = $<HTMLInputElement>('file-input');
$('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const text = await f.text();
  fileInput.value = '';
  setCode(text);
});
$('btn-save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain' }));
  a.download = 'programma.asm';
  a.click();
  URL.revokeObjectURL(a.href);
});

function setCode(src: string) {
  editor.value = src;
  breakpoints.clear();
  editor.onChange?.();
}

registerEmulatorLoader(setCode);
showTab('vars');
renderState();
compile();
