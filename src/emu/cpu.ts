// CPU 8086 + mini-DOS: esegue il Program prodotto dall'assemblatore.
import { BUILTIN_BASE_IP, BUILTINS, type Instr, type Operand, type Program } from './assembler';

export const CF = 0x0001, PF = 0x0004, AF = 0x0010, ZF = 0x0040, SF = 0x0080;
export const TF = 0x0100, IF = 0x0200, DF = 0x0400, OF = 0x0800;

export type Status = 'ready' | 'running' | 'waiting' | 'halted' | 'error';

export class CpuError extends Error {}

interface Snapshot {
  regs: Uint16Array;
  segs: Uint16Array;
  ip: number;
  flags: number;
  out: string;
  writes: [number, number][];
  consumed: string[];
  scanBuf: string;
  status: Status;
  inBuf: string;
}

const MAX_UNDO = 5000;

function parity(v: number): boolean {
  let x = v & 0xff;
  x ^= x >> 4;
  x ^= x >> 2;
  x ^= x >> 1;
  return (x & 1) === 0;
}

export class Machine {
  mem = new Uint8Array(0x100000);
  regs = new Uint16Array(8); // AX CX DX BX SP BP SI DI
  segs = new Uint16Array(4); // ES CS SS DS
  ip = 0;
  flags = 0x0002;
  out = '';
  status: Status = 'ready';
  error: string | null = null;
  steps = 0;

  private input: string[] = [];
  private scanBuf = '';
  private writes: [number, number][] = [];
  private consumed: string[] = [];
  private undo: Snapshot[] = [];
  private snap: Snapshot | null = null;
  private haltedFlag = false;

  constructor(public program: Program) {
    this.reset();
  }

  // ---------- ciclo di vita ----------
  reset() {
    this.mem.fill(0);
    for (const s of this.program.segments) this.mem.set(s.bytes, s.base * 16);
    this.regs.fill(0);
    this.segs.fill(0);
    const p = this.program;
    this.segs[1] = p.entryCS;
    this.segs[3] = p.entryCS; // DS=ES=CS all'avvio, come emu8086
    this.segs[0] = p.entryCS;
    this.segs[2] = p.stackSS;
    this.regs[4] = p.stackSP & 0xffff;
    this.ip = p.entryIP;
    this.flags = 0x0002;
    this.out = '';
    this.status = 'ready';
    this.error = null;
    this.steps = 0;
    this.input = [];
    this.scanBuf = '';
    this.undo = [];
    this.snap = null;
    this.writes = [];
    this.consumed = [];
    this.haltedFlag = false;
  }

  // ---------- accesso a registri ----------
  getReg(idx: number, size: 8 | 16): number {
    if (size === 16) return this.regs[idx];
    return idx < 4 ? this.regs[idx] & 0xff : (this.regs[idx - 4] >> 8) & 0xff;
  }
  setReg(idx: number, size: 8 | 16, v: number) {
    if (size === 16) this.regs[idx] = v & 0xffff;
    else if (idx < 4) this.regs[idx] = (this.regs[idx] & 0xff00) | (v & 0xff);
    else this.regs[idx - 4] = (this.regs[idx - 4] & 0x00ff) | ((v & 0xff) << 8);
  }
  get ax() { return this.regs[0]; }
  get cx() { return this.regs[1]; }
  get dx() { return this.regs[2]; }
  get bx() { return this.regs[3]; }
  get sp() { return this.regs[4]; }
  get bp() { return this.regs[5]; }
  get si() { return this.regs[6]; }
  get di() { return this.regs[7]; }
  get es() { return this.segs[0]; }
  get cs() { return this.segs[1]; }
  get ss() { return this.segs[2]; }
  get ds() { return this.segs[3]; }

