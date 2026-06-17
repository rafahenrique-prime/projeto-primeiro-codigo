import * as gptmaker from './gptmaker'

const catalog = [
  { id: 1, nome: "Tenis New Balance 9060 Creme C/ Cinza", preco: "R$ 549,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-05-05-21-57-11-xrm49_600x800+crop_center.jpg?v=1779812331", link: "https://www.primestoremen.com.br/tenis-new-balance-9060-creme-c-cinza" },
  { id: 2, nome: "Nike Dunk Low Gray Premium", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/dunk-01-com7i_600x800+crop_center.jpeg?v=1778510673", link: "https://www.primestoremen.com.br/nike-dunk-low-gray-premium" },
  { id: 3, nome: "Tenis New Balance 9060 Cinza Claro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/9060-cinza-claro-03-fgbwb_600x800+crop_center.jpeg?v=1778506995", link: "https://www.primestoremen.com.br/new-balnce-9060-cinza-claro" },
  { id: 4, nome: "Tenis New Balance 9060 Branco Solado Rosa", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/branco-com-rosa_600x800+crop_center.jpeg?v=1747773207", link: "https://www.primestoremen.com.br/new-balnce-9060-branco-c-detalhes-rosa" },
  { id: 5, nome: "Plataforma Gucci Feminina - Marrom Escuro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/marrom-escura-tpt1k_600x800+crop_center.jpeg?v=1778241694", link: "https://www.primestoremen.com.br/gucci-femina-marromescuro" },
  { id: 6, nome: "Tenis New Balance 530 Rosa Cream", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015354-4-g16zi_600x800+crop_center.jpeg?v=1778179095", link: "https://www.primestoremen.com.br/new-balnce-530-rosa-cream" },
  { id: 7, nome: "Tenis New Balance 530 Marron Claro", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015355-1-4scrm_600x800+crop_center.jpeg?v=1778179212", link: "https://www.primestoremen.com.br/new-balnce-530-marron-claro" },
  { id: 8, nome: "Tenis New Balance 530 Branco", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015350-2-wojum_600x800+crop_center.jpeg?v=1778178476", link: "https://www.primestoremen.com.br/new-balnce-530-branco" },
  { id: 9, nome: "Cueca Lup 009", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00012-2qvvz_600x800+crop_center.jpg?v=1778160023", link: "https://www.primestoremen.com.br/cueca-lupo-009" },
  { id: 10, nome: "Cueca Lup 007", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cueca01232133-1l0sm_600x800+crop_center.jpg?v=1778159972", link: "https://www.primestoremen.com.br/cueca-lupo-007" },
  { id: 11, nome: "Cueca Lup 006", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cueca-lupo3322-12ks4_600x800+crop_center.png?v=1778159925", link: "https://www.primestoremen.com.br/cueca-lupo-006" },
  { id: 12, nome: "Cueca Lup 005", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo99932-fjatc_600x800+crop_center.png?v=1778159900", link: "https://www.primestoremen.com.br/cueca-lupo-005" },
  { id: 13, nome: "Cueca Lup 004", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecaliupo9392321-41vpr_600x800+crop_center.png?v=1778159879", link: "https://www.primestoremen.com.br/cueca-lupo-004" },
  { id: 14, nome: "Cueca Lup 003", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00001-at6to_600x800+crop_center.png?v=1778159846", link: "https://www.primestoremen.com.br/cueca-lupo-003" },
  { id: 15, nome: "Cueca Lup 002", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo00012344-fkdce_600x800+crop_center.png?v=1778159808", link: "https://www.primestoremen.com.br/cueca-lupo-002" },
  { id: 16, nome: "Cueca Lup 034", preco: "R$ 79,00", imagem: "https://cdn.dooca.store/161486/products/cuecalupo02-azje7_600x800+crop_center.jpeg?v=1778159482", link: "https://www.primestoremen.com.br/cueca-lupo" },
  { id: 17, nome: "Tenis New Balance 9060 Off White C/ Verde Claro New", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-05-06-16-46-35-mxijt_600x800+crop_center.jpg?v=1778129468", link: "https://www.primestoremen.com.br/new-balance-9060-off-white-c-verde-claro-new" },
  { id: 18, nome: "Tenis New Balance 9060 Marrom C/ Preto", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-marorn-preto-sv3da_600x800+crop_center.jpeg?v=1778511917", link: "https://www.primestoremen.com.br/new-ballace-9060-marrom-c-preto" },
  { id: 19, nome: "Tenis New Balance 9060 Marrom", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-marrom01-k21t8_600x800+crop_center.jpeg?v=1778508824", link: "https://www.primestoremen.com.br/new-ballace-9060-marrom" },
  { id: 20, nome: "Tenis New Balance 9060 Chumbo", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/9060-grafite-01-43o2g_600x800+crop_center.jpeg?v=1778508331", link: "https://www.primestoremen.com.br/new-ballace-9060-chumbo" },
  { id: 21, nome: "Tenis New Balance 9060 Grey Cinza", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/photo-2026-04-24-10-39-02-annh1_600x800+crop_center.jpg?v=1778129316", link: "https://www.primestoremen.com.br/new-ballace-9060-grey-cinza" },
  { id: 22, nome: "Boné Importado Diesel Preto", preco: "R$ 599,00", imagem: "https://cdn.dooca.store/161486/products/img-6455-e21mc_600x800+crop_center.jpg?v=1774305135", link: "https://www.primestoremen.com.br/bone-importado-diesel-preto" },
  { id: 23, nome: "Bone Armani Importado", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/bone-armani-media-1yxxl_600x800+crop_center.jpeg?v=1774144457", link: "https://www.primestoremen.com.br/bone-louis-vitton-importado-lv-iii" },
  { id: 24, nome: "Bone Louis Vitton Importado Lv Ii", preco: "R$ 499,00", imagem: "https://cdn.dooca.store/161486/products/bone-lv-media-ij5ik_600x800+crop_center.jpeg?v=1774144299", link: "https://www.primestoremen.com.br/bone-louuis-vitton-importado-lv-ii" },
]

// Busca produto por nome ou descrição (match fuzzy simples)
export function searchProduct(query) {
  if (!query || query.trim().length < 2) return []

  const q = query.toLowerCase()
  return catalog.filter(p =>
    p.nome.toLowerCase().includes(q) ||
    p.preco.toLowerCase().includes(q)
  ).slice(0, 5)
}

// Encontra o melhor match para um produto
export function findBestMatch(query) {
  const results = searchProduct(query)
  if (results.length === 0) return null

  // Retorna o primeiro match (mais relevante)
  return results[0]
}

// Formata dados do produto para envio
export function formatProductMessage(produto) {
  return {
    nome: produto.nome,
    preco: produto.preco,
    imagem: produto.imagem,
    link: produto.link,
    mensagem: `${produto.nome}\n${produto.preco}\n\nClique no link para mais detalhes: ${produto.link}`
  }
}

// Envia a foto do produto via GPT Maker
export async function sendProductPhoto(chatId, query) {
  const produto = findBestMatch(query)

  if (!produto) {
    return {
      sucesso: false,
      mensagem: `Não encontrei um produto com "${query}" no catálogo. Tente outra descrição.`
    }
  }

  try {
    // Envia imagem + descrição
    await gptmaker.sendMessage(chatId, produto.nome, produto.imagem)

    // Envia mensagem com preço e link
    await gptmaker.sendMessage(chatId, `${produto.preco}\n\n${produto.link}`)

    return {
      sucesso: true,
      produto: produto.nome,
      preco: produto.preco,
      mensagem: 'Foto enviada com sucesso!'
    }
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao enviar foto: ${erro.message}`
    }
  }
}

// Retorna todos os produtos
export function getAllProducts() {
  return catalog
}

// Retorna categorias/marcas disponíveis
export function getCategories() {
  const marcas = new Set()
  catalog.forEach(p => {
    const match = p.nome.match(/(Nike|New Balance|Gucci|Armani|Diesel|Louis Vitton|Lupo|Cueca)/i)
    if (match) marcas.add(match[0])
  })
  return Array.from(marcas)
}
