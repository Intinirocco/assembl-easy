// Ponte tra pagine e emulatore: le pagine chiedono di aprire un programma.
type Loader = (code: string) => void;
let loader: Loader | null = null;

export function registerEmulatorLoader(fn: Loader) {
  loader = fn;
}

export function openInEmulator(code: string) {
  loader?.(code);
  location.hash = '#/emulatore';
}
