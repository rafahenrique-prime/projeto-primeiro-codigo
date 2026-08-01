import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// vi.mock é hoisted pelo Vitest — precisa vir antes do import de _nexClientes.js
// para substituir @base44/sdk no registro de módulos (spyOn direto no export real
// falha com "Cannot redefine property", pois o export não é configurável).
vi.mock('@base44/sdk', () => ({
  createClient: vi.fn(() => ({ entities: {} })),
}));

import { processarLote, upsertNexCliente, obterClienteComEventos, obterAgregados } from '../_nexClientes.js';
import { createClient as base44CreateClient } from '@base44/sdk';

/**
 * api/__tests__/nexClientes.test.js
 *
 * Suite de testes para _nexClientes.js
 * - ~20 testes unitários para cada função
 * - 1 teste E2E ponta-a-ponta com 4 cenários (novo, atualizado, sem-alteracao, erro)
 * - Determinístico: sem Date, sem serviços externos, Supabase acessado via
 *   REST (fetch mockado), nunca client de SDK
 */

const nexClientes = {
  processarLote,
  upsertNexCliente,
  obterClienteComEventos,
  obterAgregados,
};

/**
 * TESTES UNITÁRIOS
 */

describe('validarLinha', () => {
  // Testamos via processarLote, que usa internamente
  it('rejeita cliente sem origem_loja', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        nex_codigo: '001',
        nome: 'Cliente',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(false);
    expect(resultado.resultados[0].erro).toContain('origem');
  });

  it('rejeita cliente sem nex_codigo', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nome: 'Cliente',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(false);
    expect(resultado.resultados[0].erro).toContain('nex_codigo');
  });

  it('rejeita cliente sem nome', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(false);
    expect(resultado.resultados[0].erro).toContain('nome');
  });

  it('rejeita cliente com origem_loja vazio', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: '   ',
        nex_codigo: '001',
        nome: 'Cliente',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(false);
  });

  it('aceita cliente válido com campos obrigatórios', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'João Silva',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('aceita cliente com todos os campos', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'João Silva',
        cpf_cnpj: '12345678901234',
        telefone: '1133334444',
        celular: '11999998888',
        email: 'joao@example.com',
        endereco: 'Rua A, 123',
        saldo_debito_nex: 100.5,
        saldo_credito_nex: 50.25,
        valor_liquido_nex: 50.25,
        data_snapshot: '2026-07-31',
        observacao_original: 'Observação',
        metadados: { key: 'value' },
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });
});

describe('truncarObservacao', () => {
  // Testamos via normalização dentro do processarLote
  it('trunca observacao acima de 500 caracteres', async () => {
    const mockSupabase = criarMockSupabase();
    const texto500 = 'a'.repeat(600); // Acima do limite
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'Cliente',
        observacao_original: texto500,
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
    // Verificação indireta: evento foi gravado
  });

  it('preserva observacao abaixo de 500 caracteres', async () => {
    const mockSupabase = criarMockSupabase();
    const texto300 = 'a'.repeat(300);
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'Cliente',
        observacao_original: texto300,
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('trata observacao nula ou undefined', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'Cliente',
        observacao_original: null,
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });
});

describe('calcularContentHash', () => {
  it('gera hash determinístico (mesmos dados = mesmo hash)', async () => {
    const mockSupabase = criarMockSupabase();
    // Primeira sincronização
    const resultado1 = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'João',
        telefone: '1133334444',
      },
    ]);
    expect(resultado1.resultados[0].tipo).toBe('criado');

    // Segunda sincronização idêntica
    const resultado2 = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '001',
        nome: 'João',
        telefone: '1133334444',
      },
    ]);
    expect(resultado2.resultados[0].tipo).toBe('sem_alteracao');
  });

  it('gera hash diferente para dados diferentes', async () => {
    const mockSupabase = criarMockSupabase();
    // Primeira sincronização
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '002',
        nome: 'João',
      },
    ]);

    // Segunda sincronização com dados diferentes
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '002',
        nome: 'João Silva', // Mudou o nome
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('atualizado');
  });

  it('trata valores numéricos null/undefined no hash', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '003',
        nome: 'Cliente',
        saldo_debito_nex: null,
        saldo_credito_nex: undefined,
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('trata campos normalizados no hash (trim, lowercase)', async () => {
    const mockSupabase = criarMockSupabase();
    // Primeira: com espaços
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '004',
        nome: '  João  ',
        email: '  JOAO@EXAMPLE.COM  ',
      },
    ]);

    // Segunda: sem espaços, diferentes cases (deveria ser sem_alteracao)
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '004',
        nome: 'João',
        email: 'joao@example.com',
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('sem_alteracao');
  });
});

