/**
 * api/_debugFfmpegFrame.js — TEMPORÁRIO, ISOLADO, SÓ DIAGNÓSTICO (Passo 0)
 *
 * Objetivo único: comprovar que ffmpeg-static funciona no runtime da Vercel e
 * consegue extrair 1 frame de um Story real que chegou como video/mp4
 * (foto + música do Instagram), e que esse frame é identificável pela mesma
 * camada de visão já homologada (?tool=ocr-openrouter, google/gemini-2.5-flash-lite).
 *
 * NÃO integra com api/webhook.js, api/_storyContext.js nem a Action real.
 * URL do Story é fixa no código (não vem de input do usuário) — sem risco de
 * injeção. Argumentos do ffmpeg são um array fixo, nunca shell:true, nunca
 * concatenação de string vinda de fora.
 *
 * Nunca loga a storyMediaUrl nem base64. Apaga os arquivos temporários ao final.
 */

import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile, unlink, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

// Fixo, do Story real já validado nesta investigação — nunca vem de req.body.
const STORY_VIDEO_URL = 'https://gpt-files.com/file/3F306ABF4F19303E3DC66E0E9A5EC274/3F872365DAE220238BB626617B53CA57/AQNsI5l5Tv2FPjfvkcepgHBrWzCYczpLffnxgJx4dqzph1Nc1d3t32ZjuEXw5s_y4xk6LwCd6jlwJ8iNMvpql56y7_mfyj0IyBtlY68.mp4'
const ALLOWED_HOST = 'gpt-files.com'
const MAX_VIDEO_BYTES = 20 * 1024 * 1024 // 20MB — folga generosa pra vídeo curto de Story

const PROMPT_IDENTIFICACAO = `Você é um especialista em identificação de produtos para lojas.

Analise esta foto e descreva o produto com detalhes para uma base de conhecimento:

Responda EXATAMENTE neste formato:
## [Nome do produto]
**Tipo:** (categoria do produto)
**Marca:** (se visível, senão "Não identificado")
**Cor:** (cores principais)
**Características:** (detalhes visuais únicos: material, design, tamanho estimado, etc)
**Ocasião/Uso:** (para que situações ou público serve)
**Descrição para venda:** (texto persuasivo de 2-3 linhas para usar no WhatsApp)

Identifique qualquer produto que apareça na imagem — roupa, tênis, perfume, acessório, bolsa, eletrônico, etc.
Se não conseguir identificar algum campo, escreva "Não identificado".`

export default async function handler(req, res) {
  const tempFiles = []
  const t0 = Date.now()
  const timings = {}

  try {
    // 1) Validação de host (mesma allowlist já usada em _visaoProduto.js)
    const u = new URL(STORY_VIDEO_URL)
    if (u.protocol !== 'https:' || u.hostname !== ALLOWED_HOST) {
      return res.status(400).json({ ok: false, etapa: 'validacao_url', erro: 'host nao permitido' })
    }

    // 2) Download do vídeo real (sem logar a URL)
    const tDownloadStart = Date.now()
    const videoRes = await fetch(STORY_VIDEO_URL, { redirect: 'manual' })
    if (videoRes.status >= 300 && videoRes.status < 400) {
      return res.status(502).json({ ok: false, etapa: 'download', erro: 'redirect nao permitido' })
    }
    if (!videoRes.ok) {
      return res.status(502).json({ ok: false, etapa: 'download', erro: `HTTP ${videoRes.status}` })
    }
    const contentType = videoRes.headers.get('content-type') || ''
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
    if (videoBuffer.byteLength > MAX_VIDEO_BYTES) {
      return res.status(413).json({ ok: false, etapa: 'download', erro: 'video excede limite de tamanho' })
    }
    timings.downloadMs = Date.now() - tDownloadStart

    const videoPath = `/tmp/story-${randomUUID()}.mp4`
    const framePath = `/tmp/frame-${randomUUID()}.jpg`
    tempFiles.push(videoPath, framePath)
    await writeFile(videoPath, videoBuffer)

    // 3) Extração de 1 frame ~1s via ffmpeg-static — execFile (nunca shell),
    // argumentos fixos, nenhum input de usuário concatenado.
    const tFfmpegStart = Date.now()
    await execFileAsync(ffmpegPath, [
      '-ss', '1',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      framePath,
    ], { timeout: 15000 })
    timings.ffmpegMs = Date.now() - tFfmpegStart

    const frameStat = await stat(framePath)
    const frameBuffer = await readFile(framePath)

    // Dimensões via cabeçalho JPEG (SOF0/SOF2), sem dependência extra.
    let dimensoes = null
    for (let i = 2; i < frameBuffer.length - 9; i++) {
      if (frameBuffer[i] === 0xff && (frameBuffer[i + 1] === 0xc0 || frameBuffer[i + 1] === 0xc2)) {
        const height = frameBuffer.readUInt16BE(i + 5)
        const width = frameBuffer.readUInt16BE(i + 7)
        dimensoes = `${width}x${height}`
        break
      }
    }

    // 4) Envia o frame pra camada de visão JÁ HOMOLOGADA (mesmo proxy, mesmo modelo)
    const tVisionStart = Date.now()
    const base64 = frameBuffer.toString('base64')
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    const host = process.env.VERCEL_URL
    const visionRes = await fetch(`https://${host}/api/system-tools?tool=ocr-openrouter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT_IDENTIFICACAO },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        ]}],
        max_tokens: 800,
        temperature: 0.2,
      }),
    })
    timings.visionMs = Date.now() - tVisionStart

    let descricaoVisual = null
    if (visionRes.ok) {
      const visionData = await visionRes.json()
      descricaoVisual = visionData.choices?.[0]?.message?.content || null
    }

    // 5) Chamada técnica isolada de busca no catálogo (sem tocar no fluxo real)
    let produtosEncontrados = []
    if (descricaoVisual) {
      const catalogoRes = await fetch(`https://${host}/api/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
        },
        body: JSON.stringify({ pergunta: descricaoVisual, cliente_id: 'debug-ffmpeg-poc', telefone: '' }),
      })
      if (catalogoRes.ok) {
        const catalogoData = await catalogoRes.json()
        produtosEncontrados = (catalogoData.dados?.produtos || []).map(p => ({ nome: p.nome, preco: p.preco }))
      }
    }

    timings.totalMs = Date.now() - t0

    return res.status(200).json({
      ok: true,
      videoContentType: contentType,
      videoBytes: videoBuffer.byteLength,
      frameBytes: frameStat.size,
      dimensoes,
      descricaoVisual,
      produtosEncontrados,
      timings,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, erro: err.message })
  } finally {
    for (const f of tempFiles) {
      try { await unlink(f) } catch {}
    }
  }
}
