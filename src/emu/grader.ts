// Correzione automatica: esegue il programma con input/valori iniziali e confronta il risultato.
import { assemble, type AsmError, type Program } from './assembler';
import { Machine } from './cpu';

export type Scalar = number | number[] | string;

export interface TestCase {
  name: string;
  /** valori iniziali delle variabili dati (prima dell'esecuzione) */
  init?: Record<string, Scalar>;
  /** testo digitato dall'utente; "\n" equivale a Invio */
  input?: string;
  expect: {
    /** valori attesi delle variabili a fine programma */
    vars?: Record<string, Scalar>;
    /** valori attesi dei registri a fine programma (ax, bl, ...) */
    regs?: Record<string, number>;
    /** sottostringhe che devono comparire nell'output, in questo ordine */
    output?: string[];
  };
}

export interface TestResult {
  name: string;
  passed: boolean;
  details: string[]; // una riga per ogni verifica fallita
  output: string;
  runtimeError?: string;
  errorLine?: number | null;
}

export interface GradeReport {
  assemblyErrors: AsmError[];
  results: TestResult[];
  passed: number;
  total: number;
  /** righe da evidenziare in rosso (errori di assemblaggio o di esecuzione) */
  errorLines: Map<number, string>;
}

const MAX_STEPS = 200_000;

const REG16 = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'];
const REG8 = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh'];

function regValue(m: Machine, name: string): number | null {
  const n = name.toLowerCase();
  let i = REG16.indexOf(n);
  if (i >= 0) return m.regs[i];
  i = REG8.indexOf(n);
  if (i >= 0) return m.getReg(i, 8);
  return null;
}

function symbolAddr(prog: Program, name: string): { addr: number; unit: 1 | 2 | 4 } | null {
  const s = prog.symbols.get(name.toLowerCase());
  if (!s || s.type !== 'data') return null;
  const seg = prog.segments.find((x) => x.name === s.seg);
  if (!seg) return null;
  return { addr: seg.base * 16 + s.value, unit: s.size ?? 1 };
}

function toBytes(v: Scalar, unit: number): number[] {
  if (typeof v === 'string') return [...v].map((c) => c.charCodeAt(0));
  const arr = typeof v === 'number' ? [v] : v;
  const out: number[] = [];
  for (const x of arr) for (let i = 0; i < unit; i++) out.push((x >> (8 * i)) & 0xff);
  return out;
}

function fmtBytes(bytes: number[], unit: number, asString: boolean): string {
  if (asString) return JSON.stringify(String.fromCharCode(...bytes));
  const vals: number[] = [];
  for (let i = 0; i + unit <= bytes.length; i += unit) {
    let v = 0;
    for (let j = 0; j < unit; j++) v |= bytes[i + j] << (8 * j);
    vals.push(v >>> 0);
  }
  return vals.length === 1 ? String(vals[0]) : `[${vals.join(', ')}]`;
}

export interface GradeOptions {
  /** mnemonici che il programma deve contenere (es. ['call', 'ret']) */
  requires?: string[];
}

export function gradeProgram(source: string, tests: TestCase[], opts: GradeOptions = {}): GradeReport {
  const prog = assemble(source);
  const errorLines = new Map<number, string>();
  if (!prog.ok) {
    for (const e of prog.errors) if (!errorLines.has(e.line)) errorLines.set(e.line, e.message);
    return { assemblyErrors: prog.errors, results: [], passed: 0, total: tests.length + (opts.requires?.length ? 1 : 0), errorLines };
  }

  const results: TestResult[] = [];
  if (opts.requires?.length) {
    const used = new Set(prog.order.map((i) => i.mnemonic));
    const missing = opts.requires.filter((r) => !used.has(r.toLowerCase()));
    results.push({
      name: 'Struttura del programma',
      passed: missing.length === 0,
      details: missing.map((r) => `Il programma deve usare l'istruzione ${r.toUpperCase()}`),
      output: '',
    });
  }
  for (const t of tests) {
    const details: string[] = [];
    const m = new Machine(prog);
    // valori iniziali
    for (const [name, val] of Object.entries(t.init ?? {})) {
      const loc = symbolAddr(prog, name);
      if (!loc) {
        details.push(`Il test imposta la variabile "${name}" ma nel programma non esiste: va dichiarata nel segmento dati.`);
        continue;
      }
      toBytes(val, loc.unit).forEach((b, i) => (m.mem[loc.addr + i] = b));
    }
    for (const k of (t.input ?? '').replace(/\r?\n/g, '\r')) m.sendKey(k);

    m.run(MAX_STEPS);
    let runtimeError: string | undefined;
    let errorLine: number | null | undefined;
    if (m.status === 'error') {
      runtimeError = m.error ?? 'Errore di esecuzione';
      errorLine = m.lastLine;
    } else if (m.status === 'waiting') {
      runtimeError = 'Il programma resta in attesa di un input che il test non fornisce (ne legge più del previsto).';
      errorLine = m.currentLine;
    } else if (m.status !== 'halted') {
      runtimeError = `Il programma non termina entro ${MAX_STEPS.toLocaleString('it-IT')} istruzioni (ciclo infinito?).`;
      errorLine = m.currentLine;
    }
    if (runtimeError) {
      details.push(runtimeError);
      if (errorLine && !errorLines.has(errorLine)) errorLines.set(errorLine, runtimeError);
    } else {
      for (const [name, exp] of Object.entries(t.expect.vars ?? {})) {
        const loc = symbolAddr(prog, name);
        if (!loc) {
          details.push(`Variabile "${name}" non trovata: va dichiarata nel segmento dati.`);
          continue;
        }
        const want = toBytes(exp, loc.unit);
        const got = want.map((_, i) => m.rd8(loc.addr + i));
        if (want.some((b, i) => b !== got[i])) {
          const isStr = typeof exp === 'string';
          details.push(
            `${name}: atteso ${fmtBytes(want, loc.unit, isStr)}, ottenuto ${fmtBytes(got, loc.unit, isStr)}`,
          );
        }
      }
      for (const [name, exp] of Object.entries(t.expect.regs ?? {})) {
        const got = regValue(m, name);
        if (got === null) details.push(`Registro sconosciuto nel test: ${name}`);
        else {
          const mask = REG8.includes(name.toLowerCase()) ? 0xff : 0xffff;
          if ((got & mask) !== (exp & mask)) details.push(`${name.toUpperCase()}: atteso ${exp & mask}, ottenuto ${got}`);
        }
      }
      let pos = 0;
      for (const frag of t.expect.output ?? []) {
        const i = m.out.indexOf(frag, pos);
        if (i < 0) {
          details.push(`Nell'output manca "${frag}"${pos > 0 ? ' (nell\'ordine previsto)' : ''}`);
          break;
        }
        pos = i + frag.length;
      }
    }
    results.push({ name: t.name, passed: details.length === 0, details, output: m.out, runtimeError, errorLine });
  }
  return {
    assemblyErrors: [],
    results,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    errorLines,
  };
}
