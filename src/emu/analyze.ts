// Analisi statica e dinamica di un programma, per la correzione automatica senza esercizio scelto.
import type { Instr, Operand, Program } from './assembler';
import { describeCase, type Scalar } from './grader';
import { Machine } from './cpu';
import { rngFor } from '../content/autotests';

export interface VarInfo {
  name: string;
  unit: 1 | 2 | 4;
  count: number; // elementi
  length: number; // byte
  addr: number; // indirizzo lineare
  read: boolean; // usata come sorgente / indirizzo caricato
  written: boolean; // usata come destinazione
  initial: number[]; // byte iniziali
  text: boolean; // definita con una stringa
}

export interface Analysis {
  vars: VarInfo[];
  inputs: VarInfo[]; // lette e mai scritte: si comportano da dati in ingresso
  outputs: VarInfo[]; // scritte dal programma
  usesKeyboard: boolean;
  printsText: boolean;
  mnemonics: string[];
}

const WRITES_DEST = new Set([
  'mov', 'add', 'adc', 'sub', 'sbb', 'and', 'or', 'xor', 'inc', 'dec', 'neg', 'not', 'shl', 'shr', 'sal', 'sar',
  'rol', 'ror', 'rcl', 'rcr', 'xchg', 'pop',
]);

function dataVars(prog: Program): VarInfo[] {
  const list: VarInfo[] = [];
  for (const s of prog.symbols.values()) {
    if (s.type !== 'data' || !s.name) continue;
    const seg = prog.segments.find((x) => x.name === s.seg);
    if (!seg) continue;
    const unit = (s.size ?? 1) as 1 | 2 | 4;
    const length = s.length ?? unit;
    list.push({
      name: s.name,
      unit,
      count: Math.max(1, Math.floor(length / unit)),
      length,
      addr: seg.base * 16 + s.value,
      read: false,
      written: false,
      initial: Array.from(seg.bytes.slice(s.value, s.value + length)),
      text: !!s.text,
    });
  }
  return list.sort((a, b) => a.addr - b.addr);
}

function varAt(vars: VarInfo[], prog: Program, ins: Instr, op: Operand): VarInfo | null {
  if (op.k !== 'mem') return null;
  const seg = prog.segments.find((s) => s.name === ins.seg);
  void seg;
  // l'operando conserva solo lo spiazzamento: si cerca la variabile che lo contiene
  const dataSegBase = prog.dataSeg * 16;
  const lin = dataSegBase + (op.disp & 0xffff);
  return vars.find((v) => lin >= v.addr && lin < v.addr + v.length) ?? null;
}

export function analyze(prog: Program): Analysis {
  const vars = dataVars(prog);
  let usesKeyboard = false;
  let printsText = false;
  let ah: number | null = null;
  const mnemonics = new Set<string>();

  for (const ins of prog.order) {
    mnemonics.add(ins.mnemonic);
    const [a, b] = ins.ops;

    // variabili lette / scritte
    ins.ops.forEach((op, i) => {
      const v = varAt(vars, prog, ins, op);
      if (!v) return;
      const isDest = i === 0 && WRITES_DEST.has(ins.mnemonic);
      if (isDest) {
        v.written = true;
        if (ins.mnemonic !== 'mov' && ins.mnemonic !== 'pop') v.read = true; // add/inc/... leggono anche
        if (ins.mnemonic === 'xchg') v.read = true;
      } else v.read = true;
    });
    // "offset nome" o `lea reg, nome`: l'indirizzo viene preso, il contenuto sarà letto (o scritto) altrove
    const m = /\boffset\s+([A-Za-z_]\w*)/i.exec(ins.text);
    if (m) {
      const v = vars.find((x) => x.name.toLowerCase() === m[1].toLowerCase());
      if (v) v.read = true;
    }

    // uso di tastiera e terminale (analisi lineare dei valori di AH)
    if (ins.mnemonic === 'mov' && a?.k === 'reg' && a.size === 8 && a.idx === 4 && b?.k === 'imm') ah = b.value & 0xff;
    else if (ins.mnemonic === 'mov' && a?.k === 'reg' && a.size === 16 && a.idx === 0 && b?.k === 'imm') ah = (b.value >> 8) & 0xff;
    if (ins.mnemonic === 'int' && a?.k === 'imm' && a.value === 0x21 && ah !== null) {
      if ([0x01, 0x07, 0x08, 0x0a].includes(ah)) usesKeyboard = true;
      if ([0x02, 0x09, 0x06].includes(ah)) printsText = true;
    }
    if (ins.mnemonic === 'int' && a?.k === 'imm' && a.value === 0x10) printsText = true;
    if (ins.mnemonic === 'call' && a?.k === 'imm') {
      for (const [name, sym] of prog.symbols) {
        if (sym.seg === '#builtin' && sym.value === a.value) {
          if (name === 'scan_num') usesKeyboard = true;
          if (name.startsWith('print')) printsText = true;
        }
      }
    }
    if (['print', 'printn', 'putc'].includes(ins.mnemonic)) printsText = true;
  }

  return {
    vars,
    inputs: vars.filter((v) => v.read && !v.written),
    outputs: vars.filter((v) => v.written),
    usesKeyboard,
    printsText,
    mnemonics: [...mnemonics].sort(),
  };
}

