/**
 * PRIME CONTROL V1.5A — shared pure LAB commercial memory boundary.
 * IMPORTANT: the GPTMaker Action only sends question and chat ID, not Story ID.
 * Treat visual/deictic/ambiguous references as UNVERIFIED; do NOT guess product
 * from the previous chat memory or the catalog rank. No I/O in this module.
 */
const simple=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();

const POINTER=/\b(esse|essa|esses|essas|desse|dessa|desses|dessas|deste|desta|destes|destas|isto|isso|aquilo|aquele|aquela|aqueles|aquelas|dele|dela|deles|delas|nele|nela|foto|imagem|story|stories|video|print|publicacao|postagem|reels)\b/;
const VAGUE_WORDS=new Set([
 "qual","quais","o","a","os","as","e","quanto","custa","custam","valor","preco",
 "tem","tamanho","tamanhos","numero","numeros","numeracao","disponivel","estoque",
 "pode","me","mostrar","mostra","mostre","mande","mandar","enviar","foto","link",
 "quero","saber","vou","pagar","no","pix","no","cartao","em","parcelas",
 "de","do","da","dos","das","pra","para","por","favor","aqui","ai","esse","essa",
 "pp","p","m","g","gg","g1","g2","g3",
]);
const SIZE_ONLY=/^(?:tem|temos|possui|quero|temo)?\s*(?:(?:o|a|no|na)\s*)?(?:tamanho|tam|numero|numeracao)?\s*(?:pp|p|m|g|gg|g1|g2|g3|3[4-9]|4[0-9]|5[0-2])\s*\??$/;
export function classifyUnverifiedStoryReferenceV15a(question:unknown) {
 const n=simple(question);
 if(!n)return {hold:false,reason:"EMPTY"};
 if(POINTER.test(n))return {hold:true,reason:"VISUAL_REFERENCE_WITHOUT_STORY_ID"};
 const words=n.split(" ");
 if(words.length<=12&&words.every(w=>VAGUE_WORDS.has(w)||/^(?:3[4-9]|4[0-9]|5[0-2])$/.test(w)))
  return {hold:true,reason:"AMBIGUOUS_PRODUCT_FOLLOWUP"};
 if(SIZE_ONLY.test(n))return {hold:true,reason:"AMBIGUOUS_SIZE_FOLLOWUP"};
 return {hold:false,reason:"TEXT_SEARCH_ALLOWED"};
}
export function unverifiedStoryHoldResponseV15a(reason:string) {
 return {
  sucesso:true,
  contexto:{
   source:"gaby_lab_story_guard_v15a",
   story_context_status:"CURRENT_STORY_NOT_PROVEN",
   product_identification_status:"NO_CURRENT_PRODUCT_ID",
   guard_reason:reason,
   tem_produtos:false,produtos_encontrados:0,
   should_reuse_previous_product:false,
   previous_product_verified:false,
   requires_current_product_evidence:true
  },
  dados:{
   produtos:[],totalVariacoes:0,variacoesRestantes:0,
   resumo_disponibilidade:"O produto exato desta pergunta ainda não foi identificado. Não há preço, tamanho, cor ou estoque confirmados.",
   informacao_adicional:"ATENÇÃO: a mensagem não identifica de forma confiável o produto atual. É PROIBIDO reutilizar o último selected_product, preço, imagem, link, cor ou estoque da conversa. Se o Story/mídia estiver visível na conversa, identifique o item nele antes de buscar; caso contrário peça o print do Story ou o nome/modelo do produto. Não afirme ter analisado imagem que a ferramenta não recebeu."
  }
 };
}
