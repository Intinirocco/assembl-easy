// La build UMD include (e inietta) gli stili della libreria, quella ESM no.
import { createDockview } from 'dockview-core/dist/dockview-core.js';
import type { DockviewApi, DockviewTheme } from 'dockview-core';

/** Pannelli dell'emulatore: ognuno è un elemento `#pane-<id>` nel DOM. */
export const PANELS = [
  { id: 'editor', title: 'Codice sorgente' },
  { id: 'regs', title: 'Registri' },
  { id: 'log', title: 'Cosa è successo' },
  { id: 'screen', title: 'Terminale' },
  { id: 'vars', title: 'Variabili' },
  { id: 'mem', title: 'Memoria' },
  { id: 'stack', title: 'Stack' },
] as const;

const KEY = 'assembl-easy:layout-v2';
const theme: DockviewTheme = { name: 'assembl', className: 'dockview-theme-assembl', gap: 10 };

let api: DockviewApi | null = null;
let host: HTMLElement | null = null;
let built = false;
const listeners: (() => void)[] = [];

const title = (id: string) => PANELS.find((p) => p.id === id)!.title;

function addPanel(id: string, position?: Parameters<DockviewApi['addPanel']>[0]['position'], size?: { w?: number; h?: number }) {
  api!.addPanel({
    id,
    component: id,
    title: title(id),
    position,
    initialWidth: size?.w,
    initialHeight: size?.h,
  });
}

/** Disposizione di partenza, calcolata sulle dimensioni correnti dell'area. */
function defaultLayout() {
  const W = host!.clientWidth;
  const H = host!.clientHeight;
  api!.clear();
  addPanel('editor');
  addPanel('regs', { referencePanel: 'editor', direction: 'right' }, { w: W * 0.4 });
  addPanel('log', { referencePanel: 'editor', direction: 'below' }, { h: H * 0.46 });
  addPanel('screen', { referencePanel: 'log', direction: 'right' }, { w: W * 0.36 });
  addPanel('vars', { referencePanel: 'regs', direction: 'below' }, { h: H * 0.46 });
  addPanel('mem', { referencePanel: 'vars', direction: 'within' });
  addPanel('stack', { referencePanel: 'vars', direction: 'within' });
  api!.getPanel('vars')?.api.setActive();
}

function buildLayout() {
  if (built || !api || !host || host.clientWidth < 50) return;
  built = true;
  let ok = false;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      ok = PANELS.every((p) => api!.getPanel(p.id)) || api.panels.length > 0;
    }
  } catch {
    ok = false;
  }
  if (!ok) defaultLayout();
  api.onDidLayoutChange(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(api!.toJSON()));
    } catch {
      /* storage non disponibile */
    }
    listeners.forEach((f) => f());
  });
  listeners.forEach((f) => f());
}

export function initDock(el: HTMLElement) {
  host = el;
  const elements = new Map<string, HTMLElement>();
  api = createDockview(el, {
    theme,
    createComponent: (o) => {
      let node = elements.get(o.name);
      if (!node) {
        node = document.getElementById(`pane-${o.name}`) as HTMLElement;
        elements.set(o.name, node);
      }
      return { element: node, init() {} };
    },
  });
  // il layout si costruisce quando l'area ha una dimensione reale (la vista può partire nascosta)
  const ro = new ResizeObserver(() => buildLayout());
  ro.observe(el);
  buildLayout();
}

export function resetLayout() {
  if (!api || !host) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
  defaultLayout();
  listeners.forEach((f) => f());
}

export function isOpen(id: string): boolean {
  return !!api?.getPanel(id);
}

/** Mostra un pannello chiuso oppure lo chiude. */
export function togglePanel(id: string) {
  if (!api) return;
  const p = api.getPanel(id);
  if (p) p.api.close();
  else addPanel(id, { direction: 'right' });
  listeners.forEach((f) => f());
}

/** Porta in primo piano un pannello (riaprendolo se serve). */
export function focusPanel(id: string) {
  if (!api) return;
  const p = api.getPanel(id);
  if (p) p.api.setActive();
  else {
    addPanel(id, { direction: 'right' });
    api.getPanel(id)?.api.setActive();
  }
}

export function onLayoutChange(f: () => void) {
  listeners.push(f);
}
