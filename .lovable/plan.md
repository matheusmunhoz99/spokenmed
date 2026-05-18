## Problema

Para o CPF 245.713.528-16, o worker do Fiorilli devolveu:

- `cns: ""`
- `cns_secundario: "700901907579199"`

O Fiorilli tem dois slots de CNS (O11E7 = principal, O11E3 = secundário). Nesse paciente o número veio só no slot secundário. O formulário em `src/routes/app.pacientes.tsx` lê apenas `dados.cns`, então o campo CNS fica em branco mesmo com o dado disponível.

## Correção

**Arquivo:** `src/routes/app.pacientes.tsx`, lista `pairs` do preenchimento mágico (linha ~373).

Trocar:

```ts
["cns", dados.cns],
```

por:

```ts
["cns", dados.cns || dados.cns_secundario || (dados as any).outro_cns || ""],
```

Assim o campo CNS é preenchido com o primeiro valor não-vazio entre `cns`, `cns_secundario` e `outro_cns`, cobrindo todos os formatos de retorno do Fiorilli.  
  
EU QUERO QUE PUXE OS DOIS O SECUNDADO E O OUTRO_CNS, ADICIONE O CAMPO NO MEU SISTEMA E PUXE OS DADOS E SALVE NO BANCO SEMPRE OS DOIS SE TIVER, SE TIVER SÓ UM TRAZ SÓ UM, SE TIVER DOIS OS DOIS

## Fora de escopo

- Worker / `opp-client.server.ts` — o dado já chega correto, não precisa mudar.
- Outros campos do formulário — só o CNS apresenta esse comportamento de slot duplo.