  // ---------- memoria ----------
  rd8(addr: number): number {
    return this.mem[addr & 0xfffff];
  }
  wr8(addr: number, v: number) {
    const a = addr & 0xfffff;
    this.writes.push([a, this.mem[a]]);
    this.mem[a] = v & 0xff;
  }
  rd16(addr: number): number {
    return this.rd8(addr) | (this.rd8(addr + 1) << 8);
  }
  wr16(addr: number, v: number) {
    this.wr8(addr, v);
    this.wr8(addr + 1, v >> 8);
  }
  lin(seg: number, off: number): number {
    return ((seg << 4) + (off & 0xffff)) & 0xfffff;
  }
  private ea(o: Extract<Operand, { k: 'mem' }>): number {
    let off = o.disp;
    if (o.base) off += this.regs[o.base === 'bx' ? 3 : 5];
    if (o.index) off += this.regs[o.index === 'si' ? 6 : 7];
    const seg = o.seg !== null ? this.segs[o.seg] : o.base === 'bp' ? this.ss : this.ds;
    return this.lin(seg, off);
  }

  // ---------- operandi ----------
  private get(o: Operand, size: 8 | 16): number {
    switch (o.k) {
      case 'reg': return this.getReg(o.idx, o.size);
      case 'sreg': return this.segs[o.idx];
      case 'imm': return o.value & (size === 8 ? 0xff : 0xffff);
      case 'mem': {
        const a = this.ea(o);
        return size === 8 ? this.rd8(a) : this.rd16(a);
      }
    }
  }
  private set(o: Operand, size: 8 | 16, v: number) {
    switch (o.k) {
      case 'reg': this.setReg(o.idx, o.size, v); break;
      case 'sreg': this.segs[o.idx] = v & 0xffff; break;
      case 'mem': {
        const a = this.ea(o);
        if (size === 8) this.wr8(a, v);
        else this.wr16(a, v);
        break;
      }
      default: throw new CpuError('Destinazione non valida');
    }
  }

  // ---------- stack ----------
  push(v: number) {
    this.regs[4] = (this.regs[4] - 2) & 0xffff;
    this.wr16(this.lin(this.ss, this.regs[4]), v);
  }
  pop(): number {
    const v = this.rd16(this.lin(this.ss, this.regs[4]));
    this.regs[4] = (this.regs[4] + 2) & 0xffff;
    return v;
  }

  // ---------- flag ----------
  private setFlag(f: number, on: boolean) {
    this.flags = on ? this.flags | f : this.flags & ~f;
  }
  getFlag(f: number): boolean {
    return (this.flags & f) !== 0;
  }
  private szp(v: number, size: 8 | 16) {
    const mask = size === 8 ? 0xff : 0xffff;
    const r = v & mask;
    this.setFlag(ZF, r === 0);
    this.setFlag(SF, (r >> (size - 1)) !== 0);
    this.setFlag(PF, parity(r));
  }

  private alu(op: string, a: number, b: number, size: 8 | 16): number {
    const mask = size === 8 ? 0xff : 0xffff;
    const sign = size === 8 ? 0x80 : 0x8000;
    a &= mask;
    b &= mask;
    let r: number;
    switch (op) {
      case 'add':
      case 'adc': {
        const c = op === 'adc' && this.getFlag(CF) ? 1 : 0;
        const full = a + b + c;
        r = full & mask;
        this.setFlag(CF, full > mask);
        this.setFlag(OF, ((a ^ r) & (b ^ r) & sign) !== 0);
        this.setFlag(AF, ((a ^ b ^ r) & 0x10) !== 0);
        break;
      }
      case 'sub':
      case 'sbb':
      case 'cmp': {
        const c = op === 'sbb' && this.getFlag(CF) ? 1 : 0;
        const full = a - b - c;
        r = full & mask;
        this.setFlag(CF, full < 0);
        this.setFlag(OF, ((a ^ b) & (a ^ r) & sign) !== 0);
        this.setFlag(AF, ((a ^ b ^ r) & 0x10) !== 0);
        break;
      }
      case 'and':
      case 'test':
        r = a & b;
        this.setFlag(CF, false);
        this.setFlag(OF, false);
        break;
      case 'or':
        r = a | b;
        this.setFlag(CF, false);
        this.setFlag(OF, false);
        break;
      case 'xor':
        r = a ^ b;
        this.setFlag(CF, false);
        this.setFlag(OF, false);
        break;
      default:
        throw new CpuError(`ALU: operazione sconosciuta ${op}`);
    }
    this.szp(r, size);
    return r;
  }

