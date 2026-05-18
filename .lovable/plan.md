## Diagnóstico

Seu log para em:
```
✓ login OK — sessão pronta (último seq usado=a)
```

Esse texto é da **versão antiga** do `agent.py`. A nova (Fase A) imprime:
```
✓ /sis/ login OK — abrindo sub-app ambulatorio…
→ POST O106 itemclick id=1 (abrir ambulatorio) ...
→ GET /ambulatorio (SSO via token)
```

**Causa:** o `Iniciar Agente.bat` executa `runtime\agent.py`, mas o zip anterior colocava o `agent.py` novo na **raiz** da pasta. O `runtime\agent.py` antigo nunca foi sobrescrito.

## Plano

1. Regerar `/mnt/documents/spokenmed-agent.zip` com o `agent.py` novo **dentro de `runtime/`** (caminho `runtime/agent.py`), além da raiz, para que extrair com "substituir tudo" funcione direto.
2. Acrescentar no `LEIA-ME.txt` uma linha curta: *"Ao atualizar, sobrescreva também `runtime\agent.py`."*
3. Você baixa o zip novo, extrai por cima da pasta `SpokenMED-Agente` (substituir tudo), abre `Iniciar Agente.bat` e me cola o `agent.log` novo — ele agora deve mostrar os passos do ambulatorio (itemclick, GET ambulatorio, novo `_S_ID`, cinfo/afterrender/resize) e os polls `_dummy_` da Fase A.

Nenhuma mudança no app web, Worker ou lógica do agente — só empacotamento.
