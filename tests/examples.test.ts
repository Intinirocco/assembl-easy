import { describe, expect, it } from 'vitest';
import { EXAMPLES, EXAMPLE_TAGS, exampleTags } from '../src/content/examples';
import { assemble } from '../src/emu/assembler';
import { Machine } from '../src/emu/cpu';

describe('esempi spiegati', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: assembla, termina e produce il risultato dichiarato`, () => {
      const p = assemble(ex.code);
      expect(p.errors).toEqual([]);
      const m = new Machine(p);
      for (const k of (ex.input ?? '').replace(/\n/g, '\r')) m.sendKey(k);
      // ferma l'esecuzione subito prima dell'uscita al DOS, che sovrascrive AX
      let snapshot: Uint16Array | null = null;
      for (let i = 0; i < 100000 && m.status !== 'halted' && m.status !== 'error'; i++) {
        if (m.currentInstr?.text.toLowerCase() === 'mov ax, 4c00h') snapshot = m.regs.slice();
        if (!m.step()) break;
      }
      expect(m.error).toBeNull();
      expect(m.status).toBe('halted');
      expect(snapshot).not.toBeNull();
      if (ex.output) expect(m.out).toContain(ex.output);
      for (const [r, v] of Object.entries(ex.regs ?? {})) {
        const names16 = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'];
        const names8 = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh'];
        const i16 = names16.indexOf(r);
        const i8 = names8.indexOf(r);
        const reg = (i: number) => snapshot![i];
        const got = i16 >= 0 ? reg(i16) : i8 < 4 ? reg(i8) & 0xff : (reg(i8 - 4) >> 8) & 0xff;
        expect(got, r).toBe(v);
      }
    });
  }
});

describe('tag degli esempi', () => {
  it('ogni esempio ha la sua categoria tra i tag e i tag sono tutti nell\'elenco dei filtri', () => {
    for (const e of EXAMPLES) {
      const tags = exampleTags(e);
      expect(tags).toContain(e.category);
      for (const t of tags) expect(EXAMPLE_TAGS).toContain(t);
    }
  });

  it('l\'intersezione di due tag restringe i risultati', () => {
    const both = EXAMPLES.filter((e) => exampleTags(e).includes('Variabili') && exampleTags(e).includes('Registri'));
    const one = EXAMPLES.filter((e) => exampleTags(e).includes('Variabili'));
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(one.length);
  });
});
