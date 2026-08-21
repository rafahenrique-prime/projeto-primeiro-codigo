import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

function getCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
  },
  // PARTE 56 / Fase 2 — sem isso, o Vitest transforma .jsx com o factory
  // clássico (React.createElement) mesmo com o plugin React presente,
  // quebrando qualquer teste que renderize um componente sem `import React`
  // explícito (nenhum arquivo do projeto importa React manualmente — todos
  // contam com o runtime automático, que só funciona de verdade em `vite
  // dev`/`vite build` sem isto aqui). Não afeta o app em si (mesmo runtime
  // automático que o plugin já produzia).
  esbuild: {
    jsx: 'automatic',
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT_SHA__: JSON.stringify(getCommitSha()),
    __IS_VERCEL__: JSON.stringify(!!process.env.VERCEL),
  },
})
