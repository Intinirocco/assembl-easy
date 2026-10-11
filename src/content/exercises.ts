import type { TestCase } from '../emu/grader';

export interface Exercise {
  id: string;
  title: string;
  category: string;
  level: 1 | 2 | 3;
  text: string;
  hints: string[];
  /** dichiarazioni del segmento dati (già presenti nel codice di partenza) */
  data: string;
  /** istruzioni da inserire dopo la preparazione dei segmenti; vuote nel codice di partenza */
  solutionBody: string;
  /** codice dopo l'uscita al DOS (procedure) */
  solutionTail?: string;
  starterTail?: string;
  requires?: string[];
  tests: TestCase[];
}

export function buildProgram(data: string, body: string, tail = ''): string {
  return `data segment
${data}
ends

stack segment
    dw   128  dup(0)
ends

code segment
start:
    mov ax, data
    mov ds, ax
    mov es, ax

${body}
    mov ax, 4c00h ; uscita al sistema operativo
    int 21h
${tail}ends

end start
`;
}

export function starterCode(e: Exercise): string {
  return buildProgram(e.data, '    ; scrivi qui il tuo codice\n', e.starterTail ?? '');
}
export function solutionCode(e: Exercise): string {
  return buildProgram(e.data, e.solutionBody, e.solutionTail ?? '');
}

