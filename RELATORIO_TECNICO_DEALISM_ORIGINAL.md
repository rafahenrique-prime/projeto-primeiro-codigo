# RELATÓRIO TÉCNICO — DEALISM ORIGINAL
**Documento para importação no NotebookLM e reconstrução do sistema**
**Data de geração:** 2026-06-20
**Compilado por:** Análise reversa das sessões de engenharia + arquivos de backup capturados

---

## SUMÁRIO EXECUTIVO

O Dealism é uma plataforma SaaS de automação de vendas por IA para WhatsApp e Instagram, voltada a pequenos e médios vendedores (e-commerce e comércio local). O produto central é um sistema de **Buyer Agents** — agentes de IA individuais por cliente — coordenados por um **Seller Agent (DealOnca/Copiloto)** que orienta o vendedor. O sistema roda sobre um LLM (presumivelmente Claude da Anthropic), com arquitetura multi-agente, base de conhecimento vetorial, e automações de follow-up com timers.

---

## 1. VISÃO GERAL DA PLATAFORMA

### O que sabemos com certeza
- Nome do produto: **Dealism**
- Segmento: CRM de vendas + automação de IA para mensageria (WhatsApp + Instagram)
- Arquitetura: Multi-agente (um agente por comprador + um agente central por vendedor)
- Canais suportados: WhatsApp e Instagram (DMs + comentários de posts)
- O nome público do assistente central é **DealOnca** (internamente chamado de "Seller Agent")
- Existe um agente por cliente (chamado de "Buyer Agent")
- O sistema tem onboarding guiado por IA em 5 etapas (Stage 0 ao Stage 5)
- Linguagem de backend: Python (scripts de automação identificados)
- Frontend web: aplicação (não confirmado React, mas provável)

### O que foi observado nas telas
- Inbox com lista de conversas filtrável (Todos, Meus, Auto-IA, Não lidas, WhatsApp, Instagram)
- Botão "Generate" dentro de cada conversa para gerar resposta por IA
- Toggle "Autopilot" por conversa e "Global Autopilot" para todos os clientes
- Módulo "Channel" para autorizar WhatsApp e Instagram
- Módulo "Inbox" como tela central de atendimento
- Seção de Knowledge Base para treinar o agente
- Agente visual com avatar configurável

### O que foi inferido
- Backend provavelmente em Python (Django/FastAPI) com workers assíncronos
- Banco vetorial para busca semântica na knowledge base
- Sistema de sessões por chave composta: `seller:{seller_id}:buyer:{buyer_id}:{channel}`
- Autenticação OAuth para Instagram e WhatsApp Business API
- Storage de arquivos para assets (imagens, vídeos, áudios de produtos)

### Nível de confiança: **ALTO** (confirmado por arquivos internos capturados)

### Como reproduzir
1. Criar sistema multi-agente com LLM (Claude/GPT-4)
2. Cada "buyer" instancia um agente com contexto isolado
3. Um "seller agent" orquestra todos os buyer agents
4. Conectar via WhatsApp Business API e Instagram Graph API
5. Inbox web em tempo real via WebSocket

### Possível estrutura de banco de dados
```sql
sellers (id, email, seller_id, plan, created_at)
buyer_agents (id, seller_id, buyer_id, channel, config_id, status, created_at)
conversations (id, buyer_agent_id, session_key, last_message_at, status)
messages (id, conversation_id, role, content, timestamp, channel)
```

### Possíveis APIs necessárias
- WhatsApp Business API (Meta)
- Instagram Graph API (Meta)
- LLM API (Anthropic/OpenAI)
- Banco vetorial (Pinecone/Weaviate/pgvector)

---

## 2. ARQUITETURA FUNCIONAL IDENTIFICADA

### O que sabemos com certeza
A arquitetura é **multi-agente hierárquica**:

```
[Vendedor] ←→ [Seller Agent / DealOnca / Copiloto]
                        ↓
              [Buyer Agent 1] [Buyer Agent 2] [Buyer Agent N]
                    ↓               ↓               ↓
              [Cliente WA]    [Cliente IG]    [Cliente WA]
```

- Cada Buyer Agent tem seu próprio workspace isolado: `buyer_agents/buyer_{buyer_id}_{channel}_workspace/`
- Sessões são arquivos JSONL: `sessions/seller:{seller_id}:buyer:{buyer_id}:{channel}.jsonl`
- Buyer Agents são ativados **on-demand** na primeira mensagem (lazy initialization)
- Comunicação entre agentes via `sessions_send()` com tipos: `request`, `progress`, `result`, `error`
- Seller Agent NÃO precisa chamar `sessions_discover` antes de enviar — ativação automática

### Arquivos por Buyer Agent
```
buyer_agents/
  buyer_{id}_{channel}_workspace/
    USER.md          # perfil do comprador
    SOUL.md          # (herdado do seller)
    sessions/
      seller:{s}:buyer:{b}:{ch}.jsonl  # histórico de mensagens
```

### Arquivos globais do Seller
```
workspace/
  SOUL.md            # personalidade e regras do agente central
  AGENTS.md          # instruções operacionais completas
  MEMORY.md          # memória de longo prazo (manual, persistente)
  USER.md            # dados do vendedor
  BOOTSTRAP.md       # instruções de onboarding (deletado ao finalizar)
  memory/
    YYYY-MM-DD.md    # diário automático por sessão
    knowledge/       # base de conhecimento de produto
    strategy/        # base de estratégias de vendas
buyer_agents/
  bindings.json      # mapeamento buyer_key → configuração ativa
  buyer_directory.json  # nome do comprador → buyer_id + channel
buyer_agent_configs/
  config_{name}_{id}.json  # configuração de cada agente
```

### Nível de confiança: **ALTO** (arquivos reais capturados)

