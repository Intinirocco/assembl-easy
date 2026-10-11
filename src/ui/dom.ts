export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Testo semplice con `codice` inline e **grassetto** → HTML sicuro. */
export function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function store<T>(key: string, fallback: T): { get(): T; set(v: T): void } {
  const k = `assembl-easy:${key}`;
  return {
    get() {
      try {
        const raw = localStorage.getItem(k);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* storage non disponibile */
      }
    },
  };
}
