import { EXAMPLES, EXAMPLE_CATEGORIES } from '../content/examples';
import { openInEmulator } from '../bus';
import { esc, inline } from '../ui/dom';
import { highlight } from '../ui/highlight';

export function renderExamples(root: HTMLElement, param?: string) {
  const byCat = (c: string) => EXAMPLES.filter((e) => e.category === c);
  root.innerHTML = `
    <div class="page-head">
      <h1>Esempi spiegati</h1>
      <p>Programmi completi, già commentati, con la spiegazione delle righe più importanti. Aprili nell'emulatore e
      avanza con <b>Single step</b> per vedere registri e memoria cambiare a ogni istruzione.</p>
    </div>
    <div class="page-cols">
      <nav class="toc">
        ${EXAMPLE_CATEGORIES.map(
          (c) => `<div class="toc-group"><div class="toc-title">${esc(c)}</div>${byCat(c)
            .map((e) => `<a href="#/esempi/${e.id}">${esc(e.title)}</a>`)
            .join('')}</div>`,
        ).join('')}
      </nav>
      <div class="cards">
        ${EXAMPLE_CATEGORIES.map(
          (c) => `<h2 class="cat">${esc(c)}</h2>` +
            byCat(c)
              .map(
                (e) => `<article class="card" id="ex-${e.id}">
              <h3>${esc(e.title)}</h3>
              <p>${inline(e.summary)}</p>
              <pre class="code">${highlight(e.code)}</pre>
              <div class="card-actions">
                <button class="primary" data-open="${e.id}">Apri nell'emulatore</button>
                <button data-copy="${e.id}">Copia codice</button>
              </div>
              <h4>Spiegazione</h4>
              <ul class="notes">${e.notes
                .map((n) => `<li><code>${esc(n.code)}</code><span>${inline(n.text)}</span></li>`)
                .join('')}</ul>
              <div class="result"><b>Risultato.</b> ${inline(e.result)}</div>
            </article>`,
              )
              .join(''),
        ).join('')}
      </div>
    </div>`;

  root.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const ex = EXAMPLES.find((x) => x.id === b.dataset.open)!;
      openInEmulator(ex.code);
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ex = EXAMPLES.find((x) => x.id === b.dataset.copy)!;
      try {
        await navigator.clipboard.writeText(ex.code);
        b.textContent = 'Copiato ✓';
      } catch {
        b.textContent = 'Copia non riuscita';
      }
      setTimeout(() => (b.textContent = 'Copia codice'), 1500);
    }),
  );
  if (param) document.getElementById(`ex-${param}`)?.scrollIntoView({ block: 'start' });
}