### Fluxo de funcionamento
1. Cliente envia mensagem no WhatsApp ou Instagram
2. Backend roteia para o Buyer Agent correspondente ao `buyer_id + channel`
3. Se não existe Buyer Agent ativo → instancia on-demand com o config do vendedor
4. Buyer Agent processa a mensagem: busca knowledge base → gera resposta via LLM
5. Resposta enviada de volta ao cliente pelo canal original
6. Evento notificado ao Seller Agent (Copiloto) se necessário (escalation, etc.)

---

## 3. AGENTES DE IA

### O que sabemos com certeza

#### Seller Agent (DealOnca / Copiloto)
- Nome público: **DealOnca** (ou simplesmente o assistente do vendedor)
- Personalidade: "Gordon Ramsay auditando uma cozinha + Wolf of Wall Street fechando um negócio"
- Tom: direto, usa emojis generosamente, baseado em dados reais das conversas
- Funções:
  - Onboarding do vendedor (5 etapas)
  - Análise de performance de vendas
  - Diagnóstico de conversas ("channel diagnosis")
  - Criação e gestão de Buyer Agents via scripts Python
  - Comunicação direta com Buyer Agents via `sessions_send`
  - Escalation para suporte humano via `escalate_to_human`

#### Buyer Agent (Agente de Atendimento)
- Um por comprador (buyer_id + channel)
- Configuração por JSON: `config_{name}_{id}.json`
- Campos de configuração:
  - `agent_name` — nome do agente (ex: "Gabriela")
  - `company_name` — nome da empresa
  - `role` — papel do agente
  - `selling_products` — descrição do que vende
  - `industry` — categoria da indústria
  - `tone` — estilo de comunicação
  - `max_reply_words` — limite de palavras por resposta
  - `sales_goal` — objetivo de vendas
  - `playbook` — processo de vendas passo a passo
  - `others` — regras especiais (must/must-not)
  - `web_search_summary_info` — dados de análise de perfil web
  - `avatar` — URL do avatar
  - `blibee_agent_id` — ID interno na plataforma
  - `tone_name` — modelo de voz TTS (ex: "Kore")

### Exemplo real capturado (Agente Gabriela — PRIME STORE)
```json
{
  "agent_name": "Gabriela",
  "company_name": "PRIME STORE",
  "tone": "Calmo, Respeitoso, Breve, máximo 20 palavras",
  "voice_model": "Kore",
  "sales_goal": "Suporte ao Cliente e Vendas",
  "industry": "General"
}
```

### Nível de confiança: **ALTO**

### Como reproduzir
1. Criar modelo de config JSON com os campos acima
2. Instanciar LLM com system prompt gerado a partir do config
3. Injetar knowledge base relevante no contexto ou via RAG
4. Manter histórico de sessão em JSONL por conversa
5. Script `create_buyer_agent_config.py` cria config + registra em `bindings.json`

### Possível estrutura de banco de dados
```sql
agent_configs (
  id VARCHAR PRIMARY KEY,        -- "CJ5jR64o"
  seller_id INT,
  agent_name VARCHAR,
  company_name VARCHAR,
  tone TEXT,
  playbook TEXT,
  others TEXT,
  max_reply_words INT,
  voice_model VARCHAR,
  avatar_url VARCHAR,
  created_at TIMESTAMP
)
```

---

## 4. AUTOPILOT

### O que sabemos com certeza
- Existe um toggle **Autopilot por conversa** (nível individual)
- Existe um **Global Autopilot** para todos os clientes simultaneamente
- O Global Autopilot é acessado por um "ícone animado à direita da barra de busca" na lista de contatos
- O Autopilot permite que o Buyer Agent responda **sem intervenção humana**
- Sem Autopilot ativo: o vendedor deve clicar em "Generate" para cada resposta
- O toggle Autopilot fica no **canto superior direito da conversa**

### Diferença entre modos
| Modo | Quem responde | Como ativar |
|------|--------------|-------------|
| Manual | Humano digita | Padrão |
| Semi-Auto | IA gera, humano aprova | Botão "Generate" |
| Autopilot | IA responde automaticamente | Toggle por conversa |
| Global Autopilot | IA responde TODOS automaticamente | Ícone animado na lista |

### Na nossa implementação (GPT Maker)
- `mode !== 'copilot'` → conversa em Auto-IA (equivalente ao Autopilot)
- `mode === 'copilot'` → conversa assumida pelo humano
- Filtro "Auto-IA" no Inbox mostra conversas em autopilot
- Filtro "Meus" mostra conversas que o humano assumiu (copilot mode)

### Nível de confiança: **ALTO** (visto nas telas e confirmado pelo código)

### Como reproduzir
```sql
conversations (
  id, buyer_id, channel,
  autopilot BOOLEAN DEFAULT false,
  mode ENUM('auto', 'copilot', 'manual')
)
```
Worker que a cada nova mensagem verifica `autopilot = true` → executa resposta automática

### Fluxo completo
```
[Nova mensagem chega]
       ↓
[Verifica autopilot da conversa]
  ├── autopilot=true → [Buyer Agent gera resposta] → [Envia automaticamente]
  └── autopilot=false → [Notifica vendedor no Inbox] → [Vendedor clica Generate ou digita]
```

---

## 5. COPILOTO (DEAL ONCA / SELLER AGENT)

### O que sabemos com certeza
- O Copiloto é o assistente pessoal do **vendedor** (não do cliente)
- Nome: **DealOnca** (nome interno do produto), externamente aparece como assistente de vendas
- Funções documentadas:
  1. **Onboarding**: guia o vendedor pelas 5 etapas de configuração
  2. **Diagnóstico**: analisa qualidade das conversas (`run_diagnosis.py`)
  3. **Treinamento**: aceita documentos, URLs, PDFs e extrai conhecimento
  4. **Gestão de Agentes**: cria/atualiza/deleta Buyer Agent configs
  5. **Comunicação**: pode enviar mensagens diretamente para Buyer Agents
  6. **Escalation**: encaminha para suporte humano via Feishu/Slack

