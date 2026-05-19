
# Plano de ajustes — Exportação e-SUS

## 1. ZIP "limpo" (apenas .xml)

`src/lib/esus-export.functions.ts` e `src/lib/esus-ledi/index.ts`:
- Remover o arquivo `LEIA-ME.txt` da raiz do ZIP.
- Remover a pasta `data/` — colocar os XMLs **na raiz** do ZIP (PEC aceita ambos, mas o usuário quer só os XMLs visíveis).
- Confirmar que nenhum outro artefato (json, txt, logs) é adicionado.

Resultado: `meulote.zip` → `fai-<uuid>.xml`, `fcd-<uuid>.xml`, `fvd-<uuid>.xml`.

## 2. Modal "Gerado com sucesso — baixar lote?"

`src/routes/app.exportar-esus.tsx`:
- Após `gerarExportacao` retornar sucesso, abrir um `<AlertDialog>` com:
  - Título: "Lote gerado com sucesso"
  - Descrição: "Deseja baixar o lote agora?"
  - Botões: **Sim, baixar** / **Agora não**
- "Sim" dispara o download do ZIP via blob URL (mesma lógica do botão atual de download).
- "Agora não" apenas fecha o modal (o lote continua disponível em "Lotes gerados" se mantido — ver item 3).

## 3. Limpar/zerar lotes anteriores

- Botão **"Limpar todos os lotes"** no card "Lotes gerados" (ícone trash, variant destructive).
- Confirmação via `<AlertDialog>` ("Isso vai apagar todos os lotes gerados. Os atendimentos voltam para 'pendente'. Continuar?").
- Server function nova `limparTodosLotes` em `esus-export.functions.ts`:
  - DELETE em `esus_exportacoes` do usuário (respeitando RLS por unidade).
  - UPDATE em `atendimentos`, `domicilios`, `pacientes`: `status_envio='pendente'`, `exportacao_id=null`, `exportado_em=null` para registros vinculados aos lotes apagados.
- Como ação inicial deste plano, também **zerar agora** os lotes existentes via migration data-fix (`DELETE FROM esus_exportacoes` + reset dos status para que o usuário comece do zero).

## 4. Separar FCI (Cadastro Individual) de profissionais

Hoje a query do FCI inclui profissionais (provavelmente via join ou pelo seed). Ajustar:
- `esus-export.functions.ts` → branch FCI: buscar **somente `pacientes`** (cidadãos), não `profissionais`/`profiles`.
- Garantir que `uuid_ficha_fci` seja sempre do paciente.
- Remover qualquer mapper que pegue dados de `profissionais` para o FCI.

Profissionais continuam apenas no `<headerTransport>` (CNS + CBO + CNES) das outras fichas, nunca como sujeito do FCI.

## 5. Seed de dados de teste

Migration (data-only via tool de insert, NÃO schema):
- **10 pacientes** com CPF válido (gerador determinístico), CNS válido (15 dígitos com dígito verificador correto), nome, mãe, sexo, data nascimento, raça/cor, endereço completo (CEP, logradouro, bairro, cidade, UF, IBGE).
- **10 domicílios** vinculados às mesmas unidades dos pacientes, com endereço, microárea, condições de moradia (água, esgoto, energia, lixo) preenchidas. Cada domicílio referencia um ACS (`acs_user_id`) — usar um user existente ou o admin.
- **10 atendimentos (FAI)** com `status_envio='pendente'` (para entrar na próxima exportação), `finalizado_em` setado (= "encerrado"), SOAP preenchido, ao menos 1 CID, sinais vitais, vinculados aos 10 pacientes e a uma unidade real (`unidade_id` + `profissional_id` reais já existentes).
- Vincular `familia` → `familia_membros` ligando cada paciente ao respectivo domicílio (para o FCD não ficar órfão).

Pré-requisitos: ler `unidades`, `profissionais`, `equipes`, `auth.users` (via `read_query`) para usar IDs reais antes de gerar os INSERTs.

## Detalhes técnicos

```text
ZIP final:
  fai-<uuidDadoSerializado>.xml
  fcd-<uuidDadoSerializado>.xml
  fvd-<uuidDadoSerializado>.xml
```

```ts
// modal de download
const [showDownload, setShowDownload] = useState<{ id: string } | null>(null);
// após sucesso:
setShowDownload({ id: lote.id });
```

```sql
-- limpar lotes (executado uma vez agora)
UPDATE atendimentos SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL
  WHERE exportacao_id IS NOT NULL;
UPDATE domicilios SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL
  WHERE exportacao_id IS NOT NULL;
UPDATE pacientes  SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL
  WHERE exportacao_id IS NOT NULL;
DELETE FROM esus_exportacoes;
```

## Fora do escopo

- Validação contra XSD oficial (próximo passo).
- Editor de configuração do remetente na UI.
- Migrar FAO/FCI XML para LEDI (FCI já está; FAO fica para a próxima onda).

Posso seguir?
