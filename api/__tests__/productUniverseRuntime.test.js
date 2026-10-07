import { describe, it, expect, vi } from 'vitest'
import {
  buildProductUniverseRuntime,
  fetchPrimeShadowCatalog,
  selectPrimeEvidence,
} from '../_productUniverseRuntime.js'
import {
  GABY_OFFICIAL_AGENT_ID,
  handleProductUniverseRequest,
  supplierFixturesForRequest,
} from '../gaby-lab-product-universe-v1.js'

const SB = {
  baseUrl: 'https://mock.supabase.co',
  headers: {
    apikey: 'mock-key',
    Authorization: 'Bearer mock-key',
  },
}

function response(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
  }
}

function mockRes() {
  const state = {
    status: null,
    payload: null,
    headers: {},
  }

  return {
    state,
    setHeader(name, value) {
      state.headers[name] = value
    },
    status(code) {
      state.status = code
      return {
        json(payload) {
          state.payload = payload
          return payload
        },
      }
    },
  }
}

const PRIME_AIR_FORCE_WHITE = {
  id: 'prime-af1-white',
  bagy_product_id: 101,
  nome: 'Tênis Nike Air Force 1 Branco',
  categoria_nome: 'Tênis',
  preco: 399,
  preco_pix: 379,
  imagem_principal: 'https://prime.example/air-force-branco.jpg',
  link: 'https://prime.example/air-force-branco',
  codigo: 'AF1-W',
  marca: 'Nike',
}

describe('Product Universe Runtime V1 — leitura PRIME', () => {
  it('lê somente shadow_products ativos via GET', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toContain('/rest/v1/shadow_products?')
      expect(url).toContain('ativo=eq.true')
      expect(url).not.toContain('/rest/v1/products?')
      expect(init.method).toBe('GET')
      return response([PRIME_AIR_FORCE_WHITE])
    })

    const out = await fetchPrimeShadowCatalog({
      supabaseConfig: SB,
      fetchImpl,
    })

    expect(out.ok).toBe(true)
    expect(out.source).toBe('shadow_products')
    expect(out.products).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('falha do shadow PRIME não consulta tabela products legado', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toContain('/shadow_products?')
      expect(init.method).toBe('GET')
      return response([], false, 503)
    })

    const out = await fetchPrimeShadowCatalog({
      supabaseConfig: SB,
      fetchImpl,
    })

    expect(out.ok).toBe(false)
    expect(out.error_code).toBe('PRIME_SOURCE_UNAVAILABLE')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('normalizador PRIME reconhece família Air Force sem depender da cor', () => {
    const evidence = selectPrimeEvidence(
      [PRIME_AIR_FORCE_WHITE],
      {
        visual: { brand: 'Nike', model: 'Air Force 1', color: 'branco' },
        requested: { model: 'Air Force 1', color: 'preto', size: '42' },
      }
    )

    expect(evidence).toHaveLength(1)
    expect(evidence[0].canonical_family).toBe('NIKE_AIR_FORCE_1')
    expect(evidence[0].match_type).toBe('SAME_FAMILY')
    expect(evidence[0].price).toBe(399)
  })
})

