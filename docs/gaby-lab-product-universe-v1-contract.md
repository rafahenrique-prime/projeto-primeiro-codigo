# GABY LAB · Product Universe V1 — Contrato técnico

Status: **LAB / contrato puro / sem runtime / sem deploy comercial**

## Objetivo

Criar uma camada única e auditável entre a interpretação do produto e a resposta comercial da Gaby.

Nesta etapa, a camada não consulta Google Drive, Supabase, GPTMaker ou qualquer API. Ela recebe evidências já fornecidas por testes e devolve uma decisão estruturada.

## Fontes e prioridade

1. **PRIME** — catálogo oficial / Mirror da PRIME.
2. **VIVIAN** — catálogo de fornecedor.
3. **MIA** — catálogo de fornecedor.

Fornecedor encontrado significa **candidato comercial**, não estoque ao vivo.

## Regras V1 congeladas

- Falha de busca na PRIME nunca equivale automaticamente a "não temos".
- Pedido explícito do cliente substitui a variante visual do Story. Exemplo: Story branco + "tem preto 42?" => cor pedida = preto.
- Produtos podem ser EXACT, SAME_FAMILY, SIMILAR ou UNKNOWN.
- NIKE_MOTIVA é uma família canônica própria com aliases Nike Motiva, Motiva e Nike Motiva feminino; buscas dessa família descartam evidência de outra família, inclusive preços de Nike Dunk.
- SAME_FAMILY permite continuidade comercial sem exigir SKU/cor idênticos.
- Tamanho pode ser OFFERABLE por política comercial V1 mesmo sem confirmação física naquele instante.
- Preço de fornecedor só pode ser usado quando houver regra explícita de família ou um preço PRIME inequívoco para a mesma família.
- Presença no Drive de fornecedor não vira AVAILABLE.
- Foto PRIME pode seguir o fluxo já existente.
- Foto VIVIAN/MIA **não é enviada automaticamente na V1**; a ação é REQUEST_TEAM_PHOTO.
- STOP_CONFIRMED só pode ocorrer quando todas as evidências relevantes da família estiverem explicitamente marcadas como indisponíveis.

## Estados principais

### Produto

AVAILABLE, OFFERABLE, CATALOG_PRESENT, ALTERNATIVE, UNKNOWN, UNAVAILABLE_CONFIRMED.

### Tamanho

CONFIRMED, OFFERABLE, UNKNOWN, NOT_APPLICABLE, UNAVAILABLE_CONFIRMED.

### Preço

CONFIRMED, INHERITED_FAMILY_RULE, UNKNOWN, CONFLICT.

### Ação comercial

CONTINUE_SALE, ASK_SMART_QUESTION, REQUEST_TEAM_VERIFY, HUMAN_REVIEW, STOP_CONFIRMED.

## Exemplo esperado

Entrada conceitual:

- Story visual: Nike Air Force 1 branco
- Cliente: "tem preto 42?"
- PRIME: Air Force branco, R$ 399
- VIVIAN: Air Force preto
- MIA: Air Force preto
- Regra de família: NIKE_AIR_FORCE_1 = R$ 399

Saída conceitual:

- canonical_family = NIKE_AIR_FORCE_1
- requested.color = preto
- requested.size = 42
- match = SAME_FAMILY
- supplier_count = 2
- product_state = OFFERABLE
- size.state = OFFERABLE
- price.state = INHERITED_FAMILY_RULE
- price.amount = 399
- photo.action = REQUEST_TEAM_PHOTO
- commercial.action = CONTINUE_SALE

## O que esta etapa NÃO faz

- não cria tabela;
- não grava linha no Supabase;
- não acessa os Drives;
- não altera catálogo PRIME;
- não troca Action da GABY LAB;
- não altera GABY OFICIAL;
- não chama JEV;
- não faz deploy de Edge Function.

## Gate para a próxima etapa

Só criar o runtime candidato gaby-lab-product-universe-v1 depois que:

1. os testes deste contrato estiverem verdes;
2. o contrato continuar puro e determinístico;
3. nenhum teste permitir falso "não temos";
4. fornecedor continuar separado de estoque PRIME;
5. nenhuma foto de fornecedor for marcada para autoenvio.
