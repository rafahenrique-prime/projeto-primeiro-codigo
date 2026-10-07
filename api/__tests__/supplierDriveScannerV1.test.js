import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SCANNER_SCOPES,
  embeddedFolderUrl,
  parseEmbeddedFolderFileIds,
  classifyDiscoveredEntries,
  scanSupplierDrive,
} from '../_supplierDriveScanner.js'

import {
  handleSupplierDriveScannerRequest,
} from '../supplier-drive-scanner-v1.js'

function jsonResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'application/json'
        return null
      },
    },
  }
}

function htmlResponse(html, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
    json: async () => null,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'text/html'
        return null
      },
    },
  }
}

function headResponse(headers = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => null,
    text: async () => '',
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null
      },
    },
  }
}

function mockRes() {
  const state = { status: null, payload: null, headers: {} }
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

describe('Supplier Drive Scanner V1 — funções puras', () => {
  it('homologa McQueen em VIVIAN e MIA com a mesma família canônica', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_MCQUEEN')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_MCQUEEN')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'ALEXANDER_MCQUEEN_OVERSIZED',
      folder_id: '1mallMj4ThG_paDoRaUi_BL1FQbVfMDih',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ALEXANDER_MCQUEEN_OVERSIZED',
      folder_id: '1QPzSVop-kl4tR93pf3Zouh7w3dc2P8z3',
      cycle_enabled: true,
    })
  })

  it('Court Borough VIVIAN entra como piloto manual e fica fora da rotação diária por enquanto', () => {
    const scope = SCANNER_SCOPES.find(
      x => x.key === 'VIVIAN_NIKE_COURT_BOROUGH'
    )

    expect(scope).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_COURT_BOROUGH',
      brand: 'Nike',
      model: 'Nike Court Borough',
      folder_id: '1sar6MQbNFRV9A72_hVAOqlV8Fv1-axPF',
      drive_path: '/Tênis - Nike/Court Borough',
      cycle_enabled: false,
    })
  })

  it('NB1000 homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NB1000')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NB1000')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NEW_BALANCE_1000',
      folder_id: '14ynD95iIaGHvu23LHdLkXLEp7epTnJiM',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NEW_BALANCE_1000',
      folder_id: '1CYvU5JNx1B8u20jEP3Ht8eaM7-OOf3iV',
      cycle_enabled: true,
    })
  })

  it('NB2000 homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NB2000')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NB2000')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NEW_BALANCE_2000',
      folder_id: '18QyKdFW3HjZLUeSLi9C0rPDd0cJHRNfT',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NEW_BALANCE_2000',
      folder_id: '1n8lb-YwQitriJbvw7t0ed0YUOoV-KfOy',
      cycle_enabled: true,
    })
  })

  it('NB530 homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NB530')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NB530')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NEW_BALANCE_530',
      folder_id: '1JSyRh5EfpoiaU-_7zfOrOmgEXUJbaLRy',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NEW_BALANCE_530',
      folder_id: '1zZiFpQH8uPAeG9_47CETtSf4XyVNHgle',
      cycle_enabled: true,
    })
  })

  it('Adidas Samba homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_ADIDAS_SAMBA')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_ADIDAS_SAMBA')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'ADIDAS_SAMBA',
      folder_id: '1L8yAuF9eBxQiiASYAESzkz2wpQ1fpdQD',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ADIDAS_SAMBA',
      folder_id: '1iFPdBLefpvnSSx3t70cByAQ4N3a7EIh-',
      cycle_enabled: true,
    })
  })

  it('Adidas Adi 2000 homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_ADIDAS_ADI2000')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_ADIDAS_ADI2000')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'ADIDAS_ADI_2000',
      folder_id: '1d-w9yK7GFn1UjJ-VjGcm7ijYnuhrDmZA',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ADIDAS_ADI_2000',
      folder_id: '1QnYHdCKOCOht0vbZPiqop_5TC9JFGbQk',
      cycle_enabled: true,
    })
  })

  it('Adidas Campus homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_ADIDAS_CAMPUS')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_ADIDAS_CAMPUS')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'ADIDAS_CAMPUS',
      folder_id: '1fJezk1YShvFlJtQXu6zLMfXs_8e6pnZd',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ADIDAS_CAMPUS',
      folder_id: '1o_2ycQEQf2ddGXKDXpo4rORiNrrfYbnb',
      cycle_enabled: true,
    })
  })

  it('Mizuno Prophecy 14 homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_MIZUNO_PROPHECY14')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_MIZUNO_PROPHECY14')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'MIZUNO_WAVE_PROPHECY_14',
      folder_id: '11Tex-NcCScjJrZVEQoRRWzTTWoDV53_L',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'MIZUNO_WAVE_PROPHECY_14',
      folder_id: '1az9Is_YZ2wTO4Ws9VLrRlBYaCPxSbjHQ',
      cycle_enabled: true,
    })
  })

  it('Nike Dunk homologado fica ativo em VIVIAN e nas duas pastas MIA', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_DUNK')
    const mia1 = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_DUNK_1')
    const mia2 = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_DUNK_2')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_DUNK',
      folder_id: '1x79nKJUbpuLkz37AlVJUI5O2XitLJ7PP',
      cycle_enabled: true,
    })
    expect(mia1).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_DUNK',
      folder_id: '1IMNZmL0prqqTVQLVpul2KpEurMIixC1s',
      cycle_enabled: true,
    })
    expect(mia2).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_DUNK',
      folder_id: '1yOvOsJ60h9Ts4A1jnjDNs0OEhYRJkVuW',
      cycle_enabled: true,
    })
  })

  it('Nike Court Vision homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_COURT_VISION')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_COURT_VISION')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_COURT_VISION',
      folder_id: '1eciTi8cC2jiVpUSYWqerMmVwlocHSrs3',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_COURT_VISION',
      folder_id: '1CVOO30487L5Lz4M91URFeQVG_iPy6uaM',
      cycle_enabled: true,
    })
  })

  it('Nike Bailleli homologado fica ativo em VIVIAN e MIA no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_BAILLELI')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_BAILLELI')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_BAILLELI',
      folder_id: '16cMQ1r71UzUabAj9P_OvlPetduuHBLLf',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_BAILLELI',
      folder_id: '13hi1d_LysbINJ8L-hTOoQ2N-gGcXJU6b',
      cycle_enabled: true,
    })
  })

  it('Adidas Adizero homologado fica ativo em VIVIAN e nas duas pastas MIA', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_ADIDAS_ADIZERO')
    const mia1 = SCANNER_SCOPES.find(x => x.key === 'MIA_ADIDAS_ADIZERO_1')
    const mia2 = SCANNER_SCOPES.find(x => x.key === 'MIA_ADIDAS_ADIZERO_2')

    expect(vivian).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'ADIDAS_ADIZERO',
      folder_id: '1QRVksvJUdlXcJyefTxiFbqiifA9vhW88',
      cycle_enabled: true,
    })
    expect(mia1).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ADIDAS_ADIZERO',
      folder_id: '12EnsbWo6tWJ1g60deARNpCupkjgnVhmY',
      cycle_enabled: true,
    })
    expect(mia2).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'ADIDAS_ADIZERO',
      folder_id: '1OB4QRP73v_zfFsjMP4OvRfWh7_AtA5d8',
      cycle_enabled: true,
    })
  })

  it('Nike Vomero homologado fica ativo em duas pastas VIVIAN e uma MIA', () => {
    const zoomx = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_VOMERO_ZOOMX')
    const premium = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_VOMERO_PREMIUM')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_VOMERO')

    expect(zoomx).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_VOMERO',
      folder_id: '1-NnKNKysu8PBWusJ3GgkX3mYarAKzQnB',
      cycle_enabled: true,
    })
    expect(premium).toMatchObject({
      supplier: 'VIVIAN',
      canonical_family: 'NIKE_VOMERO',
      folder_id: '1UvIaSRhIX9HjJcAG2fFJD88MQsuVeX6W',
      cycle_enabled: true,
    })
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_VOMERO',
      folder_id: '1ZiVsxdCX95KZcZ-Bk_hKHAchOiqTB9X9',
      cycle_enabled: true,
    })
  })

  it('Air Max DN MIA homologado fica ativo no ciclo diário', () => {
    const scope = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_MAX_DN')

    expect(scope).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_MAX_DN',
      brand: 'Nike',
      model: 'Nike Air Max DN',
      category: 'Tênis',
      drive_path: '/NIKE/Nike DN',
      cycle_enabled: true,
    })
  })

  it('Air Max 270 MIA homologado fica ativo no ciclo diário', () => {
    const scope = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_MAX_270')

    expect(scope).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_MAX_270',
      brand: 'Nike',
      model: 'Nike Air Max 270',
      category: 'Tênis',
      drive_path: '/NIKE/Nike Air Max 270',
      cycle_enabled: true,
    })
  })

  it('Air Max 97 MIA homologado fica ativo no ciclo diário', () => {
    const scope = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_MAX_97')

    expect(scope).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_MAX_97',
      brand: 'Nike',
      model: 'Nike Air Max 97',
      category: 'Tênis',
      drive_path: '/NIKE/Nike 97',
      cycle_enabled: true,
    })
  })

  it('Air Max 95 MIA homologado fica ativo no ciclo diário', () => {
    const scope = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_MAX_95')

    expect(scope).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_MAX_95',
      brand: 'Nike',
      model: 'Nike Air Max 95',
      category: 'Tênis',
      drive_path: '/NIKE/Nike 95',
      cycle_enabled: true,
    })
  })

  it('Air Max 90 MIA homologado fica ativo no ciclo diário', () => {
    const scope = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_MAX_90')

    expect(scope).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_MAX_90',
      brand: 'Nike',
      model: 'Nike Air Max 90',
      category: 'Tênis',
      folder_id: '1BpoXdM6wjFPPVM1REJqR7BnHcw8xByff',
      drive_path: '/NIKE/Nike Air Max 90',
      cycle_enabled: true,
    })
  })

  it('Air Jordan 1 homologado fica ativo nas quatro pastas aprovadas', () => {
    const keys = [
      'VIVIAN_NIKE_AIR_JORDAN_1_ALTO',
      'VIVIAN_NIKE_AIR_JORDAN_1_LOW',
      'MIA_NIKE_AIR_JORDAN_1_A',
      'MIA_NIKE_AIR_JORDAN_1_B',
    ]

    const scopes = keys.map(key => SCANNER_SCOPES.find(x => x.key === key))

    expect(scopes.every(Boolean)).toBe(true)
    for (const scope of scopes) {
      expect(scope).toMatchObject({
        canonical_family: 'NIKE_AIR_JORDAN_1',
        brand: 'Nike',
        model: 'Nike Air Jordan 1',
        category: 'Tênis',
        cycle_enabled: true,
      })
    }

    expect(scopes.map(x => x.folder_id)).toEqual([
      '1RuhbQrS44JQkKVp-OyhH12d6O8MOruhZ',
      '1weIu77Vgv5KFY6oLE2Ai5Le2Gw12smLJ',
      '1FH9ZMCFxuq2dyWgxUIbhpvQ4FwnRxvgl',
      '1MDw8lv0JqbeO8zTm3VXfoy_dmHo1AYit',
    ])
  })

  it('Air Jordan 3 MIA homologado fica ativo no ciclo diário', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_AIR_JORDAN_3')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_JORDAN_3')

    expect(vivian).toBeUndefined()
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_JORDAN_3',
      brand: 'Nike',
      model: 'Nike Air Jordan 3',
      folder_id: '1N0V_O47vTIFZfnXUpGebTSChCUwEg9R1',
      drive_path: '/NIKE/Nike jordan 3',
      cycle_enabled: true,
    })
  })

  it('Air Jordan 4 homologado fica ativo somente em MIA e Jordan Alto da VIVIAN segue descartado', () => {
    const vivian = SCANNER_SCOPES.find(x => x.key === 'VIVIAN_NIKE_AIR_JORDAN_4')
    const mia = SCANNER_SCOPES.find(x => x.key === 'MIA_NIKE_AIR_JORDAN_4')

    expect(vivian).toBeUndefined()
    expect(mia).toMatchObject({
      supplier: 'MIA',
      canonical_family: 'NIKE_AIR_JORDAN_4',
      folder_id: '1KwZIczcVyhFqM-baVYivENrUgDicjG3F',
      cycle_enabled: true,
    })
  })

  it('monta URL pública da pasta homologada', () => {
    expect(embeddedFolderUrl('folder-123')).toBe(
      'https://drive.google.com/embeddedfolderview?id=folder-123#grid'
    )
  })

  it('extrai e deduplica fileIds do HTML público', () => {
    const html = [
      '<div id="entry-1AbCdEfGhIjKlMnOpQrStUvWxYz12345"></div>',
      '<a href="https://drive.google.com/file/d/1SecondFileId_abcdefghijk/view"></a>',
      '<div id="entry-1AbCdEfGhIjKlMnOpQrStUvWxYz12345"></div>',
    ].join('')

    expect(parseEmbeddedFolderFileIds(html)).toEqual([
      '1AbCdEfGhIjKlMnOpQrStUvWxYz12345',
      '1SecondFileId_abcdefghijk',
    ])
  })

  it('classifica new / baseline / changed / reactivated / unchanged', () => {
    const entries = [
      { drive_file_id: 'new' },
      { drive_file_id: 'baseline' },
      { drive_file_id: 'changed' },
      { drive_file_id: 'reactivated' },
      { drive_file_id: 'same' },
    ]

    const state = [
      {
        drive_file_id: 'baseline',
        content_hash: null,
        active: true,
        analysis_status: 'ready',
        visual_color: 'preto',
      },
      {
        drive_file_id: 'changed',
        content_hash: 'old-fp',
        active: true,
        analysis_status: 'ready',
        visual_color: 'branco',
      },
      {
        drive_file_id: 'reactivated',
        content_hash: 'fp-reactivated',
        active: false,
        analysis_status: 'ready',
        visual_color: 'cinza',
      },
      {
        drive_file_id: 'same',
        content_hash: 'fp-same',
        active: true,
        analysis_status: 'ready',
        visual_color: 'bege',
      },
    ]

    const fingerprints = new Map([
      ['new', 'fp-new'],
      ['baseline', 'fp-baseline'],
      ['changed', 'fp-changed'],
      ['reactivated', 'fp-reactivated'],
      ['same', 'fp-same'],
    ])

    const types = Object.fromEntries(
      classifyDiscoveredEntries(entries, state, fingerprints)
        .map(x => [x.drive_file_id, x.change_type])
    )

    expect(types).toEqual({
      new: 'new',
      baseline: 'baseline',
      changed: 'changed',
      reactivated: 'reactivated',
      same: 'unchanged',
    })
  })

  it('dry-run lê pasta + fingerprints + estado e não chama write RPCs', async () => {
    const html = [
      '<div id="entry-1FileA_abcdefghijklmno"></div>',
      '<div id="entry-1FileB_abcdefghijklmno"></div>',
    ].join('')

    const calls = []
    const fetchImpl = vi.fn(async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body })

      if (url.includes('embeddedfolderview')) {
        return htmlResponse(html)
      }

      if (url.includes('lh3.googleusercontent.com')) {
        return headResponse({
          etag: '"etag-1"',
          'content-length': '12345',
          'content-type': 'image/jpeg',
        })
      }

      if (url.includes('/rpc/lab_supplier_drive_state')) {
        return jsonResponse([])
      }

      throw new Error('write RPC não deveria ser chamado: ' + url)
    })

    const out = await scanSupplierDrive({
      dry_run: true,
      max_changes: 3,
      scope_keys: ['VIVIAN_AIR_FORCE_1'],
    }, {
      supabaseUrl: 'https://mock.supabase.co',
      publicKey: 'public-key',
      scannerToken: 'scanner-token',
      fetchImpl,
    })

    expect(out.ok).toBe(true)
    expect(out.dry_run).toBe(true)
    expect(out.scopes).toHaveLength(1)
    expect(out.scopes[0]).toMatchObject({
      scanned: 2,
      new_count: 2,
      selected_for_pending: 0,
      deactivated: 0,
    })
    expect(calls.some(x => x.url.includes('/rpc/lab_supplier_drive_upsert'))).toBe(false)
    expect(calls.some(x => x.url.includes('/rpc/lab_supplier_drive_finalize'))).toBe(false)
    expect(calls.some(x => x.url.includes('/rpc/lab_supplier_drive_log_run'))).toBe(false)
  })

  it('write limita novos/alterados ao orçamento global', async () => {
    const html = [
      '<div id="entry-1FileA_abcdefghijklmno"></div>',
      '<div id="entry-1FileB_abcdefghijklmno"></div>',
      '<div id="entry-1FileC_abcdefghijklmno"></div>',
    ].join('')

    const upserts = []
    const rpcSequence = []

    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (url.includes('embeddedfolderview')) {
        return htmlResponse(html)
      }

      if (url.includes('lh3.googleusercontent.com')) {
        return headResponse({
          etag: '"etag"',
          'content-length': '321',
          'content-type': 'image/jpeg',
        })
      }

      if (url.includes('/rpc/lab_supplier_drive_state')) {
        return jsonResponse([])
      }

      if (url.includes('/rpc/lab_supplier_drive_upsert')) {
        rpcSequence.push('upsert')
        const body = JSON.parse(init.body)
        upserts.push(body.p_drive_file_id)
        return jsonResponse([{
          id: '00000000-0000-4000-8000-000000000001',
          change_type: 'new',
          analysis_status: 'pending',
          active: true,
        }])
      }

      if (url.includes('/rpc/lab_supplier_drive_finalize')) {
        rpcSequence.push('finalize')
        return jsonResponse(0)
      }

      if (url.includes('/rpc/lab_supplier_drive_log_run')) {
        const body = JSON.parse(init.body)
        rpcSequence.push('log:' + body.p_status)
        return jsonResponse(true)
      }

      throw new Error('URL inesperada: ' + url)
    })

    const out = await scanSupplierDrive({
      dry_run: false,
      max_changes: 2,
      scope_keys: ['VIVIAN_AIR_FORCE_1'],
    }, {
      supabaseUrl: 'https://mock.supabase.co',
      publicKey: 'public-key',
      scannerToken: 'scanner-token',
      fetchImpl,
    })

    expect(out.ok).toBe(true)
    expect(upserts).toHaveLength(2)
    expect(rpcSequence[0]).toBe('log:running')
    expect(rpcSequence).toContain('log:completed')
    expect(rpcSequence.indexOf('log:running')).toBeLessThan(
      rpcSequence.indexOf('upsert')
    )
    expect(out.scopes[0].selected_for_pending).toBe(2)
    expect(out.scopes[0].deferred_changes).toBe(1)
    expect(out.scopes[0]._selected_drive_file_ids).toEqual(upserts)
    expect(JSON.stringify(out.scopes[0]))
      .not.toContain('_selected_drive_file_ids')
    expect(out.remaining_change_budget).toBe(0)
    expect(out.side_effects).toEqual({
      supplier_shadow_write: true,
      vision_call: false,
      gptmaker_call: false,
      customer_message: false,
      gaby_official: false,
    })
  })
})

