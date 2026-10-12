// Riconoscimento automatico dell'esercizio del catalogo a cui somiglia un programma.
import { assemble } from './assembler';
import { gradeProgram, type TestCase } from './grader';
import { allTests } from '../content/autotests';
import { starterCode, type Exercise } from '../content/exercises';

export interface Candidate {
  ex: Exercise;
  /** tutte le variabili dell'esercizio sono presenti, con lo stesso nome */
  signature: boolean;
  matched: string[];
  sizeMismatch: string[];
  passed: number;
  total: number;
  rate: number;
  textScore: number;
}

const sigCache = new Map<string, { name: string; unit: number }[]>();

function exerciseVars(ex: Exercise): { name: string; unit: number }[] {
  let v = sigCache.get(ex.id);
  if (!v) {
    const p = assemble(starterCode(ex));
    v = [...p.symbols.values()].filter((s) => s.type === 'data' && s.name).map((s) => ({ name: s.name!.toLowerCase(), unit: s.size ?? 1 }));
    sigCache.set(ex.id, v);
  }
  return v;
}

const STOP = new Set(['il', 'lo', 'la', 'di', 'da', 'del', 'dei', 'in', 'un', 'una', 'e', 'a', 'con', 'per', 'che', 'nella', 'nel', 'word', 'byte']);
const tokens = (t: string) =>
  new Set(t.toLowerCase().replace(/[^a-zàèéìòù0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** campione dei test di un esercizio: tutti i base + qualche automatico, per classificare in fretta */
function sample(ex: Exercise): TestCase[] {
  const { base, auto } = allTests(ex);
  const step = Math.max(1, Math.floor(auto.length / 10));
  return [...base, ...auto.filter((_, i) => i % step === 0).slice(0, 10)];
}

export function rankExercises(source: string, studentVars: { name: string; unit: number }[], exercises: Exercise[], consegna = ''): Candidate[] {
  const have = new Map(studentVars.map((v) => [v.name.toLowerCase(), v.unit]));
  const consegnaTokens = tokens(consegna);
  const out: Candidate[] = [];

  for (const ex of exercises) {
    const vars = exerciseVars(ex);
    const matched = vars.filter((v) => have.has(v.name)).map((v) => v.name);
    // le variabili dell'esercizio devono esserci tutte e rappresentare la parte principale di quelle del programma
    // (un programma con n1, n2 e msg non è "Ciao mondo" solo perché ha una variabile msg)
    const coverage = studentVars.length ? vars.length / studentVars.length : 0;
    const signature = vars.length > 0 && matched.length === vars.length && coverage >= 0.6;
    // un esercizio con variabili entra in gara solo con la firma giusta;
    // uno senza variabili (solo terminale) può essere riconosciuto soltanto dal comportamento
    if (vars.length > 0 && !signature) continue;

    const r = gradeProgram(source, sample(ex), { requires: ex.requires });
    if (r.assemblyErrors.length) return [];
    const exTokens = tokens(ex.title + ' ' + ex.text);
    let hits = 0;
    consegnaTokens.forEach((t) => exTokens.has(t) && hits++);
    out.push({
      ex,
      signature,
      matched,
      sizeMismatch: vars.filter((v) => have.has(v.name) && have.get(v.name) !== v.unit).map((v) => v.name),
      passed: r.passed,
      total: r.total,
      rate: r.total ? r.passed / r.total : 0,
      textScore: hits,
    });
  }
  return out.sort((a, b) => b.rate - a.rate || b.textScore - a.textScore || b.matched.length - a.matched.length);
}

/** Il candidato migliore, se abbastanza sicuro per essere proposto. */
export function bestCandidate(c: Candidate[]): Candidate | null {
  const first = c[0];
  if (!first) return null;
  if (first.signature) return first; // variabili con gli stessi nomi: chiaramente quell'esercizio
  return first.rate >= 0.95 ? first : null; // senza variabili: serve che il comportamento sia giusto
}
