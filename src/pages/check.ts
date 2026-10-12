import { EXERCISES, starterCode } from '../content/exercises';
import { allTests } from '../content/autotests';
import { gradeProgram, type TestCase } from '../emu/grader';
import { openInEmulator } from '../bus';
import { esc, store } from '../ui/dom';
import { CodeEditor } from '../ui/editor';
import { renderReport } from '../ui/report';
import { TEST_HELP, TestRows } from '../ui/testrows';

const saved = store<{ consegna: string; code: string; exercise: string }>('check2', {
  consegna: '',
  code: '',
  exercise: '',
});

export function renderCheck(root: HTMLElement) {
  const state = saved.get();
  root.innerHTML = `
    <div class="browse-head">
      <div>
        <h1>Correzione</h1>
        <p>Incolla il tuo codice e scegli come verificarlo: con i test di un esercizio del catalogo (decine di casi generati
        in automatico) oppure con casi scritti da te. Le righe con errori di assemblaggio o di esecuzione sono evidenziate in rosso.</p>
      </div>
    </div>

    <details class="how">
      <summary>Come funziona la correzione automatica</summary>
      <div class="how-body">
        <ol>
          <li><b>Assemblaggio</b>: il codice viene tradotto. Errori di sintassi, istruzioni inesistenti, operandi incompatibili
            o etichette mancanti vengono segnalati sulla riga giusta, in rosso.</li>
          <li><b>Esecuzione</b>: per ogni caso di prova il programma parte da zero. Si impostano i valori iniziali delle
            variabili e i tasti da digitare, poi si esegue fino a <code>int 21h / 4Ch</code>.</li>
          <li><b>Confronto</b>: a fine esecuzione si controllano variabili, registri e testo nel terminale rispetto ai valori
            attesi. Un caso è superato solo se <i>tutti</i> i controlli sono giusti.</li>
          <li><b>Errori a runtime</b> (divisione per zero, ciclo infinito, input non previsto) fanno fallire il caso e
            indicano la riga dove è successo.</li>
        </ol>
        <p>Per gli esercizi del catalogo i casi sono <b>generati automaticamente</b>: valori limite (0, 1, massimi, riporti,
        overflow…) più valori casuali con seme fisso, quindi sempre gli stessi per tutti. I risultati attesi sono calcolati
        con una formula indipendente dall'emulatore. Puoi aggiungere i tuoi casi: vengono eseguiti insieme.</p>
      </div>
    </details>

    <div class="check-grid">
      <section>
        <label class="field">Consegna (facoltativa, solo per promemoria)
          <textarea id="ck-consegna" rows="3" placeholder="Es. Leggi due cifre e stampa la loro somma…"></textarea>
        </label>
        <div class="pane">
          <div class="pane-title">Codice da correggere</div>
          <div id="ck-editor" class="editor tall"></div>
        </div>
        <div class="actions">
          <button id="ck-run" class="primary big">✓ Correggi</button>
          <button id="ck-emu" class="big">Apri nell'emulatore</button>
        </div>
      </section>

      <section>
        <label class="field">Verifica con
          <select id="ck-ex">
            <option value="">Solo i casi scritti da me</option>
            ${EXERCISES.map((e) => `<option value="${e.id}">Test dell'esercizio: ${esc(e.title)}</option>`).join('')}
          </select>
        </label>
        <div id="ck-catalog" class="ck-catalog" hidden></div>

        <h3 class="sub">I tuoi casi di prova</h3>
        <p class="muted small">Facoltativi quando scegli un esercizio; se non ne scrivi nessuno e non scegli un esercizio, si
        verifica solo che il programma si assembli e termini senza errori.</p>
        <div id="ck-rows" class="user-tests"></div>
        <details class="help small"><summary>Come compilare i campi</summary>${TEST_HELP}</details>

        <div id="ck-report"></div>
      </section>
    </div>`;

  const consegna = root.querySelector<HTMLTextAreaElement>('#ck-consegna')!;
  consegna.value = state.consegna;
  const editor = new CodeEditor(root.querySelector('#ck-editor') as HTMLElement);
  editor.value = state.code;
  const report = root.querySelector<HTMLElement>('#ck-report')!;
  const exSel = root.querySelector<HTMLSelectElement>('#ck-ex')!;
  const catalog = root.querySelector<HTMLElement>('#ck-catalog')!;
  exSel.value = state.exercise;

  const persist = () => saved.set({ consegna: consegna.value, code: editor.value, exercise: exSel.value });
  consegna.addEventListener('input', persist);
  editor.onChange = () => {
    editor.errors = new Map();
    editor.render();
    persist();
  };
  const rows = new TestRows(root.querySelector('#ck-rows') as HTMLElement, 'check');

  const describeCatalog = () => {
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    catalog.hidden = !ex;
    if (!ex) return;
    const t = allTests(ex);
    catalog.innerHTML = `<b>${t.base.length + t.auto.length} casi</b> (${t.base.length} base + ${t.auto.length} automatici)${
      ex.requires?.length ? `, con controllo sull'uso di ${ex.requires.map((r) => `<code>${r.toUpperCase()}</code>`).join(', ')}` : ''
    }.<br><span class="muted">${esc(ex.text.replace(/`/g, '').replace(/\*\*/g, ''))}</span>`;
  };
  describeCatalog();

  exSel.addEventListener('change', () => {
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    if (ex) {
      consegna.value = ex.text.replace(/`/g, '').replace(/\*\*/g, '');
      if (!editor.value.trim()) editor.value = starterCode(ex);
    }
    describeCatalog();
    persist();
  });

  report.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    editor.selectLine(Number(a.dataset.goto));
  });

  root.querySelector('#ck-run')!.addEventListener('click', () => {
    if (!editor.value.trim()) {
      report.innerHTML = '<div class="rep rep-bad"><div class="rep-title">Scrivi o incolla del codice da correggere.</div></div>';
      return;
    }
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    let tests: TestCase[];
    try {
      const user = ex ? rows.tests() : rows.testsOrDefault();
      if (ex) {
        const t = allTests(ex);
        tests = [...t.base, ...t.auto, ...user];
      } else tests = user;
    } catch (err) {
      report.innerHTML = `<div class="rep rep-bad"><div class="rep-title">I casi di prova non sono validi</div><p>${esc((err as Error).message)}</p></div>`;
      return;
    }
    const r = gradeProgram(editor.value, tests, { requires: ex?.requires });
    editor.errors = r.errorLines;
    editor.render();
    report.innerHTML = renderReport(r);
    persist();
  });
  root.querySelector('#ck-emu')!.addEventListener('click', () => openInEmulator(editor.value));
}
