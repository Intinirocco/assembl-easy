import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_TAGS, exerciseTags, solutionCode, starterCode } from '../src/content/exercises';
import { gradeProgram } from '../src/emu/grader';
import { assemble } from '../src/emu/assembler';

describe('esercizi', () => {
  for (const e of EXERCISES) {
    it(`${e.id}: la soluzione supera tutti i test`, () => {
      const r = gradeProgram(solutionCode(e), e.tests, { requires: e.requires });
      expect(r.assemblyErrors).toEqual([]);
      const failed = r.results.filter((x) => !x.passed);
      expect(failed).toEqual([]);
    });
    it(`${e.id}: il codice di partenza assembla e non passa i test`, () => {
      expect(assemble(starterCode(e)).errors).toEqual([]);
      const r = gradeProgram(starterCode(e), e.tests, { requires: e.requires });
      expect(r.passed).toBeLessThan(r.total);
    });
  }
});

describe('tag degli esercizi', () => {
  it('ogni esercizio ha la categoria tra i tag e ogni tag è un filtro disponibile', () => {
    for (const e of EXERCISES) {
      const tags = exerciseTags(e);
      expect(tags).toContain(e.category);
      for (const t of tags) expect(EXERCISE_TAGS).toContain(t);
    }
  });

  it('l\'intersezione restringe i risultati', () => {
    const has = (t: string) => EXERCISES.filter((e) => exerciseTags(e).includes(t));
    const both = EXERCISES.filter((e) => exerciseTags(e).includes('Cicli') && exerciseTags(e).includes('Variabili'));
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(has('Cicli').length + 1);
    expect(both.length).toBeLessThan(has('Variabili').length);
  });
});
