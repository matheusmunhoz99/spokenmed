Plano para deixar o fluxo de visita funcionando corretamente:

1. Corrigir o erro ao salvar visita
- Ajustar os valores enviados no campo `desfecho` para bater com a regra atual do banco: `visita_realizada`, `visita_recusada`, `ausente`.
- Manter os rótulos visuais amigáveis: “Visita realizada”, “Visita recusada”, “Ausente”.
- Garantir que a visita realizada continue exigindo assinatura ou recusa, mas só no momento final de salvar.

2. Fazer a assinatura aparecer somente ao salvar
- Remover a seção fixa “Assinatura do paciente / responsável” do corpo da ficha.
- Ao tocar em “Salvar visita”, se o desfecho for “Visita realizada” e ainda não houver assinatura/recusa, abrir um modal de assinatura.
- No modal, o agente assina, confirma e toca em “OK/Salvar”, sem a área de assinatura atrapalhar a rolagem da tela.
- Manter opção de “Paciente recusou / impossibilitado de assinar” com motivo obrigatório.
- Depois da assinatura/recusa validada, continuar o fluxo normal: perguntar se deseja replicar para a família quando houver mais membros, ou salvar direto quando for registro individual.

3. Melhorar a assinatura no celular
- Ajustar o componente de assinatura para capturar a assinatura sem causar rolagem involuntária enquanto o usuário desenha.
- Usar altura responsiva menor no modal para caber melhor em telas como a do print.
- Evitar vazamento de texto/botões para fora do card em telas pequenas.

4. Remover localização do cadastro de domicílio
- Retirar o bloco de GPS obrigatório da tela “Novo Cadastro Domiciliar”.
- Remover a exigência de `geo` no salvamento do domicílio.
- Como hoje o banco exige latitude/longitude no cadastro de domicílios, criar uma migração para tornar esses campos opcionais no cadastro domiciliar.
- Ajustar o insert do domicílio para gravar latitude/longitude como `null` quando não houver captura.

5. Manter localização apenas na ficha da visita
- Preservar o bloco “Localização GPS obrigatório” na tela de nova visita.
- A visita continuará capturando latitude/longitude no ato do atendimento, exatamente como solicitado.

6. Limpar exibição de localização em domicílios
- Remover a coluna/link “GPS/mapa” da listagem de domicílios.
- Remover o link “Ver no mapa” da tela de detalhes do domicílio, ou exibi-lo somente se algum domicílio antigo ainda tiver coordenadas.

Detalhes técnicos:
- Arquivos principais: `src/routes/app.visitas.nova.tsx`, `src/routes/app.domicilios.novo.tsx`, `src/routes/app.domicilios.index.tsx`, `src/routes/app.domicilios.$id.tsx`, `src/components/signature-pad.tsx`.
- Banco: migração para permitir `NULL` em `domicilios.latitude`, `domicilios.longitude` e `domicilios.gps_capturado_em`.
- A regra do banco que causa o erro atual aceita `visita_realizada` e `visita_recusada`, mas a tela estava enviando `realizada` e `recusada`.