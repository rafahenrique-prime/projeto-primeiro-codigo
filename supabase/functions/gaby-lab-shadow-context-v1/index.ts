import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {classifyUnverifiedStoryReferenceV15a,unverifiedStoryHoldResponseV15a} from "./story-identity-gate.ts";

const LAB_HEADER = "GABY-LAB-COMERCIAL-V1";
const SHADOW_V10_URL = "https://mbbgqasvssueirynnoyk.supabase.co/functions/v1/gaby-lab-shadow-catalog-v10";
const SHADOW_V11_URL = "https://mbbgqasvssueirynnoyk.supabase.co/functions/v1/gaby-lab-shadow-catalog-v11";
const SEARCH_MODE_CONFIG_KEY = "gaby_lab_catalog_search";
let searchModeCache: { mode: "classic_v10" | "smart_v11"; expiresAt: number } = { mode: "smart_v11", expiresAt: 0 };
const CONTEXT_TTL_MINUTES = 15;

const COLORS: Array<[string, RegExp]> = [
  ["preto", /\b(preto|preta|pretos|pretas)\b/i],
  ["branco", /\b(branco|branca|brancos|brancas)\b/i],
  ["bege", /\bbege\b/i],
  ["azul", /\bazul\b/i],
  ["verde", /\bverde\b/i],
  ["marrom", /\b(marrom|marron)\b/i],
  ["cinza", /\bcinza\b/i],
  ["vermelho", /\b(vermelho|vermelha)\b/i],
  ["rosa", /\brosa\b/i],
  ["amarelo", /\b(amarelo|amarela)\b/i],
  ["laranja", /\blaranja\b/i],
  ["roxo", /\b(roxo|roxa)\b/i],
];

function normalize(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function canonCategory(v: unknown): string {
  const n = normalize(v);
  if (/\btenis|sneaker/.test(n)) return "tenis";
  if (/\bcamiseta|camisa/.test(n)) return "camiseta";
  if (/\bbermuda|short/.test(n)) return "bermuda";
  if (/\bcalca/.test(n)) return "calca";
  if (/\boculos/.test(n)) return "oculos";
  return n;
}


function detectRequestedCategory(v: unknown): string | null {
  const n = normalize(v);
  if (/\b(tenis|sneaker|sneakers)\b/.test(n)) return "tenis";
  if (/\b(camiseta|camisetas|t shirt|tshirt)\b/.test(n)) return "camiseta";
  if (/\b(bermuda|bermudas|short|shorts)\b/.test(n)) return "bermuda";
  if (/\b(calca|calcas)\b/.test(n)) return "calca";
  if (/\b(oculos)\b/.test(n)) return "oculos";
  return null;
}

const GENERIC_CATEGORY_TOKENS = new Set([
  "me","mostra","mostrar","mostre","quero","ver","tem","temos","um","uma","uns","umas",
  "algum","alguma","alguns","algumas","de","do","da","dos","das","para","pra","por","favor",
  "masculino","masculina","masculinos","masculinas","feminino","feminina","femininos","femininas",
  "homem","homens","mulher","mulheres","tenis","sneaker","sneakers","camiseta","camisetas",
  "t","shirt","tshirt","bermuda","bermudas","short","shorts","calca","calcas","oculos"
]);

function isGenericCategoryQuery(v: unknown): boolean {
  const tokens = normalize(v).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => GENERIC_CATEGORY_TOKENS.has(token));
}

function detectColor(v: unknown): string | null {
  const raw = String(v ?? "");
  for (const [color, re] of COLORS) if (re.test(raw)) return color;
  return null;
}

function detectSize(v: unknown): string | null {
  const n = normalize(v);
  const category = detectRequestedCategory(v);
  const explicit = n.match(/\b(?:tamanho|tam|numero|numeracao)\s*(pp|p|m|g|gg|g1|g2|g3|3[4-9]|4[0-9]|5[0-2])\b/);
  if (explicit) return explicit[1].toUpperCase();
  if (category) {
    const numeric = n.match(/\b(3[4-9]|4[0-9]|5[0-2])\b/);
    if (numeric) return numeric[1];
  }
  if (category === "camiseta" || category === "bermuda" || category === "calca") {
    const words = n.split(" ");
    for (const size of ["pp","gg","g1","g2","g3","p","m","g"]) {
      if (words.includes(size)) return size.toUpperCase();
    }
  }
  return null;
}


