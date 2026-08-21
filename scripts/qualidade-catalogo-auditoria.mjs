// scripts/qualidade-catalogo-auditoria.mjs
//
// Execução manual (terminal) da Auditoria de Qualidade do Catálogo V2.
// Toda a lógica real (persistência do histórico, ciclo de vida dos achados)
// vive em api/_qualidadeCatalogoAuditoria.js — única fonte de verdade,
// também consumida pela rota HTTP (api/system-tools.js, Fase 2C). Este
// arquivo só carrega `.env.local` (para execução local via `node`) e chama
// as funções compartilhadas com a config montada a partir do ambiente.
//
// Ver docs/integrations/SHADOW-V2-CATALOGO.md para o desenho completo.

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envLocalPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

import {
  rodarAuditoriaQualidade as rodarAuditoriaQualidadeCompartilhada,
  chaveIdentidade,
  calcularChaveExtra,
} from '../api/_qualidadeCatalogoAuditoria.js'

function configDoAmbiente() {
  return {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  }
}

export { chaveIdentidade, calcularChaveExtra }

export async function rodarAuditoriaQualidade() {
  return rodarAuditoriaQualidadeCompartilhada(configDoAmbiente())
}

// --- CLI ---------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const resultado = await rodarAuditoriaQualidade()
  console.log(JSON.stringify(resultado, null, 2))
}
