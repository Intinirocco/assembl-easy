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

function panelHtml(e: Example): string {
  return `<div class="modal-head">
      <div>
        <span class="ex-cat">${esc(e.category)}</span>
        <h2 id="ex-modal-title">${esc(e.title)}</h2>
      </div>
      <button class="modal-close" aria-label="Chiudi" data-close>✕</button>
    </div>
    <p>${inline(e.summary)}</p>
    <pre class="code">${highlight(e.code)}</pre>
    <div class="card-actions">
      <button class="primary" data-open>Apri nell'emulatore</button>
      <button data-copy>Copia codice</button>
    </div>
    <h4>Spiegazione</h4>
    <ul class="notes">${e.notes
      .map((n) => `<li><code>${esc(n.code)}</code><span>${inline(n.text)}</span></li>`)
      .join('')}</ul>
    <div class="result"><b>Risultato.</b> ${inline(e.result)}</div>`;
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

let escHandler: ((e: KeyboardEvent) => void) | null = null;

function closeModal(root: HTMLElement) {
  root.querySelector('#ex-modal')?.remove();
  document.body.classList.remove('modal-open');
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}

/** Mostra (o chiude, se id è assente) il riquadro di dettaglio senza ridisegnare la pagina. */
export function syncExampleParam(root: HTMLElement, id?: string) {
  closeModal(root);
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  const overlay = document.createElement('div');
  overlay.id = 'ex-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ex-modal-title">${panelHtml(ex)}</div>`;
  root.appendChild(overlay);
  document.body.classList.add('modal-open');

  const close = () => {
    location.hash = '#/esempi';
  };
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('[data-close]')) close();
  });
  escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);

  overlay.querySelector('[data-open]')!.addEventListener('click', () => {
    closeModal(root);
    openInEmulator(ex.code);
  });
  const copy = overlay.querySelector<HTMLButtonElement>('[data-copy]')!;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ex.code);
      copy.textContent = 'Copiato ✓';
    } catch {
      copy.textContent = 'Copia non riuscita';
    }
    setTimeout(() => (copy.textContent = 'Copia codice'), 1500);
  });
  overlay.querySelector<HTMLElement>('.modal')!.focus();
}

export function renderExamples(root: HTMLElement, param?: string) {
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
  syncExampleParam(root, param);
}