// ---------------- esplorazione ----------------

export interface ExploreRow {
  label: string;
  status: 'ok' | 'error' | 'timeout' | 'waiting';
  message: string;
  changed: string; // variabili modificate: nome = valore
  output: string;
  /** riga del sorgente dove è avvenuto l'errore o dove il programma si è bloccato */
  line: number | null;
}

const POOL: Record<number, number[]> = {
  1: [0, 1, 2, 10, 127, 128, 200, 255],
  2: [0, 1, 10, 255, 256, 1000, 32767, 32768, 65535],
  4: [0, 1, 65535, 100000],
};
const KEYS = ['5\n', '7\n9\n', '12\n30\n', '34', '0\n0\n', '99\n1\n', '4\n3\n2\n'];

function fmtVar(v: VarInfo, bytes: number[]): string {
  if (v.text && v.unit === 1) return JSON.stringify(String.fromCharCode(...bytes).replace(/\r/g, '⏎'));
  const vals: number[] = [];
  for (let i = 0; i + v.unit <= bytes.length; i += v.unit) {
    let n = 0;
    for (let j = 0; j < v.unit; j++) n += bytes[i + j] * 2 ** (8 * j);
    vals.push(n);
  }
  return vals.length === 1 ? String(vals[0]) : `[${vals.join(', ')}]`;
}

/** Esegue il programma con valori diversi e ne mostra il comportamento (senza dire se è "giusto"). */
export function explore(prog: Program, a: Analysis, maxRuns = 14): ExploreRow[] {
  const r = rngFor('esplora:' + a.vars.map((v) => v.name).join(','));
  const cases: { init: Record<string, Scalar>; input: string }[] = [];
  const keysets = a.usesKeyboard ? KEYS : [''];

  // 1) valori come dichiarati nel programma
  cases.push({ init: {}, input: keysets[0] });

  // 2) un ingresso alla volta con valori limite
  for (const v of a.inputs.filter((x) => !x.text)) {
    const pool = POOL[v.unit];
    for (const val of pool.slice(0, 4)) {
      const value: Scalar = v.count > 1 ? Array.from({ length: v.count }, () => val) : val;
      cases.push({ init: { [v.name]: value }, input: keysets[0] });
    }
  }
  // 3) combinazioni casuali di tutti gli ingressi
  for (let i = 0; i < 6; i++) {
    const init: Record<string, Scalar> = {};
    for (const v of a.inputs.filter((x) => !x.text)) {
      const pool = POOL[v.unit];
      const pick = () => (r() < 0.5 ? pool[Math.floor(r() * pool.length)] : Math.floor(r() * (2 ** (8 * v.unit) - 1)));
      init[v.name] = v.count > 1 ? Array.from({ length: v.count }, pick) : pick();
    }
    cases.push({ init, input: keysets[(i + 1) % keysets.length] });
  }
  // 4) altre sequenze di tasti
  if (a.usesKeyboard) for (const k of keysets.slice(1)) cases.push({ init: {}, input: k });

  // elimina duplicati e limita
  const seen = new Set<string>();
  const unique = cases.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rows: ExploreRow[] = [];
  for (const c of unique.slice(0, maxRuns)) {
    const m = new Machine(prog, { record: false });
    for (const [name, val] of Object.entries(c.init)) {
      const v = a.vars.find((x) => x.name === name)!;
      const arr = typeof val === 'number' ? [val] : (val as number[]);
      const bytes: number[] = [];
      for (const n of arr) for (let j = 0; j < v.unit; j++) bytes.push((n >> (8 * j)) & 0xff);
      bytes.forEach((b, i) => (m.mem[v.addr + i] = b));
    }
    const before = a.vars.map((v) => Array.from({ length: v.length }, (_, i) => m.rd8(v.addr + i)));
    for (const k of c.input.replace(/\r?\n/g, '\r')) m.sendKey(k);
    m.run(50000);

    const changed: string[] = [];
    a.vars.forEach((v, i) => {
      const now = Array.from({ length: v.length }, (_, j) => m.rd8(v.addr + j));
      if (now.some((b, j) => b !== before[i][j])) changed.push(`${v.name} = ${fmtVar(v, now)}`);
    });
    let status: ExploreRow['status'] = 'ok';
    let message = 'termina';
    if (m.status === 'error') {
      status = 'error';
      message = m.error ?? 'errore';
    } else if (m.status === 'waiting') {
      status = 'waiting';
      message = 'attende altro input';
    } else if (m.status !== 'halted') {
      status = 'timeout';
      message = 'non termina (ciclo infinito?)';
    }
    rows.push({
      label: describeCase(c.init, c.input) || 'valori dichiarati nel programma',
      status,
      message,
      changed: changed.join(', ') || '—',
      output: m.out.replace(/\r\n/g, '⏎').replace(/\r/g, '⏎'),
      line: status === 'error' ? m.lastLine : status === 'ok' ? null : m.currentLine,
    });
  }
  return rows;
}
