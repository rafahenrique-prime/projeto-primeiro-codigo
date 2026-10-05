import { describe, it, expect } from 'vitest'
import {
  PRODUCT_UNIVERSE_CONTRACT_VERSION,
  buildProductUniverseDecision,
  validateProductUniverseDecision,
} from '../_productUniverseContract.js'

const FAMILY_RULES = [
  {
    family_id: 'NIKE_AIR_FORCE_1',
    canonical_name: 'Nike Air Force 1',
    aliases: ['Air Force', 'Air Force 1', 'AF1', 'Nike AF1'],
  },
  {
    family_id: 'NEW_BALANCE_9060',
    canonical_name: 'New Balance 9060',
    aliases: ['NB9060', '9060'],
  },
  {
    family_id: 'ALEXANDER_MCQUEEN_OVERSIZED',
    canonical_name: 'Alexander McQueen Oversized',
    aliases: ['Alexander McQueen', 'McQueen', 'McQueen Oversized'],
  },
  {
    family_id: 'NEW_BALANCE_1000',
    canonical_name: 'New Balance 1000',
    aliases: ['NB1000', 'NB 1000', 'New Balance 1000', 'NB 1000 Reflection', '1000 Reflection'],
  },
  {
    family_id: 'NEW_BALANCE_2000',
    canonical_name: 'New Balance 2000',
    aliases: ['NB2000', 'NB 2000', 'New Balance 2000'],
  },
  {
    family_id: 'NEW_BALANCE_530',
    canonical_name: 'New Balance 530',
    aliases: ['NB530', 'NB 530', 'New Balance 530'],
  },
  {
    family_id: 'ADIDAS_SAMBA',
    canonical_name: 'Adidas Samba',
    aliases: ['Samba', 'Adidas Samba', 'Samba OG', 'Adidas Samba OG'],
  },
]

const PRICE_RULES = [
  {
    rule_id: 'price-air-force-v1',
    family_id: 'NIKE_AIR_FORCE_1',
    price: 399,
    source: 'PRIME_FAMILY_RULE',
    active: true,
  },
]

const BASE = {
  family_rules: FAMILY_RULES,
  pricing_rules: PRICE_RULES,
  policy: { offer_catalog_sizes: true },
}