const GENERIC_FOLLOWUP_TOKENS = new Set([
  "qual","quais","valor","preco","quanto","custa","tem","tamanho","tamanhos","numero","numeros",
  "numeracao","disponivel","estoque","ele","ela","esse","essa","isso","dele","dela","desse","dessa",
  "ver","mostrar","mostra","manda","mandar","foto","imagem","link","pix","cartao","parcela","parcelas",
  "parcela","vezes","pode","quero","saber","me","fala","por","favor","e","o","a","os","as","um","uma",
  "de","do","da","dos","das","no","na","nos","nas","pra","para","ai","aqui"
]);

function isGenericFollowup(v: unknown): boolean {
  const tokens = normalize(v).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => GENERIC_FOLLOWUP_TOKENS.has(token));
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-prime-lab",
    },
  });
}

function dbEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ENV_MISSING");
  return { url, key };
}

function dbHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function getSearchMode(): Promise<"classic_v10" | "smart_v11"> {
  if (searchModeCache.expiresAt > Date.now()) return searchModeCache.mode;
  try {
    const { url, key } = dbEnv();
    const r = await fetch(
      `${url}/rest/v1/bridge_search_mode_config?select=active_mode&config_key=eq.${encodeURIComponent(SEARCH_MODE_CONFIG_KEY)}&limit=1`,
      { headers: dbHeaders(key) },
    );
    if (r.ok) {
      const rows = await r.json() as Array<{ active_mode?: string }>;
      const raw = String(rows?.[0]?.active_mode ?? "");
      const mode = raw === "classic_v10" ? "classic_v10" : "smart_v11";
      searchModeCache = { mode, expiresAt: Date.now() + 2000 };
      return mode;
    }
  } catch {
    // Falha de leitura da configuração não interrompe atendimento.
  }
  searchModeCache = { mode: "smart_v11", expiresAt: Date.now() + 1000 };
  return "smart_v11";
}

async function callShadow(pergunta: string) {
  const mode = await getSearchMode();
  const url = mode === "classic_v10" ? SHADOW_V10_URL : SHADOW_V11_URL;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-prime-lab": LAB_HEADER },
    body: JSON.stringify({ pergunta }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.sucesso) throw new Error(body?.error || `SHADOW_${mode}_HTTP_${r.status}`);
  body.contexto = { ...(body.contexto || {}), search_mode: mode };
  return body;
}

async function getContext(contextId: string) {
  const { url, key } = dbEnv();
  const r = await fetch(
    `${url}/rest/v1/bridge_product_context?select=*&context_id=eq.${encodeURIComponent(contextId)}&limit=1`,
    { headers: dbHeaders(key) },
  );
  if (!r.ok) throw new Error(`CONTEXT_GET_HTTP_${r.status}`);
  const rows = await r.json() as Array<Record<string, unknown>>;
  const row = rows[0] || null;
  if (!row) return null;
  const expires = Date.parse(String(row.expires_at ?? ""));
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return row;
}

