; multi-segment executable file template.

data segment
    ; add your data here!
    n1 db ?
    n2 db 6
    msg db "Il prodotto e' maggiore di 36$"
ends

stack segment
    dw   128  dup(0)
ends

code segment
start:
; set segment registers:
    mov ax, data
    mov ds, ax
    mov es, ax

    ; add your code here
    mov ah, 1
    int 21h   
    sub al, 48  ; conversione da ascii a decimale
    mov n1, al  ; salvataggio del numero preso in input in AL 
    
    mov bl, n2
    mul bl      ; moltiplica AL con BL
    mov cl, al  ; salva il risultato in CL
    
    cmp cl, 36
    jg maggiore ; se maggiore di 36 andra' a eseguire il blocco maggiore:
    
    mov ah, 0   ; se non e' maggiore salva 0 in AH e va al blocco fine:
    jmp fine
    
    maggiore:
    lea dx, msg
    mov ah, 9
    int 21h
    
    fine:
    mov ax, 4c00h ; exit to operating system.
    int 21h    
ends

end start ; set entry point and stop the assembler.