describe('GABY LAB Product Universe V1 — contrato comercial puro', () => {
  it('expõe versão estável do contrato', () => {
    const out = buildProductUniverseDecision(BASE)
    expect(out.contract_version).toBe(PRODUCT_UNIVERSE_CONTRACT_VERSION)
  })

  it('PRIME local confirmado continua venda e usa foto PRIME', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'Air Force', color: 'branco', size: '42' },
      evidence: [{
        source: 'PRIME',
        source_item_id: 'p1',
        name: 'Tênis Nike Air Force 1 Branco',
        brand: 'Nike',
        model: 'Air Force 1',
        canonical_family: 'NIKE_AIR_FORCE_1',
        match_type: 'EXACT',
        price: 399,
        local_stock_confirmed: true,
        requested_size_confirmed: true,
        photo_ref: 'https://prime.example/af1.jpg',
      }],
    })

    expect(out.commercial.action).toBe('CONTINUE_SALE')
    expect(out.commercial.product_state).toBe('AVAILABLE')
    expect(out.size.state).toBe('CONFIRMED')
    expect(out.price.state).toBe('CONFIRMED')
    expect(out.photo.action).toBe('USE_PRIME_PHOTO')
  })

  it('pedido explícito de cor do cliente prevalece sobre a cor visual', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      visual: { brand: 'Nike', model: 'Air Force 1', color: 'branco' },
      requested: { color: 'preto', size: '42', model: 'Air Force' },
      evidence: [{
        source: 'VIVIAN',
        source_item_id: 'v1',
        name: 'Nike Air Force Preto',
        brand: 'Nike',
        model: 'Air Force',
        color: 'preto',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
      }],
    })

    expect(out.requested.color).toBe('preto')
    expect(out.canonical_family).toBe('NIKE_AIR_FORCE_1')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Story branco + pedido preto escolhe fornecedor preto antes do PRIME branco', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      visual: { brand: 'Nike', model: 'Air Force 1', color: 'branco' },
      requested: { model: 'Air Force 1', color: 'preto', size: '42' },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-white',
          name: 'Nike Air Force 1 Branco',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'branco',
          price: 399,
          match_type: 'EXACT',
        },
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-black',
          name: 'Nike Air Force 1 Preto',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'preto',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
          photo_ref: 'drive://vivian/af1-preto',
        },
      ],
    })

    expect(out.requested.color).toBe('preto')
    expect(out.best_match.source).toBe('VIVIAN')
    expect(out.best_match.name).toContain('Preto')
    expect(out.best_match.color).toBe('preto')
    expect(out.best_match.canonical_family).toBe('NIKE_AIR_FORCE_1')
    expect(out.price.state).toBe('INHERITED_FAMILY_RULE')
    expect(out.price.amount).toBe(399)
    expect(out.photo.action).toBe('REQUEST_TEAM_PHOTO')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('preto puro vence variante composta mesmo quando a composta vem de fonte prioritária', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { brand: 'Nike', model: 'Air Force 1', color: 'preto', size: '42' },
      evidence: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-composite',
          name: 'Nike Air Force 1 Branco Preto Estampado',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'branco / preto estampado',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-pure-black',
          name: 'Nike Air Force 1 Preto',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'preto',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.best_match.source).toBe('MIA')
    expect(out.best_match.color).toBe('preto')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('PRIME com cor exata no nome mantém prioridade sobre fornecedor composto', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { brand: 'New Balance', model: '9060', color: 'preto', size: '42' },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-nb-black',
          name: 'Tênis New Balance 9060 Preto',
          brand: 'New Balance',
          model: 'Tênis New Balance 9060 Preto',
          price: 399.83,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-nb-black-white',
          name: 'New Balance 9060 Preto Branco',
          brand: 'New Balance',
          model: 'New Balance 9060',
          color: 'preto / branco',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
      family_rules: [
        ...FAMILY_RULES,
        {
          family_id: 'NEW_BALANCE_9060',
          canonical_name: 'New Balance 9060',
          aliases: ['NB9060', '9060'],
        },
      ],
    })

    expect(out.best_match.source).toBe('PRIME')
    expect(out.best_match.name).toContain('Preto')
  })

  it('VIVIAN mesmo family vira OFFERABLE, nunca estoque local confirmado', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { brand: 'Nike', model: 'AF1', color: 'preto', size: '42' },
      evidence: [{
        source: 'VIVIAN',
        source_item_id: 'drive-v1',
        name: 'Air Force Preto',
        brand: 'Nike',
        model: 'AF1',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
        photo_ref: 'drive://vivian/af1-preto',
      }],
    })

    expect(out.commercial.product_state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.guardrails.supplier_presence_is_not_live_stock).toBe(true)
    expect(out.photo.action).toBe('REQUEST_TEAM_PHOTO')
  })

  it('MIA recebe preço apenas por regra explícita de família', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'Air Force 1', color: 'preto' },
      evidence: [{
        source: 'MIA',
        name: 'Nike AF1 Preto',
        brand: 'Nike',
        model: 'AF1',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
      }],
    })

    expect(out.price.state).toBe('INHERITED_FAMILY_RULE')
    expect(out.price.amount).toBe(399)
    expect(out.price.rule_id).toBe('price-air-force-v1')
  })

  it('sem regra de preço não inventa valor de fornecedor', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: { model: 'NB9060', color: 'cinza' },
      evidence: [{
        source: 'VIVIAN',
        name: 'New Balance 9060 Cinza',
        brand: 'New Balance',
        model: '9060',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
      }],
    })

    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('mesmo produto em VIVIAN + MIA registra cobertura 2 sem fingir estoque', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'AF1', color: 'preto' },
      evidence: [
        {
          source: 'VIVIAN',
          name: 'Air Force Preto',
          brand: 'Nike',
          model: 'AF1',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          name: 'Nike Air Force 1 Preto',
          brand: 'Nike',
          model: 'Air Force 1',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.coverage.supplier_count).toBe(2)
    expect(out.commercial.product_state).toBe('OFFERABLE')
    expect(out.guardrails.supplier_presence_is_not_live_stock).toBe(true)
  })

  it('McQueen fornecedor-only continua venda sem inventar preço', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'Alexander McQueen',
        model: 'McQueen',
        color: 'branco',
        size: '42',
      },
      evidence: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-mcqueen-1',
          name: 'Alexander McQueen Oversized Branco',
          brand: 'Alexander McQueen',
          model: 'Alexander McQueen Oversized',
          color: 'branco',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-mcqueen-1',
          name: 'Alexander McQueen Oversized Branco Preto',
          brand: 'Alexander McQueen',
          model: 'Alexander McQueen Oversized',
          color: 'branco / preto',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('ALEXANDER_MCQUEEN_OVERSIZED')
    expect(out.coverage.PRIME).toBe(false)
    expect(out.coverage.supplier_count).toBe(2)
    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.product_state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB1000 cor exata na PRIME usa preço oficial e vence fornecedor', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'New Balance',
        model: 'NB1000',
        color: 'preto',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-nb1000-preto',
          name: 'Tênis Nb 1000 Reflection Preto',
          brand: 'New Balance',
          model: 'NB 1000 Reflection',
          color: 'preto',
          price: 355.31,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-nb1000-preto',
          name: 'New Balance 1000 Preto',
          brand: 'New Balance',
          model: 'New Balance 1000',
          color: 'preto',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('NEW_BALANCE_1000')
    expect(out.best_match.source).toBe('PRIME')
    expect(out.price.state).toBe('CONFIRMED')
    expect(out.price.source).toBe('PRIME')
    expect(out.price.amount).toBe(355.31)
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB1000 cor só no fornecedor continua venda sem herdar preço', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'New Balance',
        model: '1000 Reflection',
        color: 'azul',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-nb1000-preto',
          name: 'Tênis Nb 1000 Reflection Preto',
          brand: 'New Balance',
          model: 'NB 1000 Reflection',
          color: 'preto',
          price: 355.31,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-nb1000-azul',
          name: 'New Balance 1000 Azul',
          brand: 'New Balance',
          model: 'New Balance 1000',
          color: 'azul',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('NEW_BALANCE_1000')
    expect(out.best_match.source).toBe('MIA')
    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB2000 fornecedor-only continua venda sem inventar preço', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'New Balance',
        model: 'NB2000',
        color: 'cinza',
        size: '42',
      },
      evidence: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-nb2000',
          name: 'New Balance 2000 Cinza',
          brand: 'New Balance',
          model: 'New Balance 2000',
          color: 'cinza',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-nb2000',
          name: 'New Balance 2000 Cinza Preto',
          brand: 'New Balance',
          model: 'New Balance 2000',
          color: 'cinza / preto',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('NEW_BALANCE_2000')
    expect(out.coverage.PRIME).toBe(false)
    expect(out.coverage.supplier_count).toBe(2)
    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB530 cor exata na PRIME usa preço oficial confirmado', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'New Balance',
        model: 'NB530',
        color: 'branco',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-nb530-branco',
          name: 'Tênis New Balance 530 Branco',
          brand: 'New Balance',
          model: 'New Balance 530',
          color: 'branco',
          price: 399.83,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-nb530-azul',
          name: 'New Balance 530 Azul',
          brand: 'New Balance',
          model: 'New Balance 530',
          color: 'azul',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('NEW_BALANCE_530')
    expect(out.best_match.source).toBe('PRIME')
    expect(out.price.state).toBe('CONFIRMED')
    expect(out.price.source).toBe('PRIME')
    expect(out.price.amount).toBe(399.83)
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB530 cor só no fornecedor continua venda sem herdar preço', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'New Balance',
        model: 'NB 530',
        color: 'azul',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-nb530-branco',
          name: 'Tênis New Balance 530 Branco',
          brand: 'New Balance',
          model: 'New Balance 530',
          color: 'branco',
          price: 399.83,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-nb530-azul',
          name: 'New Balance 530 Azul',
          brand: 'New Balance',
          model: 'NB530',
          color: 'azul',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('NEW_BALANCE_530')
    expect(out.best_match.source).toBe('MIA')
    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adidas Samba branco na PRIME usa preço oficial confirmado', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'Adidas',
        model: 'Samba',
        color: 'branco',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-samba-branco',
          name: 'Tênis Samba Branco',
          brand: 'ADIDAS',
          model: 'Adidas Samba',
          color: 'branco',
          price: 299,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-samba-azul',
          name: 'Adidas Samba Azul',
          brand: 'Adidas',
          model: 'Adidas Samba',
          color: 'azul',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('ADIDAS_SAMBA')
    expect(out.best_match.source).toBe('PRIME')
    expect(out.price.state).toBe('CONFIRMED')
    expect(out.price.source).toBe('PRIME')
    expect(out.price.amount).toBe(299)
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adidas Samba cor só no fornecedor continua venda sem herdar preço', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      pricing_rules: [],
      requested: {
        brand: 'Adidas',
        model: 'Samba OG',
        color: 'azul',
        size: '42',
      },
      evidence: [
        {
          source: 'PRIME',
          source_item_id: 'prime-samba-branco',
          name: 'Tênis Samba Branco',
          brand: 'ADIDAS',
          model: 'Adidas Samba',
          color: 'branco',
          price: 299,
          match_type: 'SAME_FAMILY',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-samba-azul',
          name: 'Adidas Samba Azul',
          brand: 'Adidas',
          model: 'Adidas Samba',
          color: 'azul',
          supplier_presence: true,
          match_type: 'SAME_FAMILY',
        },
      ],
    })

    expect(out.canonical_family).toBe('ADIDAS_SAMBA')
    expect(out.best_match.source).toBe('MIA')
    expect(out.price.state).toBe('UNKNOWN')
    expect(out.price.amount).toBeNull()
    expect(out.size.state).toBe('OFFERABLE')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('PRIME presente + tamanho não confirmado usa OFFERABLE pela política V1', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'Air Force', size: '43' },
      evidence: [{
        source: 'PRIME',
        name: 'Nike Air Force 1',
        brand: 'Nike',
        model: 'Air Force 1',
        price: 399,
        match_type: 'SAME_FAMILY',
        local_stock_confirmed: false,
        requested_size_confirmed: false,
      }],
    })

    expect(out.size.state).toBe('OFFERABLE')
    expect(out.size.reason).toBe('COMMERCIAL_POLICY_V1')
    expect(out.commercial.action).toBe('CONTINUE_SALE')
  })

  it('ausência em todas as fontes não vira não temos automaticamente', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'Modelo desconhecido', color: 'verde' },
      evidence: [],
    })

    expect(out.commercial.product_state).toBe('UNKNOWN')
    expect(out.commercial.action).toBe('ASK_SMART_QUESTION')
    expect(out.commercial.action).not.toBe('STOP_CONFIRMED')
    expect(out.guardrails.false_out_of_stock_blocked).toBe(true)
  })

  it('somente SIMILAR pede confirmação antes de trocar produto', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'Air Force', color: 'preto' },
      evidence: [{
        source: 'PRIME',
        name: 'Nike Court Vision Preto',
        brand: 'Nike',
        model: 'Court Vision',
        match_type: 'SIMILAR',
        price: 349,
      }],
    })

    expect(out.best_match.match_type).toBe('SIMILAR')
    expect(out.commercial.product_state).toBe('ALTERNATIVE')
    expect(out.commercial.action).toBe('ASK_SMART_QUESTION')
  })

  it('PRIME indisponível sozinho nunca autoriza STOP_CONFIRMED', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'AF1', color: 'preto', size: '42' },
      evidence: [{
        source: 'PRIME',
        name: 'Air Force 1 Preto',
        brand: 'Nike',
        model: 'Air Force 1',
        color: 'preto',
        match_type: 'SAME_FAMILY',
        confirmed_unavailable: true,
      }],
    })

    expect(out.commercial.action).not.toBe('STOP_CONFIRMED')
    expect(out.guardrails.false_out_of_stock_blocked).toBe(true)
  })

  it('STOP_CONFIRMED só aparece quando todas as fontes relevantes confirmam indisponibilidade', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'AF1', color: 'preto', size: '42' },
      evidence: [
        {
          source: 'PRIME',
          name: 'Air Force 1 Preto',
          brand: 'Nike',
          model: 'Air Force 1',
          match_type: 'SAME_FAMILY',
          confirmed_unavailable: true,
        },
        {
          source: 'VIVIAN',
          name: 'AF1 Preto',
          brand: 'Nike',
          model: 'AF1',
          match_type: 'SAME_FAMILY',
          confirmed_unavailable: true,
        },
        {
          source: 'MIA',
          name: 'Nike Air Force Preto',
          brand: 'Nike',
          model: 'Air Force',
          match_type: 'SAME_FAMILY',
          confirmed_unavailable: true,
        },
      ],
    })

    expect(out.commercial.product_state).toBe('UNAVAILABLE_CONFIRMED')
    expect(out.commercial.action).toBe('STOP_CONFIRMED')
    expect(out.guardrails.false_out_of_stock_blocked).toBe(false)
  })

  it('foto de fornecedor nunca é liberada para envio automático na V1', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'AF1' },
      evidence: [{
        source: 'MIA',
        name: 'Air Force Preto',
        brand: 'Nike',
        model: 'Air Force',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
        photo_ref: 'drive://mia/photo-123',
      }],
    })

    expect(out.photo.action).toBe('REQUEST_TEAM_PHOTO')
    expect(out.guardrails.supplier_photo_auto_send).toBe(false)
  })

  it('contrato gerado passa pelo validador estrutural', () => {
    const out = buildProductUniverseDecision({
      ...BASE,
      requested: { model: 'AF1', size: '42' },
      evidence: [{
        source: 'VIVIAN',
        name: 'Air Force Preto',
        brand: 'Nike',
        model: 'AF1',
        supplier_presence: true,
        match_type: 'SAME_FAMILY',
      }],
    })

    expect(validateProductUniverseDecision(out)).toEqual({ ok: true, errors: [] })
  })
})