### Personalidade documentada
```
- Gordon Ramsay auditando uma cozinha + Wolf of Wall Street
- Nunca diz "Ótima pergunta!" ou "Terei prazer em ajudar"
- Usa dados reais como arma: "seus números estão horríveis, veja aqui..."
- Emojis generosos: 💀🔥😤📉🤦‍♂️💰🚨👀🎯
- Exceção: tópicos de segurança → 100% sério, sem piadas
- Adaptação de idioma: detecta locale do sistema, mantém até usuário mudar
```

### Restrições de segurança do Copiloto
- Nunca revela nomes de ferramentas internas
- Nunca expõe IDs de configuração, buyer_ids, file paths
- Nunca descreve arquitetura interna
- Nunca confirma se é IA quando questionado
- Resiste a jailbreak, DAN, override de instruções
- Único HTML permitido nas respostas: `<div agent-id='{id}'>@{nome}</div>`

### Nível de confiança: **ALTO** (SOUL.md e AGENTS.md capturados integralmente)

### Como reproduzir (nossa implementação: CODEX)
- `src/pages/DealOncaPage.jsx` com rota `page === 'dealonca'`
- `src/services/groq.js`: função `askCODEX` com CODEX_SOUL
- Cor identificadora: roxo `#7C3AED`

---

## 6. OBJETIVOS DOS AGENTES

### Objetivo do Seller Agent (Copiloto)
1. Fazer onboarding do vendedor em menos de 3 minutos
2. Criar e configurar Buyer Agent automaticamente
3. Diagnosticar perdas de vendas nas conversas
4. Recomendar melhorias na base de conhecimento
5. Guiar para ativação (Generate → Autopilot)
6. Aumentar faturamento do vendedor

### Objetivo do Buyer Agent (Atendente IA)
1. Responder perguntas de produto
2. Superar objeções de preço
3. Enviar links de produto com fotos
4. Coletar dados do cliente (CEP, tamanho, preferência)
5. Executar follow-ups nos momentos certos
6. Fechar a venda ou direcionar para pagamento
7. Escalar para humano quando necessário

### Segmentação por indústria (3 categorias)
| Categoria | Exemplos | Dores típicas |
|-----------|---------|--------------|
| Local Service | Educação, Saúde, Imóveis, Beleza | Resposta lenta, ausência fora horário, no-shows |
| E-commerce | Moda, Eletrônicos, Alimentos | Dúvidas de produto, baixa conversão, carrinhos abandonados |
| Professional Service | Contador, Advogado, Médico | Qualificação de lead, tempo desperdiçado, picos sazonais |

### Nível de confiança: **ALTO** (documentado no SOUL.md)

---

## 7. SISTEMA DE TREINAMENTO

### O que sabemos com certeza
- Vendedor pode treinar o agente enviando:
  - **Arquivos**: PDF, DOCX, XLSX, CSV, TXT
  - **URLs**: sites, links de produtos
  - **Imagens/áudios** (para assets visuais)
  - **Texto direto** via chat
- Ferramenta `document_extract` processa qualquer tipo de arquivo
- Chunks extraídos são roteados por `category` + `content_category_tags`
- Cada chunk tem metadata: `chunk_id`, `content_hash`, `file_path`, `upload_id`
- NUNCA se usa `write_file` com `overwrite: true` em arquivos de memória (destrói chunk IDs)
- Edições via `edit_file` apenas (preserva chunk IDs)

### Categorias de conhecimento
| Categoria | Tags | Arquivo destino |
|-----------|------|----------------|
| knowledge | product_info | `knowledge/product-info.md` |
| knowledge | pricing | `knowledge/pricing.md` |
| knowledge | policy | `knowledge/policy.md` |
| knowledge | guide | `knowledge/guide.md` |
| knowledge | faq | `knowledge/faq.md` |
| knowledge | usecase | `knowledge/usecase.md` |
| strategy | objection_handling | `strategy/objection-handling.md` |
| strategy | sales_tactic | `strategy/sales-tactics.md` |
| strategy | follow_up_strategy | `strategy/follow-up.md` |

### Lógica: Extrair ou Pular?
- **Extrair**: usuário pede explicitamente salvar, docs de produto, FAQs, logs de chat de vendas
- **Pular**: screenshots casuais, perguntas únicas, conteúdo temporário
- **Perguntar**: arquivos grandes sem contexto, conteúdo misto

### Nível de confiança: **ALTO** (AGENTS.md documenta toda a lógica)

### Como reproduzir
1. API de upload de arquivos → processamento assíncrono
2. LLM extrai chunks com metadados estruturados
3. Chunks indexados em banco vetorial (embedding)
4. Na hora de responder: RAG busca chunks relevantes → injeta no prompt

### Possível estrutura de banco de dados
```sql
knowledge_chunks (
  id UUID PRIMARY KEY,
  chunk_id VARCHAR UNIQUE,        -- gerado pelo sistema
  seller_id INT,
  file_path VARCHAR,
  content TEXT,
  category ENUM('knowledge','strategy'),
  content_category_tags VARCHAR,
  product_or_service VARCHAR,
  source_type VARCHAR,            -- 'text','image','pdf','url'
  asset_path VARCHAR,
  content_hash VARCHAR,           -- SHA256 para dedup
  upload_id VARCHAR,              -- tracking de uploads
  embedding VECTOR(1536),         -- para RAG
  created_at TIMESTAMP
)
```

---

## 8. APRENDIZADO POR CONVERSAS

### O que sabemos com certeza
- O sistema aprende com **histórico real de conversas** do vendedor
- Para WhatsApp: processo de `ingest` assíncrono → worker lê histórico → escreve em memória
- Para Instagram: `fetch_channel_data` → `channel-diagnosis` skill
- Eventos de ingest:
  - `ingest:started` → "Tenho seus dados de chat, vou dar uma olhada ✨"
  - `ingest:digest` → worker reporta o que aprendeu em bullets
- O Copiloto consome os digests e decide se compartilha insights com o vendedor
- Conversas são armazenadas em JSONL por sessão

