; multi-segment executable file template.

data segment
    ; add your data here!
    n1 db ?
    n2 db ?
    
    msg1 db "la somma dei due numeri e' piu' grande di tutto$"
    msg2 db "la somma e' minore del secondo numero alla seconda$"
    msg3 db "la somma e' piu' piccola di tutto$"
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
    mov ax, 0
    mov cx, 0
            
    mov ah, 1   ; salvataggio nella variabile del primo numero preso in input
    int 21h
    sub al, 48
    mov n1, al        
    
    mov ah, 1   ; salvataggio del secondo numero preso in input nella varibile
    int 21h
    sub al, 48
    mov n2, al 
    
    mov cl, n1
    add cl, n2  ; salvataggio della somma in CL
    
    mov al, n1
    
    mul n1
    cmp cl, al
    jle minoreDiTutto   ; controlla se e' minore di n1 in caso stampa msg3
    
    mov al, n2
    mul n2
    
    cmp cl, al
    jg maggioreDiTutto  ; controlla se la somma e' maggiore di n2^2
    
    lea dx, msg2        ; se non entra in questa condizione vuol dire che non e' maggiore di n2^2 quindi stampa msg2
    mov ah, 9h
    int 21h
    
    jmp fine
    
    maggioreDiTutto:
    lea dx, msg1
    mov ah, 9h
    int 21h
    
    jmp fine
       
    minoreDiTutto:
    lea dx, msg3
    mov ah, 9h
    int 21h 
    
    fine:
    mov ax, 4c00h ; exit to operating system.
    int 21h    
ends

end start ; set entry point and stop the assembler.
