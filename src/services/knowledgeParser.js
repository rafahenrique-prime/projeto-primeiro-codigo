// Parser inteligente de conhecimento
// Usa Groq para dividir qualquer texto em blocos estruturados separados

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const PROMPT = `Você é um organizador de base de conhecimento para uma loja de roupas e tênis premium.

Analise o texto abaixo e divida em blocos independentes, um para cada tipo de informação encontrada.

TIPOS DE BLOCO:
- PRODUTO: identidade do produto (nome, descrição, cores, tamanhos, materiais, estoque)
- PRECO: valores, descontos, parcelamento, condições de pagamento
- POLITICA: troca, devolução, frete, prazo de entrega, garantia
- GUIA: tutoriais, tabelas de medida, como usar, cuidados com o produto
- FAQ: perguntas e respostas frequentes
- ESTRATEGIA: scripts de venda, como lidar com objeções, argumentos de vendas
- GERAL: informações institucionais, sobre a empresa, contato

REGRAS:
1. Se o texto tiver 3 produtos, crie pelo menos 3 blocos PRODUTO e 3 blocos PRECO (um para cada)
2. Cada bloco deve ser autocontido — quem ler só aquele bloco deve entender tudo
3. Não invente informações — use apenas o que está no texto
4. Se um produto tem nome, inclua o nome no bloco de preço também
5. Blocos POLITICA e GUIA podem ser únicos para todo o conteúdo
6. Mínimo de 1 bloco, máximo de 30 blocos

Responda APENAS com JSON válido, sem explicações:
{
  "blocos": [
    {
      "tipo": "PRODUTO",
      "nome": "nome do produto ou assunto principal",
      "conteudo": "texto completo e detalhado do bloco"
    }
  ]
}

TEXTO PARA ANALISAR:`

export async function parseToBlocks(text) {
  if (!text || text.trim().length < 30) {
    return [{ tipo: 'GERAL', nome: text.slice(0, 60), conteudo: text }]
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: `${PROMPT}\n\n${text}` }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('JSON não encontrado na resposta')

    const parsed = JSON.parse(match[0])
    const blocos = parsed.blocos || []

    if (!Array.isArray(blocos) || blocos.length === 0) {
      return [{ tipo: 'GERAL', nome: text.slice(0, 60), conteudo: text }]
    }

    // Valida e normaliza cada bloco
    const tipos_validos = ['PRODUTO', 'PRECO', 'POLITICA', 'GUIA', 'FAQ', 'ESTRATEGIA', 'GERAL']
    return blocos
      .filter(b => b.conteudo && b.conteudo.trim().length > 5)
      .map(b => ({
        tipo: tipos_validos.includes(b.tipo) ? b.tipo : 'GERAL',
        nome: (b.nome || '').slice(0, 100),
        conteudo: (b.conteudo || '').trim(),
      }))

  } catch (e) {
    console.warn('Parser falhou, salvando como bloco único:', e.message)
    return [{ tipo: 'GERAL', nome: text.slice(0, 60), conteudo: text }]
  }
}

// Mapa tipo → categoria do nosso sistema
export const TIPO_TO_CATEGORY = {
  PRODUTO:   'PRODUTO',
  PRECO:     'PRECO',
  POLITICA:  'POLITICA',
  GUIA:      'GUIA',
  FAQ:       'FAQ',
  ESTRATEGIA:'ESTRATEGIA',
  GERAL:     'GERAL',
}

// Labels amigáveis para exibição
export const TIPO_LABELS = {
  PRODUTO:   'produto',
  PRECO:     'preço',
  POLITICA:  'política',
  GUIA:      'guia',
  FAQ:       'faq',
  ESTRATEGIA:'estratégia',
  GERAL:     'geral',
}
