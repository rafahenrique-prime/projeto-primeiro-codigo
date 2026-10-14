import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type ProductRow = {
  id: string; slug: string | null; nome: string | null; marca: string | null; categoria_nome: string | null;
  descricao: string | null; codigo: string | null; link: string | null; imagem_principal: string | null;
  preco: number | string | null; preco_pix: number | string | null; preco_tabela: number | string | null;
  parcelamento_padrao_vezes: number | null; parcelamento_padrao_valor: number | string | null; parcelamento_padrao_com_juros: boolean | null;
  parcelamento_max_vezes: number | null; parcelamento_max_valor: number | string | null; parcelamento_max_com_juros: boolean | null;
  selling_out_of_stock: boolean | null; ativo: boolean | null;
};
type VariationRow = { shadow_product_id: string; bagy_variation_id: number | null; attributes: Record<string, unknown> | null; stock_quantity: number | null };

// LAB-40: BIA-only; old GABY LAB header disabled.
const STOP = new Set([
  "voce","voces","tem","temos","quero","queria","preciso","busco","procuro","vende","disponivel","disponiveis",
  "o","a","os","as","um","uma","de","do","da","dos","das","em","no","na","nos","nas","por","para","com","se","me","te","que","e","ou","mas","pra","pro","ai","ja","nao","sim","tipo","algum","alguma","esse","essa","isso","aqui","la","ate","mais","menos","muito","pouco","seu","sua","meu","minha","agora","hoje","quando","como","qual","quais","ver","mostra","mostrar","opcao","opcoes","modelo","modelos","valor","preco","manda","mandar","link","foto","fotos","gostaria","quer","indica","indicar","recomenda","recomendar","bom","boa","dia","barata","barato","baratas","baratos","menor","menores","economica","economico","economicas","economicos","conta"
]);

