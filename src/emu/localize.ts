// Localizzazione dell'errore logico: quale riga rende sbagliato il programma?
//
// Idea ("riparazione per mutazione"): per ogni istruzione si provano piccole modifiche plausibili
// (altra condizione di salto, ADD↔SUB, altro registro, costante ±1, operandi invertiti, altra
// variabile, istruzione tolta) e si riesegue la batteria di test. Se una SOLA modifica a una riga
// fa passare tutti i test, quella riga è la colpevole. Se nessuna modifica basta, si indica almeno
// dove viene scritto il valore sbagliato.
import { assemble } from './assembler';
import { Machine } from './cpu';
import { gradeProgram, type GradeReport, type TestCase } from './grader';

export interface Suspect {
  line: number;
  /** testo della riga nel sorgente */
  text: string;
  /** 'fix': una modifica a questa riga fa passare i test; 'store': qui si scrive il valore sbagliato */
  kind: 'fix' | 'partial' | 'store' | 'output';
  message: string;
  /** modifiche proposte (solo per 'fix'/'partial') */
  suggestions: string[];
}

const TIME_BUDGET_MS = 2500;

const JCC = ['ja', 'jae', 'jb', 'jbe', 'jc', 'je', 'jg', 'jge', 'jl', 'jle', 'jnc', 'jne', 'jno', 'jns', 'jnz', 'jo', 'js', 'jz'];
const SWAP: [string, string][] = [
  ['add', 'sub'], ['adc', 'sbb'], ['inc', 'dec'], ['and', 'or'], ['or', 'xor'], ['and', 'xor'],
  ['shl', 'shr'], ['sal', 'sar'], ['mul', 'imul'], ['div', 'idiv'], ['cmp', 'test'], ['loop', 'loopne'],
];
const R8 = ['al', 'bl', 'cl', 'dl', 'ah', 'bh', 'ch', 'dh'];
const R16 = ['ax', 'bx', 'cx', 'dx', 'si', 'di'];
const BASE = ['bx', 'si', 'di'];

