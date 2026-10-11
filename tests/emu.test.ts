import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/emu/assembler';
import { Machine } from '../src/emu/cpu';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

function runWith(src: string, keys = '') {
  const prog = assemble(src);
  expect(prog.errors).toEqual([]);
  const m = new Machine(prog);
  for (const k of keys) m.sendKey(k);
  m.run(100000);
  return m;
}

describe('esempi di lezione', () => {
  it('esercizio1: somma e sottrazione', () => {
    const m = runWith(fx('esercizio1.asm'));
    expect(m.status).toBe('halted');
    // CX = 37+15, DX = 37-15
    expect(m.cx).toBe(52);
    expect(m.dx).toBe(22);
    expect(m.ax).toBe(0x4c00);
  });

  it('esercizio2: prodotto maggiore di 36 stampa il messaggio', () => {
    const m = runWith(fx('esercizio2.asm'), '7');
    expect(m.out).toContain("Il prodotto e' maggiore di 36");
  });

  it('esercizio2: prodotto minore, nessun messaggio', () => {
    const m = runWith(fx('esercizio2.asm'), '5');
    expect(m.out).not.toContain('maggiore');
    expect(m.status).toBe('halted');
  });

  it('esercizio3: somma piu piccola di tutto', () => {
    const m = runWith(fx('esercizio3.asm'), '11');
    // 1+1=2, n1*n1=1... 2>1 poi n2*n2=1, 2>1 => maggiore di tutto
    expect(m.out).toContain('piu\' grande di tutto');
  });

  it('esercitazione5: scan_num / print_num', () => {
    const m = runWith(fx('esercitazione5.asm'), '12\r30\r' + 'x');
    expect(m.out).toContain('la somma e\': 42');
    expect(m.status).toBe('halted');
  });

  it('tpsit: accesso diretto alla memoria', () => {
    const m = runWith(fx('tpsit.asm'), 'x');
    const ds = m.ds;
    expect(m.rd8(ds * 16 + 0x101)).toBe(10);
    expect(m.rd16(ds * 16 + 0x102)).toBe(0x0a0a); // 1B legge anche il byte a 0101h (=10 da 1A)
  });
});

describe('errori di assemblaggio', () => {
  it('virgola mancante in DB è un errore sulla riga giusta', () => {
    const src = fx('esercitazione5.asm').replace('13,10, "inserisci il primo', '13,10 "inserisci il primo');
    const p = assemble(src);
    expect(p.ok).toBe(false);
    const line = src.split('\n').findIndex((l) => l.includes('13,10 "inserisci il primo')) + 1;
    expect(p.errors.map((e) => e.line)).toContain(line);
    expect(p.errors[0].message).toMatch(/virgola/i);
  });

  it('istruzione sconosciuta e operandi incompatibili', () => {
    const p = assemble('code segment\nstart:\n  movv ax, 1\n  mov al, bx\n  mov ax, bogus\nends\nend start');
    expect(p.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
});
