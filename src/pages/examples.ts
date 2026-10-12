import { EXAMPLES, EXAMPLE_CATEGORIES, EXAMPLE_TAGS, exampleTags, type Example } from '../content/examples';
import { openInEmulator } from '../bus';
import { esc, inline } from '../ui/dom';
import { highlightLine } from '../ui/highlight';

// I filtri attivi sopravvivono ai cambi di pagina (aprire un esempio e tornare indietro).
const selected = new Set<string>();
let query = '';

const CATEGORY_INFO: Record<string, string> = {
  'Operazioni base': 'MOV, somma, sottrazione, prodotto e divisione: i mattoni di ogni programma.',
  Variabili: 'Dichiarare dati in memoria, leggerli e scriverli, usare indirizzi e array.',
  'Salti condizionati': 'Confrontare valori e scegliere cosa eseguire: l\'if/else dell\'assembly.',
  Cicli: 'Ripetere istruzioni con LOOP o con un salto all\'indietro.',
  'Stack e procedure': 'PUSH, POP, CALL e RET per salvare valori e riutilizzare codice.',
  'Input/Output': 'Leggere dalla tastiera e stampare nel terminale con le interruzioni del DOS.',
};

function matches(e: Example): boolean {
  const tags = exampleTags(e);
  if (![...selected].every((t) => tags.includes(t))) return false; // intersezione degli argomenti
  const q = query.trim().toLowerCase();
  return !q || (e.title + ' ' + e.summary + ' ' + e.category).toLowerCase().includes(q);
}

/** Poche righe significative del programma (dopo la preparazione dei segmenti). */
function preview(code: string): string {
  const lines = code.split('\n');
  let i = lines.findIndex((l) => /^\s*mov\s+es\s*,\s*ax/i.test(l));
  i = i >= 0 ? i + 1 : 0;
  const out: string[] = [];
  for (; i < lines.length && out.length < 5; i++) {
    const l = lines[i];
    if (/4c00h/i.test(l)) break;
    if (l.trim() && !/^\s*;/.test(l)) out.push(l.replace(/\s{2,};.*$/, '').replace(/\t/g, '    '));
  }
  const min = Math.min(...out.map((l) => l.match(/^\s*/)![0].length), 99);
  return out.map((l) => highlightLine(l.slice(min === 99 ? 0 : min))).join('\n');
}

function cardHtml(e: Example): string {
  const extra = exampleTags(e).filter((t) => t !== e.category);
  const lines = e.code.replace(/\n$/, '').split('\n').length;
  return `<a class="xcard" href="#/esempi/${e.id}">
    <div class="xc-top"><span class="ex-cat">${esc(e.category)}</span><span class="xc-lines">${lines} righe</span></div>
    <h3>${esc(e.title)}</h3>
    <p class="xc-sum">${inline(e.summary)}</p>
    <pre class="xc-code">${preview(e.code)}</pre>
    <div class="xc-foot">
      <span class="tags">${extra.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
      <span class="xc-go">Apri →</span>
    </div>
  </a>`;
}

function drawGrid(root: HTMLElement) {
  const grid = root.querySelector<HTMLElement>('#exs-grid')!;
  const list = EXAMPLES.filter(matches);
  const parts: string[] = [];
  for (const c of EXAMPLE_CATEGORIES) {
    const items = list.filter((e) => e.category === c);
    if (!items.length) continue;
    parts.push(`<section class="xgroup">
      <div class="xg-head"><h2>${esc(c)}</h2><span class="xg-count">${items.length}</span></div>
      <p class="xg-desc">${esc(CATEGORY_INFO[c] ?? '')}</p>
      <div class="xgrid">${items.map(cardHtml).join('')}</div>
    </section>`);
  }
  grid.innerHTML = parts.join('');
  (root.querySelector('#exs-empty') as HTMLElement).hidden = list.length > 0;
  (root.querySelector('#exs-count') as HTMLElement).textContent = `${list.length} di ${EXAMPLES.length} esempi`;
}

function drawTopics(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('#exs-tags .topic').forEach((b) => {
    const t = b.dataset.tag ?? '';
    b.classList.toggle('on', t === '' ? selected.size === 0 : selected.has(t));
  });
}