  private shift(op: string, v: number, count: number, size: 8 | 16): number {
    const bits = size;
    const mask = size === 8 ? 0xff : 0xffff;
    const sign = size === 8 ? 0x80 : 0x8000;
    count &= 0x1f;
    if (count === 0) return v & mask;
    let r = v & mask;
    for (let i = 0; i < count; i++) {
      const cf = this.getFlag(CF) ? 1 : 0;
      switch (op) {
        case 'shl':
        case 'sal': {
          this.setFlag(CF, (r & sign) !== 0);
          r = (r << 1) & mask;
          this.setFlag(OF, ((r & sign) !== 0) !== this.getFlag(CF));
          break;
        }
        case 'shr': {
          this.setFlag(OF, (r & sign) !== 0);
          this.setFlag(CF, (r & 1) !== 0);
          r = r >>> 1;
          break;
        }
        case 'sar': {
          this.setFlag(CF, (r & 1) !== 0);
          r = (r >>> 1) | (r & sign);
          this.setFlag(OF, false);
          break;
        }
        case 'rol': {
          const top = (r & sign) !== 0 ? 1 : 0;
          r = ((r << 1) | top) & mask;
          this.setFlag(CF, top === 1);
          break;
        }
        case 'ror': {
          const low = r & 1;
          r = (r >>> 1) | (low ? sign : 0);
          this.setFlag(CF, low === 1);
          break;
        }
        case 'rcl': {
          const top = (r & sign) !== 0 ? 1 : 0;
          r = ((r << 1) | cf) & mask;
          this.setFlag(CF, top === 1);
          break;
        }
        case 'rcr': {
          const low = r & 1;
          r = (r >>> 1) | (cf ? sign : 0);
          this.setFlag(CF, low === 1);
          break;
        }
      }
    }
    void bits;
    if (['shl', 'sal', 'shr', 'sar'].includes(op)) this.szp(r, size);
    return r;
  }

  // ---------- condizioni salto ----------
  private cond(mn: string): boolean {
    const cf = this.getFlag(CF), zf = this.getFlag(ZF), sf = this.getFlag(SF);
    const of = this.getFlag(OF), pf = this.getFlag(PF);
    switch (mn) {
      case 'je': case 'jz': return zf;
      case 'jne': case 'jnz': return !zf;
      case 'ja': case 'jnbe': return !cf && !zf;
      case 'jae': case 'jnb': case 'jnc': return !cf;
      case 'jb': case 'jnae': case 'jc': return cf;
      case 'jbe': case 'jna': return cf || zf;
      case 'jg': case 'jnle': return !zf && sf === of;
      case 'jge': case 'jnl': return sf === of;
      case 'jl': case 'jnge': return sf !== of;
      case 'jle': case 'jng': return zf || sf !== of;
      case 'jo': return of;
      case 'jno': return !of;
      case 'js': return sf;
      case 'jns': return !sf;
      case 'jp': case 'jpe': return pf;
      case 'jnp': case 'jpo': return !pf;
      case 'jcxz': return this.regs[1] === 0;
    }
    throw new CpuError(`Condizione sconosciuta: ${mn}`);
  }

  // ---------- I/O ----------
  sendKey(ch: string) {
    this.input.push(ch);
  }
  private putChar(c: number) {
    const ch = String.fromCharCode(c & 0xff);
    if (ch === '\b') this.out = this.out.slice(0, -1);
    else this.out += ch;
  }
  private nextKey(): string | null {
    if (this.input.length === 0) return null;
    const k = this.input.shift()!;
    this.consumed.push(k);
    return k;
  }
  private echoKey(k: string) {
    if (k === '\r' || k === '\n') this.out += '\r\n';
    else this.putChar(k.charCodeAt(0));
  }

  // ---------- esecuzione ----------
  get currentInstr(): Instr | undefined {
    return this.program.instrs.get(this.lin(this.cs, this.ip));
  }
  get currentLine(): number | null {
    return this.currentInstr?.line ?? null;
  }
  get canStepBack(): boolean {
    return this.undo.length > 0;
  }