describe('Supplier Drive Scanner endpoint — travas', () => {
  it('fica OFF por padrão', async () => {
    const res = mockRes()

    await handleSupplierDriveScannerRequest({
      method: 'POST',
      headers: {},
      body: {},
    }, res, { env: {} })

    expect(res.state.status).toBe(404)
    expect(res.state.payload.error).toBe('SUPPLIER_DRIVE_SCANNER_DISABLED')
  })

  it('write real exige confirmação explícita', async () => {
    const res = mockRes()
    const fetchImpl = vi.fn()

    await handleSupplierDriveScannerRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: {
        dry_run: false,
        scope_keys: ['VIVIAN_AIR_FORCE_1'],
      },
    }, res, {
      env: {
        SUPPLIER_DRIVE_SCANNER_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'lab-secret',
      },
      fetchImpl,
    })

    expect(res.state.status).toBe(400)
    expect(res.state.payload.error).toBe('DRIVE_SCAN_WRITE_CONFIRMATION_REQUIRED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('scope fora da allowlist é rejeitado', async () => {
    const res = mockRes()
    const fetchImpl = vi.fn()

    await handleSupplierDriveScannerRequest({
      method: 'POST',
      headers: {
        'x-prime-lab': 'GABY-LAB-COMERCIAL-V1',
        'x-prime-lab-secret': 'lab-secret',
      },
      body: {
        scope_keys: ['PASTA_NAO_HOMOLOGADA'],
      },
    }, res, {
      env: {
        SUPPLIER_DRIVE_SCANNER_ENABLED: 'true',
        LAB_PRODUCT_UNIVERSE_API_SECRET: 'lab-secret',
      },
      fetchImpl,
    })

    expect(res.state.status).toBe(400)
    expect(res.state.payload.error).toBe('INVALID_SCANNER_SCOPE')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('040_supplier_drive_scanner_scope_fix.sql — isolamento multi-folder', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/040_supplier_drive_scanner_scope_fix.sql'
    ),
    'utf8'
  )

  it('state V2 e finalize V2 filtram também pelo folder id', () => {
    expect(sql).toContain('public.lab_supplier_drive_state_v2')
    expect(sql).toContain('public.lab_supplier_drive_finalize_v2')
    expect((sql.match(/s\.drive_parent_id = p_drive_parent_id/g) || []).length)
      .toBeGreaterThanOrEqual(2)
  })

  it('mantém RPCs antigas intactas e não concede acesso direto à tabela', () => {
    const lower = sql.toLowerCase()
    expect(lower).not.toContain('drop function public.lab_supplier_drive_state')
    expect(lower).not.toContain('drop function public.lab_supplier_drive_finalize')
    expect(lower).not.toContain(
      'grant update on table public.supplier_shadow_products'
    )
  })

  it('scanner chama RPC V2 enviando o folder id do scope', () => {
    const source = fs.readFileSync(
      path.resolve(here, '../_supplierDriveScanner.js'),
      'utf8'
    )

    expect(source).toContain('/rpc/lab_supplier_drive_state_v2')
    expect(source).toContain('/rpc/lab_supplier_drive_finalize_v2')
    expect((source.match(/p_drive_parent_id: scope\.folder_id/g) || []).length)
      .toBeGreaterThanOrEqual(2)
  })
})