export const EXERCISES: Exercise[] = [
  {
    id: 'somma-due-numeri',
    title: 'Somma di due numeri',
    category: 'Operazioni base',
    level: 1,
    text: 'Calcola la somma di `n1` e `n2` (word) e salvala nella variabile `risultato`.',
    hints: ['Una istruzione non può avere due operandi in memoria: porta prima un valore in un registro.', 'Usa `mov`, poi `add`, poi di nuovo `mov` per salvare.'],
    data: '    n1 dw 25\n    n2 dw 17\n    risultato dw ?',
    solutionBody: '    mov ax, n1\n    add ax, n2\n    mov risultato, ax\n',
    tests: [
      { name: '25 + 17', expect: { vars: { risultato: 42 } } },
      { name: '1000 + 2345', init: { n1: 1000, n2: 2345 }, expect: { vars: { risultato: 3345 } } },
      { name: '0 + 0', init: { n1: 0, n2: 0 }, expect: { vars: { risultato: 0 } } },
    ],
  },
  {
    id: 'differenza',
    title: 'Differenza con risultato negativo',
    category: 'Operazioni base',
    level: 1,
    text: 'Calcola `n1 - n2` (word) e salva il risultato in `risultato`. Il risultato può essere negativo: in complemento a 2 è già corretto.',
    hints: ['`sub` lascia il risultato nel primo operando.'],
    data: '    n1 dw 10\n    n2 dw 25\n    risultato dw ?',
    solutionBody: '    mov ax, n1\n    sub ax, n2\n    mov risultato, ax\n',
    tests: [
      { name: '10 - 25', expect: { vars: { risultato: -15 } } },
      { name: '500 - 120', init: { n1: 500, n2: 120 }, expect: { vars: { risultato: 380 } } },
    ],
  },
  {
    id: 'prodotto-byte',
    title: 'Prodotto di due byte',
    category: 'Operazioni base',
    level: 2,
    text: 'Moltiplica i due byte `a` e `b` e salva il prodotto, che può superare 255, nella word `prodotto`.',
    hints: ['`mul` con un operando a 8 bit moltiplica AL per l\'operando e mette il risultato in AX.', 'Il risultato completo è in AX, non solo in AL.'],
    data: '    a db 12\n    b db 11\n    prodotto dw ?',
    solutionBody: '    mov al, a\n    mul b\n    mov prodotto, ax\n',
    tests: [
      { name: '12 × 11', expect: { vars: { prodotto: 132 } } },
      { name: '200 × 200', init: { a: 200, b: 200 }, expect: { vars: { prodotto: 40000 } } },
      { name: '0 × 77', init: { a: 0, b: 77 }, expect: { vars: { prodotto: 0 } } },
    ],
  },
  {
    id: 'quoziente-resto',
    title: 'Quoziente e resto',
    category: 'Operazioni base',
    level: 2,
    text: 'Dividi `dividendo` (word) per `divisore` (byte). Salva il quoziente in `quoziente` e il resto in `resto` (entrambi byte).',
    hints: ['Con un divisore a 8 bit, `div` divide AX: il quoziente va in AL e il resto in AH.'],
    data: '    dividendo dw 47\n    divisore db 5\n    quoziente db ?\n    resto db ?',
    solutionBody: '    mov ax, dividendo\n    div divisore\n    mov quoziente, al\n    mov resto, ah\n',
    tests: [
      { name: '47 / 5', expect: { vars: { quoziente: 9, resto: 2 } } },
      { name: '100 / 7', init: { dividendo: 100, divisore: 7 }, expect: { vars: { quoziente: 14, resto: 2 } } },
      { name: '3 / 5', init: { dividendo: 3, divisore: 5 }, expect: { vars: { quoziente: 0, resto: 3 } } },
    ],
  },
  {
    id: 'scambio',
    title: 'Scambio di due variabili',
    category: 'Operazioni base',
    level: 1,
    text: 'Scambia i valori delle variabili `a` e `b` (word).',
    hints: ['Salva entrambi i valori in due registri prima di riscriverli.'],
    data: '    a dw 11\n    b dw 99',
    solutionBody: '    mov ax, a\n    mov bx, b\n    mov a, bx\n    mov b, ax\n',
    tests: [
      { name: 'a=11, b=99', expect: { vars: { a: 99, b: 11 } } },
      { name: 'a=1, b=2', init: { a: 1, b: 2 }, expect: { vars: { a: 2, b: 1 } } },
    ],
  },
  {
    id: 'massimo-due',
    title: 'Massimo tra due numeri',
    category: 'Salti condizionati',
    level: 2,
    text: 'Salva in `massimo` il maggiore tra `n1` e `n2`. I numeri sono byte **senza segno** (0–255).',
    hints: ['Per i numeri senza segno si usano `ja`/`jae`/`jb`/`jbe`, non `jg`/`jl`.'],
    data: '    n1 db 14\n    n2 db 27\n    massimo db ?',
    solutionBody: '    mov al, n1\n    cmp al, n2\n    jae fine\n    mov al, n2\nfine:\n    mov massimo, al\n',
    tests: [
      { name: '14 e 27', expect: { vars: { massimo: 27 } } },
      { name: '200 e 3', init: { n1: 200, n2: 3 }, expect: { vars: { massimo: 200 } } },
      { name: '5 e 5', init: { n1: 5, n2: 5 }, expect: { vars: { massimo: 5 } } },
    ],
  },
  {
    id: 'pari-dispari',
    title: 'Pari o dispari',
    category: 'Salti condizionati',
    level: 2,
    text: 'Scrivi in `pari` il valore 1 se il byte `n` è pari, 0 se è dispari.',
    hints: ['Un numero è pari se il suo bit meno significativo è 0.', '`test al, 1` imposta ZF in base al bit 0.'],
    data: '    n db 7\n    pari db ?',
    solutionBody: '    mov al, n\n    test al, 1\n    jz e_pari\n    mov pari, 0\n    jmp fine\ne_pari:\n    mov pari, 1\nfine:\n',
    tests: [
      { name: '7', expect: { vars: { pari: 0 } } },
      { name: '10', init: { n: 10 }, expect: { vars: { pari: 1 } } },
      { name: '0', init: { n: 0 }, expect: { vars: { pari: 1 } } },
      { name: '255', init: { n: 255 }, expect: { vars: { pari: 0 } } },
    ],
  },
  {
    id: 'valore-assoluto',
    title: 'Valore assoluto',
    category: 'Salti condizionati',
    level: 2,
    text: 'Salva in `assoluto` il valore assoluto della word con segno `n`.',
    hints: ['Confronta con 0 e usa un salto per numeri con segno (`jge`, `jl`...).', '`neg` cambia segno al suo operando.'],
    data: '    n dw -37\n    assoluto dw ?',
    solutionBody: '    mov ax, n\n    cmp ax, 0\n    jge ok\n    neg ax\nok:\n    mov assoluto, ax\n',
    tests: [
      { name: '-37', expect: { vars: { assoluto: 37 } } },
      { name: '52', init: { n: 52 }, expect: { vars: { assoluto: 52 } } },
      { name: '0', init: { n: 0 }, expect: { vars: { assoluto: 0 } } },
    ],
  },
  {
    id: 'somma-1-n',
    title: 'Somma dei numeri da 1 a n',
    category: 'Cicli',
    level: 2,
    text: 'Calcola 1 + 2 + … + n, dove `n` è un byte maggiore di 0, e salva la somma nella word `somma`.',
    hints: ['`loop` decrementa CX e salta se CX non è zero.', 'Ricorda di azzerare CH se carichi solo CL.'],
    data: '    n db 10\n    somma dw ?',
    solutionBody: '    mov cl, n\n    mov ch, 0\n    mov ax, 0\nciclo:\n    add ax, cx\n    loop ciclo\n    mov somma, ax\n',
    tests: [
      { name: 'n = 10', expect: { vars: { somma: 55 } } },
      { name: 'n = 1', init: { n: 1 }, expect: { vars: { somma: 1 } } },
      { name: 'n = 100', init: { n: 100 }, expect: { vars: { somma: 5050 } } },
    ],
  },
  {
    id: 'fattoriale',
    title: 'Fattoriale',
    category: 'Cicli',
    level: 3,
    text: 'Calcola il fattoriale del byte `n` (0 ≤ n ≤ 8) e salvalo nella word `fattoriale`. Ricorda che 0! = 1.',
    hints: ['Parti da AX = 1 e moltiplica per CX a ogni giro.', 'Gestisci a parte n = 0: `loop` con CX = 0 ripeterebbe 65536 volte.'],
    data: '    n db 5\n    fattoriale dw ?',
    solutionBody: '    mov ax, 1\n    mov cl, n\n    mov ch, 0\n    cmp cx, 0\n    je fine\nciclo:\n    mul cx\n    loop ciclo\nfine:\n    mov fattoriale, ax\n',
    tests: [
      { name: '5!', expect: { vars: { fattoriale: 120 } } },
      { name: '0!', init: { n: 0 }, expect: { vars: { fattoriale: 1 } } },
      { name: '1!', init: { n: 1 }, expect: { vars: { fattoriale: 1 } } },
      { name: '7!', init: { n: 7 }, expect: { vars: { fattoriale: 5040 } } },
      { name: '8!', init: { n: 8 }, expect: { vars: { fattoriale: 40320 } } },
    ],
  },
  {
    id: 'conto-alla-rovescia',
    title: 'Conto alla rovescia',
    category: 'Cicli',
    level: 2,
    text: 'Stampa a schermo le cifre da 9 a 0, una dopo l\'altra: `9876543210`.',
    hints: ['`int 21h` con AH = 2 stampa il carattere contenuto in DL.', 'Il carattere \'9\' ha codice ASCII 57; decrementando DL si passa a \'8\', \'7\'...'],
    data: '    ; nessuna variabile necessaria',
    solutionBody: "    mov dl, '9'\n    mov cx, 10\nciclo:\n    mov ah, 2\n    int 21h\n    dec dl\n    loop ciclo\n",
    tests: [{ name: 'Output', expect: { output: ['9876543210'] } }],
  },
  {
    id: 'somma-array',
    title: 'Somma degli elementi di un array',
    category: 'Array',
    level: 2,
    text: 'Somma i 6 elementi (byte senza segno) dell\'array `v` e salva il totale nella word `somma`. Il totale può superare 255.',
    hints: ['Usa SI come indice: `lea si, v` e poi `[si]`.', 'Per sommare un byte a un registro a 16 bit, azzera la parte alta (es. BH = 0, poi BX).'],
    data: '    v db 4, 8, 15, 16, 23, 42\n    lunghezza equ 6\n    somma dw ?',
    solutionBody: '    lea si, v\n    mov cx, lunghezza\n    mov ax, 0\n    mov bh, 0\nciclo:\n    mov bl, [si]\n    add ax, bx\n    inc si\n    loop ciclo\n    mov somma, ax\n',
    tests: [
      { name: '4+8+15+16+23+42', expect: { vars: { somma: 108 } } },
      { name: 'sei uni', init: { v: [1, 1, 1, 1, 1, 1] }, expect: { vars: { somma: 6 } } },
      { name: 'sei 200', init: { v: [200, 200, 200, 200, 200, 200] }, expect: { vars: { somma: 1200 } } },
    ],
  },
  {
    id: 'massimo-array',
    title: 'Massimo di un array',
    category: 'Array',
    level: 3,
    text: 'Trova il valore massimo (byte senza segno) tra i 6 elementi dell\'array `v` e salvalo in `massimo`.',
    hints: ['Parti assumendo che il primo elemento sia il massimo.', 'Scorri gli altri 5 elementi e aggiorna il massimo quando ne trovi uno maggiore.'],
    data: '    v db 12, 45, 7, 89, 23, 56\n    lunghezza equ 6\n    massimo db ?',
    solutionBody: '    lea si, v\n    mov al, [si]\n    mov cx, lunghezza\n    dec cx\n    inc si\nciclo:\n    cmp al, [si]\n    jae avanti\n    mov al, [si]\navanti:\n    inc si\n    loop ciclo\n    mov massimo, al\n',
    tests: [
      { name: 'massimo 89', expect: { vars: { massimo: 89 } } },
      { name: 'massimo all\'inizio', init: { v: [250, 3, 4, 5, 6, 7] }, expect: { vars: { massimo: 250 } } },
      { name: 'massimo alla fine', init: { v: [1, 2, 3, 4, 5, 200] }, expect: { vars: { massimo: 200 } } },
      { name: 'tutti uguali', init: { v: [9, 9, 9, 9, 9, 9] }, expect: { vars: { massimo: 9 } } },
    ],
  },
  {
    id: 'lunghezza-stringa',
    title: 'Lunghezza di una stringa',
    category: 'Stringhe',
    level: 2,
    text: 'La stringa `testo` termina con il carattere `$`. Conta i caratteri prima del `$` e salva il risultato in `lunghezza`.',
    hints: ['Scorri la stringa con SI e confronta ogni byte con \'$\'.'],
    data: '    testo db "assembly$"\n    lunghezza db ?',
    solutionBody: "    lea si, testo\n    mov al, 0\nciclo:\n    cmp [si], '$'\n    je fine\n    inc al\n    inc si\n    jmp ciclo\nfine:\n    mov lunghezza, al\n",
    tests: [
      { name: '"assembly"', expect: { vars: { lunghezza: 8 } } },
      { name: '"ciao"', init: { testo: 'ciao$' }, expect: { vars: { lunghezza: 4 } } },
      { name: 'stringa vuota', init: { testo: '$' }, expect: { vars: { lunghezza: 0 } } },
    ],
  },
  {
    id: 'ciao-mondo',
    title: 'Ciao mondo',
    category: 'Input/Output',
    level: 1,
    text: 'Stampa a schermo il messaggio contenuto nella variabile `msg`.',
    hints: ['`int 21h` con AH = 9 stampa la stringa all\'indirizzo DS:DX fino al carattere `$`.'],
    data: '    msg db "Ciao mondo!$"',
    solutionBody: '    lea dx, msg\n    mov ah, 9\n    int 21h\n',
    tests: [{ name: 'Output', expect: { output: ['Ciao mondo!'] } }],
  },
  {
    id: 'maiuscolo',
    title: 'Da minuscolo a maiuscolo',
    category: 'Input/Output',
    level: 2,
    text: 'Leggi da tastiera una lettera minuscola e stampa subito dopo la corrispondente lettera maiuscola.',
    hints: ['`int 21h` con AH = 1 legge un carattere e lo mette in AL (e lo mostra).', 'Nella tabella ASCII le minuscole hanno codice maggiore di 32 rispetto alle maiuscole.'],
    data: '    ; nessuna variabile necessaria',
    solutionBody: '    mov ah, 1\n    int 21h\n    sub al, 32\n    mov dl, al\n    mov ah, 2\n    int 21h\n',
    tests: [
      { name: 'input "a"', input: 'a', expect: { output: ['aA'] } },
      { name: 'input "q"', input: 'q', expect: { output: ['qQ'] } },
    ],
  },
  {
    id: 'somma-cifre',
    title: 'Somma di due cifre',
    category: 'Input/Output',
    level: 2,
    text: 'Leggi due cifre da tastiera (la cui somma è al massimo 9) e stampa la loro somma come cifra.',
    hints: ['I caratteri letti sono codici ASCII: \'0\' vale 48.', 'Somma i due codici e sottrai 48 una sola volta per ottenere il codice ASCII della cifra risultato.'],
    data: '    ; nessuna variabile necessaria',
    solutionBody: '    mov ah, 1\n    int 21h\n    mov bl, al\n    int 21h\n    add al, bl\n    sub al, 48\n    mov dl, al\n    mov ah, 2\n    int 21h\n',
    tests: [
      { name: '3 e 4', input: '34', expect: { output: ['347'] } },
      { name: '0 e 0', input: '00', expect: { output: ['000'] } },
      { name: '4 e 5', input: '45', expect: { output: ['459'] } },
    ],
  },
  {
    id: 'procedura-quadrato',
    title: 'Procedura che calcola il quadrato',
    category: 'Procedure',
    level: 3,
    text: 'Scrivi una procedura `calcola` che riceve un numero in AL e restituisce in AX il suo quadrato. Chiamala con `call` per calcolare il quadrato del byte `n` e salvalo nella word `quadrato`. La procedura va scritta dopo il codice principale, prima di `ends`.',
    hints: ['Dichiara la procedura con `calcola proc` ... `ret` ... `calcola endp`.', 'Il codice principale termina con `int 21h`: la procedura va scritta dopo.'],
    data: '    n db 9\n    quadrato dw ?',
    solutionBody: '    mov al, n\n    call calcola\n    mov quadrato, ax\n',
    starterTail: '\n    ; scrivi qui la procedura calcola\n',
    solutionTail: '\ncalcola proc\n    mul al\n    ret\ncalcola endp\n',
    requires: ['call', 'ret'],
    tests: [
      { name: '9²', expect: { vars: { quadrato: 81 } } },
      { name: '12²', init: { n: 12 }, expect: { vars: { quadrato: 144 } } },
      { name: '15²', init: { n: 15 }, expect: { vars: { quadrato: 225 } } },
      { name: '0²', init: { n: 0 }, expect: { vars: { quadrato: 0 } } },
    ],
  },
  {
    id: 'bit-a-uno',
    title: 'Contare i bit a 1',
    category: 'Operazioni logiche',
    level: 3,
    text: 'Conta quanti bit valgono 1 nel byte `n` e salva il numero in `uni`.',
    hints: ['Fai scorrere il byte di una posizione a destra con `shr`: il bit uscito finisce nel Carry.', '`adc bl, 0` somma il Carry al contatore.'],
    data: '    n db 0B7h\n    uni db ?',
    solutionBody: '    mov al, n\n    mov bl, 0\n    mov cx, 8\nciclo:\n    shr al, 1\n    adc bl, 0\n    loop ciclo\n    mov uni, bl\n',
    tests: [
      { name: '10110111b', expect: { vars: { uni: 6 } } },
      { name: '0', init: { n: 0 }, expect: { vars: { uni: 0 } } },
      { name: '255', init: { n: 255 }, expect: { vars: { uni: 8 } } },
      { name: '1', init: { n: 1 }, expect: { vars: { uni: 1 } } },
    ],
  },
];

export const EXERCISE_CATEGORIES = [...new Set(EXERCISES.map((e) => e.category))];
