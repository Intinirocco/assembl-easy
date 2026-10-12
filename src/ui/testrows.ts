import type { Scalar, TestCase } from '../emu/grader';
import { esc } from './dom';

export interface Row {
  name: string;
  input: string;
  output: string;
  vars: string;
  regs: string;
  init: string;
}

const EMPTY = (n: number): Row => ({ name: `Caso ${n}`, input: '', output: '', vars: '', regs: '', init: '' });

function parseScalar(raw: string): Scalar {
  const t = raw.trim();
  const str = /^(["'])(.*)\1$/.exec(t);
  if (str) return str[2];
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(/[\s,]+/).filter(Boolean).map((x) => Number(parseScalar(x)));
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^[01]+b$/i.test(t)) return parseInt(t.slice(0, -1), 2);
  throw new Error(`Valore non valido: "${raw}"`);
}

/** "a=5, b=0x10, msg='ciao'" → { a: 5, b: 16, msg: 'ciao' } */
export function parsePairs(text: string): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  const parts = text.split(/,(?=(?:[^"'\[]|"[^"]*"|'[^']*'|\[[^\]]*\])*$)/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) throw new Error(`Manca "=" in "${p}"`);
    out[p.slice(0, eq).trim()] = parseScalar(p.slice(eq + 1));
  }
  return out;
}

export function rowToTest(r: Row): TestCase {
  const vars = parsePairs(r.vars);
  const regs: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsePairs(r.regs))) {
    if (typeof v !== 'number') throw new Error(`Il registro ${k} richiede un numero`);
    regs[k] = v;
  }
  return {
    name: r.name || 'Caso',
    group: 'user',
    input: r.input.replace(/\\n/g, '\n'),
    init: parsePairs(r.init),
    expect: {
      vars,
      regs,
      output: r.output.trim() ? r.output.split('|').map((x) => x.replace(/\\n/g, '\r\n')) : [],
    },
  };
}

const FIELDS: [keyof Row, string, string][] = [
  ['name', 'Nome', 'Caso 1'],
  ['init', 'Valori iniziali', 'n1=10, n2=20'],
  ['input', 'Input da tastiera', '12\\n30\\n'],
  ['vars', 'Variabili finali', 'risultato=30'],
  ['regs', 'Registri finali', 'cx=30'],
  ['output', 'Output atteso (separa con |)', 'somma: 30'],
];

export const TEST_HELP = `
  <ul>
    <li><b>Valori iniziali</b>: variabili del segmento dati impostate prima di partire, es. <code>n1=10, n2=20</code>,
      <code>v=[1 2 3]</code>, <code>msg='ciao$'</code> (decimale, <code>0x…</code> o <code>…h</code>).</li>
    <li><b>Input da tastiera</b>: i tasti digitati; <code>\\n</code> è Invio (es. <code>12\\n30\\n</code>).</li>
    <li><b>Variabili finali</b>: valori che le variabili devono avere alla fine, es. <code>risultato=42</code>.</li>
    <li><b>Registri finali</b>: es. <code>cx=52, dl=65</code>. <code>ax</code> è sovrascritto dall'uscita al DOS (<code>mov ax, 4c00h</code>).</li>
    <li><b>Output atteso</b>: testi che devono comparire nel terminale, in ordine, separati da <code>|</code>.</li>
    <li>I campi vuoti non vengono controllati. Un caso senza nessun campo verifica solo che il programma termini.</li>
  </ul>`;

/** Elenco modificabile di casi di prova scritti dall'utente, salvato nel browser. */
export class TestRows {
  private rows: Row[];
  private storeKey: string;

  constructor(private el: HTMLElement, key: string, private onChange?: () => void) {
    this.storeKey = `assembl-easy:rows:${key}`;
    let saved: Row[] | null = null;
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (raw) saved = JSON.parse(raw) as Row[];
    } catch {
      saved = null;
    }
    this.rows = saved?.length ? saved : [EMPTY(1)];
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.row === undefined) return;
      this.rows[Number(t.dataset.row)][t.dataset.key as keyof Row] = t.value;
      this.save();
    });
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const del = t.closest('[data-del]') as HTMLElement | null;
      if (del) {
        this.rows.splice(Number(del.dataset.del), 1);
        if (!this.rows.length) this.rows.push(EMPTY(1));
        this.save();
        this.draw();
      } else if (t.closest('[data-add]')) {
        this.rows.push(EMPTY(this.rows.length + 1));
        this.save();
        this.draw();
      }
    });
    this.draw();
  }

  private save() {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(this.rows));
    } catch {
      /* storage non disponibile */
    }
    this.onChange?.();
  }

  private draw() {
    this.el.innerHTML =
      this.rows
        .map(
          (r, i) => `<fieldset class="case"><legend>Caso ${i + 1}
          <button class="mini danger" data-del="${i}" type="button">Rimuovi</button></legend>
          ${FIELDS.map(
            ([k, label, ph]) =>
              `<label>${label}<input data-row="${i}" data-key="${k}" value="${esc(r[k])}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" /></label>`,
          ).join('')}
        </fieldset>`,
        )
        .join('') + `<button class="mini" data-add type="button">+ Aggiungi caso</button>`;
  }

  /** righe in cui almeno un campo (oltre al nome) è compilato */
  private filled(): Row[] {
    return this.rows.filter((r) => Object.entries(r).some(([k, v]) => k !== 'name' && v.trim()));
  }

  count(): number {
    return this.filled().length;
  }

  /** Casi compilati, pronti per il correttore. Lancia Error se un campo non è valido. */
  tests(): TestCase[] {
    return this.filled().map(rowToTest);
  }

  /** Come tests() ma, se non c'è nulla di compilato, restituisce un caso che verifica solo la terminazione. */
  testsOrDefault(): TestCase[] {
    const t = this.tests();
    return t.length ? t : [{ name: 'Esecuzione (il programma termina senza errori)', group: 'user', expect: {} }];
  }
}