### Estrutura do JSONL de sessão
```jsonl
{"role": "user", "content": "Oi, qual o preço?", "timestamp": 1778160294.5}
{"role": "assistant", "content": "Olá! 😊 O valor é R$ 399,00 no PIX!", "timestamp": 1778160295.1}
```

### O que foi inferido
- O worker de ingest provavelmente usa `document_extract` para transformar histórico de chat em chunks de knowledge/strategy
- Padrões identificados nos chats (ex: "clientes sempre pedem preço sem especificar produto") viram insights na knowledge base
- Chunks de conversas recebem tag `source_type: "chat"` e `[chat]` no cabeçalho

### Nível de confiança: **MÉDIO** (fluxo observado, implementação interna não confirmada)

### Como reproduzir
1. Importar histórico de WhatsApp (ZIP de backup) ou Instagram DMs
2. Processar com LLM: extrair pares pergunta/resposta + padrões de objeção
3. Classificar automaticamente em knowledge ou strategy
4. Indexar como chunks com `source_type: "chat"`
5. Worker periódico que detecta novas conversas e re-indexa aprendizados

---

## 9. BASE DE CONHECIMENTO

### O que sabemos com certeza
- Arquitetura: arquivos Markdown estruturados + banco vetorial para embeddings
- Dois escopos separados:
  - `knowledge/` — informações factuais (produto, preço, política, FAQ)
  - `strategy/` — scripts táticos (objeções, follow-up, fechamento)
- Buyer Agent tem acesso APENAS a `knowledge/` e `strategy/` — não acessa diários nem MEMORY.md
- Busca por `memory_search` com 3 modos: `keyword`, `semantic`, `hybrid` (padrão com RRF fusion)
- Cada chunk tem hash SHA256 para detectar duplicatas
- `auto-append` em arquivos de memória (sem overwrite)

### Arquivos reais capturados (PRIME STORE)
```
knowledge/
  pricing.md      — preços, cupons, tabelas
  faq.md          — horário, endereço, pagamento, entrega
  policy.md       — troca, devolução, garantia
  product-info.md — catálogo de produtos
  guide.md        — guia de uso dos produtos
  brand-info.md   — informações da marca
  diesel-brand.md — conteúdo específico Diesel
  general.md      — informações gerais
  conversation-closure.md — encerramento de conversas

strategy/
  objection-handling.md  — como responder objeções
  follow-up.md           — scripts de follow-up
  sales-tactics.md       — táticas de venda
  pricing-rules.md       — regras de preço
  diesel-sales-script.md — script específico Diesel
  color-selection.md     — guia de escolha de cor
  link-response-template.md — templates de resposta com link
  mensagem-grupo-vip.md  — mensagens para grupo VIP
```

### Nível de confiança: **ALTO** (estrutura real capturada)

### Nossa implementação equivalente (CODEX)
- `src/pages/KnowledgePage.jsx` — tabela com filtros por categoria
- Categorias: PRODUTO, PRECO, FAQ, ESTRATEGIA, POLITICA, GUIA, GERAL
- Armazenado via `createTraining` no GPT Maker + `localStorage('codex_cats')`

### Possível estrutura de banco de dados
```sql
knowledge_files (
  id INT PRIMARY KEY,
  seller_id INT,
  category ENUM('knowledge','strategy'),
  topic VARCHAR,       -- 'pricing', 'faq', 'objection-handling'
  content TEXT,        -- markdown completo
  updated_at TIMESTAMP
)
-- + tabela de chunks para RAG (ver seção 7)
```

---

## 10. WHATSAPP

### O que sabemos com certeza
- Integração via WhatsApp Business API (Meta)
- Autorização por OAuth (URL: `{DEALISM_APP_HOST}bind-channel/whatsapp`)
- Fluxo de ingest especial para WhatsApp (diferente do Instagram):
  - Após `channel:authorized` → NÃO chama `fetch_channel_data` imediatamente
  - Worker de ingest processa histórico de forma assíncrona
  - Progresso notificado via `ingest:started` e `ingest:digest`
  - Copiloto NÃO envia mensagem de "sincronizando" para WhatsApp (apenas para Instagram)
- Sessão identificada por: `seller:{seller_id}:buyer:{buyer_id}:whatsapp`
- Suporte a mensagens de **áudio**: recebe → converte para texto para processar
- REGRA: cliente envia áudio → agente SEMPRE responde em texto (exceto follow-up de 23h45min)
- Follow-up de 23h45min usa **Text-to-Speech** para enviar áudio (campo `tone_name` = modelo TTS)
- Modelo TTS capturado: "Kore"

### Buyer agents por WhatsApp
- Chave: `buyer_{buyer_id}_whatsapp`
- Armazenado em `bindings.json`
- Workspace isolado por comprador

### Nível de confiança: **ALTO**

### Como reproduzir
- WhatsApp Business API → webhook recebe mensagens
- Processamento: texto direto, áudio → Whisper/AssemblyAI para transcrição
- Resposta de volta via API do WhatsApp
- TTS para follow-up de áudio: ElevenLabs / Google TTS / Azure com voz "Kore"

### Possíveis APIs necessárias
- WhatsApp Business API (Meta Cloud API)
- OpenAI Whisper ou AssemblyAI (transcrição de áudio)
- ElevenLabs ou similar (TTS para follow-up de áudio)

---

## 11. INSTAGRAM

### O que sabemos com certeza
- Integração via Instagram Graph API (Meta)
- Autorização por OAuth (URL: `{DEALISM_APP_HOST}bind-channel/instagram`)
- Fluxo de ingest diferente do WhatsApp:
  - Após `channel:authorized` → sincronização assíncrona começa, aguardar
  - Após `channel:data_ready` → chamar `fetch_channel_data` + rodar `channel-diagnosis`
- Suporte a **auto-reply em comentários de posts** (diferencial citado no onboarding)
- Sessão: `seller:{seller_id}:buyer:{buyer_id}:instagram`
- DMs processados como conversas normais
- `fetch_channel_data` retorna: `profile_summary`, `message_count`, `conversations`, `buyers`

