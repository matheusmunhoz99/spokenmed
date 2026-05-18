## Objetivo
Criar dois novos perfis de usuário e os fluxos correspondentes:
1. **Triagem** — profissional que faz triagem/classificação de risco dos pacientes da fila/recepção.
2. **ACS (Agente Comunitário de Saúde)** — usa o celular para registrar visita domiciliar nos moldes da Ficha de Visita Domiciliar do PEC e-SUS CDS, com GPS e assinatura do paciente, salvando no prontuário.

---

## 1. Banco de dados (migração)

### 1.1. Novos roles
```sql
ALTER TYPE app_role ADD VALUE 'triagem';
ALTER TYPE app_role ADD VALUE 'acs';
```

### 1.2. Tabela `visitas_domiciliares`
Campos do CDS de Visita Domiciliar do e-SUS PEC (fielmente):
- `id`, `created_at`, `updated_at`
- `paciente_id` (FK pacientes)
- `acs_user_id` (uuid — quem fez a visita)
- `unidade_id`
- `data_visita` (date), `turno` (enum: manha/tarde/noite)
- **Motivo da visita** (multi-select — jsonb/array): cadastramento/atualização, visita periódica, busca ativa (consulta/exame/vacina/condicionada), acompanhamento (gestante, puérpera, RN, criança, pessoa com desnutrição/reabilitação/acamado/domiciliado/tabagista/condições crônicas/saúde mental/outros), controle ambiental/vetorial, convite atividades coletivas/campanha, orientação/prevenção, outros
- **Acompanhamento** (multi-select): hipertensão, diabetes, gestante, asma, DPOC, hanseníase, tuberculose, domiciliados/acamados, saúde mental, usuário álcool/drogas, etc.
- **Controle ambiental/vetorial** (multi-select): ações de combate ao Aedes, etc.
- `desfecho` (enum: visita_realizada, visita_recusada, ausente)
- `anti_vetorial` (bool — se foi visita compartilhada com agente endemias)
- `peso` (numeric, opcional), `altura` (numeric, opcional), `pa_sistolica`, `pa_diastolica` (para gestantes/hipertensos)
- **GPS**: `latitude` (numeric), `longitude` (numeric), `gps_accuracy` (numeric, metros), `gps_capturado_em` (timestamptz)
- `endereco_visitado` (text — snapshot do endereço no momento)
- `observacoes` (text)
- `assinatura_paciente` (text — base64 PNG da assinatura)
- `assinatura_paciente_em` (timestamptz)
- `assinatura_recusada` (bool — paciente recusou assinar)

RLS:
- ACS vê/insere apenas as visitas que ele mesmo fez (`acs_user_id = auth.uid()`).
- Admin/médico/triagem podem ver visitas dos pacientes da sua unidade.
- Apenas o ACS autor pode editar nas primeiras 24h; depois fica imutável.

### 1.3. Permissões de Triagem
Triagem precisa:
- ler/atualizar `fila_espera` (classificação de risco, observações)
- ler/atualizar `agendamentos.classificacao_risco`, `triagem_em`, `triagem_por`, `status=em_triagem/triado`
- ler `pacientes`
Adicionar à função `private.is_authenticated_staff` o role `triagem` e `acs`.

### 1.4. Storage
Bucket `assinaturas-visitas` (privado) — opcional; ou salvar a assinatura inline na coluna `assinatura_paciente` (base64) se o tamanho for ok (~5–20 KB). **Recomendação: inline** para simplicidade.

---

## 2. Frontend

