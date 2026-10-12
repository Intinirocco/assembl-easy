export interface Operand {
  form: string;
  note?: string;
}

export interface Instruction {
  id: string;
  name: string; // titolo (es. "JE / JZ")
  mnemonics: string[]; // per la ricerca
  category: string;
  syntax: string[];
  operands: Operand[];
  description: string;
  /** flag modificati, in italiano */
  flags: string;
  example: string;
  notes?: string[];
  table?: { head: string[]; rows: string[][] };
}

const NONE = 'Nessun flag modificato.';
const ARITH = 'Modifica CF, OF, SF, ZF, AF, PF.';
const LOGIC = 'CF = 0 e OF = 0; modifica SF, ZF, PF (AF indefinito).';

const R16 = { form: 'reg16', note: 'AX, BX, CX, DX, SI, DI, BP, SP' };
const R8 = { form: 'reg8', note: 'AL, AH, BL, BH, CL, CH, DL, DH' };

const base: Instruction[] = [
  // ---------------- Trasferimento dati ----------------
  {
    id: 'mov', name: 'MOV', mnemonics: ['mov'], category: 'Trasferimento dati',
    syntax: ['MOV destinazione, sorgente'],
    operands: [
      { form: 'reg, reg', note: 'stessa dimensione (8 o 16 bit)' },
      { form: 'reg, memoria' }, { form: 'memoria, reg' },
      { form: 'reg, costante' }, { form: 'memoria, costante' },
      { form: 'sreg, reg16 / reg16, sreg', note: 'registri di segmento (DS, ES, SS); CS non può essere destinazione' },
    ],
    description: 'Copia il valore della sorgente nella destinazione. La sorgente non cambia.',
    flags: NONE,
    example: 'mov ax, 10\nmov bl, al\nmov numero, ax',
    notes: [
      'Non si può copiare da memoria a memoria: serve un registro intermedio.',
      'Non si può caricare una costante in un registro di segmento: `mov ax, data` e poi `mov ds, ax`.',
      'Se né un registro né una variabile con tipo fissano la dimensione (es. `mov [bx], 5`), l\'operazione è a 8 bit.',
    ],
  },
  {
    id: 'xchg', name: 'XCHG', mnemonics: ['xchg'], category: 'Trasferimento dati',
    syntax: ['XCHG op1, op2'],
    operands: [{ form: 'reg, reg' }, { form: 'reg, memoria' }, { form: 'memoria, reg' }],
    description: 'Scambia il contenuto dei due operandi.',
    flags: NONE, example: 'xchg ax, bx',
    notes: ['Non accetta costanti né due operandi in memoria.'],
  },
  {
    id: 'lea', name: 'LEA', mnemonics: ['lea'], category: 'Trasferimento dati',
    syntax: ['LEA reg16, memoria'],
    operands: [{ form: 'reg16, memoria', note: 'la destinazione deve essere a 16 bit' }],
    description: 'Carica in un registro l\'indirizzo (offset) dell\'operando in memoria, non il suo contenuto.',
    flags: NONE, example: 'lea dx, messaggio     ; come mov dx, offset messaggio\nlea si, tabella[bx]',
    notes: ['`lea` accetta indirizzi calcolati (`[bx+si+2]`), `mov reg, offset var` solo nomi di variabile.'],
  },
  {
    id: 'push', name: 'PUSH', mnemonics: ['push'], category: 'Procedure e stack',
    syntax: ['PUSH sorgente'],
    operands: [{ form: 'reg16' }, { form: 'sreg' }, { form: 'memoria (word)' }, { form: 'costante' }],
    description: 'Decrementa SP di 2 e scrive la word sulla cima dello stack (SS:SP).',
    flags: NONE, example: 'push ax\npush bx',
    notes: ['Si lavora sempre a 16 bit: `push al` è un errore.'],
  },
  {
    id: 'pop', name: 'POP', mnemonics: ['pop'], category: 'Procedure e stack',
    syntax: ['POP destinazione'],
    operands: [{ form: 'reg16' }, { form: 'sreg (non CS)' }, { form: 'memoria (word)' }],
    description: 'Legge la word in cima allo stack, la scrive nella destinazione e incrementa SP di 2.',
    flags: NONE, example: 'pop bx\npop ax    ; ordine inverso rispetto ai PUSH',
    notes: ['Ogni PUSH deve avere il suo POP: uno stack non bilanciato fa sbagliare `ret`.'],
  },
  {
    id: 'pushf-popf', name: 'PUSHF / POPF', mnemonics: ['pushf', 'popf'], category: 'Procedure e stack',
    syntax: ['PUSHF', 'POPF'], operands: [],
    description: 'PUSHF mette sullo stack il registro dei flag, POPF lo ripristina dallo stack.',
    flags: 'POPF modifica tutti i flag; PUSHF nessuno.', example: 'pushf\n; ...istruzioni che alterano i flag...\npopf',
  },

  // ---------------- Aritmetiche ----------------
  {
    id: 'add', name: 'ADD', mnemonics: ['add'], category: 'Aritmetiche',
    syntax: ['ADD destinazione, sorgente'],
    operands: [{ form: 'reg, reg' }, { form: 'reg, memoria' }, { form: 'memoria, reg' }, { form: 'reg, costante' }, { form: 'memoria, costante' }],
    description: 'destinazione = destinazione + sorgente.', flags: ARITH,
    example: 'mov al, 200\nadd al, 100   ; AL = 44, CF = 1 (riporto)',
    notes: ['CF segnala il riporto per numeri senza segno, OF l\'overflow per numeri con segno.'],
  },
  {
    id: 'adc', name: 'ADC', mnemonics: ['adc'], category: 'Aritmetiche',
    syntax: ['ADC destinazione, sorgente'],
    operands: [{ form: 'stessi di ADD' }],
    description: 'destinazione = destinazione + sorgente + CF. Serve per somme su più di 16 bit.', flags: ARITH,
    example: '; somma 32 bit: DX:AX + CX:BX\nadd ax, bx\nadc dx, cx',
  },
  {
    id: 'sub', name: 'SUB', mnemonics: ['sub'], category: 'Aritmetiche',
    syntax: ['SUB destinazione, sorgente'],
    operands: [{ form: 'stessi di ADD' }],
    description: 'destinazione = destinazione − sorgente.', flags: ARITH,
    example: 'mov ax, 5\nsub ax, 8    ; AX = FFFDh (-3), CF = 1, SF = 1',
    notes: ['CF = 1 indica un "prestito": il primo operando era minore del secondo (senza segno).'],
  },
  {
    id: 'sbb', name: 'SBB', mnemonics: ['sbb'], category: 'Aritmetiche',
    syntax: ['SBB destinazione, sorgente'], operands: [{ form: 'stessi di ADD' }],
    description: 'destinazione = destinazione − sorgente − CF. Sottrazioni su più di 16 bit.', flags: ARITH,
    example: 'sub ax, bx\nsbb dx, cx',
  },
  {
    id: 'inc-dec', name: 'INC / DEC', mnemonics: ['inc', 'dec'], category: 'Aritmetiche',
    syntax: ['INC operando', 'DEC operando'],
    operands: [R8, R16, { form: 'memoria' }],
    description: 'INC somma 1 all\'operando, DEC sottrae 1.',
    flags: 'Modifica OF, SF, ZF, AF, PF. **Non** modifica CF.',
    example: 'inc cx\ndec byte_var',
    notes: ['Con operando in memoria senza tipo noto (`inc [bx]`) l\'operazione è a 8 bit.'],
  },
  {
    id: 'neg', name: 'NEG', mnemonics: ['neg'], category: 'Aritmetiche',
    syntax: ['NEG operando'], operands: [R8, R16, { form: 'memoria' }],
    description: 'Cambia il segno dell\'operando (complemento a 2): operando = 0 − operando.',
    flags: 'Modifica CF (1 se l\'operando era diverso da 0), OF, SF, ZF, AF, PF.', example: 'mov ax, 7\nneg ax        ; AX = FFF9h = -7',
  },
  {
    id: 'cmp', name: 'CMP', mnemonics: ['cmp'], category: 'Confronto e salti',
    syntax: ['CMP op1, op2'],
    operands: [{ form: 'stessi di ADD' }],
    description: 'Calcola op1 − op2 senza memorizzare il risultato: serve solo a impostare i flag per un salto condizionato successivo.',
    flags: ARITH,
    example: 'cmp al, 10\njl minore     ; salta se AL < 10 (con segno)',
  },
  {
    id: 'mul', name: 'MUL', mnemonics: ['mul'], category: 'Aritmetiche',
    syntax: ['MUL sorgente'],
    operands: [R8, R16, { form: 'memoria', note: 'il tipo della variabile decide 8 o 16 bit; non accetta costanti' }],
    description: 'Moltiplicazione senza segno. Con sorgente a 8 bit: AX = AL × sorgente. Con sorgente a 16 bit: DX:AX = AX × sorgente.',
    flags: 'CF = OF = 1 se la metà alta del risultato (AH, o DX) è diversa da 0; gli altri flag sono indefiniti.',
    example: 'mov al, 20\nmov bl, 15\nmul bl        ; AX = 300\n\nmov ax, 1000\nmov cx, 100\nmul cx        ; DX:AX = 100000',
  },
  {
    id: 'imul', name: 'IMUL', mnemonics: ['imul'], category: 'Aritmetiche',
    syntax: ['IMUL sorgente'], operands: [R8, R16, { form: 'memoria' }],
    description: 'Come MUL ma i numeri sono interpretati con segno (complemento a 2).',
    flags: 'CF = OF = 1 se il risultato non entra nella metà bassa; gli altri indefiniti.',
    example: 'mov al, -3\nmov bl, 4\nimul bl       ; AX = -12 (FFF4h)',
  },
  {
    id: 'div', name: 'DIV', mnemonics: ['div'], category: 'Aritmetiche',
    syntax: ['DIV divisore'], operands: [R8, R16, { form: 'memoria' }],
    description: 'Divisione senza segno. Divisore a 8 bit: AX ÷ divisore → AL quoziente, AH resto. Divisore a 16 bit: DX:AX ÷ divisore → AX quoziente, DX resto.',
    flags: 'Tutti i flag sono indefiniti.',
    example: 'mov ax, 100\nmov bl, 7\ndiv bl        ; AL = 14, AH = 2',
    notes: [
      'Errore se il divisore è 0 o se il quoziente non entra nel registro di destinazione.',
      'Con divisore a 16 bit ricordati di azzerare DX (`mov dx, 0`) prima della divisione.',
    ],
  },
  {
    id: 'idiv', name: 'IDIV', mnemonics: ['idiv'], category: 'Aritmetiche',
    syntax: ['IDIV divisore'], operands: [R8, R16, { form: 'memoria' }],
    description: 'Come DIV ma con numeri con segno. Il resto ha il segno del dividendo.',
    flags: 'Tutti i flag sono indefiniti.',
    example: 'mov ax, -17\nmov bl, 5\nidiv bl       ; AL = -3, AH = -2',
    notes: ['Prima di una IDIV a 16 bit usare `cwd` per estendere il segno di AX in DX.'],
  },
  {
    id: 'cbw-cwd', name: 'CBW / CWD', mnemonics: ['cbw', 'cwd'], category: 'Aritmetiche',
    syntax: ['CBW', 'CWD'], operands: [],
    description: 'Estendono il segno: CBW porta AL in AX (copiando il bit 7 in AH), CWD porta AX in DX:AX (copiando il bit 15 in DX).',
    flags: NONE, example: 'mov al, -5\ncbw           ; AX = FFFBh',
  },

  // ---------------- Logiche ----------------
  {
    id: 'and', name: 'AND', mnemonics: ['and'], category: 'Logiche e bit',
    syntax: ['AND destinazione, sorgente'], operands: [{ form: 'stessi di ADD' }],
    description: 'AND bit a bit. Si usa per azzerare bit (maschera) o per testarli.', flags: LOGIC,
    example: 'and al, 0Fh   ; tiene i 4 bit bassi\nand al, 11011111b  ; maiuscolo: azzera il bit 5',
  },
  {
    id: 'or', name: 'OR', mnemonics: ['or'], category: 'Logiche e bit',
    syntax: ['OR destinazione, sorgente'], operands: [{ form: 'stessi di ADD' }],
    description: 'OR bit a bit. Si usa per forzare a 1 alcuni bit.', flags: LOGIC,
    example: 'or al, 30h    ; da cifra 0-9 al codice ASCII\nor bx, bx     ; imposta ZF se BX = 0',
  },
  {
    id: 'xor', name: 'XOR', mnemonics: ['xor'], category: 'Logiche e bit',
    syntax: ['XOR destinazione, sorgente'], operands: [{ form: 'stessi di ADD' }],
    description: 'OR esclusivo bit a bit. `xor reg, reg` azzera il registro.', flags: LOGIC,
    example: 'xor ax, ax    ; AX = 0\nxor al, 20h   ; inverte maiuscolo/minuscolo',
  },
  {
    id: 'not', name: 'NOT', mnemonics: ['not'], category: 'Logiche e bit',
    syntax: ['NOT operando'], operands: [R8, R16, { form: 'memoria' }],
    description: 'Inverte tutti i bit dell\'operando (complemento a 1).', flags: NONE,
    example: 'mov al, 0F0h\nnot al         ; AL = 0Fh',
  },
  {
    id: 'test', name: 'TEST', mnemonics: ['test'], category: 'Logiche e bit',
    syntax: ['TEST op1, op2'], operands: [{ form: 'stessi di ADD' }],
    description: 'Esegue un AND bit a bit senza memorizzare il risultato: serve a testare bit.', flags: LOGIC,
    example: 'test al, 1\njz pari        ; bit 0 = 0: numero pari',
  },
  {
    id: 'shl-shr', name: 'SHL / SAL / SHR / SAR', mnemonics: ['shl', 'sal', 'shr', 'sar'], category: 'Logiche e bit',
    syntax: ['SHL operando, n', 'SHR operando, n', 'SAL operando, n', 'SAR operando, n'],
    operands: [
      { form: 'reg, costante' }, { form: 'memoria, costante' }, { form: 'reg, CL' }, { form: 'memoria, CL' },
    ],
    description: 'Scorrimento di n posizioni. SHL/SAL spostano a sinistra (moltiplica per 2ⁿ), SHR a destra senza segno (divide per 2ⁿ), SAR a destra mantenendo il segno. Il bit uscito finisce in CF.',
    flags: 'CF = ultimo bit uscito; modifica anche OF, SF, ZF, PF.',
    example: 'mov al, 6\nshl al, 1     ; AL = 12\nmov cl, 2\nshr al, cl    ; AL = 3',
  },
  {
    id: 'rol-ror', name: 'ROL / ROR / RCL / RCR', mnemonics: ['rol', 'ror', 'rcl', 'rcr'], category: 'Logiche e bit',
    syntax: ['ROL operando, n', 'ROR operando, n', 'RCL operando, n', 'RCR operando, n'],
    operands: [{ form: 'stessi di SHL' }],
    description: 'Rotazioni. ROL/ROR ruotano i bit a sinistra/destra riportando in coda quello uscito. RCL/RCR ruotano attraverso il Carry (9 o 17 bit complessivi).',
    flags: 'Modifica CF e OF.',
    example: 'mov al, 10000001b\nrol al, 1     ; AL = 00000011b, CF = 1',
  },

  // ---------------- Salti ----------------
  {
    id: 'jmp', name: 'JMP', mnemonics: ['jmp'], category: 'Confronto e salti',
    syntax: ['JMP etichetta'], operands: [{ form: 'etichetta' }, { form: 'reg16 / memoria', note: 'salto indiretto' }],
    description: 'Salto incondizionato: l\'esecuzione continua dall\'etichetta indicata.', flags: NONE,
    example: 'jmp fine\n; ... codice saltato ...\nfine:',
  },
  {
    id: 'loop', name: 'LOOP / LOOPE / LOOPNE', mnemonics: ['loop', 'loope', 'loopz', 'loopne', 'loopnz'], category: 'Cicli',
    syntax: ['LOOP etichetta', 'LOOPE etichetta', 'LOOPNE etichetta'], operands: [{ form: 'etichetta' }],
    description: 'Decrementa CX e salta all\'etichetta se CX ≠ 0. LOOPE/LOOPZ richiede anche ZF = 1, LOOPNE/LOOPNZ anche ZF = 0.',
    flags: NONE,
    example: '    mov cx, 5\nciclo:\n    ; corpo del ciclo\n    loop ciclo',
    notes: ['Se CX vale 0 all\'ingresso il ciclo viene eseguito 65536 volte: controlla prima con `jcxz`.'],
  },
  {
    id: 'call', name: 'CALL', mnemonics: ['call'], category: 'Procedure e stack',
    syntax: ['CALL procedura'], operands: [{ form: 'etichetta' }, { form: 'reg16 / memoria', note: 'chiamata indiretta' }],
    description: 'Chiama una procedura: salva sullo stack l\'indirizzo di ritorno e salta alla procedura.', flags: NONE,
    example: '    call stampa\n    ; ...\nstampa proc\n    ; ...\n    ret\nstampa endp',
  },
  {
    id: 'ret', name: 'RET', mnemonics: ['ret'], category: 'Procedure e stack',
    syntax: ['RET', 'RET n'], operands: [{ form: '(nessuno) oppure costante', note: 'n = byte da rimuovere dallo stack' }],
    description: 'Termina una procedura: preleva dallo stack l\'indirizzo di ritorno e vi salta. Con `RET n` libera anche n byte di parametri.',
    flags: NONE, example: 'quadrato proc\n    mul al\n    ret\nquadrato endp',
  },
  {
    id: 'int', name: 'INT', mnemonics: ['int'], category: 'Interruzioni',
    syntax: ['INT numero'], operands: [{ form: 'costante (0–255)' }],
    description: 'Richiama un servizio del sistema operativo o del BIOS. Il servizio specifico si sceglie con il valore di AH.',
    flags: 'Dipende dal servizio.', example: 'mov ah, 9\nlea dx, msg\nint 21h',
    table: {
      head: ['INT', 'AH', 'Funzione', 'Parametri / risultato'],
      rows: [
        ['21h', '01h', 'Legge un carattere (con eco)', 'Risultato in AL'],
        ['21h', '02h', 'Stampa un carattere', 'DL = carattere'],
        ['21h', '06h', 'Console diretta', 'DL = carattere, oppure DL = FFh per leggere senza attendere'],
        ['21h', '07h / 08h', 'Legge un carattere senza eco', 'Risultato in AL'],
        ['21h', '09h', 'Stampa una stringa terminata da $', 'DS:DX = indirizzo della stringa'],
        ['21h', '0Ah', 'Legge una riga in un buffer', 'DS:DX = buffer: [max][letti][caratteri…]'],
        ['21h', '4Ch', 'Termina il programma', 'AL = codice di uscita'],
        ['20h', '—', 'Termina il programma', '—'],
        ['10h', '0Eh', 'Stampa un carattere (teletype)', 'AL = carattere'],
      ],
    },
  },
  {
    id: 'flags-ops', name: 'CLC / STC / CMC / CLD / STD', mnemonics: ['clc', 'stc', 'cmc', 'cld', 'std', 'cli', 'sti'], category: 'Controllo processore',
    syntax: ['CLC', 'STC', 'CMC', 'CLD', 'STD'], operands: [],
    description: 'CLC azzera CF, STC lo pone a 1, CMC lo inverte. CLD azzera DF e STD lo pone a 1 (direzione delle istruzioni su stringhe).',
    flags: 'Solo il flag indicato.', example: 'clc\nadc ax, 0    ; somma senza riporto precedente',
  },
  {
    id: 'nop-hlt', name: 'NOP / HLT', mnemonics: ['nop', 'hlt'], category: 'Controllo processore',
    syntax: ['NOP', 'HLT'], operands: [],
    description: 'NOP non fa nulla. HLT ferma il processore (in emu8086 e qui termina l\'esecuzione).', flags: NONE, example: 'nop',
  },

  // ---------------- Stringhe ----------------
  {
    id: 'string-ops', name: 'MOVSB / MOVSW / STOSB / LODSB / CMPSB / SCASB', mnemonics: ['movsb', 'movsw', 'stosb', 'stosw', 'lodsb', 'lodsw', 'cmpsb', 'cmpsw', 'scasb', 'scasw'], category: 'Stringhe',
    syntax: ['MOVSB / MOVSW', 'STOSB / STOSW', 'LODSB / LODSW', 'CMPSB / CMPSW', 'SCASB / SCASW'], operands: [],
    description: 'Lavorano su un byte (B) o una word (W) e poi aggiornano SI e/o DI: +1/+2 se DF = 0, −1/−2 se DF = 1.',
    flags: 'CMPS e SCAS modificano i flag come CMP; le altre nessuno.',
    example: '    cld\n    lea si, origine\n    lea di, destinazione\n    mov cx, 10\n    rep movsb     ; copia 10 byte',
    table: {
      head: ['Istruzione', 'Effetto'],
      rows: [
        ['MOVSB', 'ES:[DI] ← DS:[SI]'],
        ['STOSB', 'ES:[DI] ← AL'],
        ['LODSB', 'AL ← DS:[SI]'],
        ['CMPSB', 'confronta DS:[SI] con ES:[DI]'],
        ['SCASB', 'confronta AL con ES:[DI]'],
      ],
    },
    notes: ['Ricorda `mov es, ax` all\'inizio del programma: le scritture usano ES.'],
  },
  {
    id: 'rep', name: 'REP / REPE / REPNE', mnemonics: ['rep', 'repe', 'repz', 'repne', 'repnz'], category: 'Stringhe',
    syntax: ['REP istruzione_su_stringa', 'REPE istruzione', 'REPNE istruzione'], operands: [],
    description: 'Prefissi che ripetono l\'istruzione su stringhe finché CX ≠ 0 (decrementandolo). REPE/REPNE si fermano anche quando ZF cambia.',
    flags: 'Come l\'istruzione ripetuta.', example: 'rep stosb     ; riempie CX byte con AL',
  },
  {
    id: 'xlat', name: 'XLAT', mnemonics: ['xlat', 'xlatb'], category: 'Trasferimento dati',
    syntax: ['XLAT'], operands: [],
    description: 'AL ← DS:[BX + AL]. Traduce AL tramite una tabella puntata da BX.', flags: NONE,
    example: 'lea bx, tabella\nmov al, 3\nxlat          ; AL = tabella[3]',
  },
];

