## Diagnóstico do bug "Nova visita não abre"

O arquivo `src/routes/app.visitas.tsx` é uma rota-folha que renderiza a lista de visitas direto, mas como existe um filho (`app.visitas.nova.tsx`), o TanStack Router trata `app.visitas` como **rota-pai/layout**. Pais com filhos **precisam ter `<Outlet />`** — sem isso o navegador troca de URL, mas a tela continua mostrando a lista (parece que "nada acontece"). Não é problema de permissão (verifiquei: ACS tem `visitas can_manage = true` no banco).

## O que vou entregar

### 1. Corrigir o bug da rota
Reestruturar as rotas de visitas:
- `src/routes/app.visitas.tsx` vira **layout** (só `<Outlet />` + guard de permissão).
- Mover a lista atual para `src/routes/app.visitas.index.tsx`.
- `app.visitas.nova.tsx` continua igual (passa a renderizar corretamente dentro do Outlet).
- Mesma correção aplicada nas novas rotas de domicílios.

### 2. Cadastro Domiciliar / Territorial (modelo PEC CDS)

#### Modelo de dados (migração)
- **`domicilios`** — uma "casa" com:
  - endereço completo (CEP, logradouro, número, complemento, bairro, cidade, UF),
  - GPS (lat/lng/precisão/capturado_em),
  - tipo de imóvel, tipo de domicílio, situação de moradia,
  - nº de moradores, nº de cômodos/dormitórios,
  - água (abastecimento + tratamento), esgoto, lixo, energia,
  - animais no domicílio (jsonb), material das paredes,
  - unidade_id (UBS responsável), acs_user_id (quem cadastrou),
  - microárea, família de referência.
- **`familias`** — núcleo familiar dentro do domicílio:
  - prontuário familiar (código), renda familiar, qtd. membros, em situação de rua (bool), Bolsa Família (bool),
  - responsável familiar (paciente_id).
- **`familia_membros`** — vínculo `familia_id` ↔ `paciente_id` + parentesco com o responsável.
- Coluna nova em `visitas_domiciliares`: `domicilio_id` (uuid, nullable) e `familia_id` (uuid, nullable) — visita passa a poder ser ligada ao domicílio/família, não só ao paciente.
- RLS:
  - ACS lê/escreve apenas registros que ele cadastrou (`acs_user_id = auth.uid()`).
  - Staff da unidade lê tudo da própria unidade.
  - Admin lê/escreve tudo.
- Trigger de imutabilidade após 24h (mesma regra das visitas), exceto admin.

#### Permissões
- Novo módulo `domicilios` em `src/lib/permissions.ts`.
- ACS: `view + manage`. Admin: tudo. Demais perfis: `view` (somente leitura, pra equipe ver os cadastros).
- Atualizar `defaultPermsFor` e inserir as linhas em `user_permissions` para os usuários ACS/triagem/admin existentes.

#### Telas (mobile-first, mesmo padrão das visitas)
- **`/app/domicilios`** — lista dos domicílios cadastrados pelo ACS (endereço, nº moradores, microárea, ações).
- **`/app/domicilios/novo`** — formulário do **Cadastro Domiciliar CDS**:
  1. Endereço (com ViaCEP) + GPS obrigatório.
  2. Características do imóvel (tipo, paredes, água, esgoto, lixo, energia, cômodos, animais).
  3. Família(s) que moram no domicílio: cria a família, vincula moradores (busca pacientes por nome/CPF, ou cria paciente novo rápido), define parentesco e o responsável familiar.
  4. Observações.
  5. Assinatura do responsável (opcional, mesmo componente da visita) + foto opcional da fachada.
- **`/app/domicilios/$id`** — visualização do domicílio com membros, ações: editar (≤24h), nova visita pré-preenchida.

#### Nova visita ligada à família/domicílio
- Em `/app/visitas/nova`, antes de buscar paciente, opção:
  - **"Selecionar domicílio"** → lista os domicílios do ACS → escolhe a família → escolhe o morador que está sendo visitado (pré-preenche endereço/GPS sugerido).
  - **"Visita avulsa"** → fluxo atual (busca paciente direto).
- Salva `domicilio_id` e `familia_id` no registro da visita quando vier por esse fluxo.

### 3. Navegação
- Sidebar e barra inferior (ACS): adicionar **"Domicílios"** entre Início e Visitas.
- Sidebar (admin): grupo "Atenção Básica" com Domicílios + Visitas (read-only para visualização da equipe da UBS).

## Fora de escopo (avisar se precisar depois)
- Ficha de Cadastro Individual completa do CDS (campos como escolaridade, ocupação, deficiências, gestação, condições crônicas no paciente — hoje só temos os básicos em `pacientes`).
- Microáreas/áreas de abrangência cadastráveis (vamos usar campo livre `microarea text` por enquanto; cadastro estruturado pode vir num próximo passo).
- Sincronização offline (PWA) das visitas — fica para depois.

## Arquivos que serão criados/alterados

```text
supabase/migrations/<novo>.sql          (domicilios, familias, familia_membros, alter visitas, RLS, trigger, módulo domicilios em user_permissions)
src/lib/permissions.ts                   (+ módulo "domicilios" e defaults)
src/lib/domicilios-constants.ts          (opções: tipo imóvel, abastecimento, esgoto, lixo, parentesco...)
src/routes/app.visitas.tsx               (vira layout com Outlet)
src/routes/app.visitas.index.tsx         (lista — conteúdo atual da visitas.tsx)
src/routes/app.domicilios.tsx            (layout com Outlet)
src/routes/app.domicilios.index.tsx      (lista)
src/routes/app.domicilios.novo.tsx       (formulário CDS)
src/routes/app.domicilios.$id.tsx        (detalhe)
src/routes/app.visitas.nova.tsx          (adicionar seletor de domicílio/família, salvar IDs)
src/components/app-sidebar.tsx           (item Domicílios)
src/components/mobile-bottom-nav.tsx     (item Domicílios para ACS)
src/hooks/use-auth.tsx                   (sem mudança estrutural — só se módulo novo exigir flag)
```
