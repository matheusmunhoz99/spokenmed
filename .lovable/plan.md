## Objetivo

Substituir o Whereby por **LiveKit Cloud** para a videochamada parecer 100% nativa do SpokenMED — zero branding externo, UI totalmente customizada (estilo Google Meet / WhatsApp).

## Observação importante sobre stack

Seu prompt fala em "Supabase Edge Function". Neste projeto a regra é **TanStack `createServerFn**` (server-side seguro, mesmo nível de proteção, melhor integração). Vou usar `createServerFn` em vez de Edge Function — gera o JWT do LiveKit no servidor, secret nunca vai pro cliente.

## Secrets necessários

Vou pedir 3 secrets (preciso da sua aprovação):

- `LIVEKIT_URL` — ex: `wss://seu-projeto.livekit.cloud`
- `LIVEKIT_API_KEY` — começa com `API…`
- `LIVEKIT_API_SECRET` — string longa

> Crie um projeto grátis em [cloud.livekit.io](https://cloud.livekit.io) — plano free dá 50 GB/mês e até 100 participantes simultâneos, suficiente pra testar e até produção pequena.

## Mudanças no banco

Reaproveitar a tabela `teleconsulta_salas`:

- Renomear conceito: `daily_room_name` passa a guardar o nome da sala LiveKit (mesma coluna, sem migration destrutiva)
- Adicionar coluna `livekit_room` (text) por clareza
- `host_room_url` / `daily_room_url` deixam de ser usados (mas ficam no schema sem quebrar nada)

## Backend (`src/lib/tele-livekit.server.ts`)

Novo arquivo com:

- `createRoom(roomName)` — opcional, LiveKit cria sob demanda
- `generateToken({ roomName, identity, name, role })` — usa `livekit-server-sdk` (`AccessToken`)
  - **role = "host"** (médico) → grants `roomAdmin: true, canPublish: true, canSubscribe: true`
  - **role = "guest"** (paciente) → grants `canPublish: true, canSubscribe: true`
  - TTL = 4 h
- `deleteRoom(roomName)` — encerra sala via `RoomServiceClient`

Atualiza `src/lib/tele.functions.ts`:

- `criarSalaTele` — gera `roomName = consulta-{agendamentoId}`, salva no banco
- `gerarTokenMedico` — retorna `{ token, url, room }`
- `pacienteEntrar` — retorna `{ token, url, room, paciente_nome, … }`
- `encerrarSala` — chama `deleteRoom`
- Remove `tele-whereby.server.ts` e `iniciarGravacao`/`pararGravacao` (LiveKit free não tem gravação cloud; quando quiser, dá pra ativar via egress paga)

## Frontend (`src/components/tele/CallStage.tsx`)

Reescreve usando `@livekit/components-react` com layout custom:

- `<LiveKitRoom>` como wrapper (conecta com `serverUrl` + `token`)
- **Grid de vídeo custom** — vídeo do paciente em tela cheia + thumb auto-vídeo do médico no canto (estilo WhatsApp), com `<ParticipantTile>` / `useTracks`
- **Barra de controles inferior** (custom, sem `<ControlBar>` default que tem estilo LK):
  - Mic on/off · Câmera on/off · Trocar câmera (mobile) · Compartilhar tela · Encerrar (vermelho)
- **Overlay superior** custom (já existe): avatar do paciente, nome, timer de duração, botão de resumo
- **Indicadores nativos**: ícone de "conectando", "reconectando", qualidade de rede usando `useConnectionState` / `useParticipants`
- **Chat lateral opcional** (toggle), usando `useChat` do `@livekit/components-react`
- **Reconexão automática** já é built-in do SDK

Atualiza:

- `src/routes/app.tele.$agendamentoId.tsx` (médico) — passa `token` + `url` para o CallStage
- `src/routes/tele.$token.tsx` (paciente) — mesma coisa

## Pacotes a instalar

```
livekit-client
@livekit/components-react
@livekit/components-styles
livekit-server-sdk
```

## Compatibilidade com APK v1.3.0

O APK atual já tem permissões `CAMERA` + `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`. LiveKit usa o mesmo WebRTC do Whereby — **funciona no APK existente sem regerar**.

## O que muda visualmente


| Antes (Whereby)             | Depois (LiveKit)           |
| --------------------------- | -------------------------- |
| Logo "Whereby" no canto     | Sem logo externa           |
| Controles padrão Whereby    | Controles custom SpokenMED |
| Pop-up de permissão Whereby | Direto a câmera            |
| Cores/fonts Whereby         | Tudo no design do app      |


## Plano de execução

1. Pedir aprovação dos 3 secrets (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
2. Migration: adicionar coluna `livekit_room`
3. Instalar pacotes
4. Criar `tele-livekit.server.ts` + atualizar `tele.functions.ts`
5. Reescrever `CallStage.tsx` com componentes LiveKit + UI custom
6. Atualizar as 2 rotas (médico e paciente)
7. Remover `tele-whereby.server.ts`
8. Testar fluxo completo

## Risco / pontos de atenção

- **Free tier do LiveKit**: 50 GB bandwidth/mês. Cada hora de consulta 1-a-1 em SD consome ~200 MB. Dá pra ~250 h/mês grátis. Acima disso, plano pago começa em $50/mês.
- **Gravação**: não incluída agora (LiveKit Egress é paga, ~$0.45/h gravada). Se quiser depois, dá pra ativar.
- **TURN/relay**: incluso no LiveKit Cloud, sem config extra.

---

Confirma esse plano e que vai criar a conta LiveKit Cloud pra eu pedir os 3 secrets?  
1. NÃO remova Whereby imediatamente

Em vez de apagar direto:

```

```

```
Remove tele-whereby.server.ts
```

melhor:

```

```

```
Deprecated tele-whereby.server.ts
```

Deixa uns dias como fallback até validar LiveKit em produção.

---

# 2. Adicione limite de participantes

Peça isso também:

```

```

```
Adicionar maxParticipants por sala.
```

Evita link vazado.

---

# 3. Adicione waiting room depois

Pra telemedicina isso é MUITO útil:

-   
paciente entra  

-   
fica aguardando  

-   
médico aprova entrada  


O LiveKit suporta bem isso.

---

# O mais importante

A parte abaixo está CORRETÍSSIMA:

> “secret nunca vai pro cliente”

Isso é o que diferencia:

-   
sistema sério  
  
de  

-   
integração gambiarra  


---

# Sobre custo

O cálculo deles está bem coerente.

Pra começar:

-   
provavelmente você nem vai passar do free tier.  


---

# Conclusão

Pode aprovar tranquilo.  
  
Esse plano ficou profissional mesmo.

Depois dessa migração seu sistema vai parecer:

-   
Google Meet privado  

-   
ou WhatsApp Call white-label  


em vez de:

-   
“um iframe de outro serviço”.  


E visualmente isso muda MUITO a percepção do sistema.  
  
o que acha?

&nbsp;