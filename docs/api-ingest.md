# API de Ingestão (sistema legado Firebird → SpokenMED)

Endpoint para o `.exe` instalado na prefeitura enviar lotes de registros.

## Endpoint

```
POST https://spokenmed.lovable.app/api/public/ingest
Header: x-api-key: <INGEST_API_KEY>
Content-Type: application/json
```

URL estável alternativa (não muda se o projeto for renomeado):
`https://project--1a0819ba-1757-4fe0-8af7-a5c3b7cf6168.lovable.app/api/public/ingest`

## Corpo (lote)

```json
{
  "origem": "firebird",
  "tabela": "CADPAC",
  "chave_primaria": "NMATRICULA",
  "metadata": { "versao_exe": "1.0.0", "municipio": "Teresópolis" },
  "registros": [
    { "NMATRICULA": 1234, "NOME": "MARIA DA SILVA", "CPF": "12345678900", "DTNASC": "1980-05-10" }
  ]
}
```

- `tabela`: nome da tabela de origem (ex.: `CADPAC`, `AGENDA`, `CADMEDICO`).
- `chave_primaria`: string ou array de strings. Se informada, reenvios do mesmo
  registro fazem **upsert** (não duplica).
- `registros`: 1 a 2000 objetos por requisição. Envie em blocos (ex.: 500).

## Resposta

```json
{ "ok": true, "lote_id": "uuid", "tabela": "CADPAC", "recebidos": 500, "gravados": 500 }
```

Erros: `401 unauthorized`, `400 payload_invalido` / `json_invalido`,
`500 falha_ao_gravar`.

## Onde os dados ficam

- `integracao_lotes` — um registro por envio (tabela, totais, status, erro).
- `integracao_registros` — o JSON bruto de cada linha (`payload`), com
  `chave_origem` e `status` (`pendente` até ser mapeado para as tabelas do app).

Somente administradores enxergam esses dados; a gravação é feita apenas pelo
servidor com a chave de API.

## Exemplo C# (para o .exe)

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.Add("x-api-key", apiKey);
var body = new {
    origem = "firebird",
    tabela = "CADPAC",
    chave_primaria = "NMATRICULA",
    registros = lote // List<Dictionary<string, object>>
};
var res = await http.PostAsync(
    "https://spokenmed.lovable.app/api/public/ingest",
    new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
```
