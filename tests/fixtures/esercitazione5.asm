; multi-segment executable file template.

data segment
    ; add your data here!
    pkey db "press any key...$" 
    n1 dw ? 
    n2 dw ?
    somma dw ? 
    sottrazione dw ?
    moltiplicazione dw ? 
    divisione dw ?
    resto dw ?
    msg1 db 13,10, "inserisci il primo numero: $"
    msg2 db 13,10, "inserisci il secondo numero: $" 
    msg3 db 13,10, "la somma e': $"
ends

stack segment
    dw   128  dup(0)
ends

code segment
start: 
include 'emu8086.inc'
DEFINE_CLEAR_SCREEN
DEFINE_SCAN_NUM  
DEFINE_PRINT_NUM
DEFINE_PRINT_NUM_UNS
; set segment registers:
    mov ax, data
    mov ds, ax
    mov es, ax

    lea dx, msg1
    mov ah, 9
    int 21h 
    
    call scan_num  ;prelevo un numero a 16 bit
    mov n1, cx     
    
    lea dx, msg2
    mov ah, 9
    int 21h 
    
    call scan_num  ;prelevo un numero a 16 bit
    mov n2, cx
    
    lea dx, msg3
    mov ah, 9
    int 21h 
    mov ax, n1
    add ax, n2
    call print_num 
            
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