function renderList(root: HTMLElement) {
  const count = (t: string) => EXAMPLES.filter((e) => exampleTags(e).includes(t)).length;
  root.innerHTML = `
    <div class="browse-head">
      <div>
        <h1>Esempi spiegati</h1>
        <p>Programmi completi e commentati, da leggere, eseguire passo per passo e modificare.
        Seleziona uno o più argomenti: vedrai solo gli esempi che li riguardano <b>tutti</b>.</p>
      </div>
    </div>
    <div class="browse">
      <aside class="browse-side">
        <input id="exs-q" type="search" placeholder="Cerca un esempio…" value="${esc(query)}" />
        <div class="bs-title">Argomenti</div>
        <div id="exs-tags" class="topics">
          <button class="topic" data-tag="">Tutti <span class="count">${EXAMPLES.length}</span></button>
          ${EXAMPLE_TAGS.map((t) => `<button class="topic" data-tag="${esc(t)}">${esc(t)} <span class="count">${count(t)}</span></button>`).join('')}
        </div>
        <div class="bs-note">
          <b>Come studiare un esempio</b>
          <ol><li>Leggi il codice e la spiegazione.</li><li>Aprilo nell'emulatore.</li><li>Esegui con <i>Single step</i> e osserva registri e variabili.</li><li>Cambia un valore e prevedi il risultato.</li></ol>
        </div>
      </aside>
      <div class="browse-main">
        <div class="muted small" id="exs-count"></div>
        <div id="exs-grid"></div>
        <p id="exs-empty" class="empty" hidden>Nessun esempio ha tutti gli argomenti selezionati. Togli un filtro.</p>
      </div>
    </div>`;

  root.querySelector('#exs-tags')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.topic') as HTMLButtonElement | null;
    if (!b) return;
    const t = b.dataset.tag ?? '';
    if (t === '') selected.clear();
    else if (selected.has(t)) selected.delete(t);
    else selected.add(t);
    drawTopics(root);
    drawGrid(root);
  });
  root.querySelector<HTMLInputElement>('#exs-q')!.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    drawGrid(root);
  });
  drawTopics(root);
  drawGrid(root);
}