### 2.1. Rotas novas
- `src/routes/app.triagem.tsx` — fila pendente de triagem, abrir paciente → classificar risco (vermelho/laranja/amarelo/verde/azul), registrar queixa, sinais vitais básicos, observações; ao salvar muda status para `triado`.
- `src/routes/app.visitas.tsx` — lista das visitas do ACS logado, filtro por data/paciente, botão "Nova visita".
- `src/routes/app.visitas.nova.tsx` — formulário completo (mobile-first) da ficha de visita domiciliar com:
  - Busca de paciente (por nome/CPF/CNS, dentre os cadastrados)
  - Todos os campos do CDS (seções colapsáveis: Motivo, Acompanhamento, Antropometria/PA, Desfecho)
  - Botão **"Capturar localização"** usando `navigator.geolocation.getCurrentPosition` (alta precisão) — mostra coordenadas e precisão em metros; permite recapturar
  - Componente **Assinatura** (canvas touch — biblioteca `react-signature-canvas` já no padrão usado pelo projeto, ou implementação inline com `<canvas>` e ponteiros) com botões "Limpar", "Salvar assinatura" e "Paciente recusou assinar"
  - Salvar → insert em `visitas_domiciliares`
- `src/routes/app.visitas.$id.tsx` — visualização read-only da visita (para prontuário, impressão).

### 2.2. Prontuário do paciente
Em `app.pacientes.tsx` (detalhe do paciente), adicionar aba/seção **"Visitas domiciliares"** listando as visitas (data, ACS, motivo, desfecho) com link para a visualização.

### 2.3. Sidebar e gating
- `src/components/app-sidebar.tsx`: novos itens condicionais por role:
  - **Triagem** → vê: Painel, Recepção, Fila, Triagem, Pacientes
  - **ACS** → vê apenas: Painel (resumo dele), Visitas, Pacientes (read-only)
- `src/hooks/use-auth.ts` (ou equivalente): expor o role; criar helpers `isTriagem`, `isAcs`.
- Bottom nav mobile (`mobile-bottom-nav.tsx`): para ACS mostrar atalhos "Nova visita" + "Minhas visitas".

### 2.4. Criação dos usuários
Em **Configurações → Usuários** (ou Profissionais), permitir admin criar usuário com role `triagem` ou `acs`, atribuindo unidade(s). Se essa tela ainda não existir para roles arbitrários, ajustar o seletor de role.

---

## 3. Detalhes técnicos relevantes

- **GPS**: `getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })`. Tratar erros (permissão negada, indisponível) com toast e permitir salvar sem GPS marcando `gps_indisponivel`.
- **Assinatura**: canvas 100% width, altura ~200px, suporte a touch + mouse, exportar `toDataURL('image/png')`. Validar tamanho < 50 KB.
- **Offline (fora de escopo desta rodada)**: a visita será online-only por enquanto; PWA/offline pode entrar numa rodada futura.
- **Imutabilidade**: trigger `fn_visita_imutavel` que bloqueia UPDATE após 24h, similar ao padrão de `receitas`.
- **Auditoria**: ativar trigger `fn_audit_row` em `visitas_domiciliares`.

---

## 4. Entregáveis desta rodada

1. Migração SQL (enum + tabela + RLS + triggers + helper updates).
2. Rotas `/app/triagem`, `/app/visitas`, `/app/visitas/nova`, `/app/visitas/$id`.
3. Componente reutilizável `SignaturePad` e `GeolocationCapture`.
4. Aba "Visitas domiciliares" no detalhe do paciente.
5. Sidebar/menu atualizados com gating por role.
6. Tela de admin para criar usuário escolhendo role `triagem` ou `acs` e atribuir unidade.

---

## Perguntas antes de implementar
1. **Triagem** — quais sinais vitais devem ser registrados? (sugiro: PA, FC, FR, T°, SatO₂, glicemia, dor 0–10). Confirma?
2. **Assinatura do paciente** — obrigatória sempre, ou permitido marcar "recusou assinar" / "paciente impossibilitado"?
3. **Visita sem GPS** — permitir salvar quando o paciente negar permissão de localização, ou bloquear?
4. **Foto da visita** — quer permitir o ACS anexar fotos (fachada, situação) à ficha? (Aumenta escopo — bucket de storage + upload.)
