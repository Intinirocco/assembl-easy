// Generazione automatica dei casi di prova.
//
// Per ogni esercizio si costruisce un insieme di casi:
//   - valori LIMITE (0, 1, massimo, valori che causano riporto o overflow, ...), dove si sbaglia più spesso;
//   - valori CASUALI generati con un seme fisso (sono sempre gli stessi, per tutti e a ogni verifica).
// Il risultato atteso NON viene dal programma di riferimento: è calcolato qui sotto con
// una semplice formula TypeScript ("oracolo"), indipendente dall'emulatore.
import type { Scalar, TestCase } from '../emu/grader';
import { describeCase } from '../emu/grader';
import type { Exercise } from './exercises';

export type Rng = () => number;

/** Generatore pseudocasuale deterministico (mulberry32) inizializzato da una stringa. */
export function rngFor(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const ints = (r: Rng, n: number, a: number, b: number) => Array.from({ length: n }, () => int(r, a, b));

type Init = Record<string, Scalar>;
type Expect = TestCase['expect'];

function mk(init: Init, expect: Expect, input?: string, name?: string): TestCase {
  return { name: name ?? (describeCase(init, input) || 'Esecuzione'), group: 'auto', init, input, expect };
}

/** Elimina i casi duplicati (stessi valori iniziali e input). */
function uniq(list: TestCase[]): TestCase[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = JSON.stringify([t.init, t.input]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const W = 0xffff;
const popcount = (n: number) => n.toString(2).split('1').length - 1;

const GENERATORS: Record<string, (r: Rng) => TestCase[]> = {
  // ---------- Operazioni base ----------
  'somma-due-numeri': (r) => {
    const edge: [number, number][] = [
      [0, 0], [0, 1], [1, 0], [255, 1], [256, 256], [1000, 2345], [32767, 1], [40000, 30000], [65535, 1], [65535, 65535], [12345, 54321],
    ];
    const rnd: [number, number][] = [
      ...Array.from({ length: 12 }, (): [number, number] => [int(r, 0, W), int(r, 0, W)]),
      ...Array.from({ length: 8 }, (): [number, number] => [int(r, 0, 100), int(r, 0, 100)]),
    ];
    return uniq([...edge, ...rnd].map(([a, b]) => mk({ n1: a, n2: b }, { vars: { risultato: (a + b) & W } })));
  },

  differenza: (r) => {
    const edge: [number, number][] = [
      [0, 0], [10, 25], [25, 10], [0, 1], [1, 0], [0, 65535], [65535, 0], [500, 120], [120, 500], [32768, 1], [1, 32768], [65535, 65535],
    ];
    const rnd = Array.from({ length: 16 }, (): [number, number] => [int(r, 0, W), int(r, 0, W)]);
    return uniq([...edge, ...rnd].map(([a, b]) => mk({ n1: a, n2: b }, { vars: { risultato: (a - b) & W } })));
  },

  'prodotto-byte': (r) => {
    const edge: [number, number][] = [
      [0, 0], [0, 77], [77, 0], [1, 1], [1, 255], [255, 1], [255, 255], [16, 16], [128, 2], [2, 128], [200, 200], [12, 11], [15, 17],
    ];
    const rnd = Array.from({ length: 16 }, (): [number, number] => [int(r, 0, 255), int(r, 0, 255)]);
    return uniq([...edge, ...rnd].map(([a, b]) => mk({ a, b }, { vars: { prodotto: a * b } })));
  },

  'quoziente-resto': (r) => {
    // il quoziente deve entrare in 8 bit (altrimenti DIV segnala overflow): dividendo < divisore × 256
    const cases: [number, number][] = [
      [0, 1], [1, 1], [255, 1], [7, 7], [3, 5], [100, 7], [47, 5], [255, 255], [254, 255], [65279, 255], [256, 2], [1000, 10], [99, 100], [128, 3],
    ];
    for (let i = 0; i < 16; i++) {
      const d = int(r, 1, 255);
      cases.push([int(r, 0, Math.min(W, d * 256 - 1)), d]);
    }
    return uniq(
      cases.map(([n, d]) => mk({ dividendo: n, divisore: d }, { vars: { quoziente: Math.floor(n / d), resto: n % d } })),
    );
  },

  scambio: (r) => {
    const pairs: [number, number][] = [[11, 99], [1, 2], [0, 0], [5, 5], [0, 65535], [65535, 0], [255, 256], [32768, 1]];
    for (let i = 0; i < 12; i++) pairs.push([int(r, 0, W), int(r, 0, W)]);
    return uniq(pairs.map(([a, b]) => mk({ a, b }, { vars: { a: b, b: a } })));
  },

  // ---------- Salti condizionati ----------
  'massimo-due': (r) => {
    // numeri SENZA segno: 200 > 3 anche se con segno sarebbe −56
    const pairs: [number, number][] = [
      [14, 27], [27, 14], [0, 0], [0, 255], [255, 0], [127, 128], [128, 127], [200, 3], [3, 200], [5, 5], [255, 255], [1, 0], [0, 1], [100, 200], [250, 251],
    ];
    for (let i = 0; i < 14; i++) pairs.push([int(r, 0, 255), int(r, 0, 255)]);
    return uniq(pairs.map(([a, b]) => mk({ n1: a, n2: b }, { vars: { massimo: Math.max(a, b) } })));
  },

  'pari-dispari': (r) => {
    const vals = [...Array.from({ length: 16 }, (_, i) => i), 100, 101, 126, 127, 128, 129, 254, 255, ...ints(r, 8, 0, 255)];
    return uniq(vals.map((n) => mk({ n }, { vars: { pari: n % 2 === 0 ? 1 : 0 } })));
  },

  'valore-assoluto': (r) => {
    const vals = [-37, 37, 0, 1, -1, 2, -2, 127, -127, 128, -128, 255, -255, 32767, -32767, -32768, 100, -100, ...ints(r, 12, -32768, 32767)];
    return uniq(vals.map((n) => mk({ n }, { vars: { assoluto: Math.abs(n) & W } })));
  },

  // ---------- Cicli ----------
  'somma-1-n': (r) => {
    const vals = [1, 2, 3, 4, 5, 10, 11, 50, 100, 127, 128, 200, 254, 255, ...ints(r, 10, 1, 255)];
    return uniq(vals.map((n) => mk({ n }, { vars: { somma: (n * (n + 1)) / 2 } })));
  },

  fattoriale: () => {
    const f = (n: number): number => (n <= 1 ? 1 : n * f(n - 1));
    return Array.from({ length: 9 }, (_, n) => mk({ n }, { vars: { fattoriale: f(n) } }));
  },

  'conto-alla-rovescia': () => [
    mk({}, { outputExact: '9876543210' }, undefined, 'Output esatto: 9876543210 (nessun altro carattere)'),
  ],

  // ---------- Array ----------
  'somma-array': (r) => {
    const arrays: number[][] = [
      [0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [255, 255, 255, 255, 255, 255], [4, 8, 15, 16, 23, 42], [1, 2, 3, 4, 5, 6],
      [255, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 255], [200, 200, 200, 200, 200, 200], [128, 128, 0, 0, 0, 0],
    ];
    for (let i = 0; i < 14; i++) arrays.push(ints(r, 6, 0, 255));
    return uniq(arrays.map((v) => mk({ v }, { vars: { somma: v.reduce((a, b) => a + b, 0) } })));
  },

  'massimo-array': (r) => {
    const arrays: number[][] = [
      [12, 45, 7, 89, 23, 56], [9, 9, 9, 9, 9, 9], [0, 0, 0, 0, 0, 0], [255, 255, 255, 255, 255, 255],
      [250, 3, 4, 5, 6, 7], [1, 250, 3, 4, 5, 6], [1, 2, 250, 4, 5, 6], [1, 2, 3, 250, 5, 6], [1, 2, 3, 4, 250, 6], [1, 2, 3, 4, 5, 200],
      [6, 5, 4, 3, 2, 1], [1, 2, 3, 4, 5, 6], [127, 128, 126, 129, 0, 255], [0, 0, 0, 0, 0, 1],
    ];
    for (let i = 0; i < 12; i++) arrays.push(ints(r, 6, 0, 255));
    return uniq(arrays.map((v) => mk({ v }, { vars: { massimo: Math.max(...v) } })));
  },

  // ---------- Stringhe ----------
  'lunghezza-stringa': (r) => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const strs = ['', 'a', 'ciao', 'assembly', 'zz', 'abcdefg', 'x'];
    for (let i = 0; i < 14; i++) {
      const len = int(r, 0, 8);
      strs.push(Array.from({ length: len }, () => letters[int(r, 0, 25)]).join(''));
    }
    // "testo" ha 9 byte: massimo 8 caratteri + '$'
    return uniq(strs.map((s) => mk({ testo: s + '$' }, { vars: { lunghezza: s.length } })));
  },

  // ---------- Input/Output ----------
  'ciao-mondo': () =>
    ['Ciao mondo!', 'Hello', 'Assembly', 'Ok', 'a', 'Prova 123', 'Ciao a tutti'].map((m) =>
      mk({ msg: m + '$' }, { outputExact: m }, undefined, `Stampa il contenuto di msg: "${m}"`),
    ),

  maiuscolo: () =>
    'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => mk({}, { outputExact: c + c.toUpperCase() }, c, `Lettera "${c}" → "${c.toUpperCase()}"`)),

  'somma-cifre': () => {
    const out: TestCase[] = [];
    for (let a = 0; a <= 9; a++) {
      for (let b = 0; a + b <= 9; b++) {
        out.push(mk({}, { outputExact: `${a}${b}${a + b}` }, `${a}${b}`, `Cifre ${a} e ${b} → ${a + b}`));
      }
    }
    return out;
  },

  // ---------- Procedure ----------
  'procedura-quadrato': (r) => {
    const vals = [...Array.from({ length: 17 }, (_, i) => i), 20, 50, 100, 127, 128, 200, 254, 255, ...ints(r, 6, 0, 255)];
    return uniq(vals.map((n) => mk({ n }, { vars: { quadrato: n * n } })));
  },

  // ---------- Operazioni logiche ----------
  'bit-a-uno': (r) => {
    const vals = [0, 1, 2, 4, 8, 16, 32, 64, 128, 255, 0xaa, 0x55, 0x0f, 0xf0, 0xb7, 127, 254, 129, ...ints(r, 10, 0, 255)];
    return uniq(vals.map((n) => mk({ n }, { vars: { uni: popcount(n) } })));
  },
};

/** Casi generati automaticamente per un esercizio (sempre gli stessi, a ogni chiamata). */
export function autoTests(ex: Exercise): TestCase[] {
  const gen = GENERATORS[ex.id];
  return gen ? gen(rngFor(ex.id)) : [];
}

/** Tutti i casi eseguiti da "Verifica": quelli scritti a mano + quelli generati. */
export function allTests(ex: Exercise): { base: TestCase[]; auto: TestCase[] } {
  return { base: ex.tests.map((t) => ({ ...t, group: 'base' })), auto: autoTests(ex) };
}