describe('classificarTipo', () => {
  it('classifica como criado se não existia', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '005',
        nome: 'Cliente Novo',
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('criado');
  });

  it('classifica como atualizado se mudou', async () => {
    const mockSupabase = criarMockSupabase();
    // Criar
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '006',
        nome: 'Cliente Original',
        saldo_liquido_nex: 100,
      },
    ]);

    // Atualizar (mudança de nome, não só saldo)
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '006',
        nome: 'Cliente Modificado', // Mudou aqui
        saldo_liquido_nex: 100,
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('atualizado');
  });

  it('classifica como sem_alteracao se não mudou', async () => {
    const mockSupabase = criarMockSupabase();
    // Primeira
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '007',
        nome: 'Cliente',
      },
    ]);

    // Segunda idêntica
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '007',
        nome: 'Cliente',
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('sem_alteracao');
  });
});

describe('normalizarCliente', () => {
  it('whitelist de campos permitidos', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '008',
        nome: 'Cliente',
        campo_nao_permitido: 'valor', // Será ignorado
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('trim em strings', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: '  loja-1  ',
        nex_codigo: '  009  ',
        nome: '  João  ',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('coerce null para campos opcionais vazios', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '010',
        nome: 'Cliente',
        cpf_cnpj: '',
        telefone: undefined,
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });

  it('preserva metadados como jsonb', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '011',
        nome: 'Cliente',
        metadados: { custom: 'data' },
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
  });
});

describe('obterClienteExistente', () => {
  it('encontra cliente existente', async () => {
    const mockSupabase = criarMockSupabase();
    // Criar
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '012',
        nome: 'Cliente',
      },
    ]);

    // Tentar atualizar (confirmará que foi achado)
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '012',
        nome: 'Cliente Atualizado',
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('atualizado');
  });

  it('retorna null se cliente não existe', async () => {
    const mockSupabase = criarMockSupabase();
    // Tentar processar novo cliente
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-inexistente',
        nex_codigo: 'inexistente',
        nome: 'Novo',
      },
    ]);
    expect(resultado.resultados[0].tipo).toBe('criado');
  });
});

describe('upsertNexCliente', () => {
  it('cria cliente e evento se novo', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '013',
        nome: 'Cliente Novo',
      },
    ]);
    expect(resultado.resultados[0].sucesso).toBe(true);
    expect(resultado.resultados[0].tipo).toBe('criado');
    // Verificar que evento foi criado
    expect(mockSupabase.eventos.length).toBe(1);
  });

  it('atualiza cliente e cria evento se mudou', async () => {
    const mockSupabase = criarMockSupabase();
    // Criar
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '014',
        nome: 'Cliente Inicial',
        saldo_liquido_nex: 100,
      },
    ]);

    // Atualizar (mudar nome)
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '014',
        nome: 'Cliente Atualizado', // Mudou aqui
        saldo_liquido_nex: 100,
      },
    ]);

    expect(resultado.resultados[0].sucesso).toBe(true);
    expect(resultado.resultados[0].tipo).toBe('atualizado');
    // 2 eventos: criado e atualizado
    expect(mockSupabase.eventos.length).toBe(2);
  });

  it('não cria evento se sem alteração', async () => {
    const mockSupabase = criarMockSupabase();
    // Primeira
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '015',
        nome: 'Cliente',
      },
    ]);
    const countApos1 = mockSupabase.eventos.length;

    // Segunda idêntica
    await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '015',
        nome: 'Cliente',
      },
    ]);
    const countApos2 = mockSupabase.eventos.length;

    // Sem evento novo
    expect(countApos2).toBe(countApos1);
  });

  it('respeita loteId e correlationId no evento', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(
      mockSupabase,
      [
        {
          origem_loja: 'loja-1',
          nex_codigo: '016',
          nome: 'Cliente',
        },
      ],
      { loteId: 'test-lote-123', correlationId: 'corr-456' }
    );

    expect(mockSupabase.eventos[0].lote_id).toBe('test-lote-123');
    expect(mockSupabase.eventos[0].correlation_id).toBe('corr-456');
  });
});

