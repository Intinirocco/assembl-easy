import { buildProgram } from './exercises';

export interface Note {
  /** frammento di codice a cui si riferisce la spiegazione */
  code: string;
  text: string;
}

export interface Example {
  id: string;
  title: string;
  category: string;
  summary: string;
  code: string;
  notes: Note[];
  /** Stato finale, in parole semplici (riferito a prima dell'uscita al DOS) */
  result: string;
  /** usati dai test automatici per verificare che l'esempio giri davvero */
  input?: string;
  output?: string;
  /** registri attesi subito prima dell'uscita al DOS (`mov ax, 4c00h`) */
  regs?: Record<string, number>;
}

const prog = (data: string, body: string, tail = '') => buildProgram(data || '    ; nessuna variabile', body, tail);

export const EXAMPLES: Example[] = [
  // ---------------- Operazioni base ----------------
  {
    id: 'mov-base',
    title: 'MOV: copiare valori',
    category: 'Operazioni base',
    summary: 'MOV copia un valore in un registro o in una variabile. Il valore può essere scritto in decimale, esadecimale, binario o come carattere.',
    code: prog('', `    mov ax, 10        ; costante decimale
    mov bx, 0FFh      ; esadecimale (finisce con h, se inizia con una lettera serve lo 0)
    mov cl, 101b      ; binario (finisce con b)
    mov dl, 'A'       ; carattere: vale il suo codice ASCII (65)
    mov si, ax        ; da registro a registro
    mov ah, 5         ; solo la parte alta di AX
    mov al, 7         ; solo la parte bassa di AX
`),
    notes: [
      { code: 'mov ax, 10', text: 'Carica la costante 10 in AX. Dopo questa riga AX = 000Ah.' },
      { code: 'mov bx, 0FFh', text: 'I numeri esadecimali terminano con `h`; se iniziano con una lettera (A–F) si antepone uno 0.' },
      { code: "mov dl, 'A'", text: "Un carattere tra apici vale il suo codice ASCII: 'A' = 65 = 41h." },
      { code: 'mov ah, 5 / mov al, 7', text: 'AX è formato da AH (byte alto) e AL (byte basso): si possono scrivere separatamente, AX diventa 0507h.' },
    ],
    result: 'AX = 0507h, BX = 00FFh, CL = 5, DL = 41h, SI = 000Ah.',
    regs: { ax: 0x0507, bx: 0xff, si: 10 },
  },
  {
    id: 'add-sub',
    title: 'ADD e SUB: somma e sottrazione',
    category: 'Operazioni base',
    summary: 'ADD e SUB lasciano il risultato nel primo operando. Non si possono usare due variabili in memoria nella stessa istruzione.',
    code: prog('    n1 dw 37\n    n2 dw 15', `    mov ax, n1        ; AX = 37
    mov bx, n2        ; BX = 15

    mov cx, ax
    add cx, bx        ; CX = 37 + 15 = 52

    mov dx, ax
    sub dx, bx        ; DX = 37 - 15 = 22
`),
    notes: [
      { code: 'mov ax, n1', text: 'Si legge il valore della variabile `n1` (una word) e lo si copia in AX.' },
      { code: 'add cx, bx', text: 'CX = CX + BX. Il primo operando è sia sorgente sia destinazione.' },
      { code: 'mov dx, ax / sub dx, bx', text: 'Si copia AX in DX per non perdere n1, poi si sottrae BX: DX = DX − BX.' },
    ],
    result: 'CX = 52 (34h), DX = 22 (16h). AX e BX restano invariati.',
    regs: { cx: 52, dx: 22 },
  },
  {
    id: 'inc-dec-neg',
    title: 'INC, DEC e NEG',
    category: 'Operazioni base',
    summary: 'INC e DEC sommano o sottraggono 1; NEG cambia il segno (complemento a 2).',
    code: prog('', `    mov ax, 5
    inc ax            ; AX = 6
    inc ax            ; AX = 7
    dec ax            ; AX = 6

    mov bx, 10
    neg bx            ; BX = -10 = FFF6h in complemento a 2
`),
    notes: [
      { code: 'inc ax', text: 'Più breve di `add ax, 1`. A differenza di ADD, non modifica il flag CF.' },
      { code: 'neg bx', text: '-10 in 16 bit si rappresenta come FFF6h: è 65536 − 10. Il programma lo interpreta come negativo solo se usi salti "con segno".' },
    ],
    result: 'AX = 6, BX = FFF6h (−10).',
    regs: { ax: 6, bx: 0xfff6 },
  },
  {
    id: 'mul-div',
    title: 'MUL e DIV: prodotto, quoziente e resto',
    category: 'Operazioni base',
    summary: 'MUL e DIV usano registri fissi: l\'operando indicato è solo uno, l\'altro è sempre AL/AX.',
    code: prog('    a db 12\n    b db 5', `    ; prodotto di due byte: AX = AL * operando
    mov al, a
    mul b             ; AX = 12 * 5 = 60

    ; divisione di una word per un byte: AL = quoziente, AH = resto
    mov ax, 47
    mov bl, 5
    div bl            ; AL = 9, AH = 2
`),
    notes: [
      { code: 'mul b', text: '`b` è un byte, quindi la moltiplicazione è AL × b e il risultato a 16 bit finisce in AX. MUL non accetta costanti.' },
      { code: 'div bl', text: 'Con un divisore a 8 bit il dividendo è AX: il quoziente va in AL, il resto in AH. Se il quoziente non entra in 8 bit si ha un errore di overflow.' },
    ],
    result: 'Dopo MUL: AX = 60. Dopo DIV: AL = 9 (quoziente), AH = 2 (resto), cioè AX = 0209h.',
    regs: { ax: 0x0209 },
  },

  // ---------------- Variabili ----------------
  {
    id: 'variabili',
    title: 'Dichiarare e usare variabili',
    category: 'Variabili',
    summary: 'DB riserva byte, DW riserva word (2 byte). Il punto interrogativo lascia il valore non inizializzato.',
    code: prog(`    eta db 17          ; un byte inizializzato
    anno dw 2026       ; una word inizializzata
    risultato dw ?     ; una word non inizializzata
    messaggio db "ciao$"`, `    mov al, eta
    add al, 1          ; compleanno!
    mov eta, al        ; riscrivo la variabile

    mov ax, anno
    sub ax, 2000
    mov risultato, ax  ; risultato = 26
`),
    notes: [
      { code: 'eta db 17', text: 'Riserva 1 byte e gli dà il nome `eta`. Nel codice il nome rappresenta il contenuto della variabile.' },
      { code: 'risultato dw ?', text: 'Riserva 2 byte senza valore iniziale: prima di leggerla bisogna scriverla.' },
      { code: 'mov eta, al', text: 'La variabile è in memoria: per modificarla si usa un registro come intermedio.' },
      { code: 'messaggio db "ciao$"', text: 'Una stringa è una sequenza di byte. Il `$` finale serve a INT 21h/09h per sapere dove fermarsi.' },
    ],
    result: 'eta = 18, risultato = 26.',
  },
  {
    id: 'offset-lea',
    title: 'Indirizzi: OFFSET, LEA e [BX]',
    category: 'Variabili',
    summary: 'Un indirizzo si può caricare in un registro e poi usare tra parentesi quadre per leggere o scrivere la memoria puntata.',
    code: prog('    numero db 42\n    copia db ?', `    mov bx, offset numero   ; BX = indirizzo di "numero"
    mov al, [bx]            ; AL = contenuto all'indirizzo BX = 42

    lea si, copia           ; come offset, ma si può usare anche con [bx+...]
    mov [si], al            ; scrive 42 nella variabile "copia"
`),
    notes: [
      { code: 'mov bx, offset numero', text: '`offset` fornisce l\'indirizzo (distanza dall\'inizio del segmento dati) invece del contenuto.' },
      { code: 'mov al, [bx]', text: 'Le parentesi quadre significano "il byte che si trova all\'indirizzo contenuto in BX".' },
      { code: 'lea si, copia', text: 'LEA (Load Effective Address) carica l\'indirizzo in un registro a 16 bit, equivale a `mov si, offset copia`.' },
    ],
    result: 'AL = 42 e la variabile `copia` vale 42.',
    regs: { al: 42 },
  },
  {
    id: 'array',
    title: 'Array: scorrere gli elementi',
    category: 'Variabili',
    summary: 'Un array è una sequenza di valori consecutivi. Si accede agli elementi con un registro indice (SI o DI) che si incrementa.',
    code: prog('    voti db 6, 8, 7, 9, 10\n    n equ 5', `    lea si, voti      ; SI punta al primo elemento
    mov al, [si]      ; AL = 6
    inc si            ; SI punta al secondo
    mov bl, [si]      ; BL = 8

    mov al, voti[4]   ; accesso diretto all'elemento di indice 4 = 10
`),
    notes: [
      { code: 'voti db 6, 8, 7, 9, 10', text: 'Cinque byte consecutivi. L\'etichetta `voti` è l\'indirizzo del primo.' },
      { code: 'n equ 5', text: '`equ` definisce una costante: non occupa memoria, il nome viene sostituito con 5.' },
      { code: 'inc si', text: 'Gli elementi sono byte: per passare al successivo si somma 1. Con un array di word si sommerebbe 2.' },
      { code: 'voti[4]', text: 'L\'indice parte da 0, quindi `voti[4]` è il quinto elemento.' },
    ],
    result: 'AL = 10, BL = 8.',
    regs: { al: 10, bl: 8 },
  },

  // ---------------- Salti condizionati ----------------
  {
    id: 'cmp-je',
    title: 'CMP e salti JE / JNE',
    category: 'Salti condizionati',
    summary: 'CMP confronta due valori impostando i flag; un salto condizionato decide poi se saltare in base ai flag.',
    code: prog(`    uguali db "I numeri sono uguali$"
    diversi db "I numeri sono diversi$"`, `    mov al, 7
    mov bl, 7
    cmp al, bl          ; calcola AL - BL senza salvare, imposta i flag
    je sono_uguali      ; salta se ZF = 1 (risultato zero)

    lea dx, diversi     ; ramo "altrimenti"
    jmp stampa

sono_uguali:
    lea dx, uguali
stampa:
    mov ah, 9
    int 21h
`),
    notes: [
      { code: 'cmp al, bl', text: 'Esegue AL − BL e scarta il risultato: restano solo i flag. Se i due valori sono uguali ZF diventa 1.' },
      { code: 'je sono_uguali', text: '"Jump if Equal": salta all\'etichetta se ZF = 1. Altrimenti l\'esecuzione prosegue alla riga successiva.' },
      { code: 'jmp stampa', text: 'Salto incondizionato: serve a non eseguire anche il ramo "uguali" dopo il ramo "diversi".' },
    ],
    result: 'Stampa "I numeri sono uguali".',
    output: 'I numeri sono uguali',
  },
  {
    id: 'segno-senza-segno',
    title: 'Con segno o senza segno: JG/JL e JA/JB',
    category: 'Salti condizionati',
    summary: 'Gli stessi bit si possono interpretare con o senza segno. Per questo esistono due famiglie di salti, e scegliere quella sbagliata dà risultati errati.',
    code: prog(`    senza db "JA: 200 > 3 (senza segno)$"
    con db "JG: 200 > 3 (con segno)$"
    nonsegno db "JG non salta: 200 e' -56 con segno$"`, `    mov al, 200         ; 11001000b: senza segno 200, con segno -56
    cmp al, 3

    ja maggiore_u       ; confronto SENZA segno: 200 > 3 -> salta
    jmp fine
maggiore_u:
    lea dx, senza
    mov ah, 9
    int 21h

    mov al, 200
    cmp al, 3
    jg  maggiore_s      ; confronto CON segno: -56 > 3 ? no -> non salta
    lea dx, nonsegno
    mov ah, 9
    int 21h
    jmp fine
maggiore_s:
    lea dx, con
    mov ah, 9
    int 21h
fine:
`),
    notes: [
      { code: 'ja / jb', text: 'Above / Below: per numeri **senza segno**. Usano il flag CF.' },
      { code: 'jg / jl', text: 'Greater / Less: per numeri **con segno** in complemento a 2. Usano SF e OF.' },
      { code: 'mov al, 200', text: 'In 8 bit il bit più alto è il segno: 200 = 11001000b vale −56 se interpretato con segno.' },
    ],
    result: 'Stampa il messaggio di JA, poi quello di "JG non salta".',
    output: 'JG non salta',
  },
  {
    id: 'if-else',
    title: 'If / else: il maggiore tra due numeri',
    category: 'Salti condizionati',
    summary: 'In assembly non esiste if/else: si costruisce con CMP, un salto condizionato e un salto incondizionato.',
    code: prog('    a db 14\n    b db 27\n    massimo db ?', `    mov al, a
    cmp al, b
    jae fine_if         ; if (a >= b) il massimo è già in AL
    mov al, b           ; else: il massimo è b
fine_if:
    mov massimo, al     ; massimo = 27
`),
    notes: [
      { code: 'jae fine_if', text: 'Jump if Above or Equal (senza segno): se a ≥ b non c\'è nulla da fare, si salta oltre.' },
      { code: 'mov al, b', text: 'Eseguita solo quando a < b, perché altrimenti il salto la scavalca.' },
    ],
    result: 'massimo = 27.',
    regs: { al: 27 },
  },

  // ---------------- Cicli ----------------
  {
    id: 'loop-stampa',
    title: 'LOOP: ripetere N volte',
    category: 'Cicli',
    summary: 'LOOP decrementa CX e salta all\'etichetta finché CX non è zero: CX è il contatore del ciclo.',
    code: prog('', `    mov cx, 5           ; ripeti 5 volte
    mov dl, '1'
ciclo:
    mov ah, 2           ; funzione "stampa il carattere in DL"
    int 21h
    inc dl              ; prossimo carattere
    loop ciclo          ; CX = CX - 1; se CX != 0 salta a "ciclo"
`),
    notes: [
      { code: 'mov cx, 5', text: 'Il numero di ripetizioni si mette in CX prima di entrare nel ciclo.' },
      { code: 'loop ciclo', text: 'Fa due cose: CX = CX − 1 e, se CX ≠ 0, salta. Con CX = 0 all\'inizio il ciclo girerebbe 65536 volte!' },
      { code: 'mov ah, 2 / int 21h', text: 'Stampa il carattere che è in DL. Se il ciclo modificasse AH o DL va tenuto conto.' },
    ],
    result: 'Stampa 12345.',
    output: '12345',
  },
  {
    id: 'while-somma',
    title: 'Ciclo con condizione (while)',
    category: 'Cicli',
    summary: 'Quando non si sa quante volte ripetere, si usa un salto condizionato all\'indietro al posto di LOOP.',
    code: prog('    somma dw ?', `    mov ax, 0           ; somma
    mov bx, 1           ; numero corrente
ripeti:
    add ax, bx
    inc bx
    cmp ax, 50
    jbe ripeti          ; while (somma <= 50) ripeti

    mov somma, ax       ; primo valore > 50
`),
    notes: [
      { code: 'jbe ripeti', text: 'Se la somma è ancora ≤ 50 torna all\'inizio del corpo. Il test sta in fondo, quindi il corpo gira almeno una volta (do…while).' },
      { code: 'mov somma, ax', text: '1+2+…+10 = 55 è la prima somma maggiore di 50.' },
    ],
    result: 'somma = 55, BX = 11.',
    regs: { ax: 55, bx: 11 },
  },

  // ---------------- Stack e procedure ----------------
  {
    id: 'push-pop',
    title: 'PUSH e POP: lo stack',
    category: 'Stack e procedure',
    summary: 'Lo stack è una pila LIFO: l\'ultimo valore inserito con PUSH è il primo a uscire con POP.',
    code: prog('', `    mov ax, 1111h
    mov bx, 2222h

    push ax             ; sulla pila: 1111h
    push bx             ; sulla pila: 1111h, 2222h

    pop ax              ; AX = 2222h (l'ultimo entrato)
    pop bx              ; BX = 1111h
`),
    notes: [
      { code: 'push ax', text: 'SP viene diminuito di 2 e il valore (16 bit) scritto all\'indirizzo SS:SP.' },
      { code: 'pop ax / pop bx', text: 'Gli estratti escono in ordine inverso: così AX e BX risultano scambiati.' },
    ],
    result: 'AX = 2222h, BX = 1111h: i due registri sono stati scambiati.',
    regs: { ax: 0x2222, bx: 0x1111 },
  },
  {
    id: 'call-ret',
    title: 'CALL e RET: una procedura',
    category: 'Stack e procedure',
    summary: 'Una procedura è un blocco di codice richiamabile da più punti. CALL salva sullo stack l\'indirizzo di ritorno, RET lo recupera.',
    code: prog('    risultato dw ?', `    mov al, 7
    call quadrato        ; AX = 49
    mov risultato, ax

    mov al, 12
    call quadrato        ; AX = 144
`, `
quadrato proc
    mul al               ; AX = AL * AL
    ret
quadrato endp
`),
    notes: [
      { code: 'call quadrato', text: 'Mette sullo stack l\'indirizzo dell\'istruzione successiva e salta alla procedura.' },
      { code: 'quadrato proc', text: 'Da qui al `endp` c\'è la procedura: riceve il parametro in AL e restituisce il risultato in AX (convenzione: si decide chi usa quali registri).' },
      { code: 'ret', text: 'Toglie dallo stack l\'indirizzo di ritorno e vi salta: l\'esecuzione riprende dopo la CALL.' },
      { code: '(posizione)', text: 'La procedura sta dopo il codice principale: se fosse prima verrebbe eseguita anche senza CALL.' },
    ],
    result: 'risultato = 49; alla fine AX = 144.',
    regs: { ax: 144 },
  },

  // ---------------- Input/Output ----------------
  {
    id: 'io-carattere',
    title: 'Leggere e stampare un carattere',
    category: 'Input/Output',
    summary: 'INT 21h è il servizio del sistema operativo: il numero di funzione si mette in AH.',
    code: prog('', `    mov ah, 1           ; funzione 1: leggi un carattere, in AL
    int 21h             ; aspetta un tasto (lo mostra nel terminale)

    mov dl, al          ; il carattere da stampare va in DL
    mov ah, 2           ; funzione 2: stampa il carattere in DL
    int 21h
`),
    notes: [
      { code: 'mov ah, 1 / int 21h', text: 'Il programma si ferma finché non si preme un tasto. Il codice ASCII finisce in AL.' },
      { code: 'mov dl, al', text: 'La funzione 2 vuole il carattere in DL, quindi va copiato.' },
    ],
    result: 'Ogni carattere digitato viene stampato due volte (eco + stampa).',
    input: 'x',
    output: 'xx',
  },
  {
    id: 'io-stringa',
    title: 'Leggere e stampare una stringa',
    category: 'Input/Output',
    summary: 'INT 21h funzione 0Ah legge una riga intera in un buffer; la funzione 09h stampa una stringa terminata da $.',
    code: prog(`    chiedi db "Come ti chiami? $"
    capo db 13, 10, "Ciao $"
    buf db 20, ?, 20 dup(0)   ; max 20 caratteri, poi lunghezza letta, poi i caratteri`, `    lea dx, chiedi
    mov ah, 9
    int 21h

    lea dx, buf
    mov ah, 0Ah           ; leggi una riga nel buffer
    int 21h

    mov bl, buf[1]        ; numero di caratteri letti
    mov bh, 0
    mov buf[bx+2], '$'    ; metto il terminatore dopo l'ultimo carattere

    lea dx, capo
    mov ah, 9
    int 21h
    lea dx, buf+2         ; i caratteri iniziano al terzo byte del buffer
    mov ah, 9
    int 21h
`),
    notes: [
      { code: 'buf db 20, ?, 20 dup(0)', text: 'Formato richiesto dalla funzione 0Ah: 1° byte = massimo, 2° byte = quanti ne sono stati letti (lo scrive DOS), poi lo spazio per i caratteri.' },
      { code: 'mov buf[bx+2], \'$\'', text: 'DOS termina la riga con il codice 13 (Invio), ma per stamparla serve il `$`: lo si scrive subito dopo l\'ultimo carattere.' },
      { code: 'lea dx, buf+2', text: 'Si stampa a partire dal terzo byte, saltando i due byte di controllo.' },
    ],
    result: 'Digitando "Anna" nel terminale compare: Ciao Anna.',
    input: 'Anna\n',
    output: 'Ciao Anna',
  },
  {
    id: 'io-numeri',
    title: 'Leggere e stampare numeri (emu8086.inc)',
    category: 'Input/Output',
    summary: 'La libreria emu8086.inc offre routine pronte per leggere e stampare numeri interi anche a più cifre.',
    code: `include 'emu8086.inc'

data segment
    msg1 db 13, 10, "Primo numero: $"
    msg2 db 13, 10, "Secondo numero: $"
    msg3 db 13, 10, "La somma e': $"
ends

stack segment
    dw   128  dup(0)
ends

code segment
start:
    mov ax, data
    mov ds, ax
    mov es, ax

    lea dx, msg1
    mov ah, 9
    int 21h
    call scan_num       ; legge un numero: risultato in CX
    mov bx, cx

    lea dx, msg2
    mov ah, 9
    int 21h
    call scan_num       ; secondo numero in CX

    lea dx, msg3
    mov ah, 9
    int 21h
    mov ax, bx
    add ax, cx
    call print_num      ; stampa il numero con segno in AX

    mov ax, 4c00h
    int 21h

    ; le routine usate vanno "definite" una volta, dopo l'uscita al DOS
    DEFINE_SCAN_NUM
    DEFINE_PRINT_NUM
    DEFINE_PRINT_NUM_UNS
ends

end start
`,
    notes: [
      { code: "include 'emu8086.inc'", text: 'Importa le macro della libreria; va messo all\'inizio del file.' },
      { code: 'call scan_num', text: 'Legge un numero digitato (anche negativo, anche di più cifre) fino a Invio. Il valore a 16 bit si trova in CX.' },
      { code: 'call print_num', text: 'Stampa il valore di AX come numero con segno. Per numeri senza segno c\'è `print_num_uns`.' },
      { code: 'DEFINE_SCAN_NUM', text: 'Ogni routine usata va definita una volta sola (e `print_num` richiede anche `DEFINE_PRINT_NUM_UNS`).' },
    ],
    result: 'Digitando 120 e 35 stampa: La somma e\': 155.',
    input: '120\n35\n',
    output: "La somma e': 155",
  },
];

