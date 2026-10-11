import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, INSTRUCTION_CATEGORIES } from '../src/content/instructions';
import { assemble } from '../src/emu/assembler';

describe('wiki istruzioni', () => {
  it('id univoci e categorie valide', () => {
    const ids = INSTRUCTIONS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of INSTRUCTIONS) expect(INSTRUCTION_CATEGORIES).toContain(i.category);
  });

  it('gli esempi con istruzioni vere sono accettati dall\'assemblatore', () => {
    // gli snippet sono frammenti: li avvolgo in un programma con dati e etichette di appoggio
    const wrap = (body: string) => `include 'emu8086.inc'
data segment
    numero dw 1
    messaggio db "x$"
    byte_var db 1
    msg db "x$"
    testo db "ab$"
    tabella db 1,2,3,4
    origine db 1,2,3,4,5,6,7,8,9,10
    destinazione db 10 dup(0)
ends
stack segment
    dw 128 dup(0)
ends
code segment
start:
${body}
fine:
minore:
maggiore:
pari:
ciclo:
stampa:
    nop
ends
end start`;
    const skip = new Set(['dir-segment', 'dir-db-dw', 'dir-equ', 'dir-proc', 'call', 'ret', 'inc-emu8086', 'int', 'loop', 'jmp', 'jcc']);
    const bad: string[] = [];
    for (const i of INSTRUCTIONS) {
      if (skip.has(i.id)) continue;
      const code = i.example
        .split('\n')
        .map((l) => (l.trim().startsWith(';') || !l.trim() ? '' : '    ' + l.trim()))
        .filter((l) => !/^\s*\w+:\s*$/.test(l) || true)
        .join('\n');
      const p = assemble(wrap(code));
      const errs = p.errors.filter((e) => e.line > 0);
      if (errs.length) bad.push(`${i.id}: ${errs.map((e) => e.message).join('; ')}`);
    }
    expect(bad).toEqual([]);
  });
});