  private takeSnapshot(): Snapshot {
    return {
      regs: this.regs.slice(),
      segs: this.segs.slice(),
      ip: this.ip,
      flags: this.flags,
      out: this.out,
      writes: [],
      consumed: [],
      scanBuf: this.scanBuf,
      status: this.status,
      inBuf: '',
    };
  }

  stepBack(): boolean {
    const s = this.undo.pop();
    if (!s) return false;
    for (let i = s.writes.length - 1; i >= 0; i--) this.mem[s.writes[i][0]] = s.writes[i][1];
    this.regs.set(s.regs);
    this.segs.set(s.segs);
    this.ip = s.ip;
    this.flags = s.flags;
    this.out = s.out;
    this.scanBuf = s.scanBuf;
    this.input = [...s.consumed, ...this.input];
    this.status = 'ready';
    this.error = null;
    this.haltedFlag = false;
    this.snap = null;
    this.steps = Math.max(0, this.steps - 1);
    return true;
  }

  /** Esegue una istruzione. Restituisce false se non è avanzato (fine, errore, attesa input). */
  step(): boolean {
    if (this.status === 'halted' || this.status === 'error') return false;
    if (!this.snap) {
      this.snap = this.takeSnapshot();
      this.writes = [];
      this.consumed = [];
    }
    try {
      const advanced = this.exec();
      if (!advanced) {
        this.status = this.haltedFlag ? 'halted' : 'waiting';
        if (this.haltedFlag) this.commit();
        return false;
      }
      this.steps++;
      this.commit();
      if (this.haltedFlag) this.status = 'halted';
      else if (this.status !== 'running') this.status = 'ready';
      return true;
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof CpuError ? e.message : `Errore interno: ${(e as Error).message}`;
      this.commit();
      return false;
    }
  }

  private commit() {
    if (!this.snap) return;
    this.snap.writes = this.writes;
    this.snap.consumed = this.consumed;
    this.undo.push(this.snap);
    if (this.undo.length > MAX_UNDO) this.undo.shift();
    this.snap = null;
    this.writes = [];
    this.consumed = [];
  }

  /** Esegue fino a maxSteps istruzioni, a un breakpoint (indice riga) o a fine/attesa. */
  run(maxSteps: number, breakpoints?: Set<number>): number {
    let n = 0;
    this.status = 'running';
    while (n < maxSteps) {
      if (!this.step()) break;
      n++;
      if (breakpoints && breakpoints.size) {
        const ln = this.currentLine;
        if (ln !== null && breakpoints.has(ln)) {
          this.status = 'ready';
          return n;
        }
      }
    }
    if (this.status === 'running') this.status = n >= maxSteps ? 'running' : 'ready';
    return n;
  }

  private exec(): boolean {
    // routine integrate di emu8086.inc
    if (this.ip >= BUILTIN_BASE_IP && this.ip < BUILTIN_BASE_IP + BUILTINS.length && this.cs === this.program.entryCS) {
      return this.execBuiltin(BUILTINS[this.ip - BUILTIN_BASE_IP]);
    }
    const ins = this.program.instrs.get(this.lin(this.cs, this.ip));
    if (!ins) {
      throw new CpuError(
        `Esecuzione fuori dal programma a ${this.cs.toString(16).toUpperCase().padStart(4, '0')}:${this.ip
          .toString(16).toUpperCase().padStart(4, '0')} (manca la chiusura con INT 21h/4Ch o RET?)`,
      );
    }
    const next = (this.ip + ins.size) & 0xffff;

    if (ins.prefix && ['rep', 'repe', 'repz', 'repne', 'repnz'].includes(ins.prefix)) {
      return this.execRep(ins, next);
    }
    const before = this.ip;
    this.ip = next;
    const done = this.execInstr(ins);
    if (!done) this.ip = before; // in attesa di input: l'istruzione verrà rieseguita
    return done;
  }