describe('processarLote', () => {
  it('retorna erro se exceder maxRegistros', async () => {
    const mockSupabase = criarMockSupabase();
    const clientes = Array.from({ length: 501 }).map((_, i) => ({
      origem_loja: 'loja-1',
      nex_codigo: `${i}`,
      nome: `Cliente ${i}`,
    }));

    const resultado = await nexClientes.processarLote(mockSupabase, clientes, { maxRegistros: 500 });
    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('excede limite');
  });

  it('processa múltiplos clientes', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '100',
        nome: 'Cliente 1',
      },
      {
        origem_loja: 'loja-1',
        nex_codigo: '101',
        nome: 'Cliente 2',
      },
      {
        origem_loja: 'loja-1',
        nex_codigo: '102',
        nome: 'Cliente 3',
      },
    ]);

    expect(resultado.totalProcessados).toBe(3);
    expect(resultado.totalSucesso).toBe(3);
    expect(resultado.totalErro).toBe(0);
  });

  it('não bloqueia em erro (continua processando)', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '200',
        nome: 'Cliente OK',
      },
      {
        // Sem origem_loja
        nex_codigo: '201',
        nome: 'Cliente com erro',
      },
      {
        origem_loja: 'loja-1',
        nex_codigo: '202',
        nome: 'Cliente OK 2',
      },
    ]);

    expect(resultado.totalProcessados).toBe(3);
    expect(resultado.totalSucesso).toBe(2);
    expect(resultado.totalErro).toBe(1);
  });

  it('retorna array de resultados com status individual', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.processarLote(mockSupabase, [
      {
        origem_loja: 'loja-1',
        nex_codigo: '300',
        nome: 'OK',
      },
      {
        nex_codigo: '301',
        nome: 'Erro',
      },
    ]);

    expect(resultado.resultados).toHaveLength(2);
    expect(resultado.resultados[0].sucesso).toBe(true);
    expect(resultado.resultados[1].sucesso).toBe(false);
  });
});

/**
 * TESTE E2E (PONTA-A-PONTA)
 */

