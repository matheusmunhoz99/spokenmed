## Problema

A tabela `fila_espera` foi criada sem foreign keys para as tabelas relacionadas. As queries da página `/app/fila` usam joins embutidos do PostgREST (`pacientes(...)`, `especialidades(...)`), e sem FKs declaradas o servidor responde com erro 400:

```
PGRST200: Could not find a relationship between 'fila_espera' and 'pacientes'
```

Resultado: lista fica em loading e nunca mostra nada, mesmo após F5 e mesmo com pacientes inseridos (o INSERT funciona, mas o SELECT com join falha).

## Correção

Migration única adicionando as FKs que estavam faltando:

- `fila_espera.paciente_id` → `pacientes(id)` ON DELETE CASCADE
- `fila_espera.unidade_id` → `unidades(id)` ON DELETE CASCADE
- `fila_espera.especialidade_id` → `especialidades(id)` ON DELETE RESTRICT
- `fila_espera.agendamento_id` → `agendamentos(id)` ON DELETE SET NULL
- `fila_espera.criado_por` → `auth.users(id)` ON DELETE SET NULL

Sem mudança de código no frontend — assim que as FKs existirem, o PostgREST resolve o relacionamento e a página funciona como esperado (carregamento, posição em tempo real e ações).

## Arquivos

**Novos**
- `supabase/migrations/<timestamp>_fila_espera_fks.sql`

Nenhum arquivo editado.