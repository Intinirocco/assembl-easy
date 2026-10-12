import { INSTRUCTIONS, INSTRUCTION_CATEGORIES, type Instruction } from '../content/instructions';
import { esc, inline } from '../ui/dom';
import { highlight } from '../ui/highlight';

// stato che sopravvive al cambio di istruzione (il rendering riparte da zero a ogni route)
let query = '';
let sideScroll = 0;

const FLAG_NAMES = ['CF', 'ZF', 'SF', 'OF', 'PF', 'AF', 'DF'];

function flagsHtml(text: string): string {
  const mentioned = FLAG_NAMES.filter((f) => new RegExp(`\\b${f}\\b`).test(text));
  const chips = mentioned.length
    ? `<div class="wflags">${FLAG_NAMES.map((f) => `<span class="wf${mentioned.includes(f) ? ' on' : ''}">${f}</span>`).join('')}</div>`
    : '';
  return `${chips}<p class="wf-text">${inline(text)}</p>`;
}

function detail(i: Instruction): string {
  const related = INSTRUCTIONS.filter((x) => x.category === i.category && x.id !== i.id).slice(0, 6);
  return `<article class="wdetail">
    <header class="wd-head">
      <span class="tag">${esc(i.category)}</span>
      <h1>${esc(i.name)}</h1>
      <p class="lead">${inline(i.description)}</p>
    </header>

    <div class="wd-grid">
      <section class="wd-card">
        <h3>Sintassi</h3>
        <pre class="code">${i.syntax.map((s) => esc(s)).join('\n')}</pre>
      </section>
      <section class="wd-card">
        <h3>Flag modificati</h3>
        ${flagsHtml(i.flags)}
      </section>
    </div>

    ${
      i.operands.length
        ? `<section class="wd-card">
            <h3>Operandi ammessi</h3>
            <table class="optbl"><tbody>${i.operands
              .map((o) => `<tr><td><code>${esc(o.form)}</code></td><td>${o.note ? inline(o.note) : ''}</td></tr>`)
              .join('')}</tbody></table>
          </section>`
        : ''
    }

    ${
      i.table
        ? `<section class="wd-card"><h3>Tabella</h3><div class="tscroll"><table class="tbl"><thead><tr>${i.table.head
            .map((h) => `<th>${esc(h)}</th>`)
            .join('')}</tr></thead><tbody>${i.table.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table></div></section>`
        : ''
    }

    <section class="wd-card">
      <div class="wd-row"><h3>Esempio</h3><button class="mini" id="w-copy">Copia</button></div>
      <pre class="code">${highlight(i.example)}</pre>
    </section>

    ${
      i.notes?.length
        ? `<section class="wd-card wd-notes"><h3>Da ricordare</h3><ul>${i.notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ul></section>`
        : ''
    }

    ${
      related.length
        ? `<section class="wd-related"><h3>Stessa categoria</h3><div class="chips">${related
            .map((r) => `<a class="chip" href="#/wiki/${r.id}">${esc(r.name)}</a>`)
            .join('')}</div></section>`
        : ''
    }
  </article>`;
}

function sideList(current: string, q: string): string {
  const term = q.trim().toLowerCase();
  const ok = (i: Instruction) =>
    !term || (i.name + ' ' + i.mnemonics.join(' ') + ' ' + i.description).toLowerCase().includes(term);
  let html = '';
  for (const c of INSTRUCTION_CATEGORIES) {
    const items = INSTRUCTIONS.filter((i) => i.category === c && ok(i));
    if (!items.length) continue;
    html += `<div class="wn-group"><div class="wn-title">${esc(c)}<span>${items.length}</span></div>${items
      .map((i) => `<a class="wn-item${i.id === current ? ' on' : ''}" href="#/wiki/${i.id}">${esc(i.name)}</a>`)
      .join('')}</div>`;
  }
  return html || '<p class="empty-note">Nessuna istruzione corrisponde alla ricerca.</p>';
}

export function renderWiki(root: HTMLElement, param?: string) {
  const key = (param ?? 'mov').toLowerCase();
  const cur = INSTRUCTIONS.find((i) => i.id === key || i.mnemonics.includes(key)) ?? INSTRUCTIONS.find((i) => i.id === 'mov')!;
  const wide = window.matchMedia('(min-width: 761px)').matches;

  root.innerHTML = `
    <div class="browse-head">
      <div>
        <h1>Wiki delle istruzioni</h1>
        <p>Sintassi, operandi ammessi, flag modificati ed esempi per ogni istruzione e direttiva supportata dall'emulatore.</p>
      </div>
    </div>
    <div class="browse wiki-browse">
      <aside class="browse-side wiki-side">
        <input id="wiki-q" type="search" placeholder="Cerca (es. mov, jne, loop)…" value="${esc(query)}" />
        <details class="wiki-nav" ${wide ? 'open' : ''}>
          <summary>Tutte le istruzioni (${INSTRUCTIONS.length})</summary>
          <div id="wiki-list" class="wn-list">${sideList(cur.id, query)}</div>
        </details>
      </aside>
      <div class="browse-main">${detail(cur)}</div>
    </div>`;

  const list = root.querySelector<HTMLElement>('#wiki-list')!;
  const side = root.querySelector<HTMLElement>('.wiki-side')!;
  side.scrollTop = sideScroll;
  side.addEventListener('scroll', () => (sideScroll = side.scrollTop));
  // l'istruzione scelta deve essere visibile nell'elenco
  const on = list.querySelector<HTMLElement>('.wn-item.on');
  if (on && (on.offsetTop < side.scrollTop || on.offsetTop > side.scrollTop + side.clientHeight - 60)) {
    side.scrollTop = Math.max(0, on.offsetTop - 120);
  }
  const q = root.querySelector<HTMLInputElement>('#wiki-q')!;
  q.addEventListener('input', () => {
    query = q.value;
    list.innerHTML = sideList(cur.id, query);
  });
  // se si cerca qualcosa e c'è un solo risultato, Invio lo apre
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = list.querySelector<HTMLAnchorElement>('.wn-item');
    if (first) location.hash = first.getAttribute('href')!;
  });

  root.querySelector('#w-copy')?.addEventListener('click', async (e) => {
    const b = e.target as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(cur.example);
      b.textContent = 'Copiato ✓';
    } catch {
      b.textContent = 'Non riuscito';
    }
    setTimeout(() => (b.textContent = 'Copia'), 1400);
  });
}