  private execRep(ins: Instr, next: number): boolean {
    const mn = ins.mnemonic;
    const stringOp = ['movsb', 'movsw', 'stosb', 'stosw', 'lodsb', 'lodsw', 'cmpsb', 'cmpsw', 'scasb', 'scasw'].includes(mn);
    if (!stringOp) throw new CpuError(`Il prefisso ${ins.prefix!.toUpperCase()} si usa solo con istruzioni su stringhe`);
    const cmp = mn.startsWith('cmps') || mn.startsWith('scas');
    // ogni iterazione è un passo (visibile in single step)
    if (this.regs[1] === 0) {
      this.ip = next;
      return true;
    }
    this.execInstr(ins);
    this.regs[1] = (this.regs[1] - 1) & 0xffff;
    let again = this.regs[1] !== 0;
    if (cmp && again) {
      if (ins.prefix === 'repne' || ins.prefix === 'repnz') again = !this.getFlag(ZF);
      else again = this.getFlag(ZF);
    }
    this.ip = again ? this.ip : next;
    return true;
  }

  private execBuiltin(name: string): boolean {
    const ret = () => {
      this.ip = this.pop();
    };
    switch (name) {
      case 'clear_screen':
        this.out = '';
        ret();
        return true;
      case 'print_num':
      case 'print_num_uns': {
        let v = this.regs[0];
        let s: string;
        if (name === 'print_num' && v & 0x8000) s = String(v - 0x10000);
        else s = String(v);
        for (const c of s) this.putChar(c.charCodeAt(0));
        ret();
        return true;
      }
      case 'scan_num': {
        for (;;) {
          const k = this.nextKey();
          if (k === null) return false; // attende input
          if (k === '\r' || k === '\n') {
            this.out += '\r\n';
            const txt = this.scanBuf;
            this.scanBuf = '';
            const neg = txt.startsWith('-');
            const digits = neg ? txt.slice(1) : txt;
            let v = digits ? parseInt(digits, 10) : 0;
            if (neg) v = -v;
            this.regs[1] = v & 0xffff;
            ret();
            return true;
          }
          if (k === '\b') {
            if (this.scanBuf.length) {
              this.scanBuf = this.scanBuf.slice(0, -1);
              this.out = this.out.slice(0, -1);
            }
            continue;
          }
          if (/[0-9]/.test(k) || (k === '-' && this.scanBuf === '')) {
            this.scanBuf += k;
            this.putChar(k.charCodeAt(0));
          }
        }
      }
    }
    throw new CpuError(`Routine sconosciuta: ${name}`);
  }

