## Diagnóstico

O erro mostrado no print é real e a causa está no banco:

- A tela `/app/agendar` insere um registro em `agendamentos` sem enviar `codigo`.
- A coluna `agendamentos.codigo` tem `DEFAULT public.gen_agendamento_codigo()`.
- A função `public.gen_agendamento_codigo()` teve permissão de execução removida para usuários logados.
- Resultado: no momento do insert, o banco tenta gerar o código e bloqueia com `permission denied for function gen_agendamento_codigo`.

Também encontrei um segundo problema ligado ao mesmo ponto:

- O trigger `fn_ag_set_codigo()` também chama `gen_agendamento_codigo()` e não está como `SECURITY DEFINER`.
- Mesmo que o default fosse removido, o trigger ainda poderia falhar dependendo do caminho de execução.

## Plano de correção

1. Corrigir a geração do código do agendamento no banco
   - Recriar `public.gen_agendamento_codigo()` como função interna segura.
   - Recriar `public.fn_ag_set_codigo()` como `SECURITY DEFINER`, com `search_path` fixo.
   - Manter `EXECUTE` revogado para `anon` e usuários comuns, porque a função não deve ser chamada diretamente pela interface.
   - Remover o `DEFAULT gen_agendamento_codigo()` da coluna `agendamentos.codigo`, para o insert não tentar executar a função como usuário comum.
   - Deixar a geração do código exclusivamente pelo trigger antes do insert.

2. Corrigir a tela de agendamento para evitar operação duplicada de slot
   - Hoje a tela atualiza `slots.status = reservado` antes de inserir `agendamentos`.
   - O trigger `fn_ag_reserva_slot()` também tenta reservar o slot no insert.
   - Vou remover a reserva manual do frontend e deixar o banco fazer a reserva atomicamente, evitando inconsistência e erro falso de vaga indisponível.
   - Se o insert falhar, não será mais necessário tentar liberar o slot manualmente.

3. Melhorar a mensagem de erro da tela
   - Em vez de mostrar erro cru do banco, mapear erros conhecidos:
     - `slot_indisponivel` → “Esse horário acabou de ser reservado. Escolha outro.”
     - `slot_incoerente` → “Horário inválido para os filtros selecionados.”
     - erro de permissão → “Sem permissão para agendar nesta unidade.”
   - Manter logs técnicos no console apenas para depuração.

4. Validar com testes reais após aplicar
   - Criar um agendamento pela tela `/app/agendar`.
   - Confirmar que o código foi gerado.
   - Confirmar que o slot mudou para reservado.
   - Confirmar que aparece na agenda do dia.
   - Cancelar/reagendar e validar que o slot antigo é liberado e o novo reservado.
   - Conferir logs do banco e do navegador após o teste.

## Arquivos/áreas afetadas

- Nova migration de banco para corrigir funções, trigger e default da coluna `codigo`.
- `src/routes/app.agendar.tsx` para deixar o banco controlar a reserva do slot e melhorar o tratamento de erro.

## Resultado esperado

Depois disso, o agendamento normal não deve mais falhar por `gen_agendamento_codigo`, e a reserva de vaga ficará centralizada no banco, reduzindo risco de duplicidade e inconsistência.