## Diagnóstico

No HAR do clique manual no menu "Ambulatório" (entry #22):
```
Obj=O106 Evt=itemclick id=1 _uo_=OCC
_fp_=%26O10A%3D%25020%2502%2502%25031%2503
```

Decodificado, o `_fp_` é: `&O10A=\x020\x02\x02\x031\x03` — formato uniGUI para o estado do tree node selecionado (componente O10A, value=`\x031\x03` que é ETX+"1"+ETX).

Meu agente atual manda o `itemclick` **sem** `_fp_`. O uniGUI ignora o clique e devolve body vazio (= bug `não achei URL do ambulatorio`).

## Plano

Editar **`spokenmed-agent/agent.py`** — só uma linha:

Trocar:
```python
itemclick = (
    f"Ajax=1&IsEvent=1&Obj=O106&Evt=itemclick&id=1"
    f"&_S_ID={sid}&_seq_={next_seq:x}&_uo_=OCC"
)
```

Por:
```python
ETX = "\x03"
fp_tree_raw = f"&O10A={STX}0{STX}{STX}{ETX}1{ETX}"
fp_tree = up.quote(fp_tree_raw, safe="")
itemclick = (
    f"Ajax=1&IsEvent=1&Obj=O106&Evt=itemclick&id=1"
    f"&_S_ID={sid}&_fp_={fp_tree}&_seq_={next_seq:x}&_uo_=OCC"
)
```

(O `STX` já tá declarado no escopo de cima do `login_e_captura_sid`.)

Depois rebuildar o `/mnt/documents/spokenmed-agent.zip` com `runtime/agent.py` atualizado.

## Validação

Você extrai o zip novo (substituir tudo), roda `Iniciar Agente.bat` e me cola o log. Esperado:
```
→ POST O106 itemclick id=1 (abrir ambulatorio) (seq=11)
   → URL ambulatorio capturada (XX chars)
→ GET /ambulatorio (SSO via token)
   _S_ID ambulatorio = ...
→ POST [amb] cinfo (seq=0)
...
✓ ambulatorio pronto — sid=...
✓ Worker atualizado: {...}
```

Se ainda vier `resp=` vazia, aí vou precisar adicionar também os eventos de setup que o navegador faz antes do itemclick (afterrender OD4, tabchange OE5/O34C, load O106, resize O3B1 — entries #16-21 do HAR). Começo pela correção mínima primeiro porque o `_fp_` é o sintoma mais óbvio.