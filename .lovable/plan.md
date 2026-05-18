
## Objetivo

1. **CEP**: garantir o autopreenchimento de Logradouro/Bairro/Cidade/UF e cursor automático no campo Número (já existe — só reforçar e cobrir o caso de campos preenchidos por engano).
2. **Campo CPF**: aumentar a largura para não ficar apertado (desktop e APK).
3. **CadSUS — animação "mágica" de preenchimento**: ao receber os dados, preencher os campos um por um com um pequeno delay e um destaque visual (anel + flash) em cada campo conforme ele é populado.

## Mudanças

Arquivo único: `src/routes/app.pacientes.tsx`

### 1. CEP — preenchimento garantido

- `handleCepBlur` (linha 286): trocar a lógica `f.logradouro?.trim() ? f.logradouro : r.logradouro` por **sempre sobrescrever** com o resultado do ViaCEP. O ViaCEP é fonte autoritativa; manter valor antigo só atrapalha quando o usuário trocou o CEP. Permanece o `focus()` em Número (já implementado).
- Tocar `handleCepBlur` também ao colar/auto-completar (`onChange` quando bater 8 dígitos) — opcional, para não depender do blur.

### 2. CPF maior

- Trocar `<Field label="CPF">` (sem className) por `<Field label="CPF" className="md:col-span-2">`. Isso dá 2 colunas (de 4) só pro CPF — sobra espaço para os 11 dígitos formatados + o botão CadSUS.
- Como consequência, a linha de Dados pessoais vai ter: Nome(3) / Nascimento(1) / Sexo(1) / Mãe(1) / **CPF(2)** / CNS(1) / RG(1) — bate certinho em duas linhas de 4 colunas no desktop. No mobile/APK continua 1 coluna por linha (sem mudança).

### 3. Animação "mágica" do CadSUS

Hoje o `setForm(... )` joga todos os dados de uma vez. Vou trocar por:

- Construir uma lista ordenada de pares `[campo, valor]` que vieram do CadSUS (na ordem que faz sentido visual: nome → mãe → nascimento → sexo → CNS → telefone → CEP → logradouro → número → bairro → cidade → UF).
- Iterar com `setTimeout` de ~120ms entre cada item, chamando `set(campo, valor)` um por vez. Isso dá o efeito de "máquina de escrever de campos".
- Adicionar estado `highlightField: string | null` que marca o campo recém-preenchido por ~600ms.
- No `<Input>` de cada campo afetado, adicionar `data-field="<nome>"` (alguns já têm) e uma classe condicional quando `highlightField === nome`: `ring-2 ring-primary/60 transition-shadow duration-300 animate-in fade-in`.

Implementação concreta:

```ts
const [highlightField, setHighlightField] = useState<string | null>(null);

const fillMagically = async (pairs: [string, any][]) => {
  for (const [k, v] of pairs) {
    if (v == null || v === "") continue;
    set(k, v);
    setHighlightField(k);
    await new Promise((r) => setTimeout(r, 120));
  }
  setTimeout(() => setHighlightField(null), 600);
};
```

E substituir o bloco `setForm((f: any) => ({ ... }))` dentro do `handleBuscarCadSus` por uma chamada a `fillMagically([...])`.

Adicionar helper visual no `Field` (ou direto nos Inputs):

```tsx
className={cn("...", highlightField === "nome" && "ring-2 ring-primary animate-pulse")}
```

Para evitar repetição, vou criar um pequeno helper `hl(name)` que devolve a classe certa.

## Como você testa

1. Abrir Pacientes → Novo, digitar CPF de um cidadão conhecido e dar Enter (ou clicar em CadSUS).
2. Ver os campos sendo preenchidos um por um com um anel azul piscando em cada um.
3. Digitar um CEP e dar Tab/Enter → Logradouro/Bairro/Cidade/UF aparecem e o cursor pula pro Número.
4. Conferir que o campo CPF agora tem largura confortável no desktop e no APK Android.

## Fora de escopo

- Mesmo padrão de animação nos diálogos de agendamento/encaixe/consultório — peço pra fazer numa próxima rodada se gostar do efeito.