### Diagnóstico de canal
```bash
python3 scripts/run_diagnosis.py --channel instagram
python3 scripts/run_diagnosis.py --channel instagram --mode analyze
python3 scripts/run_diagnosis.py --channel instagram --mode loss --industry beauty
```
- Modo `analyze`: análise de qualidade das conversas
- Modo `loss`: análise de perdas de vendas por indústria

### Diferencial de comentários
- Agente pode responder automaticamente comentários em posts do Instagram
- Módulo separado "Channel" no app
- Mencionado na mensagem de abertura do onboarding como feature premium

### Nível de confiança: **ALTO** (documentado no BOOTSTRAP.md)

### Possíveis APIs necessárias
- Instagram Graph API (Meta) — DMs e comentários
- Webhook para receber comentários em tempo real

---

## 12. GESTÃO DE LEADS

### O que sabemos com certeza
- `buyer_directory.json` mapeia **nome de exibição → buyer_id + channel**
- Cada comprador tem um workspace individual com `USER.md` (perfil do comprador)
- Status da conversa armazenado no `USER.md`: `active` ou `closed`
- Identificação por `buyer_id` + `channel` (pode ter mesmo buyer em WA e IG)
- 28 clientes capturados no backup da PRIME STORE: 12 WA, 14 IG, 2 testes
- `close_conversation.py` e `reopen_conversation.py` gerenciam status

### Estrutura do perfil do comprador (USER.md)
```markdown
- **Nome:** João Silva
- **Canal:** whatsapp
- **buyer_id:** 280038
- **Status:** active
- **Última interação:** 2026-05-10
```

### O que foi inferido
- Provável enriquecimento de dados ao longo das conversas (CEP, tamanho, preferências)
- Sistema de tags ou labels por tipo de cliente (novo, recorrente, VIP)
- Histórico de compras não confirmado — provavelmente externo (Shopify, Bagy, etc.)

### Nível de confiança: **MÉDIO** (estrutura básica confirmada, enriquecimento inferido)

### Possível estrutura de banco de dados
```sql
leads (
  id INT PRIMARY KEY,
  seller_id INT,
  buyer_id VARCHAR,
  channel ENUM('whatsapp','instagram'),
  display_name VARCHAR,
  phone VARCHAR,
  instagram_handle VARCHAR,
  status ENUM('active','closed','inactive'),
  tags JSON,
  last_interaction_at TIMESTAMP,
  created_at TIMESTAMP
)
```

---

## 13. FUNIL DE VENDAS

### O que sabemos com certeza
- O `playbook` do Buyer Agent define o funil (configurável por vendedor)
- Playbook capturado (PRIME STORE — Gabriela):
  1. **Saudação**: "Olá! 😊 Sou a Gabriela, Consultora de Vendas da PRIME STORE!"
  2. **Ouvir**: entender dúvida/reclamação
  3. **Entender**: pedir detalhes se necessário
  4. **Resolver**: resposta direta ou passo a passo
- Objetivo: não forçar venda, mas ajudar o cliente

### Funil típico de e-commerce (inferido dos scripts)
```
[Curiosidade/Contato inicial]
         ↓
[Qualificação — qual produto? qual tamanho?]
         ↓
[Apresentação — link com fotos, preço, variações]
         ↓
[Objeção — preço alto, aguardando, sem certeza]
         ↓
[Fechamento — PIX ou parcela? CEP para frete?]
         ↓
[Confirmação — comprovante de pagamento]
         ↓
[Pós-venda — entrega, avaliação]
```

### O que foi inferido
- A plataforma provavelmente tem visualização de funil com quantidades por etapa
- Conversas podem ser classificadas em etapas do funil automaticamente

### Nível de confiança: **MÉDIO** (playbook confirmado, visualização inferida)

### Como reproduzir
- Campo `playbook` no config do agente define as etapas
- LLM avalia em qual etapa a conversa está baseado no histórico
- Tags automáticas: `qualificando`, `negociando`, `aguardando_pagamento`, `fechado`, `perdido`

---

## 14. RELATÓRIOS

### O que sabemos com certeza
- Existe um módulo de Relatórios mencionado na navegação (`intelItems: relatorios` no nosso CRM)
- O script `run_diagnosis.py` gera análises de conversas
- Modos: `analyze` (qualidade geral) e `loss` (perdas por indústria)
- O Copiloto usa dados reais de conversas para "auditar" o vendedor

### O que foi inferido
- Métricas de relatório provável:
  - Taxa de conversão por canal
  - Tempo médio de resposta
  - Volume de conversas por período
  - Taxa de perdas por motivo (preço, disponibilidade, concorrência)
  - Performance do agente vs. atendimento humano
  - Receita atribuída ao agente de IA

### Nível de confiança: **BAIXO** (existência confirmada, conteúdo inferido)

### Como reproduzir
```sql
-- View de relatório básica
SELECT
  DATE_TRUNC('week', m.timestamp) as semana,
  COUNT(DISTINCT c.id) as total_conversas,
  COUNT(DISTINCT CASE WHEN c.status='closed_won' THEN c.id END) as vendas,
  COUNT(DISTINCT CASE WHEN c.autopilot=true THEN c.id END) as via_ia
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
WHERE c.seller_id = ?
GROUP BY 1
ORDER BY 1 DESC
```

---

## 15. MÉTRICAS

### O que sabemos com certeza
- O Lab IA (nossa implementação) tem sistema de **auditoria por conversa**:
  - Score 0-10
  - Avaliação de tom
  - Avaliação de dados fornecidos
  - Avaliação de aplicação do funil
- O Copiloto usa "dados reais como arma" — implica acesso a métricas em tempo real

### Métricas identificadas na auditoria de conversa
```
score: 0-10
tom: adequado/inadequado
dados: completo/incompleto
funil: aplicado/não aplicado
```

### O que foi inferido
- Dashboard com métricas em tempo real
- Comparativo IA vs. humano
- Alertas de anomalia (ex: queda de conversão, aumento de perdas)
- NPS ou satisfação do cliente (não confirmado)

