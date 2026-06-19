/**
 * Serviço AWS Rekognition
 *
 * Integração com AWS Rekognition para análise de fotos
 * FREE: 5.000 imagens/mês
 * DEPOIS: $0.001 por imagem
 *
 * Setup: https://docs.aws.amazon.com/rekognition/latest/dg/getting-started.html
 */

// ==================== CONFIGURAÇÃO ====================

const AWS_ACCESS_KEY = import.meta.env.VITE_AWS_ACCESS_KEY
const AWS_SECRET_KEY = import.meta.env.VITE_AWS_SECRET_KEY
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'

// Validar credenciais
function validateCredentials() {
  if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY) {
    throw new Error(`
      ❌ Credenciais AWS não configuradas!

      Adicione ao seu .env:
      VITE_AWS_ACCESS_KEY=sua-chave-aqui
      VITE_AWS_SECRET_KEY=sua-secreta-aqui
      VITE_AWS_REGION=us-east-1

      Guia: AWS_SETUP_GUIDE.md
    `)
  }
}

// ==================== ANÁLISE COM AWS SDK ====================

/**
 * Analisa foto usando AWS Rekognition
 * Detecta: labels, objects, text (OCR), faces
 */
export async function analyzeWithAWSRekognition(imageUrl) {
  try {
    validateCredentials()

    // Extrai bucket e key da URL S3
    // Ou usa URL público (mais simples para começar)

    const response = await fetchFromAWSAPI(imageUrl)

    return {
      provider: 'aws_rekognition',
      labels: response.labels || [],
      objects: response.objects || [],
      text: response.text || '',
      faces: response.faces || [],
      moderation: response.moderation || [],
      raw: response,
    }
  } catch (err) {
    console.error('[AWS Rekognition] Error:', err)
    throw err
  }
}

// ==================== API CALL VIA LAMBDA ====================

/**
 * IMPORTANTE: AWS Rekognition não funciona diretamente no navegador
 * Você precisa de:
 *
 * OPÇÃO 1: Backend Lambda (recomendado)
 *   - Cria função Lambda que chama Rekognition
 *   - Frontend chama a Lambda via API Gateway
 *
 * OPÇÃO 2: Presigned URLs
 *   - Backend gera URL assinada S3
 *   - Frontend envia foto para S3
 *   - Lambda processa automaticamente
 *
 * OPÇÃO 3: Backend Node.js
 *   - Seu servidor Node.js tem as credenciais
 *   - Frontend envia imagem
 *   - Backend chama Rekognition
 */

async function fetchFromAWSAPI(imageUrl) {
  try {
    // Opção 1: Chamar seu próprio backend (recomendado)
    const response = await fetch('/api/analyze-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  } catch (err) {
    console.error('[AWS API] Error:', err)
    throw err
  }
}

// ==================== BACKEND NODE.JS (Se quiser) ====================

/**
 * CÓDIGO PARA RODAR NO SEU SERVIDOR NODE.JS
 *
 * Instale: npm install aws-sdk
 *
 * Adicione isto ao seu servidor (Express):
 */

export const awsBackendExample = `
// server.js (Node.js + Express)
import AWS from 'aws-sdk'
import express from 'express'

const app = express()
const rekognition = new AWS.Rekognition({
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY,
  secretAccessKey: process.env.VITE_AWS_SECRET_KEY,
  region: 'us-east-1',
})

app.post('/api/analyze-photo', async (req, res) => {
  try {
    const { imageUrl } = req.body

    // Download da imagem
    const imageBuffer = await fetch(imageUrl)
      .then(r => r.buffer())

    // Chamadas paralelas ao AWS
    const [labels, text, faces] = await Promise.all([
      rekognition.detectLabels({
        Image: { Bytes: imageBuffer },
        MaxLabels: 10,
      }).promise(),

      rekognition.detectText({
        Image: { Bytes: imageBuffer },
      }).promise(),

      rekognition.detectFaces({
        Image: { Bytes: imageBuffer },
        Attributes: ['ALL'],
      }).promise(),
    ])

    res.json({
      labels: labels.Labels.map(l => ({
        description: l.Name,
        confidence: l.Confidence,
      })),
      text: text.TextDetections
        .filter(t => t.Type === 'LINE')
        .map(t => t.DetectedText)
        .join(' '),
      faces: faces.FaceDetails.map(f => ({
        confidence: f.Confidence,
        emotions: f.Emotions,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000)
`

// ==================== TESTE LOCAL ====================

/**
 * Para testar SEM backend Node.js:
 * Use o teste via boto3 (Python) ou AWS CLI
 */

export const awsCliTest = `
# Teste via AWS CLI
# Instale: https://aws.amazon.com/cli/

aws configure
# Cole suas credenciais

# Detectar labels em uma foto
aws rekognition detect-labels \\
  --image S3Object={Bucket=seu-bucket,Name=sua-foto.jpg} \\
  --region us-east-1

# Ler texto em foto
aws rekognition detect-text \\
  --image S3Object={Bucket=seu-bucket,Name=sua-foto.jpg} \\
  --region us-east-1
`

// ==================== INFORMAÇÕES ÚTEIS ====================

export const awsRecognitionFeatures = {
  detectLabels: {
    description: 'Identifica objetos, cenas, ações na imagem',
    exemplo: 'Nike, sneaker, athletic shoe, black',
    custo: 'Incluso (5k/mês free)',
  },

  detectText: {
    description: 'Lê texto na imagem (OCR)',
    exemplo: '"Nike Air Max 90"',
    custo: 'Incluso (5k/mês free)',
  },

  detectFaces: {
    description: 'Detecta rostos, emoções, atributos',
    exemplo: 'Happy, confident, smile',
    custo: 'Incluso (5k/mês free)',
  },

  detectModerationLabels: {
    description: 'Detecta conteúdo inapropriado',
    exemplo: 'Explicit, Violence',
    custo: 'Incluso (5k/mês free)',
  },

  searchFacesByImage: {
    description: 'Busca rostos similares em coleção',
    exemplo: 'Encontrar clientes no banco de fotos',
    custo: '$0.001 por imagem',
  },

  indexFaces: {
    description: 'Adiciona rosto a uma coleção',
    exemplo: 'Cadastrar rosto novo',
    custo: '$0.001 por imagem',
  },
}

// ==================== PRÓXIMOS PASSOS ====================

/**
 * Para integrar AWS Rekognition ao seu sistema:
 *
 * 1. Escolha uma opção:
 *    a) Backend Lambda (AWS hosted)
 *    b) Backend Node.js (seu servidor)
 *    c) AWS CLI (testes)
 *
 * 2. Se escolher Node.js:
 *    npm install aws-sdk
 *    Adicione as credenciais ao .env
 *    Crie endpoint /api/analyze-photo
 *
 * 3. Frontend chama o endpoint
 *
 * 4. Sistema funciona igual aos outros provedores!
 *
 * 5. Se AWS cair, fallback automático para TensorFlow
 */

export const nextSteps = `
📋 CHECKLIST:

[ ] Criar conta AWS (5 min)
[ ] Ativar free tier (1 min)
[ ] Criar IAM user (10 min)
[ ] Copiar credenciais (1 min)
[ ] Adicionar ao .env (1 min)
[ ] Instalar SDK (5 min)
[ ] Criar backend endpoint (30 min)
[ ] Testar com uma foto (5 min)
[ ] Integrar ao photoFlowService.js (10 min)

Total: ~1-2 horas para tudo pronto!
`

export default {
  analyzeWithAWSRekognition,
  awsRecognitionFeatures,
}