// ---------------- Salti condizionati (generati da una tabella) ----------------
const COND: [string, string, string, string][] = [
  ['JE / JZ', 'uguale / zero', 'ZF = 1', 'sia con segno sia senza'],
  ['JNE / JNZ', 'diverso / non zero', 'ZF = 0', 'sia con segno sia senza'],
  ['JA / JNBE', 'maggiore (senza segno)', 'CF = 0 e ZF = 0', 'senza segno'],
  ['JAE / JNB / JNC', 'maggiore o uguale (senza segno)', 'CF = 0', 'senza segno'],
  ['JB / JNAE / JC', 'minore (senza segno)', 'CF = 1', 'senza segno'],
  ['JBE / JNA', 'minore o uguale (senza segno)', 'CF = 1 o ZF = 1', 'senza segno'],
  ['JG / JNLE', 'maggiore (con segno)', 'ZF = 0 e SF = OF', 'con segno'],
  ['JGE / JNL', 'maggiore o uguale (con segno)', 'SF = OF', 'con segno'],
  ['JL / JNGE', 'minore (con segno)', 'SF ≠ OF', 'con segno'],
  ['JLE / JNG', 'minore o uguale (con segno)', 'ZF = 1 o SF ≠ OF', 'con segno'],
  ['JS', 'negativo', 'SF = 1', 'flag'],
  ['JNS', 'non negativo', 'SF = 0', 'flag'],
  ['JO', 'overflow', 'OF = 1', 'flag'],
  ['JNO', 'nessun overflow', 'OF = 0', 'flag'],
  ['JP / JPE', 'parità pari', 'PF = 1', 'flag'],
  ['JNP / JPO', 'parità dispari', 'PF = 0', 'flag'],
  ['JCXZ', 'CX uguale a zero', 'CX = 0', 'registro'],
];

