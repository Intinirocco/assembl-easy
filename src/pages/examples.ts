import { EXAMPLES, EXAMPLE_CATEGORIES, EXAMPLE_TAGS, exampleTags, type Example } from '../content/examples';
import { openInEmulator } from '../bus';
import { esc, inline } from '../ui/dom';
import { highlight } from '../ui/highlight';

// I filtri attivi sopravvivono ai cambi di route (aprire/chiudere un esempio).
const selected = new Set<string>();

function matches(e: Example): boolean {
  if (selected.size === 0) return true;
  const tags = exampleTags(e);
  return [...selected].every((t) => tags.includes(t)); // intersezione
}

function cardHtml(e: Example): string {
  const extra = exampleTags(e).filter((t) => t !== e.category);
  return `<a class="ex-card" href="#/esempi/${e.id}" data-id="${e.id}">
    <span class="ex-cat">${esc(e.category)}</span>
    <strong>${esc(e.title)}</strong>
    ${extra.length ? `<span class="tags">${extra.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
  </a>`;
}

function drawGrid(root: HTMLElement) {
  const grid = root.querySelector<HTMLElement>('#exs-grid')!;
  const list = EXAMPLES.filter(matches);
  const parts: string[] = [];
  for (const c of EXAMPLE_CATEGORIES) {
    const items = list.filter((e) => e.category === c);
    if (!items.length) continue;
    parts.push(`<h2 class="cat">${esc(c)}</h2><div class="ex-grid">${items.map(cardHtml).join('')}</div>`);
  }
  grid.innerHTML = parts.join('');
  (root.querySelector('#exs-empty') as HTMLElement).hidden = list.length > 0;
  const n = root.querySelector('#exs-count');
  if (n) n.textContent = `${list.length} di ${EXAMPLES.length} esempi`;
}

function drawChips(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('#exs-tags .chip').forEach((c) => {
    const t = c.dataset.tag ?? '';
    c.classList.toggle('on', t === '' ? selected.size === 0 : selected.has(t));
  });
}

function renderList(root: HTMLElement) {
  root.innerHTML = `
    <div class="page-head">
      <h1>Esempi spiegati</h1>
      <p>Programmi completi, già commentati. Scegli un argomento (puoi selezionarne più di uno: vedrai solo gli esempi
      che li riguardano tutti), apri un esempio e poi portalo nell'emulatore per eseguirlo passo per passo.</p>
    </div>
    <div class="filters">
      <div class="chips" id="exs-tags">
        <button class="chip" data-tag="">Tutti</button>
        ${EXAMPLE_TAGS.map((t) => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="muted small" id="exs-count"></div>
    </div>
    <div id="exs-grid"></div>
    <p id="exs-empty" class="empty" hidden>Nessun esempio ha tutti gli argomenti selezionati. Togli un filtro.</p>`;

  root.querySelector('#exs-tags')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.chip') as HTMLButtonElement | null;
    if (!b) return;
    const t = b.dataset.tag ?? '';
    if (t === '') selected.clear();
    else if (selected.has(t)) selected.delete(t);
    else selected.add(t);
    drawChips(root);
    drawGrid(root);
  });

  drawChips(root);
  drawGrid(root);
}

function renderDetail(root: HTMLElement, ex: Example) {
  const idx = EXAMPLES.indexOf(ex);
  const next = EXAMPLES[idx + 1];
  const prev = EXAMPLES[idx - 1];
  root.innerHTML = `
    <div class="crumbs"><a class="back" href="#/esempi">← Tutti gli esempi</a> · ${esc(ex.category)}</div>
    <article class="detail">
      <h1>${esc(ex.title)}</h1>
      <p class="lead">${inline(ex.summary)}</p>
      <pre class="code">${highlight(ex.code)}</pre>
      <div class="card-actions">
        <button class="primary" id="ex-open">Apri nell'emulatore</button>
        <button id="ex-copy">Copia codice</button>
      </div>
      <h4>Spiegazione</h4>
      <ul class="notes">${ex.notes
        .map((n) => `<li><code>${esc(n.code)}</code><span>${inline(n.text)}</span></li>`)
        .join('')}</ul>
      <div class="result"><b>Risultato.</b> ${inline(ex.result)}</div>
      <nav class="pager">
        ${prev ? `<a href="#/esempi/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
        <a class="back" href="#/esempi">Tutti gli esempi</a>
        ${next ? `<a href="#/esempi/${next.id}">${esc(next.title)} →</a>` : '<span></span>'}
      </nav>
    </article>`;

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
