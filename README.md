# Assembl-Easy

Emulatore **8086** che gira interamente nel browser, pensato per insegnare assembly
a chi non può installare emu8086
(che funziona solo su Windows), ad esempio su macOS, Linux o Chromebook.

Obiettivo: poter scrivere e far girare i programmi delle lezioni con un'interfaccia
moderna, senza installare nulla e con una sintassi compatibile con quella di emu8086.

## Funzionalità attuali

- **Tema chiaro / scuro** con interruttore in alto a destra: il tema predefinito è **chiaro** e non segue il
  sistema operativo; la scelta viene ricordata nel browser.
- **Editor** con sintassi colorata, numeri di riga, breakpoint (clic sul numero di riga), errori in rosso e
  due marcatori: la **prossima** istruzione (indaco) e l'**ultima eseguita** (verde). Il programma viene
  assemblato automaticamente mentre scrivi.
- **Pannelli liberi**: codice, registri, "cosa è successo", terminale, variabili, memoria e stack sono finestre
  che si possono **trascinare** (affiancare, impilare in schede, rendere fluttuanti) e **ridimensionare**; la
  disposizione iniziale è: codice e registri a sinistra, terminale e variabili a destra; "Cosa è successo",
  Memoria e Stack sono spenti e si attivano dal menu "Pannelli" (si aprono in scheda accanto al pannello affine);
  la disposizione viene ricordata nel browser e si ripristina dallo stesso menu, che permette anche di
  chiudere e riaprire ogni pannello. Il testo del terminale si ingrandisce con A+/A−.
- **Telefono**: sotto i 760 px di larghezza l'emulatore mostra una sola vista alla volta con schede in basso
  (Codice, Registri, Variabili, Terminale, …), comandi grandi e un campo di testo per la tastiera del telefono;
  il terminale si porta in primo piano quando il programma attende un input. Su computer non cambia nulla.
