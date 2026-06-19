/**
 * BACKEND DE EXEMPLO: AWS Rekognition
 *
 * ⚠️ IMPORTANTE: Este é um EXEMPLO de como usar AWS Rekognition
 *
 * OPÇÕES:
 * A) Rodar este arquivo em um servidor Node.js separado
 * B) Integrar ao seu servidor Express existente
 * C) Usar AWS Lambda (sem precisar de servidor)
 *
 * RECOMENDAÇÃO: Opção B (integrar ao seu servidor)
 */

// ==================== INSTALAÇÃO ====================

/**
 * npm install express cors aws-sdk dotenv
 */

// ==================== CÓDIGO ====================

import express from 'express'
import cors from 'cors'
import AWS from 'aws-sdk'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())

// ==================== CONFIGURAR AWS ====================

const rekognition = new AWS.Rekognition({
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY,
  secretAccessKey: process.env.VITE_AWS_SECRET_KEY,
  region: process.env.VITE_AWS_REGION || 'us-east-1',
})

// ==================== ENDPOINT PRINCIPAL ====================

/**
 * POST /api/analyze-photo
 * Body: { imageUrl: "https://..." }
 * Response: { labels, text, faces, ... }
 */
app.post('/api/analyze-photo', async (req, res) => {
  try {
    const { imageUrl } = req.body

    // Validações
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' })
    }

    console.log('[AWS] Analisando foto:', imageUrl)

    // PASSO 1: Download da imagem
    console.log('[AWS] Baixando imagem...')
    const imageBuffer = await downloadImage(imageUrl)

    if (!imageBuffer) {
      return res.status(400).json({ error: 'Failed to download image' })
    }

    console.log('[AWS] Imagem baixada:', imageBuffer.length, 'bytes')

    // PASSO 2: Chamar AWS (3 análises em paralelo)
    console.log('[AWS] Chamando Rekognition (3 análises em paralelo)...')

    const startTime = Date.now()

    const [labelsRes, textRes, facesRes] = await Promise.all([
      rekognition
        .detectLabels({
          Image: { Bytes: imageBuffer },
          MaxLabels: 10,
          MinConfidence: 50,
        })
        .promise(),

      rekognition
        .detectText({
          Image: { Bytes: imageBuffer },
        })
        .promise(),

      rekognition
        .detectFaces({
          Image: { Bytes: imageBuffer },
          Attributes: ['ALL'],
        })
        .promise(),
    ])

    const processingTime = Date.now() - startTime

    console.log('[AWS] ✅ Análise concluída em', processingTime, 'ms')

    // PASSO 3: Processar resultados
    const labels = labelsRes.Labels.map(label => ({
      description: label.Name,
      confidence: Math.round(label.Confidence),
    }))

    const text = textRes.TextDetections.filter(t => t.Type === 'LINE')
      .map(t => t.DetectedText)
      .join(' ')

    const faces = facesRes.FaceDetails.map(face => ({
      confidence: Math.round(face.Confidence),
      ageRange: face.AgeRange,
      smile: face.Smile?.Value || false,
      emotions: face.Emotions?.map(e => ({
        type: e.Type,
        confidence: Math.round(e.Confidence),
      })) || [],
    }))

    // PASSO 4: Retornar resposta
    const result = {
      success: true,
      provider: 'aws_rekognition',
      labels,
      text: text || null,
      faces,
      processingTime,
      timestamp: new Date().toISOString(),
    }

    console.log('[AWS] Retornando resultado:', {
      labels: labels.length,
      textDetected: !!text,
      faces: faces.length,
      processingTime,
    })

    res.json(result)
  } catch (err) {
    console.error('[AWS] ❌ Erro:', err.message)

    res.status(500).json({
      success: false,
      error: err.message,
      hint: 'Verifique suas credenciais AWS no .env',
    })
  }
})

// ==================== ENDPOINT DE TESTE ====================

app.get('/api/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend AWS Rekognition rodando!',
    endpoints: {
      'POST /api/analyze-photo': 'Analisa uma foto',
      'GET /api/test': 'Este endpoint',
      'GET /api/status': 'Status das credenciais',
    },
  })
})

// ==================== VERIFICAR CREDENCIAIS ====================

app.get('/api/status', (req, res) => {
  const hasAccessKey = !!process.env.VITE_AWS_ACCESS_KEY
  const hasSecretKey = !!process.env.VITE_AWS_SECRET_KEY
  const region = process.env.VITE_AWS_REGION || 'us-east-1'

  res.json({
    aws: {
      configured: hasAccessKey && hasSecretKey,
      accessKeyConfigured: hasAccessKey,
      secretKeyConfigured: hasSecretKey,
      region,
    },
    tips: !hasAccessKey || !hasSecretKey ? [
      '❌ Credenciais não configuradas',
      '1. Criar conta AWS: https://aws.amazon.com/free/',
      '2. Copiar credenciais IAM',
      '3. Adicionar ao .env:',
      '   VITE_AWS_ACCESS_KEY=...',
      '   VITE_AWS_SECRET_KEY=...',
      '   VITE_AWS_REGION=us-east-1',
      '4. Reiniciar servidor',
    ] : [
      '✅ Credenciais configuradas!',
      'POST /api/analyze-photo com imageUrl para testar',
    ],
  })
})

// ==================== HELPER: Download de Imagem ====================

async function downloadImage(imageUrl) {
  try {
    const response = await fetch(imageUrl)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const buffer = await response.buffer()
    return buffer
  } catch (err) {
    console.error('[Download] ❌ Erro:', err.message)
    return null
  }
}

// ==================== INICIAR SERVIDOR ====================

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🟠 AWS Rekognition Backend            ║
║  Rodando em http://localhost:${PORT}    ║
╚════════════════════════════════════════╝

📋 ENDPOINTS:
  GET  /api/test          → Testar conexão
  GET  /api/status        → Ver credenciais
  POST /api/analyze-photo → Analisar foto

🧪 TESTE RÁPIDO:
  curl http://localhost:${PORT}/api/test

📝 EXEMPLO DE USO:
  curl -X POST http://localhost:${PORT}/api/analyze-photo \\
    -H "Content-Type: application/json" \\
    -d '{"imageUrl":"https://example.com/foto.jpg"}'

⚙️  PRÓXIMO PASSO:
  Integrar ao seu frontend em photoFlowService.js

`)
})

// ==================== EXEMPLO DE USO NO FRONTEND ====================

/**
 * No seu photoFlowService.js, troque:
 *
 * import { recognizePhoto } from './photoRecognitionService'
 *
 * Para:
 *
 * async function analyzeImageWithBackend(imageUrl) {
 *   const response = await fetch('/api/analyze-photo', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ imageUrl }),
 *   })
 *   return response.json()
 * }
 */

export default app
