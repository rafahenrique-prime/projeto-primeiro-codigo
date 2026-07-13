// Inteligência Operacional → Aprendizado de Perfil: lê o histórico gravado
// automaticamente pela função apply_profile_size_learning (Supabase) sempre
// que o sistema detecta o tamanho (size) do cliente numa mensagem nova.
// Só leitura — quem grava é api/_profileLearning.js, não esta tela.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

export async function getProfileLearningEvents(limit = 100) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profile_learning_audit?select=*&order=created_at.desc&limit=${limit}`,
      { headers: sbHeaders }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
