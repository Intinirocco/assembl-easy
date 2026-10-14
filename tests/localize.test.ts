import { describe, expect, it } from 'vitest';
import { EXERCISES, solutionCode } from '../src/content/exercises';
import { allTests } from '../src/content/autotests';
import { gradeProgram } from '../src/emu/grader';
import { localizeFault } from '../src/emu/localize';

function breakLine(exId: string, from: string, to: string) {
  const ex = EXERCISES.find((e) => e.id === exId)!;
  const lines = solutionCode(ex).split('\n');
  const idx = lines.findIndex((l) => l.includes(from));
  expect(idx, `riga "${from}" non trovata`).toBeGreaterThanOrEqual(0);
  lines[idx] = lines[idx].replace(from, to);
  const code = lines.join('\n');
  const t = allTests(ex);
  const tests = [...t.base, ...t.auto];
  const t0 = performance.now();
  const r = gradeProgram(code, tests, { requires: ex.requires });
  const suspects = localizeFault(code, tests, r, { requires: ex.requires });
  return { line: idx + 1, r, suspects, ms: performance.now() - t0 };
}

describe('localizzazione della riga sbagliata', () => {
  const CASES: [string, string, string][] = [
    ['massimo-due', 'jae fine', 'jge fine'], // salto con segno invece che senza
    ['valore-assoluto', 'jge ok', 'jae ok'],
    ['somma-due-numeri', 'add ax, n2', 'sub ax, n2'],
    ['scambio', 'mov a, bx', 'mov a, ax'],
    ['bit-a-uno', 'mov cx, 8', 'mov cx, 4'],
    ['differenza', 'sub ax, n2', 'add ax, n2'],
    ['prodotto-byte', 'mul b', 'mul a'],
    ['massimo-array', 'cmp al, [si]', 'cmp [si], al'],
  ];
  for (const [id, from, to] of CASES) {
    it(`${id}: "${from}" → "${to}"`, () => {
      const { line, suspects, r, ms } = breakLine(id, from, to);
      expect(r.passed).toBeLessThan(r.total);
      const hit = suspects.find((s) => s.line === line);
      expect(hit, JSON.stringify(suspects)).toBeDefined();
      expect(hit!.kind).toBe('fix');
      expect(ms).toBeLessThan(4000);
    });
  }

  it('programma corretto: nessuna riga sospetta', () => {
    const ex = EXERCISES.find((e) => e.id === 'massimo-due')!;
    const t = allTests(ex);
    const r = gradeProgram(solutionCode(ex), [...t.base, ...t.auto]);
    expect(localizeFault(solutionCode(ex), [...t.base, ...t.auto], r)).toEqual([]);
  });

  it('più righe sbagliate: indica almeno dove viene scritto il valore errato', () => {
    const ex = EXERCISES.find((e) => e.id === 'somma-array')!;
    const code = solutionCode(ex).replace('mov ax, 0\n', 'mov ax, 5\n').replace('add ax, bx', 'add ax, 1');
    const t = allTests(ex);
    const tests = [...t.base, ...t.auto];
    const r = gradeProgram(code, tests);
    expect(r.passed).toBeLessThan(r.total);
    const s = localizeFault(code, tests, r);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].line).toBeGreaterThan(0);
  });
});