describe('Product Universe Runtime V1 — universo PRIME + fornecedores controlados', () => {
  it('Story branco + cliente pede preto 42: VIVIAN vence variante PRIME, mas sem pricing_rule o preço fica UNKNOWN', async () => {
    const fetchImpl = vi.fn(async () => response([PRIME_AIR_FORCE_WHITE]))

    const out = await buildProductUniverseRuntime({
      visual: { brand: 'Nike', model: 'Air Force 1', color: 'branco' },
      requested: { model: 'Air Force 1', color: 'preto', size: '42' },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'VIVIAN',
        source_item_id: 'vivian-af1-black',
        name: 'Nike Air Force 1 Preto',
        brand: 'Nike',
        model: 'Air Force 1',
        color: 'preto',
        photo_ref: 'drive://vivian/af1-black',
      }],
    })

    expect(out.mode).toBe('LAB_READ_ONLY_CANDIDATE')
    expect(out.decision.requested.color).toBe('preto')
    expect(out.decision.requested.size).toBe('42')
    expect(out.decision.best_match.source).toBe('VIVIAN')
    expect(out.decision.canonical_family).toBe('NIKE_AIR_FORCE_1')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.photo.action).toBe('REQUEST_TEAM_PHOTO')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('VIVIAN + MIA do mesmo produto registram cobertura 2', async () => {
    const fetchImpl = vi.fn(async () => response([PRIME_AIR_FORCE_WHITE]))

    const out = await buildProductUniverseRuntime({
      requested: { brand: 'Nike', model: 'AF1', color: 'preto', size: '42' },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          name: 'Air Force Preto',
          brand: 'Nike',
          model: 'AF1',
          color: 'preto',
        },
        {
          source: 'MIA',
          name: 'Nike Air Force 1 Preto',
          brand: 'Nike',
          model: 'Air Force 1',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.coverage.supplier_count).toBe(2)
    expect(out.source_status.VIVIAN.candidates).toBe(1)
    expect(out.source_status.MIA.candidates).toBe(1)
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('lê Supplier Shadow real e combina VIVIAN + MIA com a PRIME', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(init.method).toBe('GET')

      if (url.includes('/shadow_products?')) {
        return response([PRIME_AIR_FORCE_WHITE])
      }

      if (url.includes('/supplier_shadow_products?')) {
        expect(url).toContain('active=eq.true')
        expect(url).toContain('analysis_status=eq.ready')
        return response([
          {
            id: 'supplier-vivian-af1',
            supplier_key: 'VIVIAN',
            drive_file_id: 'drive-vivian-af1',
            drive_url: 'https://drive.google.com/file/d/vivian-af1/view',
            file_name: '34 ao 39',
            brand: 'Nike',
            canonical_family: 'NIKE_AIR_FORCE_1',
            detected_model: 'Nike Air Force 1',
            category: 'Tênis',
            visual_color: null,
            vision_confidence: null,
            analysis_status: 'ready',
            active: true,
          },
          {
            id: 'supplier-mia-af1',
            supplier_key: 'MIA',
            drive_file_id: 'drive-mia-af1',
            drive_url: 'https://drive.google.com/file/d/mia-af1/view',
            file_name: '38 ao 43',
            brand: 'Nike',
            canonical_family: 'NIKE_AIR_FORCE_1',
            detected_model: 'Nike Air Force 1',
            category: 'Tênis',
            visual_color: null,
            vision_confidence: null,
            analysis_status: 'ready',
            active: true,
          },
        ])
      }

      throw new Error('URL inesperada: ' + url)
    })

    const supplierServerConfig = {
      baseUrl: 'https://server.supabase.co',
      headers: {
        apikey: 'server-secret',
        Authorization: 'Bearer server-secret',
      },
    }

    const out = await buildProductUniverseRuntime({
      requested: { brand: 'Nike', model: 'Air Force 1', size: '42' },
    }, {
      supabaseConfig: SB,
      supplierSupabaseConfig: supplierServerConfig,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(out.source_status.VIVIAN.mode).toBe('REAL_SHADOW')
    expect(out.source_status.MIA.mode).toBe('REAL_SHADOW')
    expect(out.source_status.VIVIAN.rows_read).toBe(1)
    expect(out.source_status.MIA.rows_read).toBe(1)
    expect(out.decision.coverage.supplier_count).toBe(2)
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('McQueen aliases normalizam para fornecedor-only sem preço inventado', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Alexander McQueen',
        model: 'McQueen',
        color: 'branco',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-mcqueen',
          name: 'Alexander McQueen Oversized Branco',
          brand: 'Alexander McQueen',
          model: 'McQueen Oversized',
          color: 'branco',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-mcqueen',
          name: 'Alexander McQueen Oversized Branco Preto',
          brand: 'Alexander McQueen',
          model: 'Alexander McQueen Oversized',
          color: 'branco / preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('ALEXANDER_MCQUEEN_OVERSIZED')
    expect(out.decision.coverage.PRIME).toBe(false)
    expect(out.decision.coverage.supplier_count).toBe(2)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB1000 aliases normalizam sem criar herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'New Balance',
        model: 'NB 1000 Reflection',
        color: 'azul',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-nb1000-blue',
          name: 'New Balance 1000 Azul',
          brand: 'New Balance',
          model: 'New Balance 1000',
          color: 'azul',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NEW_BALANCE_1000')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB2000 aliases normalizam para fornecedor-only sem preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'New Balance',
        model: 'NB 2000',
        color: 'cinza',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-nb2000',
          name: 'New Balance 2000 Cinza',
          brand: 'New Balance',
          model: 'New Balance 2000',
          color: 'cinza',
        },
        {
          source: 'MIA',
          source_item_id: 'mia-nb2000',
          name: 'New Balance 2000 Cinza Preto',
          brand: 'New Balance',
          model: 'NB2000',
          color: 'cinza / preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NEW_BALANCE_2000')
    expect(out.decision.coverage.PRIME).toBe(false)
    expect(out.decision.coverage.supplier_count).toBe(2)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB530 aliases normalizam sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'New Balance',
        model: 'NB 530',
        color: 'azul',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-nb530-blue',
          name: 'New Balance 530 Azul',
          brand: 'New Balance',
          model: 'New Balance 530',
          color: 'azul',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NEW_BALANCE_530')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('FuelCell Rebel V4 normaliza separado das demais famílias New Balance', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'New Balance',
        model: 'FuelCell Rebel V4',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-fuelcell-rebel-v4-black',
          name: 'New Balance FuelCell Rebel V4 Preto',
          brand: 'New Balance',
          model: 'New Balance FuelCell Rebel V4',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.canonical_family)
      .toBe('NEW_BALANCE_FUELCELL_REBEL_V4')
    expect(out.decision.canonical_family).not.toBe('NEW_BALANCE_530')
    expect(out.decision.canonical_family).not.toBe('NEW_BALANCE_9060')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('NB204L normaliza como família New Balance própria', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'New Balance',
        model: 'NB204L',
        color: 'branco',
        size: '38',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-nb204l-white',
          name: 'New Balance 204L Branco',
          brand: 'New Balance',
          model: 'New Balance 204L',
          color: 'branco',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NEW_BALANCE_204L')
    expect(out.decision.canonical_family).not.toBe('NEW_BALANCE_530')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adidas Samba aliases normalizam sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Adidas',
        model: 'Samba OG',
        color: 'azul',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-samba-blue',
          name: 'Adidas Samba Azul',
          brand: 'Adidas',
          model: 'Adidas Samba',
          color: 'azul',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('ADIDAS_SAMBA')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adidas Adi 2000 aliases normalizam sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Adidas',
        model: 'Adidas 2000',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-adi2000-black',
          name: 'Adidas Adi 2000 Preto',
          brand: 'Adidas',
          model: 'Adi2000',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('ADIDAS_ADI_2000')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adidas Campus aliases normalizam sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Adidas',
        model: 'Campus 00s',
        color: 'bege',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-campus-beige',
          name: 'Adidas Campus Bege',
          brand: 'Adidas',
          model: 'Adidas Campus',
          color: 'bege',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('ADIDAS_CAMPUS')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Mizuno Pro 14 alias normaliza para Wave Prophecy 14 sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Mizuno',
        model: 'Mizuno Pro 14',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-mizuno14-black',
          name: 'Mizuno Wave Prophecy 14 Preto',
          brand: 'Mizuno',
          model: 'Wave Prophecy 14',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('MIZUNO_WAVE_PROPHECY_14')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Nike Dunk Low e SB Dunk normalizam para Nike Dunk sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'SB Dunk',
        color: 'verde',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-dunk-green',
          name: 'Nike Dunk Low Verde',
          brand: 'Nike',
          model: 'Nike Dunk Low',
          color: 'verde',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NIKE_DUNK')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Court Vision Low normaliza para Nike Court Vision sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Court Vision Low',
        color: 'branco',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-court-vision-white',
          name: 'Nike Court Vision Low Branco',
          brand: 'Nike',
          model: 'Nike Court Vision Low',
          color: 'branco',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NIKE_COURT_VISION')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Court Borough normaliza separado de Court Vision sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Court Borough',
        color: 'branco',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-court-borough-white',
          name: 'Nike Court Borough Branco',
          brand: 'Nike',
          model: 'Nike Court Borough',
          color: 'branco',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NIKE_COURT_BOROUGH')
    expect(out.decision.canonical_family).not.toBe('NIKE_COURT_VISION')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Bailleli normaliza para Nike Bailleli sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Bailleli',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-bailleli-black',
          name: 'Nike Bailleli Preto',
          brand: 'Nike',
          model: 'Nike Bailleli',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NIKE_BAILLELI')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Adizero 4 normaliza para Adidas Adizero sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Adidas',
        model: 'Adizero 4',
        color: 'amarelo',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'MIA',
          source_item_id: 'mia-adizero-yellow',
          name: 'Adidas Adizero Amarelo',
          brand: 'Adidas',
          model: 'Adidas Adizero',
          color: 'amarelo',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('ADIDAS_ADIZERO')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Air Zoom Vomero normaliza para Nike Vomero sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Zoom Vomero',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [
        {
          source: 'VIVIAN',
          source_item_id: 'vivian-vomero-black',
          name: 'Nike Air Zoom Vomero Preto',
          brand: 'Nike',
          model: 'Nike Vomero',
          color: 'preto',
        },
      ],
    })

    expect(out.decision.canonical_family).toBe('NIKE_VOMERO')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Air Max DN normaliza de forma isolada sem herdar preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max DN',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-dn-black',
        name: 'Nike Air Max DN Preto',
        brand: 'Nike',
        model: 'Nike Air Max DN',
        color: 'preto',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_MAX_DN')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')

    const shortQuery = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'DN',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-dn-short-query',
        name: 'Nike Air Max DN Preto',
        brand: 'Nike',
        model: 'Nike Air Max DN',
        color: 'preto',
      }],
    })

    expect(shortQuery.decision.canonical_family).toBe('NIKE_AIR_MAX_DN')
  })

  it('Air Max 270 normaliza de forma isolada sem herdar preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max 270',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-270-black',
        name: 'Nike Air Max 270 Preto',
        brand: 'Nike',
        model: 'Nike Air Max 270',
        color: 'preto',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_MAX_270')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Air Max 97 normaliza de forma isolada sem herdar preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max 97',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-97-black',
        name: 'Nike Air Max 97 Preto',
        brand: 'Nike',
        model: 'Nike Air Max 97',
        color: 'preto',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_MAX_97')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Air Max 95 normaliza de forma isolada sem herdar preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max 95',
        color: 'branco',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-95-white',
        name: 'Nike Air Max 95 Branco',
        brand: 'Nike',
        model: 'Nike Air Max 95',
        color: 'branco',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_MAX_95')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('Air Max 90 normaliza de forma isolada sem confundir Air Max 95', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max 90',
        color: 'cinza',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-air-max-90-grey',
        name: 'Nike Air Max 90 Cinza',
        brand: 'Nike',
        model: 'Nike Air Max 90',
        color: 'cinza',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_MAX_90')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.price.amount).toBeNull()
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')

    const wrong = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Air Max 95',
        color: 'preto',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [],
    })

    expect(wrong.decision.canonical_family).not.toBe('NIKE_AIR_MAX_90')
    expect(wrong.decision.requested.model).toBe('Air Max 95')
  })

  it('Jordan IV normaliza para Nike Air Jordan 4 sem herança de preço', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: {
        brand: 'Nike',
        model: 'Jordan IV',
        color: 'branco',
        size: '42',
      },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [{
        source: 'MIA',
        source_item_id: 'mia-jordan4-white',
        name: 'Nike Air Jordan 4 Branco',
        brand: 'Nike',
        model: 'Nike Air Jordan 4',
        color: 'branco',
      }],
    })

    expect(out.decision.canonical_family).toBe('NIKE_AIR_JORDAN_4')
    expect(out.decision.coverage.supplier_count).toBe(1)
    expect(out.decision.price.state).toBe('UNKNOWN')
    expect(out.decision.size.state).toBe('OFFERABLE')
    expect(out.decision.commercial.action).toBe('CONTINUE_SALE')
  })

  it('zero resultado em todas as fontes pede pergunta inteligente, não encerra venda', async () => {
    const fetchImpl = vi.fn(async () => response([]))

    const out = await buildProductUniverseRuntime({
      requested: { model: 'Produto inexistente', color: 'verde' },
    }, {
      supabaseConfig: SB,
      fetchImpl,
      supplierFixtures: [],
    })

    expect(out.decision.commercial.product_state).toBe('UNKNOWN')
    expect(out.decision.commercial.action).toBe('ASK_SMART_QUESTION')
    expect(out.decision.commercial.action).not.toBe('STOP_CONFIRMED')
    expect(out.decision.guardrails.false_out_of_stock_blocked).toBe(true)
  })

  it('runtime candidato declara zero efeitos colaterais', async () => {
    const fetchImpl = vi.fn(async () => response([PRIME_AIR_FORCE_WHITE]))

    const out = await buildProductUniverseRuntime({
      requested: { model: 'Air Force 1' },
    }, {
      supabaseConfig: SB,
      fetchImpl,
    })

    expect(out.side_effects).toEqual({
      supabase_write: false,
      gptmaker_call: false,
      customer_message: false,
      jev_call: false,
    })
  })
})

