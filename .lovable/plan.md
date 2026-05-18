## Criar usuário médico vinculado a um profissional existente

Vou usar o **Dr Carlos Alberto** (CRM 2333/RJ, Clínica Médica) — é o cadastro mais completo que você já tem.

### Credenciais propostas
- **E-mail:** `carlos.alberto@spokenmed.local`
- **Senha:** `Spoken@Carlos2026`
- **Nome:** Dr. Carlos Alberto
- **Conselho:** CRM 2333/RJ
- **Especialidade:** Clínica Médica
- **CBO:** 225125 (Médico clínico)
- **RQE:** 12345
- **Telefone:** (21) 99999-2333

### Passos (executados via SQL/RPC após aprovação)

1. **Criar usuário no Auth** (`auth.users`) já com e-mail confirmado e `raw_user_meta_data` contendo `nome` e `cargo: "medico"`.
2. **Trigger `handle_new_user`** cria automaticamente:
   - linha em `public.profiles` (nome + cargo)
   - role em `public.user_roles` (será `recepcionista` por padrão — vou ajustar para `medico` logo em seguida).
3. **Atualizar `public.profiles`** preenchendo: `conselho_tipo=CRM`, `conselho_numero=2333`, `conselho_uf=RJ`, `cbo=225125`, `especialidade=Clínica Médica`, `rqe=12345`, `telefone`. O trigger `fn_profile_set_assinatura_secret` gera automaticamente o `assinatura_secret` (chave HMAC para assinar PDFs).
4. **Atualizar `user_roles`** → `role=medico`.
5. **Vincular ao profissional existente:** `UPDATE profissionais SET user_id=<novo_uuid>, email='carlos.alberto@spokenmed.local' WHERE id='3fe0f1ff-...'`.
6. **Vincular às unidades** (`user_unidades` + `profissional_unidades`) — vou listar todas as unidades ativas no momento da execução e vincular a todas, ou me diz se prefere uma específica.

### Entrega
Depois de rodar, te devolvo aqui em texto:
- E-mail + senha
- URL de login
- Confirmação de que assinatura digital já está habilitada nos PDFs dele

### Quer mudar algo antes?
- E-mail/senha diferente?
- Vincular a uma unidade específica?
- Usar a **Dra Ana Souza Teste** (CRM 12345/RJ) em vez do Dr. Carlos?