  private doInt(n: number): boolean {
    const ah = this.getReg(4, 8);
    if (n === 0x20) {
      this.haltedFlag = true;
      return true;
    }
    if (n === 0x10) {
      switch (ah) {
        case 0x0e:
        case 0x09:
          this.putChar(this.getReg(0, 8));
          return true;
        case 0x00:
          this.out = '';
          return true;
        case 0x02:
        case 0x01:
          return true; // posizione/forma cursore: ignorate
      }
      throw new CpuError(`INT 10h, funzione AH=${ah.toString(16).toUpperCase()}h non supportata`);
    }
    if (n !== 0x21) throw new CpuError(`INT ${n.toString(16).toUpperCase()}h non supportata`);

    switch (ah) {
      case 0x01: {
        const k = this.nextKey();
        if (k === null) return false;
        const c = k === '\n' ? '\r' : k;
        this.echoKey(c);
        this.setReg(0, 8, c.charCodeAt(0));
        return true;
      }
      case 0x07:
      case 0x08: {
        const k = this.nextKey();
        if (k === null) return false;
        this.setReg(0, 8, (k === '\n' ? '\r' : k).charCodeAt(0));
        return true;
      }
      case 0x02:
        this.putChar(this.getReg(2, 8));
        this.setReg(0, 8, this.getReg(2, 8));
        return true;
      case 0x06: {
        const dl = this.getReg(2, 8);
        if (dl !== 0xff) this.putChar(dl);
        else {
          const k = this.nextKey();
          if (k === null) this.flags |= ZF;
          else {
            this.flags &= ~ZF;
            this.setReg(0, 8, k.charCodeAt(0));
          }
        }
        return true;
      }
      case 0x09: {
        let a = this.lin(this.ds, this.regs[2]);
        for (let i = 0; i < 65536; i++, a++) {
          const c = this.rd8(a);
          if (c === 0x24) break;
          this.putChar(c);
        }
        this.setReg(0, 8, 0x24);
        return true;
      }
      case 0x0a: {
        const base = this.lin(this.ds, this.regs[2]);
        const max = this.rd8(base);
        for (;;) {
          const k = this.nextKey();
          if (k === null) return false;
          if (k === '\r' || k === '\n') {
            this.out += '\r\n';
            const txt = this.scanBuf;
            this.scanBuf = '';
            this.wr8(base + 1, txt.length);
            for (let i = 0; i < txt.length; i++) this.wr8(base + 2 + i, txt.charCodeAt(i));
            this.wr8(base + 2 + txt.length, 13);
            return true;
          }
          if (k === '\b') {
            if (this.scanBuf.length) {
              this.scanBuf = this.scanBuf.slice(0, -1);
              this.out = this.out.slice(0, -1);
            }
          } else if (this.scanBuf.length < max - 1) {
            this.scanBuf += k;
            this.putChar(k.charCodeAt(0));
          }
        }
      }
      case 0x4c:
        this.haltedFlag = true;
        return true;
      case 0x00:
        this.haltedFlag = true;
        return true;
      case 0x0b:
        this.setReg(0, 8, this.input.length ? 0xff : 0);
        return true;
    }
    throw new CpuError(`INT 21h, funzione AH=${ah.toString(16).toUpperCase().padStart(2, '0')}h non supportata`);
  }