describe('037_supplier_drive_scanner_run_order_fix.sql — ordem de FK', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/037_supplier_drive_scanner_run_order_fix.sql'
    ),
    'utf8'
  )

  it('permite criar o ledger como running antes dos produtos', () => {
    expect(sql).toContain(
      "p_status not in ('running', 'completed', 'partial', 'failed')"
    )
    expect(sql).toContain(
      "case when p_status = 'running' then null else now() end"
    )
  })

  it('continua protegido por hash e sem grant direto em tabela', () => {
    expect(sql).toContain(
      'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
    )
    expect(sql.toLowerCase()).not.toContain(
      'grant insert on table public.supplier_shadow_sync_runs'
    )
  })
})

describe('036_supplier_drive_scanner_lab_rpc.sql — gate estreito', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(
    path.resolve(
      here,
      '../../supabase/migrations/036_supplier_drive_scanner_lab_rpc.sql'
    ),
    'utf8'
  )

  it('cria state/upsert/finalize/log como SECURITY DEFINER', () => {
    expect(sql).toContain('public.lab_supplier_drive_state')
    expect(sql).toContain('public.lab_supplier_drive_upsert')
    expect(sql).toContain('public.lab_supplier_drive_finalize')
    expect(sql).toContain('public.lab_supplier_drive_log_run')
    expect((sql.toLowerCase().match(/security definer/g) || []).length).toBeGreaterThanOrEqual(4)
  })

  it('upsert novo entra pending e mudança limpa Vision anterior', () => {
    expect(sql).toContain("'pending'")
    expect(sql).toContain('visual_color = null')
    expect(sql).toContain('vision_confidence = null')
    expect(sql).toContain('indexed_at = null')
  })

  it('baseline não força reanálise do que já está ready com cor', () => {
    expect(sql).toContain("v_existing.analysis_status = 'ready'")
    expect(sql).toContain('v_existing.visual_color is not null')
    expect(sql).toContain("v_change := 'baseline'")
  })

  it('remoção é soft delete', () => {
    expect(sql).toContain('active = false')
    expect(sql).toContain('removed_at = now()')
  })

  it('não concede SELECT/INSERT/UPDATE direto na tabela', () => {
    const lower = sql.toLowerCase()
    expect(lower).not.toContain(
      'grant select on table public.supplier_shadow_products'
    )
    expect(lower).not.toContain(
      'grant insert on table public.supplier_shadow_products'
    )
    expect(lower).not.toContain(
      'grant update on table public.supplier_shadow_products'
    )
  })

  it('guarda só hash do token do scanner', () => {
    expect(sql).toContain(
      'bc459883461a5e73cd69087a379d2beed351d46c51de23a673719c5c021984bd'
    )
    expect(sql).not.toContain('WRGsZBZgeSxeBPYtsFTsI-rkX4nUKKowspcss-akUBE')
  })
})
