import type { GradeReport, TestResult } from '../emu/grader';
import { esc } from './dom';

const GROUP_TITLE: Record<string, string> = {
  base: 'Casi base',
  auto: 'Test automatici',
  user: 'I tuoi test',
};

function failBlock(t: TestResult): string {
  let h = `<li class="fail"><span class="mark">✗</span> <b>${esc(t.name)}</b>`;
  if (t.info && t.info !== t.name && !t.name.includes(t.info)) h += `<div class="rep-vals">Valori: ${esc(t.info)}</div>`;
  h += '<ul>' + t.details.map((d) => `<li>${esc(d)}</li>`).join('') + '</ul>';
  if (t.errorLine) h += `<div class="rep-line"><a href="#" data-goto="${t.errorLine}">Vai alla riga ${t.errorLine}</a></div>`;
  if (t.output) h += `<div class="rep-out">Output ottenuto:<pre>${esc(t.output)}</pre></div>`;
  return h + '</li>';
}

function passLine(t: TestResult): string {
  return `<li class="pass"><span class="mark">✓</span> ${esc(t.name)}</li>`;
}

function groupHtml(key: string, items: TestResult[]): string {
  const passed = items.filter((x) => x.passed).length;
  const failed = items.filter((x) => !x.passed);
  const all = passed === items.length;
  const pct = items.length ? Math.round((passed / items.length) * 100) : 0;
  const maxShown = key === 'auto' ? 6 : 50;
  const shown = failed.slice(0, maxShown);

  let html = `<section class="rg ${all ? 'ok' : 'bad'}">
    <div class="rg-head">
      <span class="rg-title">${GROUP_TITLE[key] ?? key}</span>
      <span class="rg-count">${passed}/${items.length}</span>
      <div class="rg-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  if (shown.length) {
    html += `<ul class="rep-tests">${shown.map(failBlock).join('')}</ul>`;
    if (failed.length > shown.length) {
      html += `<p class="rep-more">… e altri ${failed.length - shown.length} casi falliti.</p>`;
    }
  }
  // elenco dei casi superati, ripiegato quando sono tanti
  const okItems = items.filter((x) => x.passed);
  if (okItems.length) {
    const list = `<ul class="rep-tests passed">${okItems.map(passLine).join('')}</ul>`;
    html += okItems.length > 4 || key === 'auto'
      ? `<details class="rg-pass"><summary>${okItems.length} casi superati</summary>${list}</details>`
      : list;
  }
  return html + '</section>';
}

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
  const groups = new Map<string, TestResult[]>();
  for (const t of r.results) {
    const g = groups.get(t.group) ?? [];
    g.push(t);
    groups.set(t.group, g);
  }
  const order = ['base', 'auto', 'user'].filter((g) => groups.has(g));
  const parts = order.map((g) => `${groups.get(g)!.length} ${g === 'base' ? 'base' : g === 'auto' ? 'automatici' : 'tuoi'}`);

  return `<div class="rep ${ok ? 'rep-ok' : 'rep-bad'}">
    <div class="rep-title">${ok ? '✓ Tutti i test superati' : `${r.passed} test superati su ${r.total}`}</div>
    <div class="rep-sub">${r.total} casi: ${parts.join(' · ')}</div>
    ${order.map((g) => groupHtml(g, groups.get(g)!)).join('')}
  </div>`;
}
