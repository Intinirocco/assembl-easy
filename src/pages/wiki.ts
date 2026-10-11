import { INSTRUCTIONS, INSTRUCTION_CATEGORIES, type Instruction } from '../content/instructions';
import { esc, inline } from '../ui/dom';
import { highlight } from '../ui/highlight';

function card(i: Instruction): string {
  return `<article class="card wiki" id="w-${i.id}" data-cat="${esc(i.category)}">
    <header class="wiki-head"><h3>${esc(i.name)}</h3><span class="tag">${esc(i.category)}</span></header>
    <p>${inline(i.description)}</p>
    <div class="wiki-grid">
      <div><h4>Sintassi</h4><pre class="code">${i.syntax.map((s) => esc(s)).join('\n')}</pre></div>
      <div><h4>Flag</h4><p>${inline(i.flags)}</p></div>
    </div>
    ${
      i.operands.length
        ? `<h4>Operandi ammessi</h4><ul class="ops">${i.operands
            .map((o) => `<li><code>${esc(o.form)}</code>${o.note ? `<span>${inline(o.note)}</span>` : ''}</li>`)
            .join('')}</ul>`
        : ''
    }
    ${
      i.table
        ? `<table class="tbl"><thead><tr>${i.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${i.table.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`
        : ''
    }
    <h4>Esempio</h4>
    <pre class="code">${highlight(i.example)}</pre>
    ${i.notes ? `<ul class="notes plain">${i.notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

export function renderWiki(root: HTMLElement, param?: string) {
  root.innerHTML = `
    <div class="page-head">
      <h1>Wiki delle istruzioni</h1>
      <p>Sintassi, operandi ammessi, flag modificati ed esempi per ogni istruzione e direttiva supportata dall'emulatore.</p>
    </div>
    <div class="filters">
      <input id="wiki-q" type="search" placeholder="Cerca un'istruzione (es. mov, jne, loop)…" />
      <div id="wiki-cats" class="chips">
        <button class="chip on" data-cat="">Tutte</button>
        ${INSTRUCTION_CATEGORIES.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
    </div>
    <div class="cards" id="wiki-list">${INSTRUCTIONS.map(card).join('')}</div>
    <p id="wiki-empty" class="empty" hidden>Nessuna istruzione corrisponde alla ricerca.</p>`;

  const q = root.querySelector<HTMLInputElement>('#wiki-q')!;
  const chips = root.querySelectorAll<HTMLButtonElement>('.chip');
  let cat = '';
  const apply = () => {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll<HTMLElement>('.wiki').forEach((el) => {
      const ins = INSTRUCTIONS.find((x) => `w-${x.id}` === el.id)!;
      const hay = (ins.name + ' ' + ins.mnemonics.join(' ') + ' ' + ins.description).toLowerCase();
      const ok = (!cat || ins.category === cat) && (!term || hay.includes(term));
      el.hidden = !ok;
      if (ok) shown++;
    });
    (root.querySelector('#wiki-empty') as HTMLElement).hidden = shown > 0;
  };
  q.addEventListener('input', apply);
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      cat = c.dataset.cat ?? '';
      chips.forEach((x) => x.classList.toggle('on', x === c));
      apply();
    }),
  );

  if (param) {
    // /wiki/mov: cerca per id o per mnemonico
    const key = param.toLowerCase();
    const hit = INSTRUCTIONS.find((i) => i.id === key || i.mnemonics.includes(key));
    if (hit) {
      const el = document.getElementById(`w-${hit.id}`);
      el?.scrollIntoView({ block: 'start' });
      el?.classList.add('flash');
    }
  }
}
