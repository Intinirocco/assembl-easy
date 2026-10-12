import { EXERCISES, EXERCISE_TAGS, exerciseTags, solutionCode, starterCode, type Exercise } from '../content/exercises';
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

// I filtri attivi sopravvivono al passaggio elenco → esercizio → elenco.
const selectedTags = new Set<string>();
const selectedLevels = new Set<number>();
let statusFilter: 'all' | 'todo' | 'done' = 'all';

function plain(text: string): string {
  return text.replace(/`/g, '');
}

function matches(e: Exercise, completed: Set<string>): boolean {
  const tags = exerciseTags(e);
  if (![...selectedTags].every((t) => tags.includes(t))) return false; // intersezione degli argomenti
  if (selectedLevels.size && !selectedLevels.has(e.level)) return false;
  if (statusFilter === 'done') return completed.has(e.id);
  if (statusFilter === 'todo') return !completed.has(e.id);
  return true;
}

export function renderExerciseList(root: HTMLElement) {
  const completed = new Set(done.get());
  const tagCount = (t: string) => EXERCISES.filter((e) => exerciseTags(e).includes(t)).length;
  const byLevel = [1, 2, 3].map((l) => {
    const all = EXERCISES.filter((e) => e.level === l);
    return { l, total: all.length, done: all.filter((e) => completed.has(e.id)).length };
  });
  const next = EXERCISES.find((e) => !completed.has(e.id));
  const pct = Math.round((completed.size / EXERCISES.length) * 100);

  root.innerHTML = `
    <div class="browse-head">
      <div>
        <h1>Esercizi</h1>
        <p>Scrivi il programma e premi <b>Verifica</b>: il sito lo esegue con più casi di prova e ti dice quali falliscono.</p>
      </div>
    </div>
    <div class="browse">
      <aside class="browse-side">
        <div class="progress-card">
          <div class="pg-top"><b>${completed.size}</b> / ${EXERCISES.length} completati <span class="pg-pct">${pct}%</span></div>
          <div class="pg-bar"><i style="width:${pct}%"></i></div>
          <div class="pg-levels">
            ${byLevel.map((x) => `<div><span>${LEVELS[x.l]}</span><b>${x.done}/${x.total}</b></div>`).join('')}
          </div>
          ${next ? `<a class="btn-link-block" href="#/esercizi/${next.id}">Continua: ${esc(next.title)} →</a>` : '<p class="pg-all">Hai completato tutto. Ottimo lavoro!</p>'}
        </div>

        <div class="bs-title">Stato</div>
        <div class="seg-row" id="ex-status">
          <button data-s="all">Tutti</button><button data-s="todo">Da fare</button><button data-s="done">Completati</button>
        </div>

        <div class="bs-title">Difficoltà</div>
        <div class="seg-row" id="ex-levels">
          ${[1, 2, 3].map((l) => `<button data-level="${l}">${LEVELS[l]}</button>`).join('')}
        </div>

        <div class="bs-title">Argomenti</div>
        <div id="ex-tags" class="topics">
          <button class="topic" data-tag="">Tutti <span class="count">${EXERCISES.length}</span></button>
          ${EXERCISE_TAGS.map((t) => `<button class="topic" data-tag="${esc(t)}">${esc(t)} <span class="count">${tagCount(t)}</span></button>`).join('')}
        </div>
      </aside>

      <div class="browse-main">
        <div class="muted small" id="ex-count"></div>
        <div class="xlist" id="ex-grid"></div>
        <p id="ex-empty" class="empty" hidden>Nessun esercizio corrisponde ai filtri. Togline qualcuno.</p>
      </div>
    </div>`;

  const grid = root.querySelector<HTMLElement>('#ex-grid')!;
  const draw = () => {
    const list = EXERCISES.filter((e) => matches(e, completed));
    grid.innerHTML = list
      .map((e) => {
        const isDone = completed.has(e.id);
        const extra = exerciseTags(e).filter((t) => t !== e.category);
        return `<a class="xrow${isDone ? ' done' : ''}" href="#/esercizi/${e.id}">
          <span class="xr-state" title="${isDone ? 'Completato' : 'Da fare'}">${isDone ? '✓' : ''}</span>
          <div class="xr-main">
            <div class="xr-top"><span class="ex-cat">${esc(e.category)}</span>${levelDots(e.level)}</div>
            <h3>${esc(e.title)}</h3>
            <p class="xr-text">${esc(plain(e.text))}</p>
            <div class="tags">${extra.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="tag tests">${e.tests.length} casi di prova</span></div>
          </div>
          <span class="xr-go">${isDone ? 'Rivedi' : 'Svolgi'} →</span>
        </a>`;
      })
      .join('');
    (root.querySelector('#ex-empty') as HTMLElement).hidden = list.length > 0;
    (root.querySelector('#ex-count') as HTMLElement).textContent = `${list.length} di ${EXERCISES.length} esercizi`;
    root.querySelectorAll<HTMLButtonElement>('#ex-tags .topic').forEach((c) => {
      const t = c.dataset.tag ?? '';
      c.classList.toggle('on', t === '' ? selectedTags.size === 0 : selectedTags.has(t));
    });
    root.querySelectorAll<HTMLButtonElement>('#ex-levels button').forEach((c) => {
      c.classList.toggle('on', selectedLevels.has(Number(c.dataset.level)));
    });
    root.querySelectorAll<HTMLButtonElement>('#ex-status button').forEach((c) => {
      c.classList.toggle('on', c.dataset.s === statusFilter);
    });
  };

  root.querySelector('#ex-tags')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.topic') as HTMLButtonElement | null;
    if (!b) return;
    const t = b.dataset.tag ?? '';
    if (t === '') selectedTags.clear();
    else if (selectedTags.has(t)) selectedTags.delete(t);
    else selectedTags.add(t);
    draw();
  });
  root.querySelector('#ex-levels')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    const l = Number(b.dataset.level);
    if (selectedLevels.has(l)) selectedLevels.delete(l);
    else selectedLevels.add(l);
    draw();
  });
  root.querySelector('#ex-status')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    statusFilter = b.dataset.s as typeof statusFilter;
    draw();
  });
  draw();
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
