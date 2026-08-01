-- Migration 016: Tabelas NEX Clientes, Histórico e Segurança
-- Consolidada: criação + RLS + índices numa única migration
-- Status: Versionada em repositório, NÃO APLICADA AINDA
-- Rodar manualmente no SQL Editor do Supabase (projeto não usa CLI/migrations automatizadas)

BEGIN;

-- ========== TABELA: nex_clientes ==========
create table nex_clientes (
  id                  uuid primary key default gen_random_uuid(),

  -- Chave natural (UNIQUE obrigatória)
  origem_loja         text not null,
  nex_codigo          text not null,

  -- Campos de cliente
  nome                text not null,
  cpf_cnpj            text,
  telefone            text,
  celular             text,
  email               text,
  endereco            text,

  -- Saldos: numeric(12,2) garante precisão financeira
  saldo_debito_nex    numeric(12,2),
  saldo_credito_nex   numeric(12,2),
  valor_liquido_nex   numeric(12,2),

  -- Metadados da origem
  data_snapshot       date,
  observacao_original varchar(500),  -- Truncado no banco (500 caracteres), validado em código
  metadados           jsonb default '{}',

  -- Rastreabilidade interna
  content_hash        text not null, -- SHA256 ou similar do payload normalizado
  ausente_desde       timestamptz,   -- Soft-delete: marca quando cliente desaparece, nunca delete real

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Constraint único: origem_loja + nex_codigo (impede duplicidade, gera índice automático)
  constraint uq_nex_clientes_origem_codigo unique (origem_loja, nex_codigo)
);

-- ========== TABELA: nex_sync_eventos ==========
create table nex_sync_eventos (
  id              uuid primary key default gen_random_uuid(),

  -- Rastreabilidade de lote
  lote_id         text not null,
  correlation_id  text,

  -- Identificação do cliente
  origem_loja     text not null,
  nex_codigo      text not null,

  -- Tipo de evento: criado, atualizado, sem_alteracao, ausente_na_exportacao
  tipo            text not null,

  -- Histórico de mudança (para auditoria)
  valor_anterior  jsonb,
  valor_novo      jsonb,

  created_at      timestamptz not null default now()
);

-- ========== ÍNDICES ESSENCIAIS ==========
-- nex_clientes: UNIQUE já cria índice para chave natural, nenhum outro necessário nesta fase
-- nex_sync_eventos: queries por lote e por cliente/histórico
create index idx_nex_sync_eventos_lote
  on nex_sync_eventos (lote_id);

create index idx_nex_sync_eventos_cliente_tempo
  on nex_sync_eventos (origem_loja, nex_codigo, created_at desc);

create index idx_nex_sync_eventos_origem_tempo
  on nex_sync_eventos (origem_loja, created_at desc);

-- ========== ROW LEVEL SECURITY (RLS) ==========
-- Habilitado aqui, NENHUMA policy pública (mesmo padrão de profile_learning_audit/qwen_health_state)
-- Acesso EXCLUSIVO via SUPABASE_SECRET_KEY (service_role) — nunca anon/authenticated

alter table nex_clientes enable row level security;
alter table nex_sync_eventos enable row level security;

-- Confirmação explícita: zero policies criadas
-- RLS está LIGADA, mas sem nenhuma policy = sem nenhum acesso via anon/authenticated/public
-- Qualquer tentativa de SELECT/INSERT/UPDATE/DELETE sem service_role retorna permission_denied

-- ========== COMENTÁRIOS PARA DOCUMENTAÇÃO ==========
comment on table nex_clientes is
  'Clientes importados do NEX. Isolado do Base44. Zero escrita em Cliente/Venda/Parcela/HistoricoAtividade (decisão #2). RLS habilitada, nenhuma policy pública.';

comment on table nex_sync_eventos is
  'Histórico de sincronização NEX. Uma linha por evento por cliente por lote. Rastreabilidade completa (lote_id, correlation_id, origem_loja, nex_codigo, timestamp).';

comment on column nex_clientes.origem_loja is
  'Identificador da loja/origem (ex: primestore-udi). Obrigatório (decisão #4). Parte de UNIQUE(origem_loja, nex_codigo).';

comment on column nex_clientes.nex_codigo is
  'Código único do cliente no NEX. Obrigatório. Parte de UNIQUE(origem_loja, nex_codigo).';

comment on column nex_clientes.cpf_cnpj is
  'CPF ou CNPJ como text (sem validação de formato no banco). Validação em código (api/_nexClientes.js) é obrigatória. Base44 Cliente.cpf pode ter tipo diferente — documentar para consolidação futura.';

comment on column nex_clientes.telefone is
  'Telefone como text (sem validação de dígitos no banco). Validação em código. Chave de casamento pra lookup de Cliente na Lyra (ver Fluxo F.1).';

comment on column nex_clientes.observacao_original is
  'Texto livre do NEX, truncado em 500 caracteres (varchar(500)). Pode conter PII. Validação e sanitização obrigatórias em código.';

comment on column nex_clientes.saldo_debito_nex is
  'Saldo de débito do NEX (numeric(12,2) garante precisão financeira). Nunca impacta Parcela do PRIME Cobranças (decisão #2).';

comment on column nex_clientes.saldo_credito_nex is
  'Saldo de crédito do NEX (numeric(12,2)). Nunca impacta Parcela do PRIME Cobranças.';

comment on column nex_clientes.valor_liquido_nex is
  'Saldo líquido (debito - credito). Calculável, mas armazenado pra rastreabilidade do snapshot.';

comment on column nex_clientes.content_hash is
  'Hash determinístico do payload normalizado (origem_loja+nex_codigo NÃO inclusos). Usado pra decidir criado/atualizado/sem_alteracao sem comparação campo a campo. Implementa idempotência em código.';

comment on column nex_clientes.ausente_desde is
  'Soft-delete: NULL = cliente presente na última exportação. Não-NULL = timestamp de quando deixou de aparecer. Nunca deleta automaticamente (decisão #12). Marca pra auditoria.';

comment on column nex_sync_eventos.tipo is
  'Valores válidos: criado, atualizado, sem_alteracao, ausente_na_exportacao. Nunca misto numa mesma linha. Implementa Fluxo I (integração NEX).';

comment on column nex_sync_eventos.lote_id is
  'Identificador do lote de sincronização (ex: nex-sync-2026-07-31-14h). Permite rastreabilidade por lote inteiro.';

comment on column nex_sync_eventos.correlation_id is
  'ID de correlação entre PrimeIntegracaoNex e IGNITE PRIME. Opcional. Facilita debugging ponta-a-ponta.';

-- ========== NOTA FINAL ==========
-- RLS está LIGADA, ZERO policies, ZERO acesso público garantido.
-- Qualquer SELECT/INSERT/UPDATE/DELETE sem SUPABASE_SECRET_KEY retorna:
--   {"code":"42501","message":"permission denied for table nex_clientes"}
--
-- Validação de formato (CPF, telefone, email, etc) fica em código backend.
-- Backend deve truncar observacao_original com segurança antes de enviar.
-- Nenhuma janela de vulnerabilidade entre tabela criada e RLS ligada — tudo numa transaction.

COMMIT;