function normalize(v: unknown): string { return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function money(v: unknown): string | null { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) : null; }
function priceNumber(v: unknown): number { if (v == null || v === "") return Number.POSITIVE_INFINITY; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; }
function parseMaxPrice(q: string): number | null { const n = normalize(q); for (const p of [/(?:ate|gastar|limite|no maximo|maximo)\s+(?:uns\s+)?(?:r\s*)?(\d{2,5}(?:[.,]\d{1,2})?)/,/r\s*(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:ou menos|pra baixo|para baixo)/]) { const m=n.match(p); if(m){const v=Number(m[1].replace(",",".")); if(Number.isFinite(v)) return v;} } return null; }
function tokensFor(q: string, maxPrice: number | null): string[] { const tokens=normalize(q).split(" ").filter(t=>t.length>1&&!STOP.has(t)); return [...new Set(tokens.filter(t=>!(maxPrice!==null&&Number(t)===maxPrice)))]; }
const COLOR_GROUPS: Record<string,string[]> = {preto:["preto","preta","pretos","pretas"],branco:["branco","branca","brancos","brancas"],bege:["bege"],azul:["azul","azuis"],verde:["verde","verdes"],marrom:["marrom","marron"],cinza:["cinza"],vermelho:["vermelho","vermelha","vermelhos","vermelhas"],rosa:["rosa"],amarelo:["amarelo","amarela","amarelos","amarelas"],laranja:["laranja"],roxo:["roxo","roxa","roxos","roxas"]};
function detectQueryColor(tokens:string[]): string|null { for(const [c,vs] of Object.entries(COLOR_GROUPS)) if(tokens.some(t=>vs.includes(t))) return c; return null; }
function surfaceHasColor(v:unknown,color:string): boolean { const words=new Set(normalize(v).split(" ")); return (COLOR_GROUPS[color]??[color]).some(t=>words.has(t)); }
function detectQueryCategory(tokens:string[]): string|null { const s=new Set(tokens); if(s.has("tenis")||s.has("sneaker")||s.has("sneakers"))return "tenis"; if(s.has("camiseta")||s.has("camisetas")||s.has("tshirt"))return "camiseta"; if(s.has("bermuda")||s.has("bermudas")||s.has("short")||s.has("shorts"))return "bermuda"; if(s.has("calca")||s.has("calcas"))return "calca"; if(s.has("oculos"))return "oculos"; return null; }
function canonCategory(v:unknown): string { const n=normalize(v); if(n.includes("tenis"))return "tenis"; if(n.includes("camiseta"))return "camiseta"; if(n.includes("bermuda")||n.includes("short"))return "bermuda"; if(n.includes("calca"))return "calca"; if(n.includes("oculos"))return "oculos"; return n; }
/** LAB-39/BIA ONLY: requested size is a search hint, never stock evidence. */
function detectBiaTrailingSize(q:string):string|null {
  const n=normalize(q);
  const explicit=n.match(/\b(?:tamanho|tam|numero|numeracao)\s*(pp|p|m|g|gg|g1|g2|g3|3[4-9]|4[0-9]|5[0-2])\b/);
  if(explicit)return explicit[1].toUpperCase();
  const numeric=n.match(/(?:^|\s)(3[4-9]|4[0-9]|5[0-2])\s*$/);if(numeric)return numeric[1];
  if(/\b(?:camisa|camiseta|camisetas|polo|bermuda|calca|short|jaqueta|blusa)\b/.test(n)){const clothing=n.match(/(?:^|\s)(pp|p|m|g|gg|g1|g2|g3)\s*$/);if(clothing)return clothing[1].toUpperCase();}
  return null;
}
function detectQuerySize(rawQuery:string,category:string|null): string|null {
  const n=normalize(rawQuery);
  const explicit=n.match(/\b(?:tamanho|tam|numero|numeracao)\s*(pp|p|m|g|gg|g1|g2|g3|3[4-9]|4[0-9]|5[0-2])\b/);
  if(explicit) return explicit[1].toUpperCase();
  if(category){
    const numeric=n.match(/\b(3[4-9]|4[0-9]|5[0-2])\b/);
    if(numeric) return numeric[1];
  }
  if(category==="camiseta"||category==="bermuda"||category==="calca"){
    const words=n.split(" ");
    for(const size of ["pp","gg","g1","g2","g3","p","m","g"]) if(words.includes(size)) return size.toUpperCase();
  }
  return null;
}
function productHasRequestedColor(p:ProductRow,vars:VariationRow[],color:string): boolean {
  if(surfaceHasColor(p.nome,color)) return true;
  return vars.some(v=>{ const meta=variationMeta(v,p.selling_out_of_stock); return meta.cor ? surfaceHasColor(meta.cor,color) : false; });
}
/** LAB-39/BIA ONLY: catalogue size membership, regardless of historical stock. */
function biaSizePresenceRank(vars:VariationRow[],size:string):number {
  const expected=normalize(size);if(!expected)return 0;
  return vars.some(v=>{const attrs=v.attributes??{};return Object.keys(attrs).some(k=>{const nk=normalize(k);const isSize=nk==="tamanho"||nk.includes("34 ao 43")||nk.includes("calca bermudas jeans");return isSize&&normalize((attrs as Record<string,unknown>)[k])===expected;});})?1:0;
}
function variationSizeRank(p:ProductRow,vars:VariationRow[],requestedSize:string): number {
  const target=normalize(requestedSize);
  let best=0;
  for(const v of vars){
    const meta=variationMeta(v,p.selling_out_of_stock);
    if(normalize(meta.tamanho)!==target) continue;
    if(meta.disponivel===true) return 2;
    if(meta.disponivel===null) best=Math.max(best,1);
  }
  return best;
}
function brandConstraintTokens(rows:ProductRow[],tokens:string[]): string[] { const brandWords=new Set<string>(); for(const p of rows) for(const w of normalize(p.marca).split(" ")) if(w.length>=3) brandWords.add(w); return tokens.filter(t=>brandWords.has(t)); }
function matchesStrictCategoryBrandColor(p:ProductRow,vars:VariationRow[],category:string,color:string,brandTokens:string[]): boolean { const brand=normalize(p.marca); return canonCategory(p.categoria_nome)===category && brandTokens.every(t=>brand.split(" ").includes(t)||brand.includes(t)) && productHasRequestedColor(p,vars,color); }
function scoreProduct(p: ProductRow, tokens: string[], rawQuery: string): number {
  const name=normalize(p.nome), brand=normalize(p.marca), cat=normalize(p.categoria_nome), code=normalize(p.codigo), desc=normalize(p.descricao), haystack=`${name} ${brand} ${cat} ${code} ${desc}`, modelSurface=`${name} ${code}`, qn=normalize(rawQuery);
  let score=0, matched=0; if(name&&qn.includes(name))score+=120; if(name&&name.includes(qn)&&qn.length>=4)score+=100;
  for(const t of tokens){ if(name.includes(t)){score+=18;matched++;} else if(brand.includes(t)){score+=16;matched++;} else if(cat.includes(t)){score+=12;matched++;} else if(code.includes(t)){score+=10;matched++;} else if(desc.includes(t)){score+=3;matched++;} }
  const modelTokens=tokens.filter(t=>/[a-z]/.test(t)&&/\d/.test(t)); if(modelTokens.some(t=>!haystack.includes(t)))return 0;
  const numericModelTokens=tokens.filter(t=>/^\d{3,}$/.test(t)); if(numericModelTokens.some(t=>!modelSurface.includes(t)))return 0;
  if(tokens.length>=2&&matched<2)return 0; if(tokens.length===1&&matched<1)return 0; if(tokens.length>=2){const phrase=tokens.join(" "); if(phrase.length>=4&&name.includes(phrase))score+=2;} return score;
}
function variationMeta(v: VariationRow, sellingOut: boolean | null) { const attrs=v.attributes&&typeof v.attributes==="object"?v.attributes:{}; let tamanho:string|null=null, cor:string|null=null; for(const k of Object.keys(attrs)){const nk=normalize(k); if(!tamanho&&(nk==="tamanho"||nk.includes("34 ao 43")||nk.includes("calca bermudas jeans"))) tamanho=String((attrs as any)[k]??"")||null; if(!cor&&nk==="cor") cor=String((attrs as any)[k]??"")||null;} const stock=v.stock_quantity==null?null:Number(v.stock_quantity); const disponivel=sellingOut===true?true:stock==null?null:stock>0; return {identificador:v.bagy_variation_id==null?null:String(v.bagy_variation_id),tamanho,cor,estoque:stock,disponivel}; }
function json(body: Record<string, unknown>, status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-prime-agent-id,x-prime-bia-key"}})}


const BIA_AGENT_ID=String(Deno.env.get("PRIME_CONTROL_BIA_AGENT_ID")??"");
// Secret configured in Supabase Edge Function Secrets (never hard-coded or logged).
// Until configured the BIA route always fails closed; GABY LAB behavior is unchanged.
async function authorizeBia(req:Request):Promise<boolean>{
  if(BIA_AGENT_ID.length<6 || BIA_AGENT_ID.length>200) return false; // LAB-41: fail closed if agent id is not configured.
  if(req.headers.get("x-prime-agent-id")!==BIA_AGENT_ID) return false;
  const expected=String(Deno.env.get("PRIME_CONTROL_BIA_LAB_READ_KEY")??"");
  const presented=String(req.headers.get("x-prime-bia-key")??"");
  if(expected.length<48||presented.length<48||presented.length>256) return false;
  const bytes=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest("SHA-256",bytes.encode(expected)),
    crypto.subtle.digest("SHA-256",bytes.encode(presented))
  ]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b);
  let mismatch=0;for(let i=0;i<aa.length;i++) mismatch|=aa[i]^bb[i];
  return mismatch===0;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-prime-agent-id,x-prime-bia-key"}});
  if(req.method!=="POST") return json({sucesso:false,error:"METHOD_NOT_ALLOWED"},405);
  const biaHeadersPresented=req.headers.has("x-prime-bia-key")||req.headers.has("x-prime-agent-id");
  const isBia=biaHeadersPresented&&await authorizeBia(req);
  if(!isBia) return json({sucesso:false,error:"FORBIDDEN_BIA_LAB_ONLY"},403);
  try{
    const body=await req.json().catch(()=>({})); const pergunta=String(body?.pergunta??body?.prompt??"").trim().slice(0,300); if(pergunta.length<2)return json({sucesso:false,error:"PERGUNTA_REQUIRED"},400);
    const supabaseUrl=String(Deno.env.get("SUPABASE_URL")??"").replace(/\/$/,""); const anonKey=String(Deno.env.get("SUPABASE_ANON_KEY")??""); if(!supabaseUrl||!anonKey)return json({sucesso:false,error:"SUPABASE_ENV_MISSING"},500);
  if(isBia && tokensFor(pergunta,parseMaxPrice(pergunta)).length===0) return json({sucesso:true,contexto:{pergunta,source:"PRIME_SHADOW_READ_ONLY",produtos_encontrados:0,produto_exato_confirmado:false,preco_atual_verificado:false,estoque_atual_verificado:false,ultima_sincronizacao_mirror:"NAO_VERIFICADA"},dados:{produtos:[],informacao_adicional:"Consulta sem critérios de produto suficientes. Pergunte pelo modelo ou marca."}});
    const maxPrice=parseMaxPrice(pergunta), tokens=tokensFor(pergunta,maxPrice); if(tokens.length===0)return json({sucesso:true,contexto:{pergunta,produtos_encontrados:0,tem_produtos:false,total_variacoes:0,variacoes_restantes:0,source:"shadow_v2"},dados:{produtos:[],informacao_adicional:"Busca genérica sem critério de produto suficiente.",totalVariacoes:0,variacoesRestantes:0}});
    const headers={apikey:anonKey,Authorization:`Bearer ${anonKey}`,Accept:"application/json"}; const select=["id","slug","nome","marca","categoria_nome","descricao","codigo","link","imagem_principal","preco","preco_pix","preco_tabela","parcelamento_padrao_vezes","parcelamento_padrao_valor","parcelamento_padrao_com_juros","parcelamento_max_vezes","parcelamento_max_valor","parcelamento_max_com_juros","selling_out_of_stock","ativo"].join(",");
    const productRes=await fetch(`${supabaseUrl}/rest/v1/shadow_products?select=${encodeURIComponent(select)}&ativo=eq.true&limit=1000`,{headers}); if(!productRes.ok)return json({sucesso:false,error:`MIRROR_HTTP_${productRes.status}`},502); const rows=await productRes.json() as ProductRow[];
    const requestedCategory=detectQueryCategory(tokens), requestedColor=detectQueryColor(tokens), requestedSize=(detectQuerySize(pergunta,detectQueryCategory(tokens)) ?? (isBia?detectBiaTrailingSize(pergunta):null));
    const semanticTokens=requestedSize?tokens.filter(t=>normalize(t)!==normalize(requestedSize)):tokens;
    const baseScored=rows.map(p=>({p,score:scoreProduct(p,semanticTokens,pergunta),sizeRank:0})).filter(({p,score})=>score>0&&(!requestedCategory||canonCategory(p.categoria_nome)===requestedCategory)&&(isBia||maxPrice==null||p.preco==null||Number(p.preco)<=maxPrice));
    const requestedBrandTokens=brandConstraintTokens(rows,semanticTokens);
    const strictCategoryBrandColor=Boolean(requestedCategory&&requestedColor&&requestedBrandTokens.length>0);
    const variationAware=Boolean(requestedSize||requestedColor);
    const allByProduct=new Map<string,VariationRow[]>();
    if(variationAware&&baseScored.length){
      const candidateIds=baseScored.map(({p})=>p.id).filter(Boolean);
      for(let i=0;i<candidateIds.length;i+=80){
        const batch=candidateIds.slice(i,i+80);
        const idList=encodeURIComponent(`(${batch.join(",")})`);
        const vr=await fetch(`${supabaseUrl}/rest/v1/shadow_product_variations?select=${encodeURIComponent("shadow_product_id,bagy_variation_id,attributes,stock_quantity")}&shadow_product_id=in.${idList}&limit=1000`,{headers});
        if(vr.ok){
          const batchRows=await vr.json() as VariationRow[];
          for(const v of batchRows){const arr=allByProduct.get(v.shadow_product_id)??[];arr.push(v);allByProduct.set(v.shadow_product_id,arr);}
        }
      }
    }
    let filtered=baseScored;
    if(requestedColor&&requestedCategory){
      filtered=filtered.filter(({p})=>productHasRequestedColor(p,allByProduct.get(p.id)??[],requestedColor));
    }
    if(strictCategoryBrandColor){
      filtered=filtered.filter(({p})=>matchesStrictCategoryBrandColor(p,allByProduct.get(p.id)??[],requestedCategory!,requestedColor!,requestedBrandTokens));
    }
    if(requestedSize){
      filtered=filtered.map(({p,score})=>{const sizeRank=isBia?biaSizePresenceRank(allByProduct.get(p.id)??[],requestedSize):variationSizeRank(p,allByProduct.get(p.id)??[],requestedSize);return {p,score:score+(isBia?(sizeRank>0?4:0):(sizeRank===2?12:sizeRank===1?4:0)),sizeRank};}).filter(({sizeRank})=>isBia||sizeRank>0);
    }
    const scored=filtered.sort((a,b)=>(b.sizeRank??0)-(a.sizeRank??0)||b.score-a.score||(isBia?0:priceNumber(a.p.preco)-priceNumber(b.p.preco))||normalize(a.p.nome).localeCompare(normalize(b.p.nome),"pt"));
    const total=scored.length, top=scored.slice(0,5), ids=top.map(({p})=>p.id).filter(Boolean); let variations:VariationRow[]=[];
    if(variationAware){
      for(const id of ids) variations.push(...(allByProduct.get(id)??[]));
    }else if(ids.length){
      const idList=encodeURIComponent(`(${ids.join(",")})`); const vr=await fetch(`${supabaseUrl}/rest/v1/shadow_product_variations?select=${encodeURIComponent("shadow_product_id,bagy_variation_id,attributes,stock_quantity")}&shadow_product_id=in.${idList}&limit=1000`,{headers}); if(vr.ok)variations=await vr.json() as VariationRow[];
    }
    const byProduct=new Map<string,VariationRow[]>(); for(const v of variations){const arr=byProduct.get(v.shadow_product_id)??[];arr.push(v);byProduct.set(v.shadow_product_id,arr);}
    const produtos=top.map(({p,score})=>{const vars=(byProduct.get(p.id)??[]).map(v=>variationMeta(v,p.selling_out_of_stock)); let disponibilidade:"SIM"|"NAO"|"NAO_CONFIRMADO"="NAO_CONFIRMADO"; if(p.ativo===false)disponibilidade="NAO"; else if(p.selling_out_of_stock===true)disponibilidade="SIM"; else if(vars.some(v=>v.disponivel===true))disponibilidade="SIM"; else if(vars.length>0&&vars.every(v=>v.disponivel===false))disponibilidade="NAO"; const out:Record<string,unknown>={nome:p.nome,categoria:p.categoria_nome,marca:p.marca,preco:money(p.preco),imagem:p.imagem_principal,link:p.link,disponibilidade,estoque_confirmado:disponibilidade==="SIM"?true:disponibilidade==="NAO"?false:null,relevancia:score,variacoes:vars}; const pt=money(p.preco_tabela);if(pt)out.precoTabela=pt;const pp=money(p.preco_pix);if(pp)out.precoPix=pp;if(p.parcelamento_padrao_vezes!=null&&p.parcelamento_padrao_valor!=null){out.parcelamentoPadraoVezes=p.parcelamento_padrao_vezes;out.parcelamentoPadraoValor=money(p.parcelamento_padrao_valor);out.parcelamentoPadraoComJuros=p.parcelamento_padrao_com_juros;}if(p.parcelamento_max_vezes!=null&&p.parcelamento_max_valor!=null){out.parcelamentoMaxVezes=p.parcelamento_max_vezes;out.parcelamentoMaxValor=money(p.parcelamento_max_valor);out.parcelamentoMaxComJuros=p.parcelamento_max_com_juros;}return out;});
    const restam=Math.max(0,total-produtos.length); const strictNote=strictCategoryBrandColor?" Filtro estrito aplicado: categoria + marca + cor principal precisam coincidir.":""; const variationNote=variationAware?` Seleção antes do Top 5 considerou variações${requestedSize?` de tamanho ${requestedSize}`:""}${requestedColor?` e cor ${requestedColor}`:""}; estoque confirmado tem prioridade e estoque não informado não é tratado como indisponível.`:""; const info=total>0?`Fonte: Mirror V2. Encontrados ${total} produto(s) compatível(is); exibindo ${produtos.length}${restam>0?`, restam ${restam} não listados`:""}.${strictNote}${variationNote} Disponibilidade só é SIM quando confirmada por estoque de variação ou venda sem estoque autorizada; NAO_CONFIRMADO não deve ser apresentado como estoque disponível.`:`Fonte: Mirror V2. Nenhum produto compatível encontrado.${strictNote}${variationNote} Não invente produto; ofereça ajuda para buscar alternativa.`;
    if(isBia) return json({
      sucesso:true,
      contexto:{
        pergunta,
        source:"PRIME_SHADOW_READ_ONLY",
        produtos_encontrados:produtos.length,
        produto_exato_confirmado:false,
        preco_atual_verificado:false,
        estoque_atual_verificado:false,
        ultima_sincronizacao_mirror:"NAO_VERIFICADA"
      },
      dados:{
        produtos:produtos.map(p=>({
          nome:p.nome,
          marca:p.marca,
          categoria:p.categoria,
          imagem:p.imagem,
          link:p.link,
          confirmacao:"CANDIDATO_NAO_CONFIRMADO"
        })),
        informacao_adicional:"Resultados apenas como candidatos. Não anunciar preço, estoque ou numeração, nem assumir variante ou Story exato sem comprovação independente."
      }
    });
    return json({sucesso:true,timestamp:new Date().toISOString(),contexto:{pergunta,produtos_encontrados:produtos.length,tem_produtos:produtos.length>0,total_variacoes:total,variacoes_restantes:restam,source:"shadow_v2",variation_aware:variationAware,requested_size:requestedSize,requested_color:requestedColor},dados:{produtos,informacao_adicional:info,totalVariacoes:total,variacoesRestantes:restam}});
  }catch(e){return json({sucesso:false,error:String((e as Error)?.message??"INTERNAL_ERROR").slice(0,160)},500)}
});
