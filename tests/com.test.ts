import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/emu/assembler';
import { Machine } from '../src/emu/cpu';

const ex = (n: string) => readFileSync(new URL(`../src/examples/${n}`, import.meta.url), 'utf8');

function run(src: string, keys = '\r') {
  const p = assemble(src);
  expect(p.errors).toEqual([]);
  const m = new Machine(p);
  m.run(200000); // arriva all'attesa del tasto
  const waitedForKey = m.status === 'waiting';
  if (waitedForKey) {
    for (const k of keys) m.sendKey(k);
    m.status = 'running';
    m.run(200000);
  }
  return { m, p, waitedForKey };
}

describe('programmi in formato COM (emu8086)', () => {
  it('add-sub: stampa 14 in binario e attende un tasto', () => {
    const { m, waitedForKey } = run(ex('com-add-sub.asm'));
    expect(waitedForKey).toBe(true);
    expect(m.out).toBe('00001110b');
    expect(m.status).toBe('halted');
    expect(m.error).toBeNull();
  });

  it('hello: stampa la stringa terminata da zero con int 10h', () => {
    const { m, waitedForKey } = run(ex('com-hello.asm'));
    expect(waitedForKey).toBe(true);
    expect(m.out).toBe('Hello, world!');
    expect(m.status).toBe('halted');
  });

  it('calc-sum: somma del vettore, binario e decimale con procedura ricorsiva', () => {
    const { m, p } = run(ex('com-calc-sum.asm'));
    expect(m.out.replace(/\r/g, '')).toBe('00010001b\n17');
    expect(m.status).toBe('halted');
    // la variabile m è nel segmento del codice, dopo il programma
    const sym = p.symbols.get('m')!;
    expect(sym.type).toBe('data');
    expect(m.rd8(p.entryCS * 16 + sym.value)).toBe(17);
  });

  it('il codice parte da org 100h e DS = CS', () => {
    const p = assemble(ex('com-add-sub.asm'));
    expect(p.entryIP).toBe(0x100);
    const m = new Machine(p);
    expect(m.ds).toBe(m.cs);
    expect(m.ss).toBe(m.cs);
  });

  it('il testo dopo `end` non viene compilato né segnalato', () => {
    const p = assemble(ex('com-hello.asm'));
    expect(p.errors).toEqual([]);
  });

  it('pusha / popa conservano i registri', () => {
    const src = `org 100h
mov ax, 1111h
mov bx, 2222h
mov cx, 3333h
pusha
mov ax, 0
mov bx, 0
mov cx, 0
popa
ret`;
    const { m } = run(src, '');
    expect(m.ax).toBe(0x1111);
    expect(m.bx).toBe(0x2222);
    expect(m.cx).toBe(0x3333);
    expect(m.status).toBe('halted');
  });

  it('i programmi con segmenti continuano a funzionare e non accettano codice fuori da un segmento', () => {
    const bad = assemble('data segment\n x db 1\nends\n  mov ax, 1\ncode segment\nstart:\nends\nend start');
    expect(bad.errors.some((e) => /fuori da un segmento/.test(e.message))).toBe(true);
  });
});
