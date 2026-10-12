import { EXERCISES, starterCode } from '../content/exercises';
import { gradeProgram, type Scalar, type TestCase } from '../emu/grader';
import { openInEmulator } from '../bus';
import { esc, store } from '../ui/dom';
import { CodeEditor } from '../ui/editor';
import { renderReport } from '../ui/report';

interface Row {
  name: string;
  input: string;
  output: string;
  vars: string;
  regs: string;
  init: string;
}

const saved = store<{ consegna: string; code: string; rows: Row[] }>('check', {
  consegna: '',
  code: '',
  rows: [{ name: 'Caso 1', input: '', output: '', vars: '', regs: '', init: '' }],
});

function parseScalar(raw: string): Scalar {
  const t = raw.trim();
  const str = /^(["'])(.*)\1$/.exec(t);
  if (str) return str[2];
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(/\s+/).filter(Boolean).map(Number);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^[01]+b$/i.test(t)) return parseInt(t.slice(0, -1), 2);
  throw new Error(`Valore non valido: "${raw}"`);
}

/** "a=5, b=0x10, msg='ciao'" → { a: 5, b: 16, msg: 'ciao' } */
function parsePairs(text: string): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  const parts = text.split(/,(?=(?:[^"']|"[^"]*"|'[^']*')*$)/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) throw new Error(`Manca "=" in "${p}"`);
    out[p.slice(0, eq).trim()] = parseScalar(p.slice(eq + 1));
  }
  return out;
}

function rowToTest(r: Row): TestCase {
  const vars = parsePairs(r.vars);
  const regs: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsePairs(r.regs))) {
    if (typeof v !== 'number') throw new Error(`Il registro ${k} richiede un numero`);
    regs[k] = v;
  }
  return {
    name: r.name || 'Caso',
    input: r.input.replace(/\\n/g, '\n'),
    init: parsePairs(r.init),
    expect: {
      vars,
      regs,
      output: r.output.trim() ? r.output.split('|').map((x) => x.replace(/\\n/g, '\r\n')) : [],
    },
  };
}

export function renderCheck(root: HTMLElement) {
  const state = saved.get();
  root.innerHTML = `
    <div class="page-head">
      <h1>Correzione</h1>
      <p>Incolla la consegna e il tuo codice, definisci i casi di prova (input e risultati attesi) oppure scegli un esercizio
      del catalogo: il sito esegue il programma, evidenzia in rosso le righe con errori e confronta i risultati.</p>
    </div>
    <div class="check-grid">
      <section>
        <label class="field">Consegna (facoltativa)
          <textarea id="ck-consegna" rows="4" placeholder="Es. Leggi due cifre e stampa la loro somma…"></textarea>
        </label>
        <div class="pane">
          <div class="pane-title">Codice da correggere</div>
          <div id="ck-editor" class="editor tall"></div>
        </div>
      </section>
      <section>
        <label class="field">Esercizio del catalogo
          <select id="ck-ex">
            <option value="">— Definisco io i casi di prova —</option>
            ${EXERCISES.map((e) => `<option value="${e.id}">${esc(e.category)} · ${esc(e.title)}</option>`).join('')}
          </select>
        </label>
        <div id="ck-builder">
          <h4>Casi di prova</h4>
          <p class="muted small">Tutti i campi sono facoltativi. Se non indichi nulla, si verifica solo che il programma
          si assembli e termini senza errori.</p>
          <div id="ck-rows"></div>
          <button id="ck-add" class="mini">+ Aggiungi caso</button>
          <details class="help small"><summary>Come compilare i campi</summary>
            <ul>
              <li><b>Input</b>: i tasti digitati; usa <code>\\n</code> per Invio (es. <code>12\\n30\\n</code>).</li>
              <li><b>Output atteso</b>: testi che devono comparire nel terminale, separati da <code>|</code>.</li>
              <li><b>Variabili finali</b>: <code>risultato=42, v=[1 2 3], msg='ciao'</code> (valori in decimale, <code>0x…</code> o <code>…h</code>).</li>
              <li><b>Registri finali</b>: <code>cx=52, dl=65</code>. Attenzione: <code>ax</code> è sovrascritto dall'uscita al DOS (<code>mov ax, 4c00h</code>).</li>
              <li><b>Valori iniziali</b>: <code>n1=10, n2=20</code> imposta variabili del segmento dati prima di partire.</li>
            </ul>
          </details>
        </div>
        <div id="ck-catalog" hidden class="muted small"></div>
        <div class="actions">
          <button id="ck-run" class="primary">Correggi</button>
          <button id="ck-emu">Apri nell'emulatore</button>
        </div>
        <div id="ck-report"></div>
      </section>
    </div>`;

  const consegna = root.querySelector<HTMLTextAreaElement>('#ck-consegna')!;
  consegna.value = state.consegna;
  const editor = new CodeEditor(root.querySelector('#ck-editor') as HTMLElement);
  editor.value = state.code;
  const rowsEl = root.querySelector<HTMLElement>('#ck-rows')!;
  const report = root.querySelector<HTMLElement>('#ck-report')!;
  const exSel = root.querySelector<HTMLSelectElement>('#ck-ex')!;
  let rows: Row[] = state.rows.length ? state.rows : [{ name: 'Caso 1', input: '', output: '', vars: '', regs: '', init: '' }];

  const persist = () => saved.set({ consegna: consegna.value, code: editor.value, rows });
  consegna.addEventListener('input', persist);
  editor.onChange = () => {
    editor.errors = new Map();
    editor.render();
    persist();
  };

  const FIELDS: [keyof Row, string, string][] = [
    ['name', 'Nome', 'Caso 1'],
    ['input', 'Input', '12\\n30\\n'],
    ['output', 'Output atteso', 'somma: 42'],
    ['vars', 'Variabili finali', 'risultato=42'],
    ['regs', 'Registri finali', 'cx=52'],
    ['init', 'Valori iniziali', 'n1=10, n2=20'],
  ];
  const drawRows = () => {
    rowsEl.innerHTML = rows
      .map(
        (r, i) => `<fieldset class="case"><legend>Caso ${i + 1}
          ${rows.length > 1 ? `<button class="mini danger" data-del="${i}">Rimuovi</button>` : ''}</legend>
          ${FIELDS.map(
            ([k, label, ph]) =>
              `<label>${label}<input data-row="${i}" data-key="${k}" value="${esc(r[k])}" placeholder="${esc(ph)}" spellcheck="false" /></label>`,
          ).join('')}
        </fieldset>`,
      )
      .join('');
  };
  rowsEl.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.row === undefined) return;
    rows[Number(t.dataset.row)][t.dataset.key as keyof Row] = t.value;
    persist();
  });
  rowsEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-del]') as HTMLElement | null;
    if (!b) return;
    rows.splice(Number(b.dataset.del), 1);
    drawRows();
    persist();
  });
  root.querySelector('#ck-add')!.addEventListener('click', () => {
    rows.push({ name: `Caso ${rows.length + 1}`, input: '', output: '', vars: '', regs: '', init: '' });
    drawRows();
    persist();
  });
  drawRows();

  const catalog = root.querySelector<HTMLElement>('#ck-catalog')!;
  const builder = root.querySelector<HTMLElement>('#ck-builder')!;
  exSel.addEventListener('change', () => {
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    builder.hidden = !!ex;
    catalog.hidden = !ex;
    if (ex) {
      consegna.value = ex.text.replace(/`/g, '');
      catalog.innerHTML = `Verrà eseguito con ${ex.tests.length} casi di prova: ${ex.tests.map((t) => esc(t.name)).join(', ')}.`;
      if (!editor.value.trim()) editor.value = starterCode(ex);
      persist();
    }
  });

  report.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    editor.selectLine(Number(a.dataset.goto));
  });

  root.querySelector('#ck-run')!.addEventListener('click', () => {
    let tests: TestCase[];
    let requires: string[] | undefined;
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    try {
      if (ex) {
        tests = ex.tests;
        requires = ex.requires;
      } else {
        const filled = rows.filter((r) => Object.values(r).some((v, i) => i > 0 && v.trim()));
        tests = (filled.length ? filled : [rows[0]]).map(rowToTest);
      }
    } catch (err) {
      report.innerHTML = `<div class="rep rep-bad"><div class="rep-title">Casi di prova non validi</div><p>${esc((err as Error).message)}</p></div>`;
      return;
    }
    if (!editor.value.trim()) {
      report.innerHTML = '<div class="rep rep-bad"><div class="rep-title">Scrivi o incolla del codice da correggere.</div></div>';
      return;
    }
    const r = gradeProgram(editor.value, tests, { requires });
    editor.errors = r.errorLines;
    editor.render();
    report.innerHTML = renderReport(r);
    persist();
  });
  root.querySelector('#ck-emu')!.addEventListener('click', () => openInEmulator(editor.value));
}
