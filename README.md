# Assembl-Easy

Emulatore **8086** che gira interamente nel browser, pensato per insegnare assembly
a chi non può installare emu8086
(che funziona solo su Windows), ad esempio su macOS, Linux o Chromebook.

Obiettivo: poter scrivere e far girare i programmi delle lezioni con un'interfaccia
moderna, senza installare nulla e con una sintassi compatibile con quella di emu8086.

## Funzionalità attuali

- **Editor** con sintassi colorata, numeri di riga, breakpoint (clic sul numero di riga), errori in rosso e
  due marcatori: la **prossima** istruzione (indaco) e l'**ultima eseguita** (verde). Il programma viene
  assemblato automaticamente mentre scrivi.
- **Esecuzione**: Compila, Run, Single step, Step back (torna indietro di un'istruzione), Stop, Reset,
  velocità regolabile.
- **Registri** a schede: AX/BX/CX/DX con parte alta e bassa, SI, DI, BP, SP, IP e segmenti; i valori modificati
  si evidenziano in verde. **Clic su un registro** per il popup con esadecimale, decimale (con e senza segno),
  binario bit per bit, ASCII e distinzione tra parte alta e bassa; da lì si può anche impostare un nuovo valore.
- **Flag** (CF, ZF, SF, OF, PF, AF, DF, IF, TF) con descrizione al passaggio del mouse.
- **Cosa è successo**: per ogni istruzione eseguita, i registri, flag e celle di memoria modificati, il testo
  stampato e gli eventuali salti; cronologia delle ultime istruzioni cliccabile per tornare alla riga.
- **Variabili**: tutte le variabili dichiarate con tipo, indirizzo e valore corrente (numeri, array, stringhe),
  in decimale o esadecimale; clic su una variabile per vederla in memoria.
- **Memoria** esadecimale con vista ASCII (le variabili sono evidenziate) e **Stack** con la cima indicata da SP.
- **Schermo** console con input da tastiera.
- **Errori di assemblaggio** evidenziati con una striscia rossa sulla riga e con un elenco cliccabile
  (istruzione sconosciuta, operandi di dimensione diversa, etichetta non definita, virgola mancante in `DB`, ecc.).
- Apri/salva file `.asm` e alcuni programmi di esempio.

### Sezioni didattiche

- **Esempi spiegati** (`#/esempi`): 17 programmi completi, raggruppati per argomento, con filtri a selezione
  multipla (si vedono solo gli esempi che hanno *tutti* gli argomenti scelti). Un clic su un box apre la pagina dell'esempio
  con codice, spiegazione delle righe chiave, pulsante "Apri nell'emulatore" e navigazione indietro/avanti. Ogni esempio è verificato da un test automatico.
- **Wiki delle istruzioni** (`#/wiki`): per ogni istruzione e direttiva sintassi, operandi ammessi, flag modificati,
  esempio e note; con ricerca e filtro per categoria. Link diretti del tipo `#/wiki/mov`.
- **Esercizi** (`#/esercizi`): 19 esercizi, filtrabili per argomenti (selezione multipla, intersezione) e difficoltà, con consegna, suggerimenti, soluzione nascosta e
  **correzione automatica**: il programma viene eseguito su più casi di prova (valori iniziali, input da tastiera,
  variabili/registri/output attesi) e il sito mostra quali falliscono. I progressi sono salvati nel browser.
- **Correzione** (`#/correzione`): si incolla il codice e si sceglie un esercizio del catalogo oppure si
  definiscono i propri casi di prova. Le righe con errori di assemblaggio o di esecuzione (divisione per zero,
  ciclo infinito, …) sono evidenziate in rosso.

La correzione è **deterministica e senza servizi esterni**: nessun costo e nessun backend. Non verifica la
"bellezza" del codice, ma che produca i risultati attesi.

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

1. Più esempi ed esercizi (stringhe, array bidimensionali, procedure con parametri sullo stack, …).
2. Grafica e miglioramento delle funzionalità dell'emulatore.
3. Eventuale commento automatico degli errori logici con un modello linguistico (opzionale, richiederebbe un backend).

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
| `src/emu/grader.ts` | correttore: esegue un programma su casi di prova e confronta i risultati |
| `src/content/` | contenuti didattici: `examples.ts`, `instructions.ts` (wiki), `exercises.ts` |
| `src/pages/` | pagine: emulatore, esempi, wiki, esercizi, correzione |
| `src/ui/` | componenti condivisi (editor con righe evidenziate, evidenziazione sintassi, report) |
| `src/main.ts`, `src/style.css` | router e stile |
| `tests/` | test (Vitest): programmi di lezione, esempi, esercizi con le loro soluzioni, wiki |

### Aggiungere un esercizio

In `src/content/exercises.ts` aggiungi un elemento a `EXERCISES`: `data` (dichiarazioni), `solutionBody`
(soluzione di riferimento) e `tests` (valori iniziali `init`, `input`, e attese `vars`/`regs`/`output`).
`npm test` verifica che la soluzione superi tutti i test e che il codice di partenza no.

## Pubblicazione

Il sito è statico e viene pubblicato su **GitHub Pages** dalla GitHub Action in
`.github/workflows/deploy.yml` a ogni push su `main` (prima esegue i test). Per attivarlo:
*Settings → Pages → Build and deployment → Source: GitHub Actions*.
