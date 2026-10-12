import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXERCISES, solutionCode, buildProgram } from '../src/content/exercises';
import { assemble } from '../src/emu/assembler';
import { analyze, explore } from '../src/emu/analyze';
import { bestCandidate, rankExercises } from '../src/emu/detect';

function detect(src: string, consegna = '') {
  const prog = assemble(src);
  expect(prog.errors).toEqual([]);
  const a = analyze(prog);
  const rank = rankExercises(src, a.vars.map((v) => ({ name: v.name.toLowerCase(), unit: v.unit })), EXERCISES, consegna);
  return { prog, a, rank, best: bestCandidate(rank) };
}

describe('riconoscimento automatico dell\'esercizio', () => {
  for (const e of EXERCISES) {
    it(`riconosce ${e.id} dalla sua soluzione`, () => {
      const { best } = detect(solutionCode(e));
      expect(best?.ex.id).toBe(e.id);
    });
  }

  it('riconosce l\'esercizio anche se il programma è sbagliato (le variabili coincidono)', () => {
    const ex = EXERCISES.find((x) => x.id === 'massimo-due')!;
    const sbagliata = buildProgram(ex.data, '    mov al, n1\n    cmp al, n2\n    jge fine\n    mov al, n2\nfine:\n    mov massimo, al\n');
    const { best } = detect(sbagliata);
    expect(best?.ex.id).toBe('massimo-due');
    expect(best!.rate).toBeLessThan(1);
  });

  it('distingue esercizi con le stesse variabili dal comportamento', () => {
    const somma = EXERCISES.find((x) => x.id === 'somma-due-numeri')!;
    const diff = EXERCISES.find((x) => x.id === 'differenza')!;
    expect(detect(solutionCode(somma)).best?.ex.id).toBe('somma-due-numeri');
    expect(detect(solutionCode(diff)).best?.ex.id).toBe('differenza');
  });

  it('non inventa un esercizio per i programmi delle lezioni', () => {
    for (const f of ['esercizio1.asm', 'esercizio2.asm', 'esercizio3.asm', 'tpsit.asm']) {
      const src = readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
      const { best } = detect(src);
      expect(best, f).toBeNull();
    }
  });
});

describe('analisi del codice', () => {
  it('classifica variabili, tastiera e terminale', () => {
    const src = readFileSync(new URL('./fixtures/esercizio2.asm', import.meta.url), 'utf8');
    const { a } = detect(src);
    expect(a.usesKeyboard).toBe(true);
    expect(a.printsText).toBe(true);
    const by = Object.fromEntries(a.vars.map((v) => [v.name, v]));
    expect(by.n1.written).toBe(true); // mov n1, al
    expect(by.n2.read).toBe(true); // mov bl, n2
    expect(by.n2.written).toBe(false);
    expect(a.inputs.map((v) => v.name)).toContain('n2');
    expect(a.outputs.map((v) => v.name)).toContain('n1');
  });

  it('esplora il comportamento con valori diversi', () => {
    const src = readFileSync(new URL('./fixtures/esercizio2.asm', import.meta.url), 'utf8');
    const { prog, a } = detect(src);
    const rows = explore(prog, a);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.status === 'ok' || r.status === 'waiting')).toBe(true);
    // con l'input 7 il prodotto è 42 > 36: compare il messaggio
    expect(rows.some((r) => r.output.includes("maggiore di 36"))).toBe(true);
  });
});
