# Assembl-Easy

Emulatore **8086** che gira interamente nel browser, pensato per insegnare assembly
a chi non può installare emu8086
(che funziona solo su Windows), ad esempio su macOS, Linux o Chromebook.

Obiettivo: poter scrivere e far girare i programmi delle lezioni con un'interfaccia
moderna, senza installare nulla e con una sintassi compatibile con quella di emu8086.

## Funzionalità attuali

- **Editor** con numeri di riga, breakpoint (clic sul numero di riga) e riga corrente evidenziata.
- **Esecuzione**: Compila, Run, Single step, Step back (torna indietro di un'istruzione), Stop, Reset,
  velocità regolabile.
- **Registri** (AX, BX, CX, DX con parte alta/bassa, SI, DI, BP, SP, CS, IP, SS, DS, ES) e **flag**,
  con evidenziazione di ciò che cambia a ogni passo.
- **Memoria** esadecimale con vista ASCII, navigabile per segmento e offset.
- **Schermo** console con input da tastiera.
- **Errori di assemblaggio** evidenziati con una striscia rossa sulla riga e con un elenco cliccabile
  (istruzione sconosciuta, operandi di dimensione diversa, etichetta non definita, virgola mancante in `DB`, ecc.).
- Apri/salva file `.asm` e alcuni programmi di esempio.

### Cosa viene emulato

- Formato classico di emu8086: `data segment … ends`, `stack segment`, `code segment`, `start:`, `end start`
  (e le direttive semplificate `.data`, `.code`, `.stack`).
- Direttive: `DB`, `DW`, `DD`, `DUP`, `?`, `EQU`, `ORG`, `PROC`/`ENDP`, `OFFSET`.
- Istruzioni: `MOV`, `XCHG`, `LEA`, `PUSH`, `POP`, aritmetiche e logiche, `MUL`/`DIV` (anche con segno),
  scorrimenti e rotazioni, tutti i salti condizionati, `LOOP`, `CALL`/`RET`, istruzioni su stringhe con `REP`.
- Interruzioni: `INT 21h` (funzioni 01h, 02h, 06h, 07h, 08h, 09h, 0Ah, 0Bh, 4Ch), `INT 20h`, `INT 10h` base.
- `include 'emu8086.inc'`: `DEFINE_SCAN_NUM`, `DEFINE_PRINT_NUM`, `DEFINE_PRINT_NUM_UNS`,
  `DEFINE_CLEAR_SCREEN`, `PRINT`, `PRINTN`, `PUTC`.

### Limiti noti

- Le istruzioni non sono codificate in byte macchina: non esiste un listato esadecimale del codice
  e gli indirizzi delle istruzioni sono stimati. La memoria dei dati è invece fedele.
- Non sono emulate grafica, porte I/O (`IN`/`OUT`) e le interruzioni BIOS/DOS non elencate sopra.
- Quando manca `BYTE PTR`/`WORD PTR` (es. `mov [0100h], 10`) l'operazione è a 8 bit.

## Roadmap

1. Sezione di **esempi spiegati**, per argomento (operazioni base, salti condizionati, variabili, …).
2. **Wiki delle istruzioni**: sintassi, operandi ammessi, flag modificati, esempi.
3. **Esercizi** con consegna e **correzione automatica** tramite test (input → output/registri attesi),
   con evidenziazione delle righe errate. Nessun servizio a pagamento né backend.

## Sviluppo

Requisiti: Node.js 20 o superiore.

```bash
npm install
npm run dev      # server di sviluppo
npm test         # test dell'assemblatore e della CPU
npm run build    # build di produzione in dist/
```

Struttura:

| Percorso | Contenuto |
| --- | --- |
| `src/emu/assembler.ts` | assemblatore a due passate, errori con numero di riga |
| `src/emu/cpu.ts` | CPU 8086, flag, stack, mini-DOS e routine di `emu8086.inc` |
| `src/main.ts`, `src/style.css` | interfaccia |
| `src/examples/` | programmi di esempio caricabili dall'interfaccia |
| `tests/` | test (Vitest) con i programmi di lezione come fixture |

## Pubblicazione

Il sito è statico e viene pubblicato su **GitHub Pages** dalla GitHub Action in
`.github/workflows/deploy.yml` a ogni push su `main` (prima esegue i test). Per attivarlo:
*Settings → Pages → Build and deployment → Source: GitHub Actions*.
