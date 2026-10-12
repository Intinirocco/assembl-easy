import { describe, expect, it } from 'vitest';
import { EXERCISES, buildProgram, solutionCode } from '../src/content/exercises';
import { allTests, autoTests, rngFor } from '../src/content/autotests';
import { gradeProgram } from '../src/emu/grader';

describe('test automatici degli esercizi', () => {
  it('sono deterministici (stessi casi a ogni chiamata)', () => {
    const e = EXERCISES.find((x) => x.id === 'somma-due-numeri')!;
    expect(autoTests(e)).toEqual(autoTests(e));
    expect(rngFor('a')()).toBe(rngFor('a')());
    expect(rngFor('a')()).not.toBe(rngFor('b')());
  });

  for (const e of EXERCISES) {
    it(`${e.id}: molti casi e la soluzione di riferimento li supera tutti`, () => {
      const { base, auto } = allTests(e);
      expect(auto.length).toBeGreaterThanOrEqual(e.id === 'conto-alla-rovescia' ? 1 : 7);
      const r = gradeProgram(solutionCode(e), [...base, ...auto], { requires: e.requires });
      expect(r.assemblyErrors).toEqual([]);
      const failed = r.results.filter((x) => !x.passed).map((x) => `${x.name}: ${x.details.join('; ')}`);
      expect(failed).toEqual([]);
    });
  }
});

// Soluzioni sbagliate ma plausibili: i test automatici devono scoprirle.
const MUTANTS: Record<string, { why: string; body: string; tail?: string }[]> = {
  'somma-due-numeri': [
    { why: 'somma a 8 bit', body: '    mov al, byte ptr n1\n    add al, byte ptr n2\n    mov ah, 0\n    mov risultato, ax\n' },
  ],
  'prodotto-byte': [{ why: 'salva solo AL', body: '    mov al, a\n    mul b\n    mov byte ptr prodotto, al\n' }],
  'massimo-due': [{ why: 'salto con segno', body: '    mov al, n1\n    cmp al, n2\n    jge fine\n    mov al, n2\nfine:\n    mov massimo, al\n' }],
  'valore-assoluto': [{ why: 'salto senza segno', body: '    mov ax, n\n    cmp ax, 0\n    jae ok\n    neg ax\nok:\n    mov assoluto, ax\n' }],
  'somma-array': [
    {
      why: 'somma a 8 bit',
      body: '    lea si, v\n    mov cx, lunghezza\n    mov al, 0\nciclo:\n    add al, [si]\n    inc si\n    loop ciclo\n    mov ah, 0\n    mov somma, ax\n',
    },
  ],
  'massimo-array': [
    { why: 'ignora l\'ultimo elemento', body: '    lea si, v\n    mov al, [si]\n    mov cx, lunghezza\n    sub cx, 2\n    inc si\nciclo:\n    cmp al, [si]\n    jae avanti\n    mov al, [si]\navanti:\n    inc si\n    loop ciclo\n    mov massimo, al\n' },
  ],
  fattoriale: [{ why: 'non gestisce 0!', body: '    mov ax, 1\n    mov cl, n\n    mov ch, 0\nciclo:\n    mul cx\n    loop ciclo\n    mov fattoriale, ax\n' }],
  'pari-dispari': [{ why: 'risultato invertito', body: '    mov al, n\n    test al, 1\n    jz e\n    mov pari, 1\n    jmp fine\ne:\n    mov pari, 0\nfine:\n' }],
  'bit-a-uno': [{ why: 'conta solo 4 bit', body: '    mov al, n\n    mov bl, 0\n    mov cx, 4\nciclo:\n    shr al, 1\n    adc bl, 0\n    loop ciclo\n    mov uni, bl\n' }],
  'quoziente-resto': [{ why: 'scambia quoziente e resto', body: '    mov ax, dividendo\n    div divisore\n    mov quoziente, ah\n    mov resto, al\n' }],
};

describe('i test automatici scoprono soluzioni sbagliate', () => {
  for (const [id, list] of Object.entries(MUTANTS)) {
    for (const m of list) {
      it(`${id}: ${m.why}`, () => {
        const ex = EXERCISES.find((x) => x.id === id)!;
        const { base, auto } = allTests(ex);
        const code = buildProgram(ex.data, m.body, m.tail ?? '');
        const r = gradeProgram(code, [...base, ...auto]);
        expect(r.assemblyErrors).toEqual([]);
        expect(r.passed).toBeLessThan(r.total);
        // ... e lo scopre anche senza i casi scritti a mano
        const onlyAuto = gradeProgram(code, auto);
        expect(onlyAuto.passed).toBeLessThan(onlyAuto.total);
      });
    }
  }
});

describe('programmi che non terminano', () => {
  it('un ciclo infinito viene fermato in fretta e segnalato', () => {
    const ex = EXERCISES.find((x) => x.id === 'somma-due-numeri')!;
    const code = buildProgram(ex.data, 'ciclo:\n    jmp ciclo\n');
    const { base, auto } = allTests(ex);
    const t0 = performance.now();
    const r = gradeProgram(code, [...base, ...auto]);
    const ms = performance.now() - t0;
    expect(r.passed).toBe(0);
    expect(r.results.some((x) => /ciclo infinito/i.test(x.details.join(' ')))).toBe(true);
    expect(r.results.filter((x) => x.runtimeError === 'Non eseguito').length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(3000);
  });
});