async function saveContext(input: {
  contextId: string;
  lastQuery: string;
  lastResults: unknown[];
  selectedProduct: string | null;
  size: string | null;
  color: string | null;
}) {
  const { url, key } = dbEnv();
  const expires = new Date(Date.now() + CONTEXT_TTL_MINUTES * 60_000).toISOString();
  const payload = {
    context_id: input.contextId,
    last_query: input.lastQuery.slice(0, 300),
    last_results: input.lastResults,
    selected_product: input.selectedProduct,
    last_requested_size: input.size,
    last_requested_color: input.color,
    updated_at: new Date().toISOString(),
    expires_at: expires,
  };
  const r = await fetch(`${url}/rest/v1/bridge_product_context?on_conflict=context_id`, {
    method: "POST",
    headers: { ...dbHeaders(key), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`CONTEXT_SAVE_HTTP_${r.status}`);
}

async function getProductRecord(name: string) {
  const { url, key } = dbEnv();
  const select = "id,nome,marca,categoria_nome,descricao,link,ativo,selling_out_of_stock";
  const r = await fetch(
    `${url}/rest/v1/shadow_products?select=${encodeURIComponent(select)}&ativo=eq.true&nome=eq.${encodeURIComponent(name)}&limit=1`,
    { headers: dbHeaders(key) },
  );
  if (!r.ok) throw new Error(`PRODUCT_GET_HTTP_${r.status}`);
  const rows = await r.json() as Array<Record<string, unknown>>;
  return rows[0] || null;
}

async function getVariationColors(productId: string) {
  const { url, key } = dbEnv();
  const r = await fetch(
    `${url}/rest/v1/shadow_product_variations?select=attributes&shadow_product_id=eq.${encodeURIComponent(productId)}&limit=200`,
    { headers: dbHeaders(key) },
  );
  if (!r.ok) return [] as string[];
  const rows = await r.json() as Array<{ attributes?: Record<string, unknown> | null }>;
  const colors: string[] = [];
  for (const row of rows) {
    const attrs = row.attributes && typeof row.attributes === "object" ? row.attributes : {};
    for (const [k, v] of Object.entries(attrs)) {
      if (normalize(k) === "cor" && v != null) {
        const c = detectColor(String(v));
        if (c) colors.push(c);
      }
    }
  }
  return [...new Set(colors)];
}

async function selectedProductHasColor(productName: string, targetColor: string) {
  const row = await getProductRecord(productName);
  if (!row) return { found: false, row: null };
  const surface = `${String(row.nome ?? "")} ${String(row.descricao ?? "")}`;
  if (detectColor(surface) === targetColor) return { found: true, row };
  const variationColors = await getVariationColors(String(row.id ?? ""));
  return { found: variationColors.includes(targetColor), row };
}

function hasRequestedSize(product: Record<string, unknown>, size: string | null) {
  if (!size) return true;
  const vars = Array.isArray(product.variacoes) ? product.variacoes as Array<Record<string, unknown>> : [];
  return vars.some((v) => String(v.tamanho ?? "") === size && v.disponivel !== false);
}

function candidateMatchesReference(
  product: Record<string, unknown>,
  reference: Record<string, unknown>,
  targetColor: string,
  size: string | null,
) {
  const sameCategory = canonCategory(product.categoria) === canonCategory(reference.categoria_nome);
  const pBrand = normalize(product.marca);
  const rBrand = normalize(reference.marca);
  const sameBrand = Boolean(pBrand && rBrand && (pBrand === rBrand || pBrand.includes(rBrand) || rBrand.includes(pBrand)));
  const correctColor = detectColor(product.nome) === targetColor;
  return sameCategory && sameBrand && correctColor && hasRequestedSize(product, size);
}

function compactProducts(products: unknown[]) {
  return products.slice(0, 5).map((p) => {
    const x = p && typeof p === "object" && !Array.isArray(p) ? p as Record<string, unknown> : {};
    return {
      nome: x.nome ?? null,
      categoria: x.categoria ?? null,
      marca: x.marca ?? null,
      preco: x.preco ?? null,
      precoPix: x.precoPix ?? null,
      link: x.link ?? null,
      imagem: x.imagem ?? null,
      disponibilidade: x.disponibilidade ?? null,
      variacoes: Array.isArray(x.variacoes) ? x.variacoes : [],
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "POST") return json({ sucesso: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (req.headers.get("x-prime-lab") !== LAB_HEADER) return json({ sucesso: false, error: "FORBIDDEN_LAB_ONLY" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const pergunta = String(body?.pergunta ?? "").trim().slice(0, 300);
    const contextId = String(body?.cliente_id ?? body?.context_id ?? "").trim().slice(0, 220);
    if (pergunta.length < 2) return json({ sucesso: false, error: "PERGUNTA_REQUIRED" }, 400);
    if (!contextId || contextId.length < 6 || contextId.includes("$" + "{")) return json({ sucesso: false, error: "LAB_CONTEXT_REQUIRED" }, 400);

    // V1.5A commercial-LAB-only guard: current Action has no Story/media ID.
    // DO NOT read/write stale 15-minute memory for vague or visual references.
    const storyEvidence = classifyUnverifiedStoryReferenceV15a(pergunta);
    if (storyEvidence.hold) return json(unverifiedStoryHoldResponseV15a(storyEvidence.reason));

    const prev = await getContext(contextId);
    const requestedSize = detectSize(pergunta) ?? (prev?.last_requested_size ? String(prev.last_requested_size) : null);
    const requestedColor = detectColor(pergunta);
    const selectedProduct = prev?.selected_product ? String(prev.selected_product) : null;

    // Continuação por COR: preserve o produto exato; se a nova cor não for comprovada nele,
    // retorne apenas alternativas e sinalize explicitamente que são OUTRO modelo/produto.
    if (prev && selectedProduct && requestedColor) {
      const check = await selectedProductHasColor(selectedProduct, requestedColor);
      const reference = check.row;
      if (check.found && reference) {
        const exact = await callShadow([selectedProduct, requestedSize].filter(Boolean).join(" "));
        const exactProducts = (exact?.dados?.produtos ?? []).filter((p: Record<string, unknown>) => normalize(p.nome) === normalize(selectedProduct));
        const out = { ...exact, dados: { ...exact.dados, produtos: exactProducts.slice(0, 1) } };
        out.contexto = {
          ...out.contexto,
          pergunta,
          source: "shadow_context_v1",
          contextual: {
            context_id: contextId,
            reference_product: selectedProduct,
            attribute_change: "color",
            requested_color: requestedColor,
            requested_size: requestedSize,
            same_model_found: true,
            alternatives_only: false,
          },
        };
        out.dados.informacao_adicional =
          `CONTEXTO CONFIRMADO: o produto de referência continua sendo "${selectedProduct}". A cor ${requestedColor} foi confirmada nesse mesmo produto. Não troque de modelo.`;
        await saveContext({
          contextId, lastQuery: pergunta, lastResults: compactProducts(exactProducts),
          selectedProduct, size: requestedSize, color: requestedColor,
        });
        return json(out);
      }

      const category = String(reference?.categoria_nome ?? prev?.last_results?.[0]?.categoria ?? "Tênis");
      const brand = String(reference?.marca ?? prev?.last_results?.[0]?.marca ?? "");
      const alternativeQuery = [category, brand, requestedColor, requestedSize].filter(Boolean).join(" ");
      const alt = await callShadow(alternativeQuery);
      const all = Array.isArray(alt?.dados?.produtos) ? alt.dados.produtos as Array<Record<string, unknown>> : [];
      const alternatives = reference
        ? all.filter((p) => normalize(p.nome) !== normalize(selectedProduct) && candidateMatchesReference(p, reference, requestedColor, requestedSize)).slice(0, 3)
        : [];

      const out = { ...alt };
      out.contexto = {
        ...out.contexto,
        pergunta,
        produtos_encontrados: alternatives.length,
        tem_produtos: alternatives.length > 0,
        source: "shadow_context_v1",
        contextual: {
          context_id: contextId,
          reference_product: selectedProduct,
          attribute_change: "color",
          requested_color: requestedColor,
          requested_size: requestedSize,
          same_model_found: false,
          alternatives_only: true,
        },
      };
      out.dados = {
        ...out.dados,
        produtos: alternatives,
        totalVariacoes: alternatives.length,
        variacoesRestantes: 0,
        informacao_adicional:
          `ATENÇÃO DE CONTEXTO: o cliente está falando do mesmo produto "${selectedProduct}". A cor ${requestedColor} NÃO foi confirmada nesse mesmo produto/modelo. Os produtos listados abaixo são somente ALTERNATIVAS de ${brand || "mesma marca"} na mesma categoria. Antes de mostrar qualquer alternativa, diga explicitamente que esse mesmo modelo não apareceu em ${requestedColor}. Nunca apresente a alternativa como se fosse o mesmo modelo.`,
      };

      await saveContext({
        contextId, lastQuery: pergunta, lastResults: compactProducts(alternatives),
        selectedProduct, size: requestedSize, color: requestedColor,
      });
      return json(out);
    }

    // Continuação por TAMANHO sem troca de cor: consulta o produto referente pelo nome completo.
    if (prev && selectedProduct && requestedSize) {
      const exact = await callShadow(`${selectedProduct} ${requestedSize}`);
      const all = Array.isArray(exact?.dados?.produtos) ? exact.dados.produtos as Array<Record<string, unknown>> : [];
      const same = all.filter((p) => normalize(p.nome) === normalize(selectedProduct) && hasRequestedSize(p, requestedSize)).slice(0, 1);
      const out = { ...exact };
      out.contexto = {
        ...out.contexto,
        pergunta,
        produtos_encontrados: same.length,
        tem_produtos: same.length > 0,
        source: "shadow_context_v1",
        contextual: {
          context_id: contextId,
          reference_product: selectedProduct,
          attribute_change: "size",
          requested_size: requestedSize,
          same_model_found: same.length > 0,
          alternatives_only: false,
        },
      };
      out.dados = {
        ...out.dados,
        produtos: same,
        totalVariacoes: same.length,
        variacoesRestantes: 0,
        informacao_adicional: same.length
          ? `CONTEXTO CONFIRMADO: mantenha o mesmo produto "${selectedProduct}". O tamanho ${requestedSize} está confirmado nele. Não troque de modelo.`
          : `CONTEXTO CONFIRMADO: mantenha o mesmo produto "${selectedProduct}". O tamanho ${requestedSize} não foi confirmado nele. Não troque de modelo silenciosamente.`,
      };
      await saveContext({
        contextId, lastQuery: pergunta, lastResults: compactProducts(same),
        selectedProduct, size: requestedSize, color: prev?.last_requested_color ? String(prev.last_requested_color) : null,
      });
      return json(out);
    }

    // Follow-up genérico sem novo produto/atributo: mantenha o produto referente.
    if (prev && selectedProduct && !requestedColor && !detectSize(pergunta) && isGenericFollowup(pergunta)) {
      const exact = await callShadow(selectedProduct);
      const all = Array.isArray(exact?.dados?.produtos) ? exact.dados.produtos as Array<Record<string, unknown>> : [];
      const same = all.filter((p) => normalize(p.nome) === normalize(selectedProduct)).slice(0, 1);
      const out = { ...exact };
      out.contexto = {
        ...out.contexto,
        pergunta,
        produtos_encontrados: same.length,
        tem_produtos: same.length > 0,
        source: "shadow_context_v1",
        contextual: {
          context_id: contextId,
          reference_product: selectedProduct,
          attribute_change: "none",
          generic_followup: true,
          requested_size: prev?.last_requested_size ? String(prev.last_requested_size) : null,
          requested_color: prev?.last_requested_color ? String(prev.last_requested_color) : null,
          same_model_found: same.length > 0,
          alternatives_only: false,
        },
      };
      out.dados = {
        ...out.dados,
        produtos: same,
        totalVariacoes: same.length,
        variacoesRestantes: 0,
        informacao_adicional: same.length
          ? `CONTEXTO CONFIRMADO: responda ao follow-up usando o mesmo produto "${selectedProduct}". Não troque de produto/modelo.`
          : `CONTEXTO CONFIRMADO: o produto referente continua sendo "${selectedProduct}", mas não foi possível reconfirmá-lo agora. Não substitua por outro produto silenciosamente.`,
      };
      await saveContext({
        contextId,
        lastQuery: pergunta,
        lastResults: compactProducts(same),
        selectedProduct,
        size: prev?.last_requested_size ? String(prev.last_requested_size) : null,
        color: prev?.last_requested_color ? String(prev.last_requested_color) : null,
      });
      return json(out);
    }

    // Primeira busca / nova busca:
    // - se for um pedido genérico de categoria, remova termos genéricos que diluem a relevância;
    // - se a categoria estiver explícita, nunca misture produtos de outra categoria.
    const requestedCategory = detectRequestedCategory(pergunta);
    const base = await callShadow(pergunta);
    const rawProducts = Array.isArray(base?.dados?.produtos) ? base.dados.produtos as Array<Record<string, unknown>> : [];
    let products = requestedCategory
      ? rawProducts.filter((p) => canonCategory(p.categoria) === requestedCategory)
      : rawProducts;

    // Em pedido genérico de categoria, preserve primeiro a ordem/relevância original.
    // Se o filtro deixar poucas opções, complete com a busca canônica da categoria,
    // sem substituir o primeiro produto já escolhido pelo ranking original.
    let categoryFillUsed = false;
    if (requestedCategory && isGenericCategoryQuery(pergunta) && products.length < 5) {
      const fill = await callShadow(requestedCategory);
      const fillProducts = Array.isArray(fill?.dados?.produtos) ? fill.dados.produtos as Array<Record<string, unknown>> : [];
      const seen = new Set(products.map((p) => normalize(p.nome)));
      for (const p of fillProducts) {
        if (canonCategory(p.categoria) !== requestedCategory) continue;
        const key = normalize(p.nome);
        if (!key || seen.has(key)) continue;
        products.push(p);
        seen.add(key);
        categoryFillUsed = true;
        if (products.length >= 5) break;
      }
    }

    const topName = products[0]?.nome ? String(products[0].nome) : null;
    const baseTotalRaw = Number(base?.contexto?.total_variacoes ?? base?.dados?.totalVariacoes ?? products.length);
    const presentationTotal = Number.isFinite(baseTotalRaw) ? Math.max(products.length, baseTotalRaw) : products.length;
    const presentationRemaining = Math.max(0, presentationTotal - products.length);
    const exactNames = products.map((p, index) => `${index + 1}. ${String(p.nome ?? "")}`).join(" | ");
    base.contexto = {
      ...base.contexto,
      pergunta,
      produtos_encontrados: products.length,
      tem_produtos: products.length > 0,
      total_variacoes: presentationTotal,
      variacoes_restantes: presentationRemaining,
      source: "shadow_context_v1",
      contextual: {
        context_id: contextId,
        reference_product: topName,
        initialized: true,
        requested_category: requestedCategory,
        category_filter_applied: Boolean(requestedCategory),
        category_fill_used: categoryFillUsed,
      },
    };
    const exactSummaryLines = products.map((p, index) => {
      const name = String(p.nome ?? "");
      const price = String(p.preco ?? "").trim();
      return `${index + 1}. NOME EXATO: ${name}${price ? ` | PREÇO: ${price}` : ""}`;
    }).join("\n");
    const exactSummary = products.length
      ? `RESULTADO EXATO DO CATÁLOGO. Total compatível: ${presentationTotal}. Exibindo agora: ${products.length}. Restam: ${presentationRemaining}. COPIE OS NOMES ABAIXO LITERALMENTE; NÃO RESUMA, NÃO RENOMEIE E NÃO INVENTE COR/MODELO.\n${exactSummaryLines}`
      : `RESULTADO EXATO DO CATÁLOGO. Nenhum produto compatível encontrado.`;

    const normalizedQuestion = normalize(pergunta);
    const needsVariationDetails = Boolean(detectSize(pergunta))
      || /\\b(tamanho|tamanhos|numero|numeracao)\\b/.test(normalizedQuestion);
    const responseProducts = products.map((p) => {
      const vars = Array.isArray(p.variacoes) ? p.variacoes as Array<Record<string, unknown>> : [];
      const compactVars = needsVariationDetails
        ? vars.filter((v) => !requestedSize || String(v.tamanho ?? "") === requestedSize)
        : [];
      return {
        nome: p.nome ?? null,
        categoria: p.categoria ?? null,
        marca: p.marca ?? null,
        preco: p.preco ?? null,
        precoPix: p.precoPix ?? null,
        imagem: p.imagem ?? null,
        link: p.link ?? null,
        disponibilidade: p.disponibilidade ?? null,
        estoque_confirmado: p.estoque_confirmado ?? null,
        variacoes: compactVars,
      };
    });
    const previousInfo = base.dados?.informacao_adicional;
    base.dados = {
      resumo_disponibilidade: exactSummary,
      produtos: responseProducts,
      totalVariacoes: presentationTotal,
      variacoesRestantes: presentationRemaining,
      informacao_adicional: requestedCategory
        ? `CONTEXTO DE CATEGORIA: o cliente pediu ${requestedCategory}. Liste somente produtos dessa categoria; não misture categorias diferentes. LISTAGEM OBRIGATÓRIA: apresente TODOS os ${products.length} produtos retornados nesta resposta. COPIE OS NOMES EXATAMENTE como recebidos da ferramenta, sem encurtar, renomear, inventar cor/modelo ou substituir item. Nomes obrigatórios: ${exactNames}. O total real desta busca é ${presentationTotal} e restam ${presentationRemaining} opções não listadas; se mencionar quantidade, use exatamente esses números.`
        : previousInfo,
    };
    await saveContext({
      contextId,
      lastQuery: pergunta,
      lastResults: compactProducts(products),
      selectedProduct: topName,
      size: detectSize(pergunta),
      color: detectColor(pergunta),
    });
    return json(base);
  } catch (e) {
    return json({ sucesso: false, error: String((e as Error)?.message ?? "INTERNAL_ERROR").slice(0, 180) }, 500);
  }
});