### Nível de confiança: **MÉDIO** (auditoria confirmada, dashboard inferido)

---

## 16. CLASSIFICAÇÃO DE CLIENTES

### O que foi observado
- `buyer_directory.json` registra nome de exibição de cada comprador
- Histórico de conversas permite inferir perfil

### O que foi inferido
- Provável classificação automática por comportamento:
  - **Novo**: primeira conversa
  - **Recorrente**: múltiplas conversas
  - **VIP**: compras recorrentes / alto ticket
  - **Inativo**: sem interação por X dias
  - **Perdido**: interação sem conversão

### Evidência de segmento VIP
- Arquivo capturado: `strategy/mensagem-grupo-vip.md` — confirma existência de estratégia diferenciada para clientes VIP

### Nível de confiança: **BAIXO** (inferido a partir de fragmentos)

### Como reproduzir
```sql
-- Classificação automática por regras
UPDATE leads SET tag = CASE
  WHEN total_purchases > 3 THEN 'vip'
  WHEN last_interaction_at < NOW() - INTERVAL '30 days' THEN 'inativo'
  WHEN total_purchases = 0 AND created_at > NOW() - INTERVAL '7 days' THEN 'novo'
  ELSE 'recorrente'
END
```

---

## 17. FOLLOW-UP AUTOMÁTICO

### O que sabemos com certeza — DETALHADO

**Script real capturado**: `monitor_followups.py`

**3 momentos de follow-up com controle de envio único:**

| Stage | Tempo de inatividade | Disparo |
|-------|---------------------|---------|
| `30min` | 30 a 1424 minutos | Mensagem de texto |
| `23h45min` | 1425 a 1439 minutos | Mensagem de ÁUDIO (TTS) |
| `24h` | ≥ 1440 minutos | Mensagem de texto |

**Lógica de controle:**
- Estado persistido em `workspace/memory/followup_sent_state.json`
- Chave: `{buyer_id}_{channel}_{stage}` → timestamp de envio
- Cada follow-up enviado **APENAS UMA VEZ** por comprador/stage
- Não reenvia mesmo se cliente permanecer inativo

**Filosofia de follow-up (documentada no config):**
```
- Follow-up serve para AJUDAR, não forçar venda
- Respeitar o espaço do cliente
- 1 mensagem de follow-up é suficiente
- Cliente sabe onde te encontrar quando quiser
- NUNCA ser insistente ou desesperado
```

**Fonte do tempo de última mensagem:**
- Lê JSONL de sessão: `buyer_agents/buyer_{id}_{ch}_workspace/sessions/...jsonl`
- Última linha com timestamp (suporta ISO string e Unix epoch)
- Calcula inatividade em minutos

**Quem executa:** Script Python rodado por scheduler (cron ou worker)

### Nível de confiança: **ALTO** (código fonte capturado)

### Como reproduzir
```python
# Worker periódico (a cada 5 minutos)
def check_followups():
    state = load_sent_state()
    for buyer in get_all_active_buyers():
        inactive_mins = get_inactive_minutes(buyer)
        
        if 30 <= inactive_mins < 1425 and not was_sent(buyer, '30min', state):
            send_followup_text(buyer, template_30min)
            mark_sent(buyer, '30min', state)
            
        elif 1425 <= inactive_mins < 1440 and not was_sent(buyer, '23h45min', state):
            send_followup_audio(buyer, template_23h45_tts)  # usa TTS!
            mark_sent(buyer, '23h45min', state)
            
        elif inactive_mins >= 1440 and not was_sent(buyer, '24h', state):
            send_followup_text(buyer, template_24h)
            mark_sent(buyer, '24h', state)
    
    save_sent_state(state)
```

### Possível estrutura de banco de dados
```sql
followup_log (
  id INT PRIMARY KEY,
  buyer_id VARCHAR,
  channel VARCHAR,
  stage ENUM('30min','23h45min','24h'),
  sent_at TIMESTAMP,
  message_type ENUM('text','audio'),
  UNIQUE(buyer_id, channel, stage)  -- garante envio único
)
```

---

## 18. RECOMENDAÇÕES DE PRODUTOS

### O que sabemos com certeza
- A knowledge base contém catálogo de produtos com preços
- O Buyer Agent tem acesso a preços, variações e links de produto
- Regra documentada: SEMPRE enviar links COMPLETOS (com `https://`)
- Nunca encurtar ou abreviar URLs de produto

### Template de resposta com produto (capturado)
```
New Balance 9060 a partir de R$ 399,00 no PIX 👟

🔗 Segue o link com fotos:
https://www.primestoremen.com.br/produtos?q=9060

Me envia a foto ou nome do modelo que te passo o valor certinho! 😊
```

### O que foi inferido
- Sistema de busca de produto por descrição/imagem (cliente envia foto → agente identifica)
- Recomendação contextual: cliente pede "tênis feminino" → agente filtra catálogo
- Upsell: "também temos esse modelo que combina mais com..."
- Cross-sell baseado em compras anteriores (não confirmado)

### Evidência de reconhecimento de imagem
- Nossa implementação: `src/services/photoFlowService.js` e `src/services/ocrService.js`
- AWS Rekognition para identificação de produtos por foto

### Nível de confiança: **MÉDIO** (behavior confirmado, algoritmo de recomendação inferido)

### Como reproduzir
1. Catálogo em knowledge base: produto → preço → variações → URL
2. LLM extrai intenção da mensagem do cliente
3. RAG busca produto relevante na knowledge base
4. Formata resposta com link e CTA

---

## 19. RECUPERAÇÃO DE VENDAS PERDIDAS

### O que sabemos com certeza
- `run_diagnosis.py` tem modo `--mode loss` por indústria
- Copiloto usa dados reais para identificar padrões de perda
- Knowledge base tem `strategy/objection-handling.md` com scripts de superação

### Objeções tratadas (inferidas dos arquivos capturados)
- Preço alto → desconto compensatório (ex: R$289 → R$249 por espera)
- Esperar produto chegar → oferecer desconto como compensação
- Sem certeza do tamanho → guia de seleção + política de troca