describe('Endpoint gaby-lab-product-universe-v1 — travas', () => {
  it('fica OFF por padrão e nem consulta Supabase', async () => {
    const fetchImpl = vi.fn()
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'test-lab-secret',
      },
      body: { requested: { model: 'Air Force 1' } },
    }, res, {
      env: {},
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(404)
    expect(res.state.payload.error).toBe('LAB_RUNTIME_DISABLED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('com runtime ligado exige header LAB correto antes de qualquer leitura', async () => {
    const fetchImpl = vi.fn()
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {},
      body: { requested: { model: 'Air Force 1' } },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(403)
    expect(res.state.payload.error).toBe('LAB_HEADER_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('runtime ligado falha fechado se segredo da API não estiver configurado', async () => {
    const fetchImpl = vi.fn()
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: { 'x-prime-lab': 'GABY-LAB-COMERCIAL-V1' },
      body: { requested: { model: 'Air Force 1' } },
    }, res, {
      env: { LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true' },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(503)
    expect(res.state.payload.error).toBe('LAB_API_SECRET_MISSING')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('runtime ligado rejeita segredo LAB incorreto antes de qualquer leitura', async () => {
    const fetchImpl = vi.fn()
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'wrong-secret',
      },
      body: { requested: { model: 'Air Force 1' } },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(403)
    expect(res.state.payload.error).toBe('LAB_API_SECRET_INVALID')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('bloqueia explicitamente o ID da GABY OFICIAL', async () => {
    const fetchImpl = vi.fn()
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'test-lab-secret',
      },
      body: {
        agent_id: GABY_OFFICIAL_AGENT_ID,
        requested: { model: 'Air Force 1' },
      },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(403)
    expect(res.state.payload.error).toBe('GABY_OFFICIAL_BLOCKED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('em preview aceita fixture de fornecedor somente com flag explícita', () => {
    const body = {
      supplier_fixtures: [{ source: 'VIVIAN', name: 'Air Force Preto' }],
    }

    expect(supplierFixturesForRequest(body, {
      LAB_PRODUCT_UNIVERSE_FIXTURES_ENABLED: 'true',
      VERCEL_ENV: 'preview',
    })).toHaveLength(1)

    expect(supplierFixturesForRequest(body, {
      LAB_PRODUCT_UNIVERSE_FIXTURES_ENABLED: 'false',
      VERCEL_ENV: 'preview',
    })).toEqual([])
  })

  it('em production ignora fixtures recebidas no request mesmo com flag ligada', () => {
    const body = {
      supplier_fixtures: [{ source: 'MIA', name: 'Produto fake' }],
    }

    expect(supplierFixturesForRequest(body, {
      LAB_PRODUCT_UNIVERSE_FIXTURES_ENABLED: 'true',
      VERCEL_ENV: 'production',
    })).toEqual([])
  })

  it('Supplier Shadow usa exclusivamente SUPABASE_SECRET_KEY no endpoint LAB', async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, authorization: init?.headers?.Authorization || init?.headers?.authorization })

      if (url.includes('/shadow_products?')) {
        return response([PRIME_AIR_FORCE_WHITE])
      }

      if (url.includes('/supplier_shadow_products?')) {
        return response([{
          id: 'supplier-v1',
          supplier_key: 'VIVIAN',
          drive_file_id: 'drive-v1',
          drive_url: 'https://drive.google.com/file/d/drive-v1/view',
          file_name: '34 ao 39',
          brand: 'Nike',
          canonical_family: 'NIKE_AIR_FORCE_1',
          detected_model: 'Nike Air Force 1',
          category: 'Tênis',
          visual_color: null,
          vision_confidence: null,
          analysis_status: 'ready',
          active: true,
        }])
      }

      throw new Error('URL inesperada')
    })
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'test-lab-secret',
      },
      body: {
        requested: { model: 'Air Force 1', size: '42' },
      },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
        SUPABASE_URL: 'https://server.supabase.co',
        SUPABASE_SECRET_KEY: 'server-secret',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(200)
    expect(calls).toHaveLength(2)

    const primeCall = calls.find((x) => x.url.includes('/shadow_products?'))
    const supplierCall = calls.find((x) => x.url.includes('/supplier_shadow_products?'))

    expect(primeCall.authorization).toBe('Bearer mock-key')
    expect(supplierCall.authorization).toBe('Bearer server-secret')
    expect(res.state.payload.source_status.VIVIAN.mode).toBe('REAL_SHADOW')
  })

  it('Render LAB usa chave pública + token RPC sem SUPABASE_SECRET_KEY', async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, method: init.method, authorization: init?.headers?.Authorization })

      if (url.includes('/shadow_products?')) {
        return response([PRIME_AIR_FORCE_WHITE])
      }

      if (url.includes('/rpc/lab_supplier_shadow_ready')) {
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body)).toEqual({ p_token: 'rpc-lab-token' })
        return response([{
          id: 'supplier-via-rpc',
          supplier_key: 'VIVIAN',
          drive_file_id: 'drive-via-rpc',
          drive_url: 'https://drive.google.com/file/d/drive-via-rpc/view',
          file_name: '34 ao 39',
          brand: 'Nike',
          canonical_family: 'NIKE_AIR_FORCE_1',
          detected_model: 'Nike Air Force 1',
          category: 'Tênis',
          visual_color: null,
          vision_confidence: null,
          analysis_status: 'ready',
          active: true,
        }])
      }

      throw new Error('URL inesperada: ' + url)
    })
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'test-lab-secret',
      },
      body: {
        requested: { model: 'Air Force 1', size: '42' },
      },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
        SUPABASE_URL: 'https://public.supabase.co',
        VITE_SUPABASE_URL: 'https://public.supabase.co',
        VITE_SUPABASE_KEY: 'public-anon-key',
        SUPPLIER_SHADOW_RPC_TOKEN: 'rpc-lab-token',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(200)
    expect(res.state.payload.source_status.VIVIAN.mode).toBe('REAL_SHADOW_RPC')
    expect(res.state.payload.source_status.VIVIAN.candidates).toBe(1)
    expect(calls.some((x) => x.url.includes('/rpc/lab_supplier_shadow_ready'))).toBe(true)
  })

  it('quando habilitado e autorizado executa somente leitura e retorna decisão', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(init.method).toBe('GET')
      expect(url).toContain('/shadow_products?')
      return response([PRIME_AIR_FORCE_WHITE])
    })
    const res = mockRes()

    await handleProductUniverseRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'test-lab-secret',
      },
      body: {
        requested: { model: 'Air Force 1', color: 'branco', size: '42' },
      },
    }, res, {
      env: {
        LAB_PRODUCT_UNIVERSE_RUNTIME_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'test-lab-secret',
      },
      fetchImpl,
      supabaseConfig: SB,
      supabaseKey: 'mock-key',
    })

    expect(res.state.status).toBe(200)
    expect(res.state.payload.ok).toBe(true)
    expect(res.state.payload.side_effects.supabase_write).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
