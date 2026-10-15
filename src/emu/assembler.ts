// Assemblatore 8086 (sottoinsieme didattico, sintassi emu8086).
// Due passate: la prima assegna indirizzi, la seconda risolve le espressioni.
// Le istruzioni non vengono codificate in byte: si conserva l'AST e la CPU lo esegue direttamente.

export interface AsmError {
  line: number; // 1-based
  message: string;
}

export type Reg16 = 'ax' | 'cx' | 'dx' | 'bx' | 'sp' | 'bp' | 'si' | 'di';
export type Reg8 = 'al' | 'cl' | 'dl' | 'bl' | 'ah' | 'ch' | 'dh' | 'bh';
export type SReg = 'es' | 'cs' | 'ss' | 'ds';

export const REG16: Reg16[] = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'];
export const REG8: Reg8[] = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh'];
export const SREG: SReg[] = ['es', 'cs', 'ss', 'ds'];

export type Operand =
  | { k: 'reg'; idx: number; size: 8 | 16 }
  | { k: 'sreg'; idx: number }
  | { k: 'imm'; value: number }
  | {
      k: 'mem';
      size: 0 | 8 | 16; // 0 = non specificata
      seg: number | null; // indice SREG di override
      base: 'bx' | 'bp' | null;
      index: 'si' | 'di' | null;
      disp: number;
    };

export interface Instr {
  line: number;
  seg: string;
  offset: number;
  size: number; // byte stimati (solo per visualizzazione/indirizzi)
  mnemonic: string;
  prefix: string | null;
  ops: Operand[];
  opSize: 8 | 16; // dimensione operazione dedotta
  text: string; // sorgente normalizzato
}

export interface Segment {
  name: string;
  kind: 'data' | 'code' | 'stack';
  base: number; // paragrafo (segmento) di caricamento
  size: number;
  bytes: Uint8Array;
  /** offset di inizio del codice (ORG): 100h nei programmi in formato COM */
  origin?: number;
}

export interface Symbol {
  /** nome come scritto nel sorgente */
  name?: string;
  type: 'data' | 'code' | 'const' | 'seg';
  seg?: string;
  value: number; // offset (data/code), valore (const), paragrafo (seg, risolto dopo il layout)
  size?: 1 | 2 | 4;
  /** byte totali occupati (variabili dati) */
  length?: number;
  /** la definizione contiene una stringa tra apici */
  text?: boolean;
}

export interface Program {
  ok: boolean;
  errors: AsmError[];
  segments: Segment[];
  instrs: Map<number, Instr>; // chiave: indirizzo lineare
  order: Instr[];
  symbols: Map<string, Symbol>;
  entryCS: number;
  entryIP: number;
  stackSS: number;
  stackSP: number;
  dataSeg: number;
  source: string[];
}

export const LOAD_BASE = 0x0700;
export const BUILTIN_BASE_IP = 0xff00; // offset speciale: le routine di emu8086.inc sono interne all'emulatore
export const BUILTINS = ['scan_num', 'print_num', 'print_num_uns', 'clear_screen'] as const;
const DEFINE_TO_BUILTIN: Record<string, string> = {
  DEFINE_SCAN_NUM: 'scan_num',
  DEFINE_PRINT_NUM: 'print_num',
  DEFINE_PRINT_NUM_UNS: 'print_num_uns',
  DEFINE_CLEAR_SCREEN: 'clear_screen',
};

const JCC = [
  'ja', 'jae', 'jb', 'jbe', 'jc', 'je', 'jg', 'jge', 'jl', 'jle', 'jna', 'jnae', 'jnb', 'jnbe',
  'jnc', 'jne', 'jng', 'jnge', 'jnl', 'jnle', 'jno', 'jnp', 'jns', 'jnz', 'jo', 'jp', 'jpe',
  'jpo', 'js', 'jz', 'jcxz',
];
const LOOPS = ['loop', 'loope', 'loopz', 'loopne', 'loopnz'];
const NO_OPS = [
  'nop', 'hlt', 'ret', 'retf', 'iret', 'clc', 'stc', 'cmc', 'cld', 'std', 'cli', 'sti', 'cbw',
  'cwd', 'pushf', 'popf', 'lahf', 'sahf', 'xlat', 'xlatb', 'movsb', 'movsw', 'cmpsb', 'cmpsw',
  'stosb', 'stosw', 'lodsb', 'lodsw', 'scasb', 'scasw', 'into', 'pusha', 'popa',
];
const ONE_OP = [
  'push', 'pop', 'inc', 'dec', 'neg', 'not', 'mul', 'imul', 'div', 'idiv', 'call', 'int',
  'jmp', 'ret',
  ...JCC, ...LOOPS,
];
const TWO_OP = [
  'mov', 'xchg', 'lea', 'add', 'adc', 'sub', 'sbb', 'cmp', 'and', 'or', 'xor', 'test',
  'shl', 'shr', 'sal', 'sar', 'rol', 'ror', 'rcl', 'rcr', 'les', 'lds', 'in', 'out',
];
// Macro di emu8086.inc, valide solo con `include 'emu8086.inc'`
const MACRO_OPS = ['print', 'printn', 'putc', 'gotoxy', 'pthis'];
const REPS = ['rep', 'repe', 'repz', 'repne', 'repnz', 'lock'];

