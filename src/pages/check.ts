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
import { TestRows } from '../ui/testrows';

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
  const alts = others.filter((c) => c.signature && c.ex.id !== best.ex.id && c.rate >= 0.4).slice(0, 3);
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
  const placeholder = `<div class="rep rep-idle">
      <div class="rep-title">Come verrà corretto</div>
      <ol class="ck-steps">
        <li><b>Assemblaggio</b>: gli errori di sintassi compaiono in rosso sulla riga giusta.</li>
        <li><b>Analisi</b>: variabili (ingressi e uscite), tastiera, terminale, istruzioni usate.</li>
        <li><b>Riconoscimento</b> dell'esercizio del catalogo dai nomi delle variabili e dal comportamento.</li>
        <li><b>Test</b>: casi base, decine di casi automatici (valori limite e casuali) e i tuoi.</li>
      </ol>
      <p class="rep-hint">Incolla il codice e premi <b>Correggi</b>.</p>
    </div>`;

  root.innerHTML = `
    <div class="crumbs ck-crumbs"><span class="muted">Incolla il tuo codice e verifica che faccia ciò che deve</span></div>
    <div class="ck-page">
      <aside class="ck-left">
        <h1>Correzione</h1>

        <section class="ck-card">
          <h3>Modalità</h3>
          <select id="ck-ex">
            <option value="auto">Automatica: riconosci l'esercizio dal codice</option>
            <option value="none">Solo i casi scritti da me</option>
            <optgroup label="Forza un esercizio del catalogo">
              ${EXERCISES.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join('')}
            </optgroup>
          </select>
          <div id="ck-catalog" class="ck-catalog" hidden></div>
          <p class="ck-note">In automatica il sito analizza il programma e sceglie da solo i test adatti.
          Se due esercizi hanno le stesse variabili aiutalo con la consegna.</p>
        </section>

        <section class="ck-card">
          <h3>Consegna <span class="muted">(facoltativa)</span></h3>
          <textarea id="ck-consegna" rows="4" placeholder="Es. Leggi due cifre e stampa la loro somma…"></textarea>
        </section>

        <details class="ck-card how">
          <summary>Come funziona la correzione</summary>
          <div class="how-body">
            <ol>
              <li><b>Assemblaggio</b>: errori di sintassi, istruzioni inesistenti, operandi incompatibili, etichette mancanti.</li>
              <li><b>Analisi del codice</b>: variabili e ruoli, uso di tastiera e terminale, istruzioni.</li>
              <li><b>Riconoscimento</b>: confronta i nomi delle variabili con quelli degli esercizi e sceglie in base ai test superati.</li>
              <li><b>Esecuzione</b>: ogni caso parte da zero con valori e tasti stabiliti; si confrontano variabili, registri e terminale.</li>
              <li><b>Nessun esercizio riconosciuto</b>: si mostra il comportamento con valori diversi e si segnalano solo errori veri.</li>
            </ol>
          </div>
        </details>
      </aside>

      <section class="ck-center">
        <div class="pane ck-editor-pane">
          <div class="pane-title">Codice da correggere</div>
          <div id="ck-editor" class="editor tall"></div>
        </div>
        <div class="actions">
          <button id="ck-run" class="primary big">✓ Correggi</button>
          <button id="ck-emu" class="big">Apri nell'emulatore</button>
        </div>

        <section class="ck-card ck-cases">
          <div class="ck-cases-head">
            <h3>I tuoi casi di prova <span class="muted">(facoltativi)</span></h3>
            <p>Vengono eseguiti insieme ai test del catalogo. Compila solo i campi che ti servono.</p>
          </div>
          <div id="ck-rows" class="user-tests tr-wide"></div>
        </section>
      </section>

      <aside class="ck-right"><div id="ck-report">${placeholder}</div></aside>
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
