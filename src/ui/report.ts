import type { GradeReport } from '../emu/grader';
import { esc } from './dom';

export function renderReport(r: GradeReport): string {
  if (r.assemblyErrors.length) {
    return `<div class="rep rep-bad">
      <div class="rep-title">Il programma non si assembla: ${r.assemblyErrors.length} error${r.assemblyErrors.length === 1 ? 'e' : 'i'}</div>
      <ul class="rep-list">${r.assemblyErrors
        .map((e) => `<li><a href="#" data-goto="${e.line}">Riga ${e.line}</a> — ${esc(e.message)}</li>`)
        .join('')}</ul>
      <p class="rep-hint">Le righe errate sono evidenziate in rosso nell'editor.</p>
    </div>`;
  }
  const ok = r.passed === r.total && r.total > 0;
  let html = `<div class="rep ${ok ? 'rep-ok' : 'rep-bad'}">
    <div class="rep-title">${ok ? '✓ Tutti i test superati' : `${r.passed} test superati su ${r.total}`}</div>
    <ul class="rep-tests">`;
  for (const t of r.results) {
    html += `<li class="${t.passed ? 'pass' : 'fail'}"><span class="mark">${t.passed ? '✓' : '✗'}</span> <b>${esc(t.name)}</b>`;
    if (!t.passed) {
      html += '<ul>' + t.details.map((d) => `<li>${esc(d)}</li>`).join('') + '</ul>';
      if (t.errorLine) html += `<div class="rep-line"><a href="#" data-goto="${t.errorLine}">Vai alla riga ${t.errorLine}</a></div>`;
      if (t.output) html += `<div class="rep-out">Output ottenuto:<pre>${esc(t.output)}</pre></div>`;
    }
    html += '</li>';
  }
  html += '</ul></div>';
  return html;
}
