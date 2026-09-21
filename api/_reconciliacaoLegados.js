/**
 * api/_reconciliacaoLegados.js
 *
 * CONTRATO CATÁLOGO PRIME — Etapa 1 (LAB/preview). Reconciliação assistida
 * dos produtos legados SEM bagy_product_id (43 linhas no diagnóstico de
 * 2026-09-21). Funções PURAS e SOMENTE LEITURA: recebem os dados, devolvem
 * o relatório. NENHUMA escrita ou vinculação automática — o passo de
 * atribuir bagy_product_id é humano e fica para depois do relatório
 * (APROVADO Etapa 0, seção 8 do plano).
 *
 * Para cada legado o preview gera:
 * - produto legado (id, nome, link, preco, imagem, status);
 * - link normalizado (mesma semântica de _bagySyncClient.normalizeLink,
 *   aqui pura e sem dependência de env);
 * - possíveis candidatos Bagy com as evidências que sustentam cada um;
 * - confiança (alta | media | baixa | nenhuma);
 * - conflito/ambiguidade (boolean + lista quando >1 candidato);
 * - recomendação para revisão.
 *
 * Testado isoladamente em api/__tests__/reconciliacaoLegados.test.js.
 */

import { normalizarChave } from './_catalogoContratoPrime.js'

/**
 * Normaliza um link pra comparação estável: origem + path minúsculos, sem
 * trailing slash, sem query/hash. Links relativos resolvem contra storeUrl
 * (parâmetro explícito — nada de env em módulo puro). Mesma semântica de
 * api/_bagySyncClient.js normalizeLink; manter as duas em sincronia.
 */
export function normalizarLinkPuro(url, storeUrl) {
  if (!url) return ''
  const full = url.startsWith('http') ? url : `${storeUrl}/${url.replace(/^\//, '')}`
  try {
    const u = new URL(full)
    const path = u.pathname.replace(/\/$/, '')
    return (u.origin + path).toLowerCase()
  } catch {
    return full.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
  }
}

export const CONFIANCA_RECONCILIACAO = Object.freeze({
  ALTA: 'alta',
  MEDIA: 'media',
  BAIXA: 'baixa',
  NENHUMA: 'nenhuma',
})

export const RECOMENDACAO_RECONCILIACAO = Object.freeze({
  VALIDAR_VINCULO_HUMANO: 'validar_vinculo_humano',
  REVISAO_MANUAL: 'revisao_manual',
  REVISAR_SEM_CANDIDATO: 'revisar_sem_candidato',
})

/**
 * Gera o preview de reconciliação. Determinístico: mesma entrada → mesma
 * saída (candidatos ordenados por bagy_product_id; índices estáveis).
 *
 * Regras de confiança (documentadas, sem exceção):
 * - 1 candidato por LINK EXATO + nome também casa → alta / validar_vinculo_humano
 * - 1 candidato por LINK EXATO com nome diferente → media / revisao_manual
 *   (links são reciclados nesta loja — evidência real: link de um produto
 *   reaparece em outro; nome divergente derruba a confiança)
 * - >1 candidatos no mesmo link → media + conflito / revisao_manual
 * - sem link, 1 candidato por NOME EXATO → baixa / revisao_manual
 * - sem link, >1 por nome → baixa + conflito / revisao_manual
 * - nada → nenhuma / revisar_sem_candidato (decisão por grupo: inativar,
 *   corrigir na Bagy, manter ou retirar da consulta da Gaby)
 *
 * @param {Array} legados      linhas de products SEM bagy_product_id
 * @param {Array} candidatos   linhas de products COM bagy_product_id (ou a
 *                             listagem oficial da Bagy no mesmo shape)
 * @param {{storeUrl?: string}} opcoes
 */
export function reconciliarLegadosPreview(legados, candidatos, opcoes = {}) {
  const storeUrl = opcoes.storeUrl || 'https://www.primestoremen.com.br'

  const porLink = new Map()
  const porNome = new Map()
  for (const c of candidatos || []) {
    const linkNorm = normalizarLinkPuro(c.link, storeUrl)
    if (linkNorm) {
      if (!porLink.has(linkNorm)) porLink.set(linkNorm, [])
      porLink.get(linkNorm).push(c)
    }
    const nomeNorm = normalizarChave(c.nome)
    if (nomeNorm) {
      if (!porNome.has(nomeNorm)) porNome.set(nomeNorm, [])
      porNome.get(nomeNorm).push(c)
    }
  }

  const resumoCandidato = (c, evidencias) => ({
    bagy_product_id: c.bagy_product_id ?? null,
    id: c.id ?? null,
    nome: c.nome ?? null,
    link: c.link ?? null,
    evidencias,
  })

  return (legados || []).map((l) => {
    const linkNormalizado = normalizarLinkPuro(l.link, storeUrl)
    const nomeNormalizado = normalizarChave(l.nome)

    let candidatos = []
    let confianca = CONFIANCA_RECONCILIACAO.NENHUMA
    let conflito = false
    let recomendacao = RECOMENDACAO_RECONCILIACAO.REVISAR_SEM_CANDIDATO

    const porLinkExato = linkNormalizado ? porLink.get(linkNormalizado) || [] : []
    if (porLinkExato.length > 0) {
      candidatos = porLinkExato.map((c) => {
        const evidencias = ['link_exato']
        if (normalizarChave(c.nome) === nomeNormalizado) evidencias.push('nome_exato')
        return resumoCandidato(c, evidencias)
      })
      const nomeCasa = porLinkExato.length === 1 && normalizarChave(porLinkExato[0].nome) === nomeNormalizado
      if (porLinkExato.length === 1 && nomeCasa) {
        confianca = CONFIANCA_RECONCILIACAO.ALTA
        recomendacao = RECOMENDACAO_RECONCILIACAO.VALIDAR_VINCULO_HUMANO
      } else {
        // nome divergente (link reciclado) ou mais de um candidato no link
        confianca = CONFIANCA_RECONCILIACAO.MEDIA
        conflito = porLinkExato.length > 1
        recomendacao = RECOMENDACAO_RECONCILIACAO.REVISAO_MANUAL
      }
    } else {
      const porNomeExato = nomeNormalizado ? porNome.get(nomeNormalizado) || [] : []
      if (porNomeExato.length > 0) {
        candidatos = porNomeExato.map((c) => resumoCandidato(c, ['nome_exato']))
        confianca = CONFIANCA_RECONCILIACAO.BAIXA
        conflito = porNomeExato.length > 1
        recomendacao = RECOMENDACAO_RECONCILIACAO.REVISAO_MANUAL
      }
    }

    return {
      legado: {
        id: l.id ?? null,
        nome: l.nome ?? null,
        link: l.link ?? null,
        preco: l.preco ?? null,
        imagem: l.imagem ?? null,
        status: l.status ?? null,
      },
      link_normalizado: linkNormalizado || null,
      candidatos,
      confianca,
      conflito,
      recomendacao,
    }
  })
}