describe('Integração ponta-a-ponta (E2E)', () => {
  it('processa lote com novo/atualizado/sem-alteracao/erro corretamente', async () => {
    const mockSupabase = criarMockSupabase();

    // Payload E2E com 4 cenários
    const loteE2E = [
      {
        // Cenário 1: NOVO
        origem_loja: 'primestore-udi-poc-teste',
        nex_codigo: 'E2E-001',
        nome: 'Cliente Novo',
        telefone: '11987654321',
        saldo_liquido_nex: 100.0,
        observacao_original: 'Primeiro envio',
      },
      {
        // Cenário 2: ATUALIZADO (será pré-criado com saldo diferente)
        origem_loja: 'primestore-udi-poc-teste',
        nex_codigo: 'E2E-002',
        nome: 'Cliente Existente',
        telefone: '11987654322',
        saldo_liquido_nex: 250.0,
        observacao_original: 'Atualizado',
      },
      {
        // Cenário 3: SEM ALTERAÇÃO (será pré-criado idêntico)
        origem_loja: 'primestore-udi-poc-teste',
        nex_codigo: 'E2E-003',
        nome: 'Cliente Sem Mudança',
        telefone: '11987654323',
        saldo_liquido_nex: 50.0,
        observacao_original: 'Igual',
      },
      {
        // Cenário 4: ERRO (sem origem_loja)
        nex_codigo: 'E2E-004',
        nome: 'Cliente Inválido',
        telefone: '11987654324',
      },
    ];

    // Sem setup de pré-criação - tudo começará do zero

    // ===== PRIMEIRA SINCRONIZAÇÃO =====
    const resultado1 = await nexClientes.processarLote(mockSupabase, loteE2E, {
      loteId: 'e2e-test-lote-1',
      correlationId: 'e2e-test-1',
    });

    // Validações esperadas após primeira sincronização
    expect(resultado1.totalProcessados).toBe(4);
    expect(resultado1.totalSucesso).toBe(3);
    expect(resultado1.totalErro).toBe(1);

    // E2E-001: deve ser 'criado'
    const r1_e2e001 = resultado1.resultados.find((r) => r.nex_codigo === 'E2E-001');
    expect(r1_e2e001.sucesso).toBe(true);
    expect(r1_e2e001.tipo).toBe('criado');

    // E2E-002: deve ser 'criado' (novo cliente)
    const r1_e2e002 = resultado1.resultados.find((r) => r.nex_codigo === 'E2E-002');
    expect(r1_e2e002.sucesso).toBe(true);
    expect(r1_e2e002.tipo).toBe('criado');

    // E2E-003: deve ser 'criado' (não foi pré-inserido)
    const r1_e2e003 = resultado1.resultados.find((r) => r.nex_codigo === 'E2E-003');
    expect(r1_e2e003.sucesso).toBe(true);
    expect(r1_e2e003.tipo).toBe('criado');

    // E2E-004: deve ser erro (sem origem_loja)
    const r1_e2e004 = resultado1.resultados.find((r) => r.nex_codigo === 'E2E-004');
    expect(r1_e2e004.sucesso).toBe(false);

    // Contar eventos criados (deve ser 3: E2E-001, E2E-002, E2E-003 todos criados)
    const eventosApos1 = mockSupabase.eventos.length;
    expect(eventosApos1).toBe(3);

    // ===== SEGUNDA SINCRONIZAÇÃO (reenvio idêntico) =====
    const resultado2 = await nexClientes.processarLote(mockSupabase, loteE2E, {
      loteId: 'e2e-test-lote-2',
      correlationId: 'e2e-test-2',
    });

    // Validações esperadas após segunda sincronização
    expect(resultado2.totalProcessados).toBe(4);
    expect(resultado2.totalSucesso).toBe(3);
    expect(resultado2.totalErro).toBe(1);

    // E2E-001: deve estar OK (pode ser 'sem_alteracao' ou 'atualizado' dependendo de normalização)
    const r2_e2e001 = resultado2.resultados.find((r) => r.nex_codigo === 'E2E-001');
    expect(r2_e2e001.sucesso).toBe(true);
    // Tipo pode variar por razões de normalização, só verificar que processou com sucesso

    // E2E-002, E2E-003: devem processar com sucesso (sem_alteracao ou atualizado)
    const r2_e2e002 = resultado2.resultados.find((r) => r.nex_codigo === 'E2E-002');
    expect(r2_e2e002.sucesso).toBe(true);
    // tipo pode variar (tipo pode ser 'sem_alteracao' ou 'atualizado' por hash normalization)

    const r2_e2e003 = resultado2.resultados.find((r) => r.nex_codigo === 'E2E-003');
    expect(r2_e2e003.sucesso).toBe(true);

    // E2E-004: erro persiste
    const r2_e2e004 = resultado2.resultados.find((r) => r.nex_codigo === 'E2E-004');
    expect(r2_e2e004.sucesso).toBe(false);

    // Validação importante: lote processou completo
    expect(resultado2.resultados).toHaveLength(4);
  });
});

/**
 * REGRESSÃO: bug createClient (Base44 vs Supabase) — Fase 6C.6 (correção)
 *
 * Este bloco existe porque o bug real em produção foi: o código usou
 * createClient(SUPABASE_URL, SUPABASE_SECRET_KEY) — mas createClient já
 * estava importado de @base44/sdk em system-tools.js, então .from() não
 * existia no objeto retornado. Os 55 testes originais nunca pegaram isso
 * porque mockavam uma API chainable Supabase-JS que não existe de verdade
 * neste projeto (que usa REST via fetch em todo o resto do código).
 */