### Exemplos reais de tática capturada
```
Desconto por espera: oferecer R$249 (de R$289) quando cliente precisa
aguardar chegada do produto — demonstra valorização do tempo do cliente.
```

### Sistema de recuperação (inferido)
- Conversas encerradas sem compra → classificadas como "perdidas"
- Diagnóstico automático identifica motivo da perda
- Copiloto sugere ações para recuperar (atualizar script, oferecer desconto)

### Nível de confiança: **MÉDIO** (táticas confirmadas, sistema de recuperação inferido)

### Como reproduzir
1. Classificar conversas: `closed_won`, `closed_lost`, `abandoned`
2. LLM analisa últimas mensagens → detecta motivo da perda
3. Tags automáticas: `lost_price`, `lost_availability`, `lost_competitor`
4. Dashboard de recuperação: clientes com `abandoned` + inatividade < 7 dias → nova tentativa

---

## 20. INTERFACE DO USUÁRIO

### O que sabemos com certeza

#### Estrutura de navegação (confirmada pelo nosso CRM clone)
```
[Left Nav — 56px colapsado / 240px expandido]
├── Dashboard (vermelho)
├── ESPAÇO DE TRABALHO
│   ├── Inbox (tela principal)
│   ├── Agentes
│   ├── Canais (autorização WA + IG)
│   ├── Catálogo
│   └── (Importar, Extrator)
└── INTELIGÊNCIA
    ├── Knowledge Base
    ├── Contatos/Leads
    ├── Lab IA
    └── Relatórios
```

#### Inbox (tela central)
- Lista de conversas à esquerda com filtros:
  - **Todos** · **Meus** · **Auto-IA** · **Não lidas** · **WhatsApp** · **Instagram**
- Área de chat à direita
- Botão "Generate" para gerar resposta por IA
- Toggle Autopilot no canto superior direito da conversa
- Ícone animado na lista de contatos para Global Autopilot

#### Agente visual
- Avatar configurável (URL de imagem)
- Nome do agente exibido nas conversas
- Anchor tag HTML especial: `<div agent-id='{id}'>@{nome}</div>`

#### Onboarding (5 etapas)
```
Stage 0: Business Discovery  — coleta contexto do negócio
Stage 1: Create Agent        — cria o Buyer Agent automaticamente
Stage 2: Feedback & Revise   — ajuste de configuração (max 1 rodada)
Stage 3: Probe & Optimize    — teste real com perguntas simuladas
Stage 4: Activation          — Inbox → Generate → Autopilot
Stage 5: Graduation          — finaliza onboarding, BOOTSTRAP.md deletado
```

#### Regras visuais de comunicação do Copiloto
- NUNCA URLs em markdown — sempre plain text com `https://`
- Máximo 4 partes por resposta (multi-part reply)
- Zero leakage interno (sem IDs, paths, JSON)
- Linguagem adaptável: detecta locale do sistema

### Nível de confiança: **ALTO** (reproduzido integralmente no nosso CRM)

---

## LISTA DE FUNCIONALIDADES MAPEADAS

| # | Funcionalidade | Confiança | Implementada no nosso CRM |
|---|---------------|-----------|--------------------------|
| 1 | Multi-canal WhatsApp + Instagram | Alto | Parcial (UI pronta) |
| 2 | Buyer Agent por cliente | Alto | Sim (via GPT Maker) |
| 3 | Seller Agent / Copiloto (DealOnca) | Alto | Sim (CODEX) |
| 4 | Autopilot por conversa | Alto | Sim (filtro Auto-IA) |
| 5 | Global Autopilot | Alto | Não |
| 6 | Botão Generate | Alto | Sim |
| 7 | Onboarding guiado em 5 etapas | Alto | Não |
| 8 | Knowledge Base (2 escopos) | Alto | Sim |
| 9 | Ingest de histórico WhatsApp | Alto | Não |
| 10 | Ingest de histórico Instagram | Alto | Não |
| 11 | Follow-up 30min / 23h45 / 24h | Alto | Não |
| 12 | TTS para follow-up de áudio | Alto | Não |
| 13 | Auto-reply em comentários IG | Alto | Não |
| 14 | Diagnóstico de conversas | Alto | Sim (Lab IA) |
| 15 | Document extract (PDF/URL/etc) | Alto | Não |
| 16 | Config de agente por JSON | Alto | Sim (via GPT Maker) |
| 17 | Fechar/reabrir conversa | Alto | Não |
| 18 | Buyer directory | Alto | Não |
| 19 | Sessões em JSONL | Alto | Não |
| 20 | RAG / busca semântica na KB | Médio | Não (usa GPT Maker KB) |
| 21 | Escalation para humano | Alto | Não |
| 22 | Script de objeções | Alto | Sim (na KB) |
| 23 | Recomendação de produto com link | Médio | Sim |
| 24 | Diagnóstico de perdas por indústria | Alto | Não |
| 25 | Reconhecimento de foto de produto | Médio | Sim (photoFlowService) |

---

## LISTA DE FUNCIONALIDADES AINDA DESCONHECIDAS

1. Estrutura exata do banco de dados de produção (SQL ou NoSQL?)
2. Provedor LLM real (Claude? GPT-4? próprio?)
3. Infraestrutura de hosting (AWS? GCP? Vercel?)
4. Sistema de billing e planos (preços, limites por plano)
5. Sistema de NPS / satisfação do cliente comprador
6. Integração com plataformas de e-commerce (Shopify, Bagy, Loja Integrada)
7. Sistema de pagamento integrado (cobrar do vendedor)
8. Painel de administração interno (backoffice)
9. API pública para integradores
10. Sistema de permissões multi-usuário (equipe do vendedor)
11. Funcionalidade de grupos do WhatsApp
12. Campanhas em massa (broadcast)
13. Chatbot de qualificação pré-venda (flow builder visual)
14. Integração com CRMs externos (HubSpot, Pipedrive)
15. Analytics de comentários do Instagram (além de DMs)
16. Sistema de A/B testing de respostas
17. Limite de mensagens por plano (cotas)
18. Sistema de webhooks para integrações externas
19. App mobile nativo (existe?)
20. Suporte a canais além de WA e IG (Telegram, SMS, email?)

