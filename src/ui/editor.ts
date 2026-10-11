import { esc } from './dom';

export interface EditorOptions {
  breakpoints?: boolean;
  placeholder?: string;
}

/** Editor di testo con numeri di riga, riga corrente, righe errate e breakpoint. */
export class CodeEditor {
  readonly textarea: HTMLTextAreaElement;
  readonly breakpoints = new Set<number>();
  errors = new Map<number, string>();
  current: number | null = null;
  onChange: (() => void) | null = null;
  onBreakpoints: (() => void) | null = null;

  private gutter: HTMLElement;
  private backdrop: HTMLElement;
  private readonly lh = 20;

  constructor(parent: HTMLElement, private opts: EditorOptions = {}) {
    parent.classList.add('editor');
    parent.innerHTML = '<div class="gutter"></div><div class="backdrop"></div><textarea spellcheck="false" wrap="off" autocomplete="off" autocapitalize="off"></textarea>';
    this.gutter = parent.querySelector('.gutter')!;
    this.backdrop = parent.querySelector('.backdrop')!;
    this.textarea = parent.querySelector('textarea')!;
    if (opts.placeholder) this.textarea.placeholder = opts.placeholder;

    this.textarea.addEventListener('scroll', () => this.syncScroll());
    this.textarea.addEventListener('input', () => {
      this.render();
      this.onChange?.();
    });
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const t = this.textarea;
        t.setRangeText('    ', t.selectionStart, t.selectionEnd, 'end');
        t.dispatchEvent(new Event('input'));
      }
    });
    this.gutter.addEventListener('click', (e) => {
      if (!this.opts.breakpoints) return;
      const el = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
      if (!el) return;
      const ln = Number(el.dataset.line);
      if (this.breakpoints.has(ln)) this.breakpoints.delete(ln);
      else this.breakpoints.add(ln);
      this.render();
      this.onBreakpoints?.();
    });
    this.render();
  }

  get value(): string {
    return this.textarea.value;
  }
  set value(v: string) {
    this.textarea.value = v;
    this.render();
  }

  get lineCount(): number {
    return this.textarea.value.split('\n').length;
  }

  render() {
    const n = this.lineCount;
    let g = '';
    let b = '';
    for (let i = 1; i <= n; i++) {
      const gc = ['gl'];
      const bc = ['bl'];
      if (this.breakpoints.has(i)) {
        gc.push('bp');
        bc.push('bpl');
      }
      if (this.errors.has(i)) {
        gc.push('err');
        bc.push('err');
      }
      if (this.current === i) bc.push('cur');
      g += `<div class="${gc.join(' ')}" data-line="${i}">${i}</div>`;
      const tip = this.errors.has(i) ? ` title="${esc(this.errors.get(i)!)}"` : '';
      b += `<div class="${bc.join(' ')}"${tip}>&nbsp;</div>`;
    }
    this.gutter.innerHTML = g;
    this.backdrop.innerHTML = b;
    this.syncScroll();
  }

  private syncScroll() {
    this.gutter.scrollTop = this.textarea.scrollTop;
    this.backdrop.scrollTop = this.textarea.scrollTop;
  }

  scrollToLine(ln: number) {
    const t = this.textarea;
    const y = (ln - 1) * this.lh;
    if (y < t.scrollTop || y > t.scrollTop + t.clientHeight - this.lh * 2) {
      t.scrollTop = Math.max(0, y - t.clientHeight / 2);
      this.syncScroll();
    }
  }

  selectLine(ln: number) {
    const lines = this.value.split('\n');
    let pos = 0;
    for (let i = 0; i < ln - 1; i++) pos += lines[i].length + 1;
    this.textarea.focus();
    this.textarea.setSelectionRange(pos, pos + (lines[ln - 1]?.length ?? 0));
    this.scrollToLine(ln);
  }
}