const jcc: Instruction = {
  id: 'jcc', name: 'Salti condizionati (Jcc)', category: 'Confronto e salti',
  mnemonics: COND.flatMap(([n]) => n.split(' / ').map((x) => x.toLowerCase())),
  syntax: ['Jcc etichetta'],
  operands: [{ form: 'etichetta', note: 'entro circa ±127 byte dall\'istruzione (salto breve)' }],
  description:
    'Saltano all\'etichetta se la condizione sui flag è vera, altrimenti proseguono. Di solito seguono un CMP o un\'istruzione aritmetica. Per confrontare numeri **senza segno** si usano JA/JB, per numeri **con segno** JG/JL: sono due famiglie diverse.',
  flags: NONE,
  example: '    cmp al, bl\n    jg  maggiore   ; con segno\n    ja  maggiore   ; senza segno',
  table: {
    head: ['Istruzione', 'Salta se…', 'Condizione sui flag', 'Tipo'],
    rows: COND.map(([a, b, c, d]) => [a, b, c, d]),
  },
  notes: ['Dopo `cmp a, b` le condizioni si leggono "a (operatore) b": `jl` salta se a < b.'],
};

// ---------------- Direttive ----------------
const directives: Instruction[] = [
  {
    id: 'dir-db-dw', name: 'DB / DW / DUP', mnemonics: ['db', 'dw', 'dup', 'dd'], category: 'Direttive e macro',
    syntax: ['[nome] DB valore[, valore…]', '[nome] DW valore[, valore…]', 'n DUP(valore)'],
    operands: [{ form: 'costante, stringa tra apici, ? (non inizializzato)' }],
    description: 'Riservano memoria nel segmento dati. DB = byte, DW = word (2 byte). `n DUP(v)` ripete n volte il valore v. I valori vanno separati da virgole.',
    flags: NONE,
    example: 'voto db 8\ntotale dw ?\ntesto db "ciao", 13, 10, "$"\ntabella dw 10 dup(0)',
    notes: ['Tra due valori ci vuole sempre la virgola: `db 13, 10, "testo"`; dimenticarla è un errore di assemblaggio.', 'Le stringhe stampate con INT 21h/09h devono terminare con `$`.'],
  },
  {
    id: 'dir-equ', name: 'EQU / OFFSET', mnemonics: ['equ', 'offset'], category: 'Direttive e macro',
    syntax: ['nome EQU espressione', 'OFFSET variabile'], operands: [{ form: 'espressione costante' }],
    description: 'EQU definisce una costante simbolica (non occupa memoria). OFFSET fornisce l\'indirizzo di una variabile all\'interno del segmento.',
    flags: NONE, example: 'N equ 10\nmov cx, N\nmov bx, offset tabella',
  },
  {
    id: 'dir-segment', name: 'SEGMENT / ENDS / END', mnemonics: ['segment', 'ends', 'end', '.data', '.code', '.stack', '.model'], category: 'Direttive e macro',
    syntax: ['nome SEGMENT … ENDS', 'END etichetta_di_ingresso'], operands: [],
    description: 'Delimitano i segmenti del programma (dati, stack, codice). `END start` indica dove inizia l\'esecuzione.',
    flags: NONE,
    example: 'data segment\n    x db 5\nends\n\nstack segment\n    dw 128 dup(0)\nends\n\ncode segment\nstart:\n    mov ax, data\n    mov ds, ax\n    ; ...\nends\n\nend start',
    notes: ['`mov ax, data` / `mov ds, ax` serve a far puntare DS al segmento dati: senza di essi le variabili non si leggono correttamente.'],
  },
  {
    id: 'dir-proc', name: 'PROC / ENDP', mnemonics: ['proc', 'endp'], category: 'Direttive e macro',
    syntax: ['nome PROC', '…', 'RET', 'nome ENDP'], operands: [],
    description: 'Delimitano una procedura richiamabile con CALL. Il corpo deve terminare con RET.',
    flags: NONE, example: 'stampa proc\n    mov ah, 9\n    int 21h\n    ret\nstampa endp',
  },
  {
    id: 'inc-emu8086', name: 'emu8086.inc', mnemonics: ['include', 'print', 'printn', 'putc', 'scan_num', 'print_num', 'print_num_uns', 'clear_screen', 'define_scan_num', 'define_print_num', 'define_print_num_uns', 'define_clear_screen'], category: 'Direttive e macro',
    syntax: ["include 'emu8086.inc'"], operands: [],
    description: 'Libreria di macro e routine di emu8086. Le macro come PRINT sono usabili subito; le procedure vanno "definite" una volta con DEFINE_… e poi richiamate con CALL.',
    flags: 'Dipende dalla routine.',
    example: "include 'emu8086.inc'\n; ...\n    PRINT 'Ciao'      ; stampa\n    PRINTN ' a capo'  ; stampa e va a capo\n    PUTC 'A'          ; un carattere\n    call scan_num     ; numero letto in CX\n    call print_num    ; stampa AX con segno\n; in fondo:\n    DEFINE_SCAN_NUM\n    DEFINE_PRINT_NUM\n    DEFINE_PRINT_NUM_UNS",
    table: {
      head: ['Nome', 'Tipo', 'Effetto'],
      rows: [
        ['PRINT \'testo\'', 'macro', 'Stampa il testo'],
        ['PRINTN \'testo\'', 'macro', 'Stampa il testo e va a capo'],
        ['PUTC car', 'macro', 'Stampa un carattere'],
        ['SCAN_NUM', 'procedura (DEFINE_SCAN_NUM)', 'Legge un numero intero in CX'],
        ['PRINT_NUM', 'procedura (DEFINE_PRINT_NUM)', 'Stampa AX come numero con segno'],
        ['PRINT_NUM_UNS', 'procedura (DEFINE_PRINT_NUM_UNS)', 'Stampa AX come numero senza segno'],
        ['CLEAR_SCREEN', 'procedura (DEFINE_CLEAR_SCREEN)', 'Pulisce il terminale'],
      ],
    },
  },
];

export const INSTRUCTIONS: Instruction[] = [...base, jcc, ...directives].sort((a, b) => a.name.localeCompare(b.name, 'it'));

export const INSTRUCTION_CATEGORIES = [
  'Trasferimento dati',
  'Aritmetiche',
  'Logiche e bit',
  'Confronto e salti',
  'Cicli',
  'Procedure e stack',
  'Stringhe',
  'Interruzioni',
  'Controllo processore',
  'Direttive e macro',
];