function splitOps(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let q: string | null = null;
  for (const c of s) {
    if (q) {
      cur += c;
      if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === '[' || c === '(') {
      depth++;
      cur += c;
    } else if (c === ']' || c === ')') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseLine(raw: string) {
  // [etichetta:] istruzione [; commento]
  const m = /^(\s*(?:[A-Za-z_.@$?][\w.@$?]*\s*:\s*)?)([^;]*?)(\s*;.*)?$/.exec(raw);
  if (!m) return null;
  const code = m[2].trim();
  const mm = /^([A-Za-z_]\w*)\s*(.*)$/.exec(code);
  if (!mm) return null;
  return { prefix: m[1], suffix: m[3] ?? '', mn: mm[1], ops: splitOps(mm[2]) };
}

interface Mutant {
  code: string;
}

function mutantsFor(mn: string, ops: string[], vars: { name: string; unit: number }[]): Mutant[] {
  const out: Mutant[] = [];
  const lower = mn.toLowerCase();
  const fmt = (m: string, o: string[]) => (o.length ? `${m} ${o.join(', ')}` : m);
  const add = (code: string) => out.push({ code });

  if (JCC.includes(lower) && ops.length === 1) {
    for (const j of JCC) if (j !== lower) add(fmt(j, ops));
  }
  for (const [a, b] of SWAP) {
    if (lower === a) add(fmt(b, ops));
    else if (lower === b) add(fmt(a, ops));
  }
  // registri, registri base/indice e costanti
  ops.forEach((op, i) => {
    const t = op.toLowerCase();
    const replaceWith = (v: string) => add(fmt(mn, ops.map((x, k) => (k === i ? v : x))));
    if (R8.includes(t)) R8.filter((r) => r !== t).forEach(replaceWith);
    else if (R16.includes(t)) R16.filter((r) => r !== t).forEach(replaceWith);
    else if (/^\[(bx|si|di)\]$/.test(t)) BASE.filter((r) => `[${r}]` !== t).forEach((r) => replaceWith(`[${r}]`));
    else if (/^-?\d+$/.test(t) || /^[0-9][0-9a-f]*h$/i.test(t)) {
      const n = /h$/i.test(t) ? parseInt(t.slice(0, -1), 16) : parseInt(t, 10);
      const cands = new Set<number>([n - 1, n + 1, n * 2, 0, 1]);
      if (n % 2 === 0) cands.add(n / 2);
      cands.delete(n);
      for (const c of cands) if (c >= 0 && c <= 65535) replaceWith(String(c));
    } else {
      const v = vars.find((x) => x.name.toLowerCase() === t);
      if (v) vars.filter((o) => o.unit === v.unit && o.name !== v.name).slice(0, 4).forEach((o) => replaceWith(o.name));
    }
  });
  // operandi invertiti (confronti e sottrazioni, o trasferimenti tra registri)
  if (['cmp', 'sub', 'mov', 'sbb'].includes(lower) && ops.length === 2 && ops[0].toLowerCase() !== ops[1].toLowerCase()) {
    add(fmt(mn, [ops[1], ops[0]]));
  }
  // istruzione tolta (non la preparazione dei segmenti né le chiamate al DOS)
  if (lower !== 'int' && lower !== 'ret' && lower !== 'call') add('nop');
  return out;
}

const key = (t: TestCase) => `${t.group}|${t.name}`;

export function localizeFault(source: string, tests: TestCase[], baseline: GradeReport, opts: { requires?: string[] } = {}): Suspect[] {
  if (baseline.assemblyErrors.length || baseline.passed === baseline.total) return [];
  const prog = assemble(source);
  if (!prog.ok) return [];

  // si provano per primi i casi che già falliscono: una variante sbagliata viene scartata subito
  const failedKeys = new Set(baseline.results.filter((r) => !r.passed).map((r) => `${r.group}|${r.name}`));
  const ordered = [...tests.filter((t) => failedKeys.has(key(t))), ...tests.filter((t) => !failedKeys.has(key(t)))];
  const baseFail = baseline.total - baseline.passed;

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const vars = [...prog.symbols.values()]
    .filter((s) => s.type === 'data' && s.name)
    .map((s) => ({ name: s.name!, unit: s.size ?? 1 }));
  const start = performance.now();

  const fixes = new Map<number, string[]>();
  const partial = new Map<number, { fail: number; code: string }>();
  const lineDone = new Set<number>();

  outer: for (const ins of prog.order) {
    if (lineDone.has(ins.line)) continue;
    lineDone.add(ins.line);
    const raw = lines[ins.line - 1];
    if (raw === undefined) continue;
    const parsed = parseLine(raw);
    if (!parsed || /^(rep|repe|repz|repne|repnz|lock)$/i.test(parsed.mn)) continue;
    // la preparazione dei segmenti (mov ax, data / mov ds, ax / mov es, ax) non si tocca
    if (/^mov$/i.test(parsed.mn) && /^(ds|es|ss)$/i.test(parsed.ops[0] ?? '')) continue;
    if (/^mov$/i.test(parsed.mn) && /^ax$/i.test(parsed.ops[0] ?? '') && prog.symbols.get((parsed.ops[1] ?? '').toLowerCase())?.type === 'seg') continue;

    for (const m of mutantsFor(parsed.mn, parsed.ops, vars)) {
      if (performance.now() - start > TIME_BUDGET_MS) break outer;
      const mutated = [...lines];
      mutated[ins.line - 1] = parsed.prefix + m.code + parsed.suffix;
      const r = gradeProgram(mutated.join('\n'), ordered, {
        requires: opts.requires,
        maxSteps: 20000,
        maxFailures: Math.max(0, Math.floor(baseFail * 0.4)),
      });
      if (r.assemblyErrors.length) continue;
      const complete = r.results.length >= baseline.total - (opts.requires?.length ? 0 : 0);
      const fail = r.total - r.passed;
      if (complete && fail === 0) {
        const list = fixes.get(ins.line) ?? [];
        if (list.length < 3) list.push(m.code);
        fixes.set(ins.line, list);
      } else if (complete && fail <= Math.floor(baseFail * 0.4) && fail < baseFail) {
        const cur = partial.get(ins.line);
        if (!cur || fail < cur.fail) partial.set(ins.line, { fail, code: m.code });
      }
    }
  }

  const out: Suspect[] = [];
  for (const [line, sug] of fixes) {
    out.push({
      line,
      text: (lines[line - 1] ?? '').trim(),
      kind: 'fix',
      message: 'Questa riga è sbagliata: una sua piccola modifica fa passare tutti i test.',
      suggestions: sug,
    });
  }
  if (!out.length) {
    const best = [...partial.entries()].sort((a, b) => a[1].fail - b[1].fail).slice(0, 2);
    for (const [line, p] of best) {
      out.push({
        line,
        text: (lines[line - 1] ?? '').trim(),
        kind: 'partial',
        message: `Riga probabilmente sbagliata: modificandola falliscono molti meno test (${p.fail} su ${baseline.total}).`,
        suggestions: [p.code],
      });
    }
  }
  if (!out.length) {
    const w = writerLine(source, ordered.find((t) => failedKeys.has(key(t))));
    if (w) out.push({ ...w, text: (lines[w.line - 1] ?? '').trim() });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Fallback: la riga che scrive nella variabile (o stampa) il valore sbagliato nel primo caso fallito. */
function writerLine(source: string, test?: TestCase): Omit<Suspect, 'text'> | null {
  if (!test) return null;
  const prog = assemble(source);
  if (!prog.ok) return null;
  const m = new Machine(prog);
  const place = (name: string) => {
    const s = prog.symbols.get(name.toLowerCase());
    const seg = s && prog.segments.find((x) => x.name === s.seg);
    return s && seg ? { addr: seg.base * 16 + s.value, len: s.length ?? s.size ?? 1, unit: s.size ?? 1 } : null;
  };
  for (const [name, val] of Object.entries(test.init ?? {})) {
    const loc = place(name);
    if (!loc) continue;
    const arr = typeof val === 'string' ? [...val].map((c) => c.charCodeAt(0)) : typeof val === 'number' ? [val] : val;
    const bytes = typeof val === 'string' ? arr : arr.flatMap((x) => Array.from({ length: loc.unit }, (_, j) => (x >> (8 * j)) & 0xff));
    bytes.forEach((b, i) => m.poke(loc.addr + i, b));
  }
  for (const k of (test.input ?? '').replace(/\r?\n/g, '\r')) m.sendKey(k);
  m.run(20000);

  // variabile con valore diverso dall'atteso
  for (const [name, exp] of Object.entries(test.expect.vars ?? {})) {
    const loc = place(name);
    if (!loc) continue;
    const want =
      typeof exp === 'string'
        ? [...exp].map((c) => c.charCodeAt(0))
        : (typeof exp === 'number' ? [exp] : exp).flatMap((x) => Array.from({ length: loc.unit }, (_, j) => (x >> (8 * j)) & 0xff));
    const wrong = want.some((b, i) => m.rd8(loc.addr + i) !== b);
    if (!wrong) continue;
    for (let i = m.trace.length - 1; i >= 0; i--) {
      const t = m.trace[i];
      if (t.line && t.mem.some((w) => w.addr < loc.addr + loc.len && w.addr + w.to.length > loc.addr)) {
        return {
          line: t.line,
          kind: 'store',
          message: `Qui viene scritto il valore sbagliato in "${name}": controlla come è stato calcolato.`,
          suggestions: [],
        };
      }
    }
    return null; // la variabile non viene mai scritta: nessuna riga da indicare
  }
  // output diverso dall'atteso
  if (test.expect.outputExact !== undefined || test.expect.output?.length) {
    for (let i = m.trace.length - 1; i >= 0; i--) {
      const t = m.trace[i];
      if (t.line && t.out) {
        return { line: t.line, kind: 'output', message: "Qui viene stampato l'output sbagliato.", suggestions: [] };
      }
    }
  }
  return null;
}
