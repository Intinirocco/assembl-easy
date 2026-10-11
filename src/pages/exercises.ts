import { EXERCISES, EXERCISE_CATEGORIES, solutionCode, starterCode, type Exercise } from '../content/exercises';
import { gradeProgram } from '../emu/grader';
import { openInEmulator } from '../bus';
import { esc, inline, store } from '../ui/dom';
import { CodeEditor } from '../ui/editor';
import { renderReport } from '../ui/report';

const done = store<string[]>('done', []);
const LEVELS = ['', 'Facile', 'Medio', 'Difficile'];

function levelDots(l: number) {
  return `<span class="level l${l}" title="${LEVELS[l]}">${'●'.repeat(l)}${'○'.repeat(3 - l)}</span>`;
}

export function renderExerciseList(root: HTMLElement) {
  const completed = new Set(done.get());
  root.innerHTML = `
    <div class="page-head">
      <h1>Esercizi</h1>
      <p>Scrivi il programma, premi <b>Verifica</b>: il sito lo esegue con più casi di prova e ti dice quali falliscono.
      ${completed.size}/${EXERCISES.length} completati.</p>
    </div>
    <div class="filters">
      <div class="chips" id="ex-cats">
        <button class="chip on" data-cat="">Tutti</button>
        ${EXERCISE_CATEGORIES.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
    </div>
    <div class="ex-grid" id="ex-grid"></div>`;
  const grid = root.querySelector<HTMLElement>('#ex-grid')!;
  const draw = (cat: string) => {
    grid.innerHTML = EXERCISES.filter((e) => !cat || e.category === cat)
      .map(
        (e) => `<a class="ex-card${completed.has(e.id) ? ' done' : ''}" href="#/esercizi/${e.id}">
          <span class="ex-cat">${esc(e.category)}</span>
          <strong>${esc(e.title)}</strong>
          <span class="ex-meta">${levelDots(e.level)} ${completed.has(e.id) ? '<span class="ex-done">✓ Completato</span>' : ''}</span>
        </a>`,
      )
      .join('');
  };
  draw('');
  const chips = root.querySelectorAll<HTMLButtonElement>('.chip');
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      chips.forEach((x) => x.classList.toggle('on', x === c));
      draw(c.dataset.cat ?? '');
    }),
  );
}

export function renderExercise(root: HTMLElement, id: string) {
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) {
    root.innerHTML = `<div class="page-head"><h1>Esercizio non trovato</h1><p><a href="#/esercizi">Torna all'elenco</a></p></div>`;
    return;
  }
  renderDetail(root, ex);
}

function renderDetail(root: HTMLElement, ex: Exercise) {
  const draft = store<string | null>(`draft:${ex.id}`, null);
  const idx = EXERCISES.indexOf(ex);
  const next = EXERCISES[idx + 1];
  root.innerHTML = `
    <div class="crumbs"><a href="#/esercizi">← Esercizi</a> · ${esc(ex.category)} · ${levelDots(ex.level)} ${LEVELS[ex.level]}</div>
    <div class="ex-detail">
      <section class="ex-text">
        <h1>${esc(ex.title)}</h1>
        <div class="consegna">${inline(ex.text)}</div>
        <h4>Casi di prova</h4>
        <ul class="cases">${ex.tests.map((t) => `<li>${esc(t.name)}</li>`).join('')}</ul>
        <details class="hints"><summary>Suggerimenti</summary>
          <ol>${ex.hints.map((h) => `<li>${inline(h)}</li>`).join('')}</ol>
        </details>
        <details class="hints"><summary>Mostra la soluzione</summary>
          <p class="warn">Prova prima da solo: la soluzione è una delle tante possibili.</p>
          <pre class="code" id="sol"></pre>
        </details>
      </section>
      <section class="ex-work">
        <div class="pane">
          <div class="pane-title">Il tuo codice
            <span class="spacer"></span>
            <button id="ex-reset" class="mini">Ripristina</button>
          </div>
          <div id="ex-editor" class="editor tall"></div>
        </div>
        <div class="actions">
          <button id="ex-check" class="primary">Verifica</button>
          <button id="ex-open">Apri nell'emulatore</button>
          ${next ? `<a class="btn-link" href="#/esercizi/${next.id}">Prossimo esercizio →</a>` : ''}
        </div>
        <div id="ex-report"></div>
      </section>
    </div>`;

  (root.querySelector('#sol') as HTMLElement).textContent = solutionCode(ex);

  const editor = new CodeEditor(root.querySelector('#ex-editor') as HTMLElement);
  editor.value = draft.get() ?? starterCode(ex);
  editor.onChange = () => {
    draft.set(editor.value);
    editor.errors = new Map();
    editor.render();
  };

  const report = root.querySelector<HTMLElement>('#ex-report')!;
  report.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    editor.selectLine(Number(a.dataset.goto));
  });

  root.querySelector('#ex-check')!.addEventListener('click', () => {
    const r = gradeProgram(editor.value, ex.tests, { requires: ex.requires });
    editor.errors = r.errorLines;
    editor.render();
    report.innerHTML = renderReport(r);
    if (r.assemblyErrors.length === 0 && r.total > 0 && r.passed === r.total) {
      const list = new Set(done.get());
      list.add(ex.id);
      done.set([...list]);
    }
  });
  root.querySelector('#ex-open')!.addEventListener('click', () => openInEmulator(editor.value));
  root.querySelector('#ex-reset')!.addEventListener('click', () => {
    if (!confirm('Ripristinare il codice di partenza? Le modifiche andranno perse.')) return;
    editor.value = starterCode(ex);
    draft.set(null);
    editor.errors = new Map();
    editor.render();
    report.innerHTML = '';
  });
}
