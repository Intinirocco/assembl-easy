; multi-segment executable file template.

data segment
    ; add your data here!
    pkey db "press any key...$"
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

    ; Esercizio 1 A
    mov [0100h], 10
    mov al, [0100h]
    mov [0101h], al 
    
    ; Esercizio 1 B
    mov [0100h], 10
    mov ax, [0100h]
    mov [0102h], ax
    
    ; Esercizio 2 A
    mov bx, 0100h
    mov al, [bx]
    inc [bx]
    mov [bx], al
    
    ; Esercizio 2 B
    mov bx, 0100h
    mov ax, [bx]
    inc [bx]
    inc [bx]
    mov [bx],  ax
            
    lea dx, pkey
    mov ah, 9
    int 21h        ; output string at ds:dx
    
    ; wait for any key....    
    mov ah, 1
    int 21h
    
    mov ax, 4c00h ; exit to operating system.
    int 21h    
ends

end start ; set entry point and stop the assembler.
