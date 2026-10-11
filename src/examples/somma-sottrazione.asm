; multi-segment executable file template.

data segment
    ; add your data here!
    n1 dw 37
    n2 dw 15
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
    mov ax, n1
    mov bx, n2
    
    mov cx, ax
    add cx, bx  ;somma tra CX (che e' AX) e BX salvata in CX
    
    mov dx, ax
    sub dx, bx  ;sottrazione tra DX(n1) e BX salvata in DX
    
    mov ax, 4c00h ; exit to operating system.
    int 21h    
ends

end start ; set entry point and stop the assembler.