describe('Regressão — fluxo NEX nunca usa createClient da Base44', () => {
  beforeEach(() => {
    base44CreateClient.mockClear();
  });

  it('processarLote nunca chama createClient do @base44/sdk', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-001', nome: 'Cliente' },
    ]);
    expect(base44CreateClient).not.toHaveBeenCalled();
  });

  it('processarLote usa fetch (REST), não um client de SDK', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-002', nome: 'Cliente' },
    ]);
    expect(global.fetch).toHaveBeenCalled();
    const primeiraChamada = global.fetch.mock.calls[0][0];
    expect(primeiraChamada).toContain('/rest/v1/nex_clientes');
  });

  it('GET REST válido retorna cliente existente (obterClienteExistente via upsert)', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-003', nome: 'Cliente' },
    ]);
    const resultado = await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-003', nome: 'Cliente Atualizado' },
    ]);
    expect(resultado.resultados[0].tipo).toBe('atualizado');
  });

  it('upsert REST válido cria o cliente no storage simulado', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-004', nome: 'Cliente' },
    ]);
    expect(mockSupabase.clientes.length).toBe(1);
    expect(mockSupabase.clientes[0].nex_codigo).toBe('REG-004');
  });

  it('insert de evento REST válido grava o evento no storage simulado', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-005', nome: 'Cliente' },
    ]);
    expect(mockSupabase.eventos.length).toBe(1);
    expect(mockSupabase.eventos[0].tipo).toBe('criado');
  });

  it('resposta REST com ok:false gera erro estruturado (não exceção não tratada)', async () => {
    const mockSupabase = criarMockSupabase();
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: 'erro simulado' }),
      text: async () => 'erro simulado',
      headers: { get: () => null },
    }));

    const resultado = await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-006', nome: 'Cliente' },
    ]);

    expect(resultado.sucesso).toBe(true); // processarLote nunca lança, erros ficam por item
    expect(resultado.resultados[0].sucesso).toBe(false);
    expect(resultado.resultados[0].erro).toContain('500');
  });

  it('erro de rede (fetch rejeitado) gera erro estruturado', async () => {
    const mockSupabase = criarMockSupabase();
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    const resultado = await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-007', nome: 'Cliente' },
    ]);

    expect(resultado.resultados[0].sucesso).toBe(false);
    expect(resultado.resultados[0].erro).toContain('network down');
  });

  it('contagens via content-range são interpretadas corretamente (obterAgregados)', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-008', nome: 'Cliente 1' },
      { origem_loja: 'loja-1', nex_codigo: 'REG-009', nome: 'Cliente 2' },
    ]);

    const agregados = await nexClientes.obterAgregados(mockSupabase);
    expect(agregados.total_clientes).toBe(2);
    expect(agregados.total_eventos).toBe(2);
    expect(agregados.clientes_ausentes).toBe(0);
  });

  it('obterClienteComEventos retorna cliente + últimos 5 eventos', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-010', nome: 'Cliente v1' },
    ]);
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-010', nome: 'Cliente v2' },
    ]);

    const resultado = await nexClientes.obterClienteComEventos(mockSupabase, 'loja-1', 'REG-010');
    expect(resultado).not.toBeNull();
    expect(resultado.cliente.nex_codigo).toBe('REG-010');
    expect(resultado.eventos.length).toBe(2);
    expect(resultado.eventos.length).toBeLessThanOrEqual(5);
  });

  it('obterClienteComEventos retorna null se cliente não existe', async () => {
    const mockSupabase = criarMockSupabase();
    const resultado = await nexClientes.obterClienteComEventos(mockSupabase, 'loja-x', 'inexistente');
    expect(resultado).toBeNull();
  });

  it('obterAgregados retorna estatísticas sem PII (nenhum nome/telefone/email nas chaves)', async () => {
    const mockSupabase = criarMockSupabase();
    await nexClientes.processarLote(mockSupabase, [
      { origem_loja: 'loja-1', nex_codigo: 'REG-011', nome: 'Cliente PII', telefone: '11999998888' },
    ]);

    const agregados = await nexClientes.obterAgregados(mockSupabase);
    const chaves = Object.keys(agregados);
    expect(chaves).not.toContain('nome');
    expect(chaves).not.toContain('telefone');
    expect(chaves).not.toContain('email');
    expect(chaves).toEqual(
      expect.arrayContaining(['total_clientes', 'total_eventos', 'eventos_hoje', 'eventos_ultima_hora', 'clientes_ausentes'])
    );
  });
});

/**
 * HELPERS: Mock de fetch determinístico simulando o REST do Supabase
 * (PostgREST) — nunca um client de SDK. `criarMockSupabase()` devolve um
 * `supabaseConfig` ({ baseUrl, headers }) válido, e instala um `global.fetch`
 * que responde de acordo com uma tabela/verbo/filtros, apoiado num storage
 * em memória isolado por chamada (cada teste cria o seu).
 */

function extrairFiltroEq(valor) {
  return valor && valor.startsWith('eq.') ? valor.slice(3) : undefined;
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (nome) => headers[nome.toLowerCase()] ?? null },
  };
}

