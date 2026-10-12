import { EXERCISES, starterCode, type Exercise } from '../content/exercises';
import { allTests } from '../content/autotests';
import { assemble } from '../emu/assembler';
import { analyze, explore, type Analysis, type ExploreRow } from '../emu/analyze';
import { bestCandidate, rankExercises, type Candidate } from '../emu/detect';
import { gradeProgram, type TestCase } from '../emu/grader';
import { openInEmulator } from '../bus';
import { esc, store } from '../ui/dom';
import { CodeEditor } from '../ui/editor';
import { renderReport } from '../ui/report';
import { TEST_HELP, TestRows } from '../ui/testrows';

const saved = store<{ consegna: string; code: string; exercise: string }>('check2', {
  consegna: '',
  code: '',
  exercise: 'auto',
});

const plain = (t: string) => t.replace(/`/g, '').replace(/\*\*/g, '');
const pct = (x: number) => `${Math.round(x * 100)}%`;

function analysisCard(a: Analysis): string {
  const role = (v: Analysis['vars'][number]) =>
    v.written && v.read ? 'ingresso e uscita' : v.written ? 'uscita' : v.read ? 'ingresso / costante' : 'non usata';
  const type = (v: Analysis['vars'][number]) => (v.unit === 1 ? 'DB' : v.unit === 2 ? 'DW' : 'DD') + (v.count > 1 ? `[${v.count}]` : '');
  return `<details class="analysis" open>
    <summary>Cosa ho capito del programma</summary>
    <dl>
      <dt>Variabili</dt>
      <dd>${
        a.vars.length
          ? a.vars.map((v) => `<span class="vchip"><b>${esc(v.name)}</b> ${type(v)} <i>${role(v)}</i></span>`).join('')
          : '<span class="muted">nessuna variabile dichiarata</span>'
      }</dd>
      <dt>Tastiera</dt><dd>${a.usesKeyboard ? 'legge dalla tastiera' : 'non legge dalla tastiera'}</dd>
      <dt>Terminale</dt><dd>${a.printsText ? 'stampa nel terminale' : 'non stampa nulla'}</dd>
      <dt>Istruzioni</dt><dd>${a.mnemonics.map((m) => `<code>${esc(m)}</code>`).join(' ')}</dd>
    </dl>
  </details>`;
}

function exploreTable(rows: ExploreRow[]): string {
  const icon = (s: ExploreRow['status']) => (s === 'ok' ? '✓' : s === 'waiting' ? '…' : '✗');
  return `<div class="rep explore">
    <div class="rep-title">Comportamento con valori diversi</div>
    <p class="rep-sub">Non c'è un risultato "giusto" con cui confrontare: sono i valori che il programma produce.
    Controlla che abbiano senso.</p>
    <div class="tscroll"><table class="tbl">
      <thead><tr><th>Valori iniziali / input</th><th>Variabili modificate</th><th>Terminale</th><th>Esito</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr class="${r.status}">
            <td><code>${esc(r.label)}</code></td><td><code>${esc(r.changed)}</code></td>
            <td><code>${esc(r.output || '—')}</code></td>
            <td class="st-${r.status}">${icon(r.status)} ${esc(r.message)}</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </div>`;
}

function bannerRecognized(best: Candidate, others: Candidate[]): string {
  const alts = others.filter((c) => c.signature && c.ex.id !== best.ex.id).slice(0, 3);
  const sizeWarn = best.sizeMismatch.length
    ? `<br><span class="warn-inline">Attenzione: ${best.sizeMismatch.map((n) => `<code>${esc(n)}</code>`).join(', ')} ha un tipo diverso (DB/DW) da quello dell'esercizio.</span>`
    : '';
  return `<div class="detect ok">
    <div class="detect-title">🔎 Esercizio riconosciuto: <b>${esc(best.ex.title)}</b></div>
    <p>${
      best.signature
        ? `Le variabili ${best.matched.map((n) => `<code>${esc(n)}</code>`).join(', ')} corrispondono a quelle dell'esercizio`
        : 'Il comportamento del programma coincide con quello dell\'esercizio'
    }; nei casi di controllo ne supera <b>${pct(best.rate)}</b>. Ora verifico con tutti i test del catalogo.${sizeWarn}</p>
    ${
      alts.length
        ? `<p class="small">Potrebbe essere un altro esercizio con le stesse variabili? ${alts
            .map((c) => `<button class="mini" data-ex="${c.ex.id}">${esc(c.ex.title)} (${pct(c.rate)})</button>`)
            .join(' ')}</p>`
        : ''
    }
  </div>`;
}

const BANNER_UNKNOWN = `<div class="detect unknown">
  <div class="detect-title">🔎 Nessun esercizio del catalogo riconosciuto</div>
  <p>I nomi delle variabili e il comportamento non corrispondono a nessuno degli esercizi. Qui sotto trovi l'analisi del
  codice e il comportamento con valori diversi. Per una verifica con risultati attesi <b>scegli un esercizio</b> dalla
  tendina oppure <b>scrivi i tuoi casi di prova</b>.</p>
