// Fachada do webhook no branch LAB.
// O comportamento oficial permanece byte-a-byte em ../lib/webhookOfficial.js.
// Só desvia para Story + Shadow V2 quando DUAS travas LAB exatas estão presentes.

import officialHandler from '../lib/webhookOfficial.js'
export * from '../lib/webhookOfficial.js'

const LAB_HEADER = 'GABY-LAB-COMERCIAL-V1'
const LAB_MODE = 'story-shadow-v1'

export default async function handler(req, res) {
  const labHeader = req?.headers?.['x-prime-lab']
  const labMode = req?.headers?.['x-prime-lab-mode']

  if (labHeader === LAB_HEADER && labMode === LAB_MODE) {
    const { runGabyLabStoryShadow } = await import('../lib/gabyLabStoryShadow.js')
    return runGabyLabStoryShadow(req, res)
  }

  return officialHandler(req, res)
}