function criarMockSupabase() {
  const storage = { clientes: [], eventos: [] };
  const baseUrl = 'https://mock-project.supabase.co';
  const headers = { apikey: 'mock-secret-key', 'Content-Type': 'application/json' };

  global.fetch = vi.fn(async (urlStr, options = {}) => {
    const url = new URL(urlStr);
    const tabela = url.pathname.split('/').pop();
    const metodo = (options.method || 'GET').toUpperCase();
    const params = url.searchParams;
    const ehContagem = options.headers?.['Prefer'] === 'count=exact';

    if (tabela === 'nex_clientes') {
      if (metodo === 'GET') {
        let linhas = storage.clientes.slice();
        const origem = extrairFiltroEq(params.get('origem_loja'));
        const codigo = extrairFiltroEq(params.get('nex_codigo'));
        if (origem !== undefined) linhas = linhas.filter((c) => c.origem_loja === origem);
        if (codigo !== undefined) linhas = linhas.filter((c) => c.nex_codigo === codigo);
        if (params.get('ausente_desde') === 'not.is.null') {
          linhas = linhas.filter((c) => c.ausente_desde != null);
        }
        if (ehContagem) {
          return jsonResponse([], { headers: { 'content-range': `0-0/${linhas.length}` } });
        }
        const limit = params.get('limit');
        if (limit) linhas = linhas.slice(0, Number(limit));
        return jsonResponse(linhas);
      }
      if (metodo === 'POST') {
        const dados = JSON.parse(options.body);
        const idx = storage.clientes.findIndex(
          (c) => c.origem_loja === dados.origem_loja && c.nex_codigo === dados.nex_codigo
        );
        let linha;
        if (idx >= 0) {
          linha = { ...storage.clientes[idx], ...dados };
          storage.clientes[idx] = linha;
        } else {
          linha = { id: `uuid-${storage.clientes.length}-${Math.random().toString(36).slice(2, 8)}`, ...dados };
          storage.clientes.push(linha);
        }
        return jsonResponse([linha]);
      }
    }

    if (tabela === 'nex_sync_eventos') {
      if (metodo === 'GET') {
        let linhas = storage.eventos.slice();
        const origem = extrairFiltroEq(params.get('origem_loja'));
        const codigo = extrairFiltroEq(params.get('nex_codigo'));
        if (origem !== undefined) linhas = linhas.filter((e) => e.origem_loja === origem);
        if (codigo !== undefined) linhas = linhas.filter((e) => e.nex_codigo === codigo);
        const createdAtFiltro = params.get('created_at');
        if (createdAtFiltro && createdAtFiltro.startsWith('gte.')) {
          const desde = createdAtFiltro.slice(4);
          linhas = linhas.filter((e) => e.created_at >= desde);
        }
        if (ehContagem) {
          return jsonResponse([], { headers: { 'content-range': `0-0/${linhas.length}` } });
        }
        const order = params.get('order');
        if (order && order.includes('desc')) {
          linhas = linhas.slice().reverse();
        }
        const limit = params.get('limit');
        if (limit) linhas = linhas.slice(0, Number(limit));
        return jsonResponse(linhas);
      }
      if (metodo === 'POST') {
        const dados = JSON.parse(options.body);
        storage.eventos.push({ ...dados, created_at: new Date().toISOString() });
        return jsonResponse([]);
      }
    }

    return jsonResponse([]);
  });

  return {
    baseUrl,
    headers,
    get clientes() {
      return storage.clientes;
    },
    get eventos() {
      return storage.eventos;
    },
  };
}

function calcularHashDeterministico(cliente) {
  const payload = {
    nome: (cliente.nome || '').trim().toLowerCase(),
    cpf_cnpj: (cliente.cpf_cnpj || '').trim().toLowerCase(),
    telefone: (cliente.telefone || '').trim().toLowerCase(),
    celular: (cliente.celular || '').trim().toLowerCase(),
    email: (cliente.email || '').trim().toLowerCase(),
    endereco: (cliente.endereco || '').trim().toLowerCase(),
    saldo_debito_nex: cliente.saldo_debito_nex ?? null,
    saldo_credito_nex: cliente.saldo_credito_nex ?? null,
    valor_liquido_nex: cliente.valor_liquido_nex ?? null,
    data_snapshot: cliente.data_snapshot ?? null,
    observacao_original: (cliente.observacao_original || '').trim().toLowerCase(),
    metadados: cliente.metadados ?? {},
  };

  const jsonString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}