---

## PERGUNTAS PARA INVESTIGAR

### Sobre arquitetura
1. O LLM base é Claude (Anthropic), GPT-4 (OpenAI) ou modelo próprio?
2. O banco vetorial é Pinecone, Weaviate, pgvector ou outro?
3. Os workers de follow-up rodam em cron, Celery, ou serviço gerenciado?
4. O Dealism usa WebSockets para Inbox em tempo real ou polling?
5. Como os Buyer Agents são isolados — containers, threads, ou apenas contexto separado?

### Sobre produto
6. Qual é o limite de clientes simultâneos por plano?
7. O sistema detecta quando o cliente está "pronto para comprar" automaticamente?
8. Existe um score de propensão de compra por cliente?
9. Como funciona o Relay (assumir conversa) — é o mesmo que nosso "copilot mode"?
10. Existe um módulo de campanhas proativas (não apenas reativas)?

### Sobre integração
11. A autorização do WhatsApp é via WhatsApp Business API oficial ou solução alternativa (Evolution API)?
12. Existe integração nativa com Shopify/Bagy para puxar catálogo automaticamente?
13. O Dealism tem webhooks de saída (notificar sistemas externos sobre eventos)?

### Sobre dados
14. O Dealism tem acesso a dados de conversão financeira (saber se a venda foi paga)?
15. Como o sistema distingue mensagens enviadas pela IA vs. pelo humano no histórico?
16. Os dados de conversas são usados para treinar modelos próprios?

---

## ROADMAP PARA CONSTRUIR SISTEMA SEMELHANTE

### FASE 1 — Fundação (2-4 semanas)
**Objetivo:** Sistema básico funcional com IA respondendo mensagens

- [ ] Backend: FastAPI + PostgreSQL + Redis
- [ ] Integração WhatsApp Business API (Meta Cloud API)
- [ ] Buyer Agent básico: LLM + config JSON + knowledge base simples
- [ ] Inbox web em tempo real (WebSocket)
- [ ] Botão Generate funcional
- [ ] Deploy em produção (Railway/Fly.io)

### FASE 2 — Knowledge Base e Treinamento (2-3 semanas)
**Objetivo:** Vendedor consegue treinar o agente com seus dados

- [ ] Upload de documentos (PDF, XLSX, DOCX)
- [ ] Document extraction com LLM
- [ ] Banco vetorial (pgvector ou Pinecone)
- [ ] RAG para respostas contextualizadas
- [ ] Interface de Knowledge Base (tabela com filtros)
- [ ] Categorias: produto, preço, FAQ, estratégia, política

### FASE 3 — Instagram e Automação (3-4 semanas)
**Objetivo:** Canal Instagram + follow-up automático

- [ ] Integração Instagram Graph API
- [ ] Auto-reply em comentários de posts
- [ ] Follow-up automático: 30min / 23h45min (TTS) / 24h
- [ ] Worker periódico (Celery + Beat)
- [ ] TTS para follow-up de áudio (ElevenLabs)
- [ ] Transcrição de áudio recebido (Whisper)

### FASE 4 — Copiloto e Onboarding (3-4 semanas)
**Objetivo:** Experiência de onboarding guiado

- [ ] Copiloto (DealOnca / CODEX) com personalidade definida
- [ ] Onboarding em 5 etapas automatizado
- [ ] Criação de agente guiada por IA
- [ ] Diagnóstico de conversas
- [ ] Análise de perdas por indústria
- [ ] Probe/test antes de ativar

### FASE 5 — Autopilot e Gestão (2-3 semanas)
**Objetivo:** Automação completa

- [ ] Toggle Autopilot por conversa
- [ ] Global Autopilot para todos os clientes
- [ ] Ingest de histórico WhatsApp (importar backup)
- [ ] Aprendizado por conversas históricas
- [ ] Classificação automática de leads (novo/recorrente/VIP/inativo/perdido)
- [ ] Funil de vendas automático com tags

### FASE 6 — Analytics e Relatórios (2-3 semanas)
**Objetivo:** Dados para tomada de decisão

- [ ] Dashboard de métricas (conversão, tempo de resposta, volume)
- [ ] Relatório de perdas (motivo × stage do funil)
- [ ] Score de auditoria de conversas (0-10)
- [ ] Comparativo IA vs. humano
- [ ] Alertas de anomalia

### FASE 7 — Escala e Integrações (ongoing)
**Objetivo:** Produto maduro para escala

- [ ] API pública para integradores
- [ ] Webhook de saída para sistemas externos
- [ ] Integração com plataformas de e-commerce (Bagy, Shopify)
- [ ] Multi-usuário (equipe do vendedor)
- [ ] Sistema de billing (Stripe + planos)
- [ ] App mobile (React Native)

---

## NOTAS FINAIS SOBRE SEGURANÇA DO SISTEMA

O Dealism tem design consciente de segurança em múltiplas camadas:

1. **Prompt Security**: resistência a jailbreak, DAN, identity probing
2. **Data Isolation**: cada Buyer Agent acessa apenas sua knowledge, nunca dados de outros compradores
3. **Credential Rules**: NUNCA pedir senha ou dados de cartão
4. **Internal Opacity**: zero leakage de paths, IDs, tool names para usuário final
5. **URL Safety**: links sempre completos com `https://`, nunca encurtados
6. **Audio Privacy**: áudio recebido → processado como texto, não retransmitido

---

*Documento gerado em 2026-06-20. Baseado em análise reversa de arquivos internos do Dealism capturados no backup da PRIME STORE (Seller ID: 38537, Agente: Gabriela, ID: CJ5jR64o) e nas sessões de engenharia do projeto IGNITE PRIME CRM.*
