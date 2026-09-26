import { decideStoryWithJev } from './_jevStoryDecision.js'

const CASES = {
  strong: {
    question: 'Quanto essa?',
    visionQuery: 'New Balance 9060 Bege',
    candidates: [
      { nome: 'Tênis New Balance 9060 Bege', categoria: 'Tênis', marca: 'New Balance', score: 80 },
      { nome: 'Tênis New Balance 9060 Gelo', categoria: 'Tênis', marca: 'New Balance', score: 47 },
      { nome: 'Tênis Nike Dunk Bege', categoria: 'Tênis', marca: 'Nike', score: 23 },
    ],
  },
  ambiguous: {
    question: 'Quanto o cinza?',
    visionQuery: 'New Balance 9060 Cinza',
    candidates: [
      { nome: 'Tênis New Balance 9060 Cinza Claro', categoria: 'Tênis', marca: 'New Balance', score: 55 },
      { nome: 'Tênis New Balance 9060 Cinza Escuro', categoria: 'Tênis', marca: 'New Balance', score: 53 },
      { nome: 'Tênis Nike Dunk Cinza', categoria: 'Tênis', marca: 'Nike', score: 32 },
    ],
  },
  mismatch: {
    question: 'Tem 37?',
    visionQuery: 'New Balance 9060 Bege',
    candidates: [
      { nome: 'Camiseta Diesel Preta', categoria: 'Camiseta', marca: 'Diesel', score: 28 },
      { nome: 'Calça Jeans Diesel Azul', categoria: 'Calça', marca: 'Diesel', score: 27 },
    ],
  },
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'not_found' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const key = String(req.query?.case || 'strong')
  const fixture = CASES[key]
  if (!fixture) return res.status(400).json({ error: 'invalid_case' })

  const result = await decideStoryWithJev({
    ...fixture,
    storyContextStatus: 'STORY_FOUND_VISION_OK',
    visionStatus: 'success',
  })

  return res.status(200).json({
    case: key,
    action: result.action,
    selectedCandidateId: result.selectedCandidateId,
    confidence: result.confidence,
    selectedProbability: result.selectedProbability,
    reason: result.reason,
    model: result.model || null,
    costUsd: result.costUsd ?? null,
    status: result.status,
  })
}
