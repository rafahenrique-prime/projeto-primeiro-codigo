# GABRIELA_CHANGELOG — Reorganização completa

**Data/hora:** 2026-07-04 ~17h (horário de Brasília)
**Executado por:** Claude (Fable 5), com aprovação explícita do Rafael via plano revisado
**Backup integral pré-mudança:** `docs/GABRIELA_BACKUP_COMPLETO.md` + JSONs em `docs/backup-gptmaker-2026-07-04/`
**Proposta aprovada:** `docs/GABRIELA_REFACTOR_PLAN.md`

---

## Resumo

| Recurso | Antes | Depois |
|---|---|---|
| Treinamentos | 16 (com 3 regras de foto duplicadas, 3 de busca, 2 de horário conflitantes) | **7** (1 assunto = 1 fonte) |
| Behavior | 2561 chars, 4 conflitos com treinamentos | **2033 chars**, zero conflito conhecido |
| Intenções | 10 (3 inativas/órfãs) | **7** (todas ativas) |
| Base de conhecimento | 82 entradas | **82 (INTOCADA** — só classificada no plano) |
| Nota do sistema | 4,5/10 | projetada 8,5/10 (validar nos testes reais) |

---

## Lote 1 — Treinamentos (16 → 7)

### Editados no lugar (PUT, ID preservado, texto novo — verificado idêntico via re-fetch)

| ID | Antes | Depois |
|---|---|---|
| `3F527E6217B890747F81161D5BC43076` | "📸 REGRA OBRIGATÓRIA — ENVIO DE FOTOS" (583c) | **Training 01 — Fotos regra única** (712c): funde as 3 regras de foto + NOVO fallback para foto ENVIADA pelo cliente (pede nome/modelo) + regra de não repetir preço/link (auto-photo já envia) |
| `3F53B82B9F283E654B6B063E7F08B04E` | "🛍️ FLUXO DE VENDAS CONSULTIVO" com "não ofereça PIX antes de perguntar" (591c) | **Training 03 — Regras de Preço** (647c): SEMPRE Cartão+PIX+economia juntos (decisão Rafael); valores reais, nunca de exemplo |
| `3F473DDF9DF6E047491506B5E28A01C5` | "Comando de Atendimento" tom sneaker "brabo" (703c) | **Training 04 — Atendimento Consultivo** (951c): funde comando + técnicas de vendas + múltiplos modelos; tom 90% consultivo/10% streetwear |
| `3F4718A4439110C27F145E312A000221` | "Regras de Formatação" + horário 09h (665c) | **Training 05 — Informações da Loja** (916c): funde endereço/Maps/credibilidade/nicho variado; horário oficial único Seg-Sex 09h-20h, Sáb 09h-16h |
| `3F4717DAFC2970617261064117A1F523` | "FORMATO OBRIGATÓRIO DOS LINKS" busca sempre (443c) | **Training 06 — Links e Busca** (652c): link exato PRIORITÁRIO, busca `?q=` só fallback (decisão Rafael); regras singular/sem acento das 3 regras antigas |

### Mantidos idênticos (nenhum PUT)

| ID | Conteúdo |
|---|---|
| `3F57159D516BE07E5E16F2185F7B08E4` | Training 02 — Lista de cores (990c, validado em produção em 04/07) |
| `3F527E1D820AF032B7EA6E5276C5EB28` | Training 07 — Leitura do webhook (`${webhook_response...}`, 257c) — **PROVISÓRIO**: só remover após teste no Agent Lab provar que a intenção injeta os dados sem ele |

### Deletados (DELETE — texto integral preservado no backup)