const norm = (t: string) =>
  t
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .replace(/;.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Per ogni spiegazione, le righe del codice a cui si riferisce (0-based). */
export function matchLines(code: string, noteCode: string): number[] {
  const lines = code.split('\n').map(norm);
  const hits = new Set<number>();
  for (const frag of noteCode.split(/\s+\/\s+/)) {
    const f = norm(frag);
    if (!f || f.startsWith('(')) continue;
    // 1) la riga inizia con il frammento (eventualmente dopo un'etichetta)
    const start = new RegExp(`^(?:[\\w.@$?]+:\\s*)?${escRe(f)}(?:$|[^\\w])`);
    const found: number[] = [];
    lines.forEach((l, i) => {
      if (start.test(l)) found.push(i);
    });
    // 2) altrimenti il frammento compare come parola nella riga
    if (!found.length) {
      const word = new RegExp(`(?:^|[^\\w])${escRe(f)}(?:$|[^\\w])`);
      lines.forEach((l, i) => {
        if (word.test(l)) found.push(i);
      });
    }
    found.forEach((i) => hits.add(i));
  }
  return [...hits].sort((x, y) => x - y).slice(0, 4);
}

function renderDetail(root: HTMLElement, ex: Example) {
  const idx = EXAMPLES.indexOf(ex);
  const next = EXAMPLES[idx + 1];
  const prev = EXAMPLES[idx - 1];
  const tags = exampleTags(ex).filter((t) => t !== ex.category);
  const codeLines = ex.code.replace(/\n$/, '').split('\n');
  const noteLines = ex.notes.map((n) => matchLines(ex.code, n.code));

  // numeri delle spiegazioni da mostrare sulla prima riga collegata
  const badges = new Map<number, number[]>();
  noteLines.forEach((ls, i) => {
    if (ls.length) badges.set(ls[0], [...(badges.get(ls[0]) ?? []), i + 1]);
  });

  const codeHtml = codeLines
    .map((l, i) => {
      const b = (badges.get(i) ?? []).map((n) => `<span class="nb" data-note="${n}">${n}</span>`).join('');
      return `<div class="cl" data-i="${i}"><span class="cn">${i + 1}</span><span class="cb">${b}</span><span class="ct">${highlightLine(l) || '&nbsp;'}</span></div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="crumbs"><a class="back" href="#/esempi">← Tutti gli esempi</a></div>
    <header class="ex-hero">
      <div class="ex-hero-meta">
        <span class="ex-cat">${esc(ex.category)}</span>
        ${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
      <h1>${esc(ex.title)}</h1>
      <p class="lead">${inline(ex.summary)}</p>
      <div class="hero-actions">
        <button class="primary big" id="ex-open">▶ Apri nell'emulatore</button>
        <button class="big" id="ex-copy">Copia codice</button>
      </div>
    </header>

    <div class="ex-layout">
      <section class="codewin">
        <div class="cw-bar"><span class="cw-dots"><i></i><i></i><i></i></span><span class="cw-name">esempio.asm</span><span class="cw-count">${codeLines.length} righe</span></div>
        <div class="cw-body" id="cw-body">${codeHtml}</div>
      </section>

      <aside class="ex-side">
        <section class="side-card">
          <h3>Spiegazione</h3>
          <ol class="steps">
            ${ex.notes
              .map(
                (n, i) => `<li class="step" data-note="${i + 1}" tabindex="0">
                  <span class="num">${i + 1}</span>
                  <div><code>${esc(n.code)}</code><p>${inline(n.text)}</p></div>
                </li>`,
              )
              .join('')}
          </ol>
        </section>

        <section class="side-card result-card">
          <h3>Risultato</h3>
          <p>${inline(ex.result)}</p>
        </section>

        <section class="side-card try-card">
          <h3>Provalo tu</h3>
          <ol class="try">
            <li>Premi <b>Apri nell'emulatore</b>.</li>
            <li>Usa <b>Single step</b> per eseguire una istruzione alla volta.</li>
            <li>Guarda <b>Registri</b> e <b>Variabili</b>: i valori che cambiano diventano verdi.</li>
            <li>Prova a modificare un numero e rilancia: cosa cambia?</li>
          </ol>
        </section>
      </aside>
    </div>

    <nav class="pager-cards">
      ${prev ? `<a href="#/esempi/${prev.id}"><span>← Precedente</span><strong>${esc(prev.title)}</strong></a>` : '<span></span>'}
      ${next ? `<a class="next" href="#/esempi/${next.id}"><span>Successivo →</span><strong>${esc(next.title)}</strong></a>` : '<span></span>'}
    </nav>`;

  // spiegazione ↔ righe di codice
  const body = root.querySelector<HTMLElement>('#cw-body')!;
  const setHl = (note: number | null) => {
    body.querySelectorAll('.cl.hl').forEach((el) => el.classList.remove('hl'));
    root.querySelectorAll('.step.on').forEach((el) => el.classList.remove('on'));
    body.querySelectorAll('.nb.on').forEach((el) => el.classList.remove('on'));
    if (note === null) return;
    root.querySelector(`.step[data-note="${note}"]`)?.classList.add('on');
    body.querySelector(`.nb[data-note="${note}"]`)?.classList.add('on');
    for (const i of noteLines[note - 1] ?? []) body.querySelector(`.cl[data-i="${i}"]`)?.classList.add('hl');
  };
  root.querySelectorAll<HTMLElement>('.step').forEach((el) => {
    const n = Number(el.dataset.note);
    el.addEventListener('mouseenter', () => setHl(n));
    el.addEventListener('focus', () => setHl(n));
    el.addEventListener('mouseleave', () => setHl(null));
    el.addEventListener('blur', () => setHl(null));
    el.addEventListener('click', () => {
      setHl(n);
      const first = noteLines[n - 1]?.[0];
      if (first !== undefined) body.querySelector(`.cl[data-i="${first}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
  body.querySelectorAll<HTMLElement>('.nb').forEach((el) => {
    const n = Number(el.dataset.note);
    el.addEventListener('mouseenter', () => setHl(n));
    el.addEventListener('mouseleave', () => setHl(null));
  });

  root.querySelector('#ex-open')!.addEventListener('click', () => openInEmulator(ex.code));
  const copy = root.querySelector<HTMLButtonElement>('#ex-copy')!;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ex.code);
      copy.textContent = 'Copiato ✓';
    } catch {
      copy.textContent = 'Copia non riuscita';
    }
    setTimeout(() => (copy.textContent = 'Copia codice'), 1500);
  });
}

export function renderExamples(root: HTMLElement, param?: string) {
  const ex = EXAMPLES.find((e) => e.id === param);
  if (ex) renderDetail(root, ex);
  else if (param) {
    root.innerHTML = `<div class="page-head"><h1>Esempio non trovato</h1><p><a href="#/esempi">Torna all'elenco</a></p></div>`;
  } else renderList(root);
}