/** Argomenti aggiuntivi oltre alla categoria principale: servono ai filtri (intersezione). */
const EXTRA_TAGS: Record<string, string[]> = {
  'mov-base': ['Registri'],
  'add-sub': ['Variabili', 'Registri'],
  'inc-dec-neg': ['Registri'],
  'mul-div': ['Variabili', 'Registri'],
  variabili: ['Operazioni base'],
  'offset-lea': ['Memoria e indirizzi'],
  array: ['Array', 'Memoria e indirizzi'],
  'cmp-je': ['Input/Output'],
  'segno-senza-segno': ['Con e senza segno', 'Input/Output'],
  'if-else': ['Variabili'],
  'loop-stampa': ['Input/Output'],
  'while-somma': ['Salti condizionati', 'Operazioni base'],
  'push-pop': ['Registri'],
  'call-ret': ['Variabili', 'Operazioni base'],
  'io-stringa': ['Stringhe', 'Memoria e indirizzi'],
  'io-numeri': ['Operazioni base'],
};

export function exampleTags(e: Example): string[] {
  return [...new Set([e.category, ...(EXTRA_TAGS[e.id] ?? [])])];
}

export const EXAMPLE_CATEGORIES = [...new Set(EXAMPLES.map((e) => e.category))];

const TAG_ORDER = [
  ...EXAMPLE_CATEGORIES,
  'Registri',
  'Memoria e indirizzi',
  'Array',
  'Stringhe',
  'Con e senza segno',
];
export const EXAMPLE_TAGS = [...new Set(EXAMPLES.flatMap(exampleTags))].sort(
  (a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b),
);