</div>`;

export function renderCheck(root: HTMLElement) {
  const state = saved.get();
  const mode0 = state.exercise || 'auto';
  root.innerHTML = `
    <div class="browse-head">
      <div>
        <h1>Correzione</h1>
        <p>Incolla il tuo codice e premi <b>Correggi</b>: il sito analizza il programma, riconosce l'esercizio del catalogo a cui
        somiglia e lo verifica con decine di casi generati in automatico. Le righe con errori sono evidenziate in rosso.</p>
      </div>
    </div>

    <details class="how">
      <summary>Come funziona la correzione automatica</summary>
      <div class="how-body">
        <ol>
          <li><b>Assemblaggio</b>: errori di sintassi, istruzioni inesistenti, operandi incompatibili o etichette mancanti
            vengono segnalati sulla riga giusta, in rosso.</li>
          <li><b>Analisi del codice</b>: quali variabili dichiara (e quali sono ingressi o uscite), se legge dalla tastiera,
            se stampa, quali istruzioni usa.</li>
          <li><b>Riconoscimento</b> (modalità automatica): confronta i nomi delle variabili con quelli degli esercizi e, per
            quelli con le stesse variabili, sceglie in base a quanti test supera. Un esercizio che usa solo il terminale
            viene riconosciuto se il comportamento coincide.</li>
          <li><b>Esecuzione</b>: ogni caso parte da zero, con valori iniziali e tasti digitati; poi si confrontano variabili,
            registri e terminale con quanto atteso. Errori a runtime e cicli infiniti fanno fallire il caso.</li>
          <li><b>Se non riconosce nulla</b>: mostra il comportamento con valori limite e casuali (nessun "giusto o sbagliato",
            perché non c'è un risultato di riferimento) e controlla che il programma termini sempre senza errori.</li>
        </ol>
        <p>Puoi sempre forzare un esercizio dalla tendina o aggiungere casi tuoi: vengono eseguiti insieme agli altri.</p>
      </div>
    </details>

    <div class="check-grid">
      <section>
        <label class="field">Consegna (facoltativa: aiuta il riconoscimento quando due esercizi hanno le stesse variabili)
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
        <label class="field">Modalità
          <select id="ck-ex">
            <option value="auto">Automatica: riconosci l'esercizio dal codice</option>
            <option value="none">Solo i casi scritti da me</option>
            <optgroup label="Forza un esercizio del catalogo">
              ${EXERCISES.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('')}
            </optgroup>
          </select>
        </label>
        <div id="ck-catalog" class="ck-catalog" hidden></div>

        <h3 class="sub">I tuoi casi di prova (facoltativi)</h3>
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
  exSel.value = mode0;
  if (exSel.value !== mode0) exSel.value = 'auto';

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
    }.<br><span class="muted">${esc(plain(ex.text))}</span>`;
  };
  describeCatalog();

  exSel.addEventListener('change', () => {
    const ex = EXERCISES.find((e) => e.id === exSel.value);
    if (ex) {
      consegna.value = plain(ex.text);
      if (!editor.value.trim()) editor.value = starterCode(ex);
    }
    describeCatalog();
    persist();
  });

  report.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest('[data-goto]') as HTMLElement | null;
    if (a) {
      e.preventDefault();
      editor.selectLine(Number(a.dataset.goto));
      return;
    }
    const alt = t.closest('[data-ex]') as HTMLElement | null;
    if (alt) {
      exSel.value = alt.dataset.ex!;
      describeCatalog();
      persist();
      run();
    }
  });

  function run() {
    const code = editor.value;
    if (!code.trim()) {
      report.innerHTML = '<div class="rep rep-bad"><div class="rep-title">Scrivi o incolla del codice da correggere.</div></div>';
      return;
    }
    let user: TestCase[];
    try {
      user = rows.tests();
    } catch (err) {
      report.innerHTML = `<div class="rep rep-bad"><div class="rep-title">I casi di prova non sono validi</div><p>${esc((err as Error).message)}</p></div>`;
      return;
    }

    const prog = assemble(code);
    if (!prog.ok) {
      const r = gradeProgram(code, []);
      editor.errors = r.errorLines;
      editor.render();
      report.innerHTML = renderReport(r);
      persist();
      return;
    }

    const analysis = analyze(prog);
    const mode = exSel.value;
    let ex: Exercise | undefined;
    let head = '';

    if (mode === 'auto') {
      const rank = rankExercises(
        code,
        analysis.vars.map((v) => ({ name: v.name.toLowerCase(), unit: v.unit })),
        EXERCISES,
        consegna.value,
      );
      const best = bestCandidate(rank);
      if (best) {
        ex = best.ex;
        head = bannerRecognized(best, rank);
      } else {
        head = BANNER_UNKNOWN;
      }
    } else if (mode !== 'none') {
      ex = EXERCISES.find((e) => e.id === mode);
    }

    // nessun esercizio e nessun caso scritto dall'utente: non c'è nulla con cui confrontare,
    // si mostra il comportamento del programma (con tasti e valori diversi) e si segnalano solo gli errori veri
    if (!ex && user.length === 0) {
      const rowsExp = explore(prog, analysis);
      const errs = new Map<number, string>();
      for (const r of rowsExp) if ((r.status === 'error' || r.status === 'timeout') && r.line && !errs.has(r.line)) errs.set(r.line, r.message);
      const okCount = rowsExp.filter((r) => r.status === 'ok').length;
      const bad = rowsExp.filter((r) => r.status === 'error' || r.status === 'timeout');
      editor.errors = errs;
      editor.render();
      const summary = `<div class="rep ${bad.length ? 'rep-bad' : 'rep-ok'}">
        <div class="rep-title">${
          bad.length
            ? `Errori in ${bad.length} casi su ${rowsExp.length}`
            : `✓ Nessun errore: il programma termina in ${okCount} casi su ${rowsExp.length}`
        }</div>
        ${
          bad.length
            ? `<ul class="rep-list">${[...errs].map(([ln, msg]) => `<li><a href="#" data-goto="${ln}">Riga ${ln}</a> — ${esc(msg)}</li>`).join('')}</ul>`
            : `<p class="rep-hint">Il correttore non può dire se i risultati sono giusti senza un esercizio o dei casi con i valori attesi.</p>`
        }
      </div>`;
      report.innerHTML = head + summary + analysisCard(analysis) + exploreTable(rowsExp);
      persist();
      return;
    }

    const t = ex ? allTests(ex) : { base: [] as TestCase[], auto: [] as TestCase[] };
    const tests: TestCase[] = [...t.base, ...t.auto, ...user];
    const r = gradeProgram(code, tests, { requires: ex?.requires });
    editor.errors = r.errorLines;
    editor.render();
    report.innerHTML = head + analysisCard(analysis) + renderReport(r);
    persist();
  }

  root.querySelector('#ck-run')!.addEventListener('click', run);
  root.querySelector('#ck-emu')!.addEventListener('click', () => openInEmulator(editor.value));
}
