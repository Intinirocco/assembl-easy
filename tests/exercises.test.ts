import { describe, expect, it } from 'vitest';
import { EXERCISES, solutionCode, starterCode } from '../src/content/exercises';
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