class AsmErr extends Error {}

interface DataItem {
  kind: 'bytes' | 'dup';
  text: string;
}

interface Line {
  no: number;
  seg: string; // segmento corrente
  offset: number;
  kind: 'data' | 'instr' | 'equ';
  name?: string;
  directive?: 'db' | 'dw' | 'dd';
  body: string;
  size: number;
}

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ';') return s.slice(0, i);
  }
  return s;
}

// Divide per virgola ignorando virgole in stringhe, parentesi e [ ]
function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = '';
  for (const c of s) {
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === '(' || c === '[') {
      depth++;
      cur += c;
    } else if (c === ')' || c === ']') {
      depth--;
      cur += c;
    } else if (c === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseNumberToken(t: string): number | null {
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[01]+b$/i.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^[0-9]+d?$/i.test(t)) return parseInt(t, 10);
  return null;
}

interface EvalResult {
  value: number;
  dataRef: Symbol | null; // simbolo dati usato senza `offset`
  fromOffset: boolean;
}

class Evaluator {
  constructor(
    private symbols: Map<string, Symbol>,
    private allowForward: boolean,
  ) {}

  eval(text: string): EvalResult {
    const toks = this.tokenize(text);
    let p = 0;
    let dataRef: Symbol | null = null;
    let fromOffset = false;

    const parseExpr = (): number => {
      let v = parseTerm();
      while (p < toks.length && (toks[p] === '+' || toks[p] === '-')) {
        const op = toks[p++];
        const r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    };
    const parseTerm = (): number => {
      let v = parseUnary();
      while (p < toks.length && (toks[p] === '*' || toks[p] === '/')) {
        const op = toks[p++];
        const r = parseUnary();
        if (op === '/' && r === 0) throw new AsmErr('Divisione per zero nell\'espressione');
        v = op === '*' ? v * r : Math.trunc(v / r);
      }
      return v;
    };
    const parseUnary = (): number => {
      const t = toks[p];
      if (t === '-') {
        p++;
        return -parseUnary();
      }
      if (t === '+') {
        p++;
        return parseUnary();
      }
      if (t && t.toLowerCase() === 'offset') {
        p++;
        const id = toks[p++];
        const s = id ? this.symbols.get(id.toLowerCase()) : undefined;
        if (!s) {
          if (this.allowForward) return 0;
          throw new AsmErr(`Simbolo non definito: ${id ?? ''}`);
        }
        fromOffset = true;
        return s.value;
      }
      return parsePrimary();
    };
    const parsePrimary = (): number => {
      const t = toks[p++];
      if (t === undefined) throw new AsmErr('Espressione incompleta');
      if (t === '(') {
        const v = parseExpr();
        if (toks[p++] !== ')') throw new AsmErr('Parentesi non chiusa');
        return v;
      }
      if (t.startsWith('"') || t.startsWith("'")) {
        const body = t.slice(1, -1);
        if (body.length === 0 || body.length > 2)
          throw new AsmErr(`Stringa "${body}" non utilizzabile come numero`);
        return body.length === 1 ? body.charCodeAt(0) : (body.charCodeAt(0) << 8) | body.charCodeAt(1);
      }
      const n = parseNumberToken(t);
      if (n !== null) return n;
      if (/^[A-Za-z_.@$?][\w.@$?]*$/.test(t)) {
        const s = this.symbols.get(t.toLowerCase());
        if (!s) {
          if (this.allowForward) return 0;
          throw new AsmErr(`Simbolo non definito: ${t}`);
        }
        if (s.type === 'data') dataRef = s;
        return s.value;
      }
      throw new AsmErr(`Valore non valido: ${t}`);
    };

    const v = parseExpr();
    if (p < toks.length) throw new AsmErr(`Token inatteso "${toks[p]}" nell'espressione`);
    return { value: v, dataRef, fromOffset };
  }

  private tokenize(s: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if ('+-*/()'.includes(c)) {
        out.push(c);
        i++;
        continue;
      }
      if (c === '"' || c === "'") {
        const j = s.indexOf(c, i + 1);
        if (j < 0) throw new AsmErr('Stringa non terminata');
        out.push(s.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      const m = /^[A-Za-z0-9_.@$?]+/.exec(s.slice(i));
      if (!m) throw new AsmErr(`Carattere non valido "${c}"`);
      out.push(m[0]);
      i += m[0].length;
    }
    return out;
  }
}

function regInfo(name: string): Operand | null {
  const n = name.toLowerCase();
  let i = REG16.indexOf(n as Reg16);
  if (i >= 0) return { k: 'reg', idx: i, size: 16 };
  i = REG8.indexOf(n as Reg8);
  if (i >= 0) return { k: 'reg', idx: i, size: 8 };
  i = SREG.indexOf(n as SReg);
  if (i >= 0) return { k: 'sreg', idx: i };
  return null;
}

const MNEMONICS = new Set<string>([...NO_OPS, ...ONE_OP, ...TWO_OP]);

export function assemble(source: string): Program {
  const srcLines = source.replace(/\r\n?/g, '\n').split('\n');
  const errors: AsmError[] = [];
  const err = (line: number, message: string) => errors.push({ line, message });

  const symbols = new Map<string, Symbol>();
  const lines: Line[] = [];
  const segOrder: { name: string; kind: Segment['kind']; size: number }[] = [];
  const segSizes = new Map<string, number>();
  let curSeg: string | null = null;
  let includeSeen = false;
  const wantedBuiltins = new Set<string>();
  let entryLabel: string | null = null;
  let procDepth: string[] = [];
  const consts = new Evaluator(symbols, false);
  // formato COM di emu8086: niente segmenti, `org 100h`, dati dopo il codice
  let ended = false; // dopo `end` il resto del file è ignorato
  let explicitSeg = false; // è comparsa una direttiva di segmento (formato EXE)
  const origins = new Map<string, number>();
  const toImplicit = (what: string) => {
    if (curSeg) return;
    if (explicitSeg) throw new AsmErr(`${what} fuori da un segmento`);
    ensureSeg('#com', 'code');
    curSeg = '#com';
  };

  const ensureSeg = (name: string, kind: Segment['kind']) => {
    if (!segSizes.has(name)) {
      segSizes.set(name, 0);
      segOrder.push({ name, kind, size: 0 });
    }
  };
  const defSymbol = (no: number, name: string, sym: Symbol) => {
    const k = name.toLowerCase();
    if (symbols.has(k)) {
      err(no, `Simbolo già definito: ${name}`);
      return;
    }
    sym.name = name;
    symbols.set(k, sym);
  };
  const advance = (n: number) => {
    if (curSeg) segSizes.set(curSeg, (segSizes.get(curSeg) ?? 0) + n);
  };

  // ---------- Passata 1 ----------
  srcLines.forEach((raw, i) => {
    const no = i + 1;
    let s = stripComment(raw).trim();
    if (ended || !s) return;

    try {
      // name "programma": solo un'etichetta del programma
      if (/^name\s+(["']).*\1\s*$/i.test(s)) return;

      // include
      if (/^include\b/i.test(s)) {
        if (/emu8086\.inc/i.test(s)) includeSeen = true;
        else throw new AsmErr('Include non supportato (solo emu8086.inc)');
        return;
      }
      // DEFINE_xxx
      const def = /^(DEFINE_[A-Z_]+)\s*$/i.exec(s);
      if (def) {
        const b = DEFINE_TO_BUILTIN[def[1].toUpperCase()];
        if (!includeSeen) throw new AsmErr(`${def[1]} richiede include 'emu8086.inc'`);
        if (!b) throw new AsmErr(`Macro sconosciuta: ${def[1]}`);
        wantedBuiltins.add(b);
        return;
      }
      // .model / .stack / .data / .code (sintassi semplificata)
      let m = /^\.(model|stack|data|code)\b\s*(.*)$/i.exec(s);
      if (m) {
        explicitSeg = true;
        const d = m[1].toLowerCase();
        if (d === 'model') return;
        if (d === 'stack') {
          ensureSeg('stack', 'stack');
          curSeg = 'stack';
          const n = m[2] ? consts.eval(m[2]).value : 1024;
          segSizes.set('stack', n);
          symbols.set('@stack', { type: 'seg', seg: 'stack', value: 0 });
          return;
        }
        ensureSeg(d, d === 'data' ? 'data' : 'code');
        curSeg = d;
        symbols.set('@' + d, { type: 'seg', seg: d, value: 0 });
        return;
      }
      // name segment / segment name
      m = /^([A-Za-z_]\w*)\s+segment\b/i.exec(s);
      if (m) {
        explicitSeg = true;
        const nm = m[1].toLowerCase();
        const kind: Segment['kind'] = /stack/.test(nm) ? 'stack' : /code|cs/.test(nm) ? 'code' : 'data';
        ensureSeg(nm, kind);
        curSeg = nm;
        symbols.set(nm, { type: 'seg', seg: nm, value: 0 });
        return;
      }
      if (/^ends\b/i.test(s) || /^[A-Za-z_]\w*\s+ends\b/i.test(s)) {
        curSeg = null;
        return;
      }
      // end [label]
      m = /^end(?:\s+([A-Za-z_]\w*))?\s*$/i.exec(s);
      if (m) {
        if (m[1]) entryLabel = m[1].toLowerCase();
        ended = true;
        return;
      }
      // org
      m = /^org\s+(.+)$/i.exec(s);
      if (m) {
        toImplicit('ORG');
        const v = consts.eval(m[1]).value;
        if ((segSizes.get(curSeg!) ?? 0) === 0 && !origins.has(curSeg!)) origins.set(curSeg!, v);
        segSizes.set(curSeg!, v);
        return;
      }
      // proc / endp
      m = /^([A-Za-z_]\w*)\s+proc\b/i.exec(s);
      if (m) {
        toImplicit('PROC');
        defSymbol(no, m[1], { type: 'code', seg: curSeg!, value: segSizes.get(curSeg!) ?? 0 });
        procDepth.push(m[1]);
        return;
      }
      if (/^([A-Za-z_]\w*\s+)?endp\b/i.test(s)) {
        procDepth.pop();
        return;
      }
      // equ / =
      m = /^([A-Za-z_]\w*)\s+(?:equ|=)\s+(.+)$/i.exec(s);
      if (m) {
        const v = consts.eval(m[2]).value;
        defSymbol(no, m[1], { type: 'const', value: v });
        return;
      }

      // etichetta "nome:"
      let rest = s;
      m = /^([A-Za-z_.@$?][\w.@$?]*)\s*:\s*(.*)$/.exec(s);
      if (m) {
        toImplicit('Etichetta');
        defSymbol(no, m[1], { type: 'code', seg: curSeg!, value: segSizes.get(curSeg!) ?? 0 });
        rest = m[2].trim();
        if (!rest) return;
      }

      // dati: [nome] db|dw|dd ...
      m = /^(?:([A-Za-z_.@$?][\w.@$?]*)\s+)?(db|dw|dd)\b\s*(.*)$/i.exec(rest);
      if (m && !(m[1] && MNEMONICS.has(m[1].toLowerCase()))) {
        toImplicit('Definizione dati');
        const dir = m[2].toLowerCase() as 'db' | 'dw' | 'dd';
        const unit = dir === 'db' ? 1 : dir === 'dw' ? 2 : 4;
        if (!m[3].trim()) throw new AsmErr(`${dir.toUpperCase()} senza valori`);
        const off = segSizes.get(curSeg!) ?? 0;
        const sym: Symbol = { type: 'data', seg: curSeg!, value: off, size: unit as 1 | 2 | 4, text: /["']/.test(m[3]) };
        if (m[1]) defSymbol(no, m[1], sym);
        const size = dataSize(m[3], unit, consts);
        sym.length = size;
        lines.push({ no, seg: curSeg!, offset: off, kind: 'data', name: m[1], directive: dir, body: m[3], size });
        advance(size);
        return;
      }

      // istruzione
      toImplicit('Istruzione');
      const size = estimateSize(rest);
      lines.push({ no, seg: curSeg!, offset: segSizes.get(curSeg!) ?? 0, kind: 'instr', body: rest, size });
      advance(size);
    } catch (e) {
      if (e instanceof AsmErr) err(no, e.message);
      else throw e;
    }
  });
  void procDepth;

  // ---------- Layout ----------
  const segments: Segment[] = [];
  let paragraph = LOAD_BASE;
  for (const so of segOrder) {
    let size = segSizes.get(so.name) ?? 0;
    if (so.kind === 'stack' && size === 0) size = 256;
    const padded = Math.max(16, (size + 15) & ~15);
    segments.push({ name: so.name, kind: so.kind, base: paragraph, size, bytes: new Uint8Array(padded), origin: origins.get(so.name) });
    const sym = symbols.get(so.name);
    if (sym) sym.value = paragraph;
    paragraph += padded >> 4;
  }
  const dataSegObj = segments.find((s) => s.kind === 'data');
  const dataAlias = symbols.get('@data');
  if (dataAlias && dataSegObj) dataAlias.value = dataSegObj.base;
  for (const k of ['@code', '@stack']) {
    const a = symbols.get(k);
    const sg = segments.find((x) => x.name === a?.seg);
    if (a && sg) a.value = sg.base;
  }
  const segByName = new Map(segments.map((s) => [s.name, s]));

  // Simboli builtin di emu8086.inc
  BUILTINS.forEach((b, i) => {
    if (wantedBuiltins.has(b)) symbols.set(b, { type: 'code', seg: '#builtin', value: BUILTIN_BASE_IP + i });
  });

  // ---------- Passata 2 ----------
  const ev = new Evaluator(symbols, false);
  const instrs = new Map<number, Instr>();
  const order: Instr[] = [];

  for (const ln of lines) {
    const segObj = segByName.get(ln.seg)!;
    try {
      if (ln.kind === 'data') {
        const bytes = encodeData(ln.body, ln.directive!, ev);
        segObj.bytes.set(bytes, ln.offset);
        continue;
      }
      const ins = parseInstr(ln, symbols, ev, includeSeen);
      ins.size = ln.size;
      instrs.set(segObj.base * 16 + ln.offset, ins);
      order.push(ins);
    } catch (e) {
      if (e instanceof AsmErr) err(ln.no, e.message);
      else throw e;
    }
  }

  // Entry point
  let entryCS = 0;
  let entryIP = 0;
  if (entryLabel) {
    const s = symbols.get(entryLabel);
    if (!s || s.type !== 'code') err(srcLines.length, `Punto di ingresso non valido: ${entryLabel}`);
    else {
      entryCS = segByName.get(s.seg!)?.base ?? 0;
      entryIP = s.value;
    }
  } else {
    const code = segments.find((s) => s.kind === 'code');
    if (code) {
      entryCS = code.base;
      entryIP = code.origin ?? 0;
    }
  }
  if (!segments.some((s) => s.kind === 'code') && errors.length === 0)
    err(1, 'Nessun segmento di codice trovato');

  const stack = segments.find((s) => s.kind === 'stack');
  errors.sort((a, b) => a.line - b.line);
  return {
    ok: errors.length === 0,
    errors,
    segments,
    instrs,
    order,
    symbols,
    entryCS,
    entryIP,
    stackSS: stack ? stack.base : entryCS,
    stackSP: stack ? stack.size : 0xfffe,
    dataSeg: dataSegObj ? dataSegObj.base : entryCS,
    source: srcLines,
  };
}

// ---------- Dati ----------

function splitDupItems(body: string): string[] {
  const items = splitTop(body, ',').map((x) => x.trim());
  if (items.some((x) => x === '')) throw new AsmErr('Valore vuoto: virgola in eccesso');
  return items;
}

function dupMatch(item: string): { count: string; inner: string } | null {
  const m = /^(.+?)\s+dup\s*\((.*)\)$/i.exec(item);
  return m ? { count: m[1], inner: m[2] } : null;
}

function itemSize(item: string, unit: number, consts: Evaluator): number {
  const d = dupMatch(item);
  if (d) {
    const n = consts.eval(d.count).value;
    if (n < 0) throw new AsmErr('Contatore DUP negativo');
    return n * splitDupItems(d.inner).reduce((a, x) => a + itemSize(x, unit, consts), 0);
  }
  if (item === '?') return unit;
  const str = /^(["'])(.*)\1$/.exec(item);
  if (str && str[2].length !== 1) {
    if (unit !== 1) {
      if (str[2].length > 2) throw new AsmErr('Stringa troppo lunga per DW');
      return unit;
    }
    return str[2].length;
  }
  return unit;
}

function dataSize(body: string, unit: number, consts: Evaluator): number {
  checkMissingComma(body);
  return splitDupItems(body).reduce((a, x) => a + itemSize(x, unit, consts), 0);
}

// Due valori consecutivi senza virgola ("13,10 "testo"") sono un errore.
function checkMissingComma(body: string) {
  for (const item of splitTop(body, ',')) {
    const t = item.trim();
    if (dupMatch(t)) {
      checkMissingComma(dupMatch(t)!.inner);
      continue;
    }
    // sequenza: [valore] spazio [stringa|numero] fuori da stringhe
    if (/^(?:[^\s"']+|"[^"]*"|'[^']*')\s+(?:["']|\d|[A-Za-z_])/.test(t) && !/\bdup\b/i.test(t)) {
      const op = /^offset\s/i.test(t) || /[+\-*/]\s/.test(t);
      if (!op) throw new AsmErr('Manca una virgola tra i valori della definizione dati');
    }
  }
}

function encodeData(body: string, dir: 'db' | 'dw' | 'dd', ev: Evaluator): number[] {
  const unit = dir === 'db' ? 1 : dir === 'dw' ? 2 : 4;
  const out: number[] = [];
  const emit = (v: number) => {
    if (unit === 1 && (v < -128 || v > 255)) throw new AsmErr(`Valore ${v} fuori range per DB`);
    if (unit === 2 && (v < -32768 || v > 65535)) throw new AsmErr(`Valore ${v} fuori range per DW`);
    for (let i = 0; i < unit; i++) out.push((v >> (8 * i)) & 0xff);
  };
  const walk = (b: string) => {
    for (const raw of splitDupItems(b)) {
      const item = raw.trim();
      const d = dupMatch(item);
      if (d) {
        const n = ev.eval(d.count).value;
        const inner: number[] = [];
        const save = out.length;
        walk(d.inner);
        inner.push(...out.splice(save));
        for (let i = 0; i < n; i++) out.push(...inner);
        continue;
      }
      if (item === '?') {
        for (let i = 0; i < unit; i++) out.push(0);
        continue;
      }
      const str = /^(["'])(.*)\1$/.exec(item);
      if (str && str[2].length > 1 && unit === 1) {
        for (const ch of str[2]) emit(ch.charCodeAt(0));
        continue;
      }
      if (str && str[2].length === 2 && unit === 2) {
        emit((str[2].charCodeAt(0) << 8) | str[2].charCodeAt(1));
        continue;
      }
      emit(ev.eval(item).value);
    }
  };
  walk(body);
  return out;
}

// ---------- Istruzioni ----------

function estimateSize(text: string): number {
  const t = text.trim().toLowerCase();
  const sp = t.search(/\s/);
  if (sp < 0) return 1;
  const ops = splitTop(t.slice(sp), ',').map((x) => x.trim());
  if (ops.length === 1) return /^\[/.test(ops[0]) || /^[a-z_]\w*$/.test(ops[0]) ? 3 : 2;
  const regs = ops.filter((o) => regInfo(o) !== null).length;
  if (regs === 2) return 2;
  return ops.some((o) => o.includes('[')) ? 4 : 3;
}

function parseOperand(text: string, symbols: Map<string, Symbol>, ev: Evaluator): Operand {
  let t = text.trim();
  if (!t) throw new AsmErr('Operando vuoto');
  let size: 0 | 8 | 16 = 0;
  const ptr = /^(byte|word)\s+ptr\s+/i.exec(t);
  if (ptr) {
    size = ptr[1].toLowerCase() === 'byte' ? 8 : 16;
    t = t.slice(ptr[0].length).trim();
  }
  const r = regInfo(t);
  if (r) return r;

  let seg: number | null = null;
  const so = /^(es|cs|ss|ds)\s*:\s*(.*)$/i.exec(t);
  if (so) {
    seg = SREG.indexOf(so[1].toLowerCase() as SReg);
    t = so[2].trim();
  }

  const parseBracket = (inner: string) => {
    let base: 'bx' | 'bp' | null = null;
    let index: 'si' | 'di' | null = null;
    let disp = 0;
    const terms = inner.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? [];
    for (const term of terms) {
      const sign = term.startsWith('-') ? -1 : 1;
      const body = term.replace(/^[+-]/, '');
      const lower = body.toLowerCase();
      if (lower === 'bx' || lower === 'bp') {
        if (sign < 0 || base) throw new AsmErr('Combinazione di registri base non valida');
        base = lower;
      } else if (lower === 'si' || lower === 'di') {
        if (sign < 0 || index) throw new AsmErr('Combinazione di registri indice non valida');
        index = lower;
      } else if (['ax', 'cx', 'dx', 'sp', 'al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh'].includes(lower)) {
        throw new AsmErr(`Il registro ${lower.toUpperCase()} non può essere usato come indirizzo (solo BX, BP, SI, DI)`);
      } else {
        disp += sign * ev.eval(body).value;
      }
    }
    return { base, index, disp };
  };

  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new AsmErr('Parentesi quadra non chiusa');
    const { base, index, disp } = parseBracket(t.slice(1, -1));
    return { k: 'mem', size, seg, base, index, disp };
  }
  // nome[bx+si]
  const nb = /^([A-Za-z_.@$?][\w.@$?]*)\s*\[(.*)\]$/.exec(t);
  if (nb) {
    const s = symbols.get(nb[1].toLowerCase());
    if (!s || s.type !== 'data') throw new AsmErr(`Variabile non definita: ${nb[1]}`);
    const { base, index, disp } = parseBracket(nb[2]);
    return { k: 'mem', size: size || ((s.size! * 8) as 8 | 16), seg, base, index, disp: disp + s.value };
  }
  const res = ev.eval(t);
  if (res.dataRef && !res.fromOffset) {
    const sz = res.dataRef.size === 1 ? 8 : 16;
    return { k: 'mem', size: size || sz, seg, base: null, index: null, disp: res.value };
  }
  return { k: 'imm', value: res.value };
}

function parseInstr(ln: Line, symbols: Map<string, Symbol>, ev: Evaluator, includeSeen: boolean): Instr {
  let text = ln.body.trim();
  let prefix: string | null = null;
  let m = /^([A-Za-z]+)\s+(.*)$/.exec(text);
  if (m && REPS.includes(m[1].toLowerCase())) {
    prefix = m[1].toLowerCase();
    text = m[2].trim();
  }
  m = /^([A-Za-z_][\w]*)\s*(.*)$/.exec(text);
  if (!m) throw new AsmErr(`Istruzione non valida: ${text}`);
  const mn = m[1].toLowerCase();
  const rawOps = m[2].trim() ? splitTop(m[2], ',') : [];

  const isMacro = MACRO_OPS.includes(mn);
  if (isMacro && !includeSeen) throw new AsmErr(`${mn.toUpperCase()} richiede include 'emu8086.inc'`);
  if (!MNEMONICS.has(mn) && !isMacro) throw new AsmErr(`Istruzione sconosciuta: ${m[1]}`);

  // macro: operandi grezzi
  if (isMacro) {
    return {
      line: ln.no, seg: ln.seg, offset: ln.offset, size: 0, mnemonic: mn, prefix,
      ops: rawOps.map((o) => {
        const t = o.trim();
        const str = /^(["'])(.*)\1$/.exec(t);
        if (str) return { k: 'imm', value: str[2].length === 1 ? str[2].charCodeAt(0) : 0 } as Operand;
        return parseOperand(t, symbols, ev);
      }),
      opSize: 8,
      text: text.replace(/\s+/g, ' '),
    };
  }

  const ops = rawOps.map((o) => parseOperand(o, symbols, ev));

  const expect = (n: number) => {
    if (ops.length !== n)
      throw new AsmErr(`${mn.toUpperCase()} richiede ${n} operand${n === 1 ? 'o' : 'i'}, trovati ${ops.length}`);
  };
  if (NO_OPS.includes(mn) && !(mn === 'ret' && ops.length === 1)) expect(0);
  else if (TWO_OP.includes(mn) && !ONE_OP.includes(mn)) expect(2);
  else if (ONE_OP.includes(mn) && !(mn === 'ret' && ops.length === 0)) expect(1);

  // dimensione operazione
  let opSize: 8 | 16 = 8;
  const regOp = ops.find((o) => o.k === 'reg') as Extract<Operand, { k: 'reg' }> | undefined;
  const memOp = ops.find((o) => o.k === 'mem') as Extract<Operand, { k: 'mem' }> | undefined;
  if (['push', 'pop', 'call', 'jmp', 'lea', 'cbw', 'cwd'].includes(mn) || ops.some((o) => o.k === 'sreg')) opSize = 16;
  else if (['shl', 'shr', 'sal', 'sar', 'rol', 'ror', 'rcl', 'rcr'].includes(mn)) {
    const a = ops[0];
    opSize = a.k === 'reg' ? a.size : a.k === 'mem' && a.size ? a.size : 8;
  } else if (regOp) opSize = regOp.size;
  else if (memOp && memOp.size) opSize = memOp.size;
  else opSize = 8;

  // controlli di compatibilità
  if (mn === 'mov' || ['add', 'adc', 'sub', 'sbb', 'cmp', 'and', 'or', 'xor', 'test', 'xchg'].includes(mn)) {
    const [a, b] = ops;
    if (a.k === 'imm') throw new AsmErr(`Il primo operando di ${mn.toUpperCase()} non può essere una costante`);
    if (a.k === 'mem' && b.k === 'mem') throw new AsmErr('Non si può usare memoria in entrambi gli operandi');
    if (a.k === 'reg' && b.k === 'reg' && a.size !== b.size)
      throw new AsmErr('Gli operandi hanno dimensioni diverse (8 e 16 bit)');
    if (a.k === 'reg' && b.k === 'mem' && b.size && b.size !== a.size)
      throw new AsmErr('La variabile e il registro hanno dimensioni diverse');
    if (b.k === 'reg' && a.k === 'mem' && a.size && a.size !== b.size)
      throw new AsmErr('La variabile e il registro hanno dimensioni diverse');
    if (a.k === 'mem' && b.k === 'imm' && a.size === 0) opSize = 8;
    if (b.k === 'imm' && a.k !== 'sreg') {
      const limit = opSize === 8 ? 255 : 65535;
      if (b.value > limit || b.value < -(limit + 1) / 2)
        throw new AsmErr(`La costante ${b.value} non entra in ${opSize} bit`);
    }
    if (a.k === 'sreg' && (b.k === 'imm')) throw new AsmErr('Non si può caricare una costante in un registro di segmento');
    if (a.k === 'sreg' && a.idx === 1) throw new AsmErr('CS non può essere modificato con MOV');
    if (a.k === 'sreg' && b.k === 'sreg') throw new AsmErr('MOV tra registri di segmento non consentito');
  }
  if (mn === 'lea') {
    if (ops[0].k !== 'reg' || ops[0].size !== 16) throw new AsmErr('LEA richiede un registro a 16 bit come destinazione');
    if (ops[1].k !== 'mem') throw new AsmErr('LEA richiede una variabile o un indirizzo di memoria come sorgente');
  }
  if (['inc', 'dec', 'neg', 'not'].includes(mn) && ops[0].k === 'imm')
    throw new AsmErr(`${mn.toUpperCase()} non accetta una costante`);
  if (['mul', 'imul', 'div', 'idiv'].includes(mn) && ops[0].k === 'imm')
    throw new AsmErr(`${mn.toUpperCase()} non accetta una costante: usare un registro o una variabile`);
  if (['push', 'pop'].includes(mn)) {
    const o = ops[0];
    if (o.k === 'reg' && o.size === 8) throw new AsmErr(`${mn.toUpperCase()} richiede un registro a 16 bit`);
    if (o.k === 'imm' && mn === 'pop') throw new AsmErr('POP non accetta una costante');
  }
  if (['shl', 'shr', 'sal', 'sar', 'rol', 'ror', 'rcl', 'rcr'].includes(mn)) {
    const c = ops[1];
    if (c.k === 'reg' ? !(c.size === 8 && c.idx === 1) : c.k !== 'imm')
      throw new AsmErr(`${mn.toUpperCase()}: il numero di posizioni deve essere una costante o CL`);
  }
  if ([...JCC, ...LOOPS, 'jmp', 'call'].includes(mn)) {
    const o = ops[0];
    if (o.k === 'imm') {
      const t = rawOps[0].trim().toLowerCase();
      const s = symbols.get(t);
      if (!s || s.type !== 'code') throw new AsmErr(`Etichetta non definita: ${rawOps[0].trim()}`);
    }
    if (o.k === 'mem' && o.base === null && o.index === null && rawOps[0].trim().toLowerCase() in {}) {
      /* noop */
    }
  }
  if (mn === 'int' && ops[0].k !== 'imm') throw new AsmErr('INT richiede un numero di interruzione');
  if (mn === 'xchg' && (ops[0].k === 'imm' || ops[1].k === 'imm')) throw new AsmErr('XCHG non accetta costanti');

  return {
    line: ln.no, seg: ln.seg, offset: ln.offset, size: 0, mnemonic: mn, prefix, ops, opSize,
    text: text.replace(/\s+/g, ' '),
  };
}