- **Esecuzione**: Compila, Run, Single step, Step back (torna indietro di un'istruzione), Stop, Reset,
  velocità regolabile.
- **Registri** in due tabelle: AX/BX/CX/DX con parte alta (H) e bassa (L), poi SI, DI, BP, SP, IP e segmenti; le
  righe modificate si evidenziano in verde. **Clic su un registro** (o sulla sola parte H/L) per il popup con
  esadecimale, decimale con e senza segno, binario, bit e ASCII; da lì si può anche impostare un nuovo valore.
- **Flag** (CF, ZF, SF, OF, PF, AF, DF, IF, TF) con descrizione al passaggio del mouse.
- **Cosa è successo**: per ogni istruzione eseguita, i registri, flag e celle di memoria modificati, il testo
  stampato e gli eventuali salti; cronologia delle ultime istruzioni cliccabile per tornare alla riga.
- **Variabili**: tutte le variabili dichiarate con tipo, indirizzo e valore corrente (numeri, array, stringhe),
  in decimale o esadecimale; clic su una variabile per vederla in memoria.
- **Memoria** esadecimale con vista ASCII (le variabili sono evidenziate) e **Stack** con la cima indicata da SP.
- **Terminale** con input da tastiera: quando il programma attende un tasto il cursore passa da solo al terminale
  (lo riapre se era chiuso) e i tasti premuti vanno al programma anche senza cliccare.
- **Errori di assemblaggio** evidenziati con una striscia rossa sulla riga e con un elenco cliccabile
  (istruzione sconosciuta, operandi di dimensione diversa, etichetta non definita, virgola mancante in `DB`, ecc.).
- Apri/salva file `.asm` e alcuni programmi di esempio.

### Sezioni didattiche

- **Esempi spiegati** (`#/esempi`): 17 programmi completi, raggruppati per argomento, con barra laterale di filtri
  a selezione multipla (si vedono solo gli esempi che hanno *tutti* gli argomenti scelti), ricerca e anteprima del codice. Un clic su un box apre la pagina dell'esempio:
  codice con righe numerate, spiegazioni numerate agganciate alle righe di codice (al passaggio del mouse la riga si
  illumina), risultato, guida "Provalo tu", pulsante "Apri nell'emulatore" e navigazione precedente/successivo. Ogni esempio è verificato da un test automatico.
- **Wiki delle istruzioni** (`#/wiki`): a due colonne, con l'elenco per categoria (ricercabile) a sinistra e la scheda
  dell'istruzione a destra: sintassi, flag modificati, operandi ammessi, esempio e note. Link diretti `#/wiki/mov`. Le pagine sfruttano
  tutta la larghezza dello schermo (a più colonne sui monitor grandi).
- **Esercizi** (`#/esercizi`): 19 esercizi con barra di avanzamento, filtri per argomenti (selezione multipla,
  intersezione), difficoltà e stato, con consegna, suggerimenti, soluzione nascosta e
  **correzione automatica**: il programma viene eseguito su più casi di prova (valori iniziali, input da tastiera,
  variabili/registri/output attesi) e il sito mostra quali falliscono. I progressi sono salvati nel browser.
- **Correzione** (`#/correzione`): tre colonne (impostazioni, editor grande, risultati). Si incolla il codice e il sito
  riconosce l'esercizio; si può forzare un esercizio o aggiungere i propri casi di prova. Le righe con errori di assemblaggio o di esecuzione (divisione per zero,
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

## Come funziona la correzione automatica

La correzione è **deterministica**: non usa intelligenza artificiale né servizi esterni, gira tutta nel browser e a
parità di codice dà sempre lo stesso risultato.

1. **Assemblaggio** (`src/emu/assembler.ts`). Il codice viene tradotto. Errori di sintassi, istruzioni sconosciute,
   operandi di dimensione diversa, etichette o variabili non definite, virgole mancanti in `DB`… sono riportati con il
   numero di riga e il testo si colora in rosso su quella riga. Se ci sono errori non si esegue nulla.
2. **Esecuzione di ogni caso** (`src/emu/grader.ts`). Per ogni caso di prova viene creata una macchina nuova e si
   imposta lo stato di partenza: valori iniziali delle variabili (`init`) e tasti da digitare (`input`). Si esegue fino a
   `int 21h / 4Ch`. Per sicurezza un caso si ferma dopo 100.000 istruzioni (ciclo infinito) e, dopo 3 timeout, i casi
   rimanenti non vengono nemmeno provati.
3. **Confronto**. Alla fine si confrontano i risultati con quelli attesi (`expect`): valore delle **variabili**, dei
   **registri**, testi presenti nel **terminale** (`output`, in ordine) o output **esatto** (`outputExact`). Un caso è
   superato solo se tutti i controlli sono giusti. Un errore di esecuzione (divisione per zero, overflow di `div`, input
   non previsto, ciclo infinito) fa fallire il caso e indica la riga.
4. **Struttura** (`requires`). Alcuni esercizi pretendono l'uso di certe istruzioni (es. `CALL` e `RET` per le procedure).

### I casi di prova di ogni esercizio

Cliccando **Verifica** vengono eseguiti, in quest'ordine:

| Gruppo | Origine | Scopo |
| --- | --- | --- |
| **Casi base** | scritti a mano in `src/content/exercises.ts` | i casi classici, facili da leggere |
| **Test automatici** | generati da `src/content/autotests.ts` | valori limite e valori casuali |
| **I tuoi test** | inseriti dall'utente nel riquadro "Aggiungi i tuoi casi di prova" | casi personali (facoltativi) |

I **test automatici** per ogni esercizio comprendono:

- **valori limite**: 0, 1, il massimo (255 o 65535), valori che causano riporto o overflow, numeri a cavallo del bit di
  segno (127/128, 32767/32768), elementi uguali, il massimo in ogni posizione di un array…
- **valori casuali** generati con un seme fisso derivato dall'identificativo dell'esercizio: sono diversi da un
  esercizio all'altro ma **sempre gli stessi** per tutti e a ogni verifica, quindi i risultati sono riproducibili;
- **risultato atteso calcolato con una formula indipendente** (nel codice del generatore, ad esempio
  `Math.max(a, b)` o `(a + b) & 0xffff`), **non** dal programma di riferimento: così un eventuale errore
  dell'emulatore non può "nascondersi" in un test.

Il report raggruppa i casi, mostra per i primi falliti i **valori usati** (`n1 = 200, n2 = 3`) e cosa si
aspettava (`massimo: atteso 200, ottenuto 3`), e riduce a una riga i casi superati.

### La pagina Correzione: riconoscimento automatico

Nella modalità **automatica** (predefinita) non serve scegliere l'esercizio dalla tendina:

1. **Analisi del codice** (`src/emu/analyze.ts`): variabili dichiarate (tipo, dimensione, se sono *ingressi* —lette e mai
   scritte— o *uscite* —scritte dal programma), uso della tastiera (`int 21h` con AH = 1/7/8/0Ah, `scan_num`), stampa nel
   terminale, istruzioni usate.
2. **Riconoscimento** (`src/emu/detect.ts`):
   - un esercizio con variabili è candidato se il programma le dichiara **tutte con lo stesso nome** e se esse
     costituiscono la parte principale delle variabili del programma (almeno il 60%: così `msg` da sola non fa scambiare
     un programma qualsiasi per "Ciao mondo");
   - tra i candidati si sceglie quello che supera più casi (esecuzione di un campione di test) e, a parità, quello più
     vicino alla consegna scritta;
   - un esercizio senza variabili (solo terminale) viene riconosciuto solo se il comportamento coincide (≥ 95%).
3. **Verifica completa** con tutti i test dell'esercizio riconosciuto più quelli dell'utente. Gli altri candidati con
   le stesse variabili sono proposti come pulsanti nel riquadro "Esercizio riconosciuto".
4. **Se non riconosce nulla**: nessun confronto con risultati attesi (non esistono), ma **esplorazione**: il programma è
   eseguito con valori limite e casuali per gli ingressi e con sequenze di tasti, e si mostra una tabella *valori →
   variabili modificate, terminale, esito*; si evidenziano in rosso solo errori veri (divisione per zero, ciclo infinito).

### Quale riga è sbagliata? (`src/emu/localize.ts`)

Quando i test falliscono la riga colpevole viene evidenziata con una **barra rossa** (con ✕ sul numero di riga):

- **errori di assemblaggio** e **errori a runtime** (divisione per zero, ciclo infinito…) sono segnati direttamente, anche
  nell'emulatore;
- per gli **errori logici** si usa una *riparazione per mutazione*: per ogni istruzione si provano piccole modifiche
  plausibili (altra condizione di salto, `ADD`↔`SUB`, altro registro, costante ±1/×2/÷2, operandi invertiti, altra
  variabile, istruzione tolta) e si riesegue la batteria di test. Se **una sola** modifica a una riga fa passare tutti i
  test, quella riga è la colpevole ("Riga sbagliata"); il suggerimento con la modifica è nascosto dietro un pulsante;
- se più righe sono sbagliate e nessuna modifica singola basta, si indica la riga che migliora di più oppure quella che
  scrive nella variabile (o stampa) il valore sbagliato.

### Verifica dei test (`npm test`)

- ogni esercizio: la soluzione di riferimento supera **tutti** i casi base e automatici;
- una serie di **soluzioni sbagliate plausibili** ("mutanti": salto con segno invece che senza, somma a 8 bit, ultimo
  elemento ignorato, 0! non gestito…) deve essere **scoperta** dai soli test automatici;
- un ciclo infinito viene fermato e segnalato in pochi millisecondi.

### Aggiungere un esercizio

In `src/content/exercises.ts` aggiungi un elemento a `EXERCISES`: `data` (dichiarazioni), `solutionBody`
(soluzione di riferimento) e `tests` (valori iniziali `init`, `input`, e attese `vars`/`regs`/`output`).
In `src/content/autotests.ts` aggiungi un generatore con lo stesso `id`: valori limite + casuali e formula del
risultato atteso. `npm test` verifica che la soluzione superi tutti i test e che il codice di partenza no.

## Pubblicazione

Il sito è statico e viene pubblicato su **GitHub Pages** dalla GitHub Action in
`.github/workflows/deploy.yml` a ogni push su `main` (prima esegue i test). Per attivarlo:
*Settings → Pages → Build and deployment → Source: GitHub Actions*.