  private execInstr(ins: Instr): boolean {
    const { mnemonic: mn, ops, opSize: sz } = ins;
    const str = (unit: 1 | 2, kind: string) => {
      const step = this.getFlag(DF) ? -unit : unit;
      const rdS = () => (unit === 1 ? this.rd8(this.lin(this.ds, this.regs[6])) : this.rd16(this.lin(this.ds, this.regs[6])));
      const rdD = () => (unit === 1 ? this.rd8(this.lin(this.es, this.regs[7])) : this.rd16(this.lin(this.es, this.regs[7])));
      const wrD = (v: number) =>
        unit === 1 ? this.wr8(this.lin(this.es, this.regs[7]), v) : this.wr16(this.lin(this.es, this.regs[7]), v);
      const size = (unit * 8) as 8 | 16;
      switch (kind) {
        case 'movs': wrD(rdS()); this.regs[6] += step; this.regs[7] += step; break;
        case 'stos': wrD(this.getReg(0, size)); this.regs[7] += step; break;
        case 'lods': this.setReg(0, size, rdS()); this.regs[6] += step; break;
        case 'cmps': this.alu('cmp', rdS(), rdD(), size); this.regs[6] += step; this.regs[7] += step; break;
        case 'scas': this.alu('cmp', this.getReg(0, size), rdD(), size); this.regs[7] += step; break;
      }
      this.regs[6] &= 0xffff;
      this.regs[7] &= 0xffff;
    };

    switch (mn) {
      case 'nop': return true;
      case 'hlt': this.haltedFlag = true; return true;
      case 'mov': this.set(ops[0], sz, this.get(ops[1], sz)); return true;
      case 'xchg': {
        const a = this.get(ops[0], sz), b = this.get(ops[1], sz);
        this.set(ops[0], sz, b);
        this.set(ops[1], sz, a);
        return true;
      }
      case 'lea': {
        const o = ops[1];
        if (o.k !== 'mem') throw new CpuError('LEA richiede un operando in memoria');
        let off = o.disp;
        if (o.base) off += this.regs[o.base === 'bx' ? 3 : 5];
        if (o.index) off += this.regs[o.index === 'si' ? 6 : 7];
        this.set(ops[0], 16, off & 0xffff);
        return true;
      }
      case 'push': this.push(this.get(ops[0], 16)); return true;
      case 'pop': this.set(ops[0], 16, this.pop()); return true;
      case 'pushf': this.push(this.flags); return true;
      case 'popf': this.flags = this.pop() | 0x0002; return true;
      case 'add': case 'adc': case 'sub': case 'sbb': case 'and': case 'or': case 'xor':
        this.set(ops[0], sz, this.alu(mn, this.get(ops[0], sz), this.get(ops[1], sz), sz));
        return true;
      case 'cmp': case 'test':
        this.alu(mn, this.get(ops[0], sz), this.get(ops[1], sz), sz);
        return true;
      case 'inc': case 'dec': {
        const cf = this.getFlag(CF);
        const v = this.get(ops[0], sz);
        this.set(ops[0], sz, this.alu(mn === 'inc' ? 'add' : 'sub', v, 1, sz));
        this.setFlag(CF, cf);
        return true;
      }
      case 'neg': {
        const v = this.get(ops[0], sz);
        const r = this.alu('sub', 0, v, sz);
        this.setFlag(CF, v !== 0);
        this.set(ops[0], sz, r);
        return true;
      }
      case 'not': this.set(ops[0], sz, ~this.get(ops[0], sz)); return true;
      case 'mul': case 'imul': {
        const signed = mn === 'imul';
        const toS = (v: number, s: 8 | 16) => (v & (s === 8 ? 0x80 : 0x8000) ? v - (s === 8 ? 0x100 : 0x10000) : v);
        const src = this.get(ops[0], sz);
        if (sz === 8) {
          const a = this.getReg(0, 8);
          const r = signed ? toS(a, 8) * toS(src, 8) : a * src;
          this.regs[0] = r & 0xffff;
          const over = signed ? r < -128 || r > 127 : (r & 0xff00) !== 0;
          this.setFlag(CF, over);
          this.setFlag(OF, over);
        } else {
          const a = this.regs[0];
          const r = signed ? toS(a, 16) * toS(src, 16) : a * src;
          this.regs[0] = r & 0xffff;
          this.regs[2] = (r >>> 16) & 0xffff;
          const over = signed ? r < -32768 || r > 32767 : this.regs[2] !== 0;
          this.setFlag(CF, over);
          this.setFlag(OF, over);
        }
        return true;
      }
      case 'div': case 'idiv': {
        const signed = mn === 'idiv';
        const toS = (v: number, s: 8 | 16 | 32) =>
          v & (s === 8 ? 0x80 : s === 16 ? 0x8000 : 0x80000000) ? v - (s === 8 ? 0x100 : s === 16 ? 0x10000 : 0x100000000) : v;
        const src = this.get(ops[0], sz);
        if (src === 0) throw new CpuError('Divisione per zero');
        if (sz === 8) {
          const a = this.regs[0];
          const d = signed ? toS(src, 8) : src;
          const n = signed ? toS(a, 16) : a;
          const q = Math.trunc(n / d), r = n % d;
          if (signed ? q < -128 || q > 127 : q > 0xff) throw new CpuError('Overflow nella divisione (quoziente troppo grande per AL)');
          this.regs[0] = ((r & 0xff) << 8) | (q & 0xff);
        } else {
          const n32 = ((this.regs[2] << 16) | this.regs[0]) >>> 0;
          const n = signed ? toS(n32, 32) : n32;
          const d = signed ? toS(src, 16) : src;
          const q = Math.trunc(n / d), r = n % d;
          if (signed ? q < -32768 || q > 32767 : q > 0xffff) throw new CpuError('Overflow nella divisione (quoziente troppo grande per AX)');
          this.regs[0] = q & 0xffff;
          this.regs[2] = r & 0xffff;
        }
        return true;
      }
      case 'cbw': this.regs[0] = this.getReg(0, 8) & 0x80 ? 0xff00 | this.getReg(0, 8) : this.getReg(0, 8); return true;
      case 'cwd': this.regs[2] = this.regs[0] & 0x8000 ? 0xffff : 0; return true;
      case 'shl': case 'shr': case 'sal': case 'sar': case 'rol': case 'ror': case 'rcl': case 'rcr': {
        const c = ops[1].k === 'reg' ? this.getReg(1, 8) : (ops[1] as { value: number }).value;
        this.set(ops[0], sz, this.shift(mn, this.get(ops[0], sz), c, sz));
        return true;
      }
      case 'jmp': case 'call': {
        const o = ops[0];
        const target = o.k === 'imm' ? o.value & 0xffff : this.get(o, 16);
        if (mn === 'call') this.push(this.ip);
        this.ip = target;
        return true;
      }
      case 'ret': {
        this.ip = this.pop();
        if (ops.length) this.regs[4] = (this.regs[4] + (ops[0] as { value: number }).value) & 0xffff;
        return true;
      }
      case 'loop': case 'loope': case 'loopz': case 'loopne': case 'loopnz': {
        this.regs[1] = (this.regs[1] - 1) & 0xffff;
        let go = this.regs[1] !== 0;
        if (mn === 'loope' || mn === 'loopz') go = go && this.getFlag(ZF);
        if (mn === 'loopne' || mn === 'loopnz') go = go && !this.getFlag(ZF);
        if (go) this.ip = (ops[0] as { value: number }).value & 0xffff;
        return true;
      }
      case 'int': return this.doInt((ops[0] as { value: number }).value & 0xff);
      case 'iret': this.ip = this.pop(); this.segs[1] = this.pop(); this.flags = this.pop(); return true;
      case 'clc': this.setFlag(CF, false); return true;
      case 'stc': this.setFlag(CF, true); return true;
      case 'cmc': this.setFlag(CF, !this.getFlag(CF)); return true;
      case 'cld': this.setFlag(DF, false); return true;
      case 'std': this.setFlag(DF, true); return true;
      case 'cli': this.setFlag(IF, false); return true;
      case 'sti': this.setFlag(IF, true); return true;
      case 'lahf': this.setReg(4, 8, this.flags & 0xff); return true;
      case 'sahf': this.flags = (this.flags & 0xff00) | (this.getReg(4, 8) & 0xd5) | 2; return true;
      case 'xlat': case 'xlatb':
        this.setReg(0, 8, this.rd8(this.lin(this.ds, this.regs[3] + this.getReg(0, 8))));
        return true;
      case 'movsb': str(1, 'movs'); return true;
      case 'movsw': str(2, 'movs'); return true;
      case 'stosb': str(1, 'stos'); return true;
      case 'stosw': str(2, 'stos'); return true;
      case 'lodsb': str(1, 'lods'); return true;
      case 'lodsw': str(2, 'lods'); return true;
      case 'cmpsb': str(1, 'cmps'); return true;
      case 'cmpsw': str(2, 'cmps'); return true;
      case 'scasb': str(1, 'scas'); return true;
      case 'scasw': str(2, 'scas'); return true;

      // macro di emu8086.inc
      case 'print': case 'printn': {
        const raw = ins.text.replace(/^\S+\s+/, '');
        const m = /^(["'])(.*)\1$/.exec(raw.trim());
        if (!m) throw new CpuError(`${mn.toUpperCase()} richiede una stringa tra apici`);
        this.out += m[2] + (mn === 'printn' ? '\r\n' : '');
        return true;
      }
      case 'putc': {
        const o = ops[0];
        this.putChar(o.k === 'imm' ? o.value : this.get(o, 8));
        return true;
      }
      case 'gotoxy': return true;
    }
    if (JCC_SET.has(mn)) {
      if (this.cond(mn)) this.ip = (ops[0] as { value: number }).value & 0xffff;
      return true;
    }
    throw new CpuError(`Istruzione ${mn.toUpperCase()} non supportata dall'emulatore`);
  }
}

const JCC_SET = new Set([
  'ja', 'jae', 'jb', 'jbe', 'jc', 'je', 'jg', 'jge', 'jl', 'jle', 'jna', 'jnae', 'jnb', 'jnbe',
  'jnc', 'jne', 'jng', 'jnge', 'jnl', 'jnle', 'jno', 'jnp', 'jns', 'jnz', 'jo', 'jp', 'jpe',
  'jpo', 'js', 'jz', 'jcxz',
]);