| ID | Era | Motivo |
|---|---|---|
| `3F5985DE5053A0AA732EEE7199EB7943` | Cliente envia foto (vision) | Órfão (Vision Inbound revertido); função substituída pelo fallback do Training 01 |
| `3F56CA8976D420F30F9F46A813912264` | Múltiplos modelos → listar direto | Fundido no Training 04 |
| `3F527E71C9AA5092D7B4861DC225FDFE` | Foto — regra prioritária | Fundido no Training 01 |
| `3F527E4C1B36207E28576E5276C5EB28` | Foto — não incluir imagem | Fundido no Training 01 |
| `3F473753146430CE3BE23A37B381C795` | Técnicas de vendas | Fundido no Training 04 |
| `3F47374A9037308E0AEACAAAF19EF400` | Sobre a loja ("masculina premium") | Fundido no Training 05, nicho corrigido para variado |
| `3F47182A2CFD30F3D3155600D667ABB2` | Endereço + horário 10h (ERRADO) | Fundido no Training 05 com horário oficial 09h |
| `3F471813FF31906B9F71729754365E8E` | Links de busca genéricos | Fundido no Training 06 |
| `3F4718050656A09F68FCCAAAF19EF400` | Simplificação de buscas | Fundido no Training 06 |

## Lote 2 — Behavior (PUT, verificado idêntico via re-fetch)

**Antes (2561c):** "produtos variados" mas conflitando com treinamento "masculina premium"; emojis "em TODAS as mensagens"; "máx 20 palavras" (impossível junto com lista de 5 cores); citava intenção com nome errado ("Alertar Rafael"); tom sem definição clara.

**Depois (2033c):** nicho variado explícito (masc+fem) · tom 90/10 · emojis moderados 1-2/msg (aprovado por Rafael) · "até 3 linhas exceto formatos padrão" · nome exato da intenção "Alerta rafael" · regra anti-alucinação ("NUNCA invente produto, preço ou link") · Abordagens preservadas (saudação/indeciso/upsell/fantasma) · links com prioridade exato>busca.

Texto integral do antes: backup seção 1. Texto integral do depois: REFACTOR_PLAN seção C.

## Lote 3 — Intenções (10 → 7, DELETE)

| ID | Era | Motivo |
|---|---|---|
| `3F527C5A2A5F402D7CBB6E5276C5EB28` | Alerta rafael 02 (inativa) | Duplicata exata de "Alerta rafael" |
| `3F597C79A514D02D68E50EAD0D57FBFF` | Vision Inbound (inativa) | Feature revertida em 04/07 |
| `3F527C63EDEA109FE81B7274D8EBABD6` | Consultar base de conhecimento (inativa) | Endpoint `/api/knowledge` deletado do Vercel em 04/07 (404) |

Restantes (todas ativas): Buscar Produtos · enviar foto produto · Alerta rafael · Novo Lead · Venda Confirmada · Cliente Insatisfeito · Pedido grande.

## Lote 4 — Verificação

- ✅ Re-fetch pós-PUT: 5 treinamentos + behavior byte a byte idênticos ao proposto
- ✅ Contagens finais confirmadas: 7 treinamentos, 7 intenções
- ✅ Busca de produtos viva (curl `/api/webhook`, "quais cores tem o new balance 9060"): 5 produtos, total de variações real no topo do `informacao_adicional` — Training 07 cumprindo o papel
- ⏳ **Pendente (precisa do Rafael):** testes reais no WhatsApp dos 20 cenários do REFACTOR_PLAN — em especial foto (cenários 7-8), alerta Telegram (14-15) e persona (1-2, 17-19)

## Rollback

Qualquer regressão → restaurar o texto original do `GABRIELA_BACKup_COMPLETO.md` via PUT (segundos por item). Intenções deletadas precisariam ser recriadas manualmente (ID novo) com os dados da seção 3 do backup.

## Fora do escopo desta mudança (registrado para o futuro)

- Limpeza da KB (82 entradas classificadas no REFACTOR_PLAN, nada apagado) — exige backup próprio + reteste da busca do webhook
- Remoção do Training 07 — só após teste específico no Agent Lab
- Token do bot Telegram exposto nas URLs de 6 intenções — migrar para proxy serverless
- Agentes desativados (Gabi teste, Gaby 02) — Gaby 02 tem intenções ativas apontando pra auto-photo/knowledge; revisar antes de qualquer reativação
