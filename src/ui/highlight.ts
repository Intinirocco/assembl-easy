import { esc } from './dom';

const MNEMONICS = new Set(
  ('mov xchg lea push pop pushf popf add adc sub sbb inc dec neg cmp mul imul div idiv and or xor not test shl shr sal sar ' +
    'rol ror rcl rcr jmp ja jae jb jbe jc je jg jge jl jle jna jnae jnb jnbe jnc jne jng jnge jnl jnle jno jnp jns jnz jo jp ' +
    'jpe jpo js jz jcxz loop loope loopz loopne loopnz call ret int iret nop hlt clc stc cmc cld std cli sti cbw cwd lahf sahf ' +
    'xlat movsb movsw stosb stosw lodsb lodsw cmpsb cmpsw scasb scasw rep repe repz repne repnz print printn putc gotoxy').split(' '),
);
const REGS = new Set(
  'ax bx cx dx si di bp sp al ah bl bh cl ch dl dh cs ds es ss ip'.split(' '),
);
const DIRS = new Set(
  'segment ends end db dw dd dup equ offset proc endp org include ptr byte word near far'.split(' '),
);

const TOKEN =
  /(;.*$)|("[^"]*"|'[^']*')|(\b[0-9][0-9a-f]*h\b|\b[01]+b\b|\b\d+\b)|([A-Za-z_.@$?][\w.@$?]*:)|([A-Za-z_.@$?][\w.@$?]*)/gi;

export function highlightLine(line: string): string {
  let out = '';
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = TOKEN.exec(line)); ) {
    out += esc(line.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[0];
    if (m[1]) out += `<span class="tk-cm">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="tk-st">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="tk-nm">${esc(t)}</span>`;
    else if (m[4]) out += `<span class="tk-lb">${esc(t)}</span>`;
    else {
      const w = t.toLowerCase();
      if (MNEMONICS.has(w)) out += `<span class="tk-kw">${esc(t)}</span>`;
      else if (REGS.has(w)) out += `<span class="tk-rg">${esc(t)}</span>`;
      else if (DIRS.has(w) || w.startsWith('define_')) out += `<span class="tk-dr">${esc(t)}</span>`;
      else out += esc(t);
    }
  }
  return out + esc(line.slice(last));
}

export function highlight(code: string): string {
  return code.split('\n').map(highlightLine).join('\n');
}
