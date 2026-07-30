# Teste de Base de Conhecimento — PRIME STORE × Dealism

Este é um documento **experimental e de teste**, gerado somente para leitura, com o objetivo de avaliar se o agente Dealism consegue localizar produtos, recomendar por intenção, informar preços, encontrar tamanhos/cores, fornecer link da página e URL de imagem, e responder perguntas naturais de clientes.

Nenhum arquivo, banco de dados, código, configuração ou integração do projeto foi alterado para produzir este documento. As informações vêm de duas fontes:

1. **Banco de dados** — tabela `products` no Supabase (projeto `mbbgqasvssueirynnoyk`), consultada via API REST somente leitura (`GET /rest/v1/products`). Campos disponíveis: `id, nome, preco, link, imagem, categoria, codigo, price_original, price_discount, discount_percent, status, source, created_at, synced_at`.
2. **Site público** (`primestoremen.com.br`) — confirmado via `sitemap.xml` (contém as URLs de categoria e de produto no mesmo arquivo, 633 entradas) e via carregamento real da página de cada produto no navegador (o acesso via `curl` retorna `403` — a loja bloqueia requisições sem navegador real; por isso a validação foi feita com navegador).

**Limitação importante do banco:** a tabela `products` **não possui campos de SKU/código real** (`codigo` está `null` em todos os 10 produtos), **não possui campo de descrição**, e **não possui campo de tamanhos/variações** — esses dados só existem na página pública do site. Por isso todas as fichas abaixo dependem da página pública para descrição, tamanhos e disponibilidade de estoque.

---

# PRODUTO 01 — Tênis New Balance 9060 Cor Gelo

Produto:
Tênis New Balance 9060 Cor Gelo (título no site: "New Ballace 9060 Cor Gelo")

Código/SKU:
Não informado

Marca:
New Balance

Categoria:
Tênis

Gênero:
Unissex (site indica "FEM / MASC")

Status:
Ativo (status="active" no banco; site indica "Produto vendido sob encomenda")

Preço normal:
R$ 599,00

Preço promocional:
R$ 449,00

Preço no PIX:
R$ 422,06

Parcelamento:
4x de R$ 112,25 sem juros

Cores ou variações:
- Cor Gelo (única variação cadastrada nesta ficha)

Tamanhos cadastrados:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43

Tamanhos disponíveis atualmente:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43 (site declara "venda ilimitada" — não há tamanhos esgotados)

Descrição:
Tênis com cabedal em material sintético resistente e solado em borracha antiderrapante. Possui sistema de amortecimento para maior conforto e redução de impacto. Fechamento em cadarço. Visual moderno com cores neutras.

Características:
- Sistema de amortecimento
- Solado de borracha antiderrapante
- Fechamento em cadarço
- Cabedal em material sintético

Foto principal:
https://cdn.dooca.store/161486/products/9060-gelo_1600x2000.jpeg?v=1758981430000

Fotos secundárias:
- https://cdn.dooca.store/161486/products/photo-2026-07-07-14-47-17-br14y_600x800+crop_center.jpg?v=1783455829
- https://cdn.dooca.store/161486/products/38-ao-43-4-ufcxt_600x800+crop_center.jpeg?v=1782507853
- https://cdn.dooca.store/161486/products/38-ao-43-vhnir_600x800+crop_center.jpeg?v=1782504222

Página do produto:
https://www.primestoremen.com.br/new-ballace-9060-cor-gelo

Palavras-chave:
new balance, 9060, tenis new balance, tenis cor gelo, tenis unissex, tenis feminino, tenis masculino, calçado esportivo, tenis conforto, new balance 9060 gelo, tenis 34 ao 43, tenis amortecimento, tenis casual, sneaker new balance, tenis dia a dia

Perguntas que este produto pode responder:
- Vocês têm New Balance 9060?
- Quanto custa o New Balance 9060 cor gelo?
- Tem tamanho 39 do New Balance 9060?
- Qual o preço no pix do tênis New Balance 9060?
- Dá para parcelar o New Balance 9060?
- O New Balance 9060 é unissex?
- Vocês têm tênis para o dia a dia confortável?
- Qual o link para comprar o New Balance 9060 cor gelo?
- Vocês têm foto do New Balance 9060?
- O New Balance 9060 tem entrega imediata?
- Quais tamanhos existem do New Balance 9060?
- É produto original ou réplica? (não informado pela fonte)

Resposta curta recomendada:
O New Balance 9060 Cor Gelo custa R$ 449,00 (R$ 422,06 no pix ou 4x de R$ 112,25 sem juros), tamanhos de 34 a 43. Confira aqui: https://www.primestoremen.com.br/new-ballace-9060-cor-gelo

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/new-ballace-9060-cor-gelo
- Imagem: cdn.dooca.store (CDN da plataforma da loja)

Divergências encontradas:
O banco registra `price_original=449,00` e `price_discount=429,00`, mas a página pública exibe preço "de" R$ 599,00 "por" R$ 449,00 (pix R$ 422,06). O valor de R$ 429,00 do banco não aparece na página no momento da consulta — possível preço desatualizado no banco.

=========================================================

# PRODUTO 02 — Tênis New Balance 530 Branco

Produto:
Tênis New Balance 530 Branco

Código/SKU:
Não informado

Marca:
New Balance

Categoria:
Tênis

Gênero:
Unissex (site indica "FEM / MASC")

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 499,00

Preço promocional:
R$ 399,83 (equivalente ao valor parcelado; ver observação em Divergências)

Preço no PIX:
R$ 375,84

Parcelamento:
4x de R$ 99,96 sem juros

Cores ou variações:
- Branco (única variação cadastrada nesta ficha)

Tamanhos cadastrados:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43

Tamanhos disponíveis atualmente:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43 (site declara "venda ilimitada")

Descrição:
Tênis clássico e icônico da New Balance, com acabamento em couro branco, tecnologia de amortecimento ABZORB e palmilha em EVA moldada. Solado de borracha resistente e fechamento em cadarço.

Características:
- Tecnologia de amortecimento ABZORB
- Palmilha em EVA moldada
- Acabamento em couro
- Solado de borracha resistente

Foto principal:
https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015350-2-wojum_1600x2000.jpeg?v=1778178476

Fotos secundárias:
- https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015350-1-yo6lf_1200x1600.jpeg?v=1778178477
- https://cdn.dooca.store/161486/products/whatsapp-image-2026-05-07-at-015350-fkp1b_450x600.jpeg?v=1778178477
- https://cdn.dooca.store/161486/products/38-ao-43-4-ufcxt_600x800+crop_center.jpeg?v=1782507853

Página do produto:
https://www.primestoremen.com.br/new-balnce-530-branco

Palavras-chave:
new balance 530, tenis new balance 530, tenis branco, new balance branco, tenis unissex, tenis clássico, sneaker new balance, tenis couro, tenis dia a dia, tenis casual, tenis 34 ao 43, new balance 530 branco preço, calçado esportivo, tenis conforto

Perguntas que este produto pode responder:
- Vocês têm New Balance 530 branco?
- Quanto custa o New Balance 530?
- Qual o preço no pix do New Balance 530 branco?
- Tem entrega rápida do New Balance 530?
- Quais tamanhos tem o New Balance 530?
- O New Balance 530 é unissex?
- Dá para parcelar o New Balance 530?
- Qual o link do New Balance 530 branco?
- Tem foto do New Balance 530 branco?
- O New Balance 530 é original?
- Vocês têm tênis branco clássico?

Resposta curta recomendada:
O New Balance 530 Branco está por R$ 499,00 (R$ 375,84 no pix ou 4x de R$ 99,96 sem juros), com envio imediato e tamanhos de 34 a 43. Veja aqui: https://www.primestoremen.com.br/new-balnce-530-branco

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/new-balnce-530-branco
- Imagem: cdn.dooca.store

Divergências encontradas:
O banco não tem `price_original`/`price_discount` preenchidos para este item (ambos nulos), mas a página pública exibe claramente um preço de R$ 499,00 com valor parcelado de R$ 399,83 — o banco não capturou a estrutura de desconto real do site.

=========================================================

# PRODUTO 03 — Tênis Nike Dunk Rosa

Produto:
Tênis Nike Dunk Rosa

Código/SKU:
Não informado

Marca:
Nike

Categoria:
Tênis

Gênero:
Feminino (descrição do site menciona "design moderno e feminino")

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 499,00

Preço promocional:
R$ 289,00

Preço no PIX:
R$ 271,66

Parcelamento:
4x de R$ 72,25 sem juros

Cores ou variações:
- Rosa (única variação cadastrada nesta ficha)

Tamanhos cadastrados:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43

Tamanhos disponíveis atualmente:
- 34, 35, 36, 37, 38, 39, 40, 41, 42, 43 (site declara "venda ilimitada")

Descrição:
Tênis inspirado nos modelos de basquete dos anos 80, com cabedal em couro sintético, entressola em EVA e sola de borracha. Design feminino em tom rosa.

Características:
- Cabedal em couro sintético
- Entressola em EVA
- Sola de borracha com aderência
- Design inspirado em modelo clássico de basquete

Foto principal:
https://cdn.dooca.store/161486/products/rosa07-lwbo4_450x600.jpeg?v=1772909202

Fotos secundárias:
- https://cdn.dooca.store/161486/products/rosa01-bisot_450x600.jpeg?v=1772909203
- https://cdn.dooca.store/161486/products/rosa06-mbrhx_450x600.jpeg?v=1772909203
- https://cdn.dooca.store/161486/products/rosa05-gxnlb_450x600.jpeg?v=1772909204

Página do produto:
https://www.primestoremen.com.br/tenis-nike-dunk-rosa

Palavras-chave:
nike dunk, tenis nike dunk rosa, nike dunk feminino, tenis rosa, sneaker nike, tenis nike barato, nike dunk promoção, tenis feminino nike, calçado feminino, tenis casual rosa, nike dunk 34 ao 43, tenis nike dunk preço

Perguntas que este produto pode responder:
- Vocês têm Nike Dunk rosa?
- Quanto custa o Nike Dunk rosa?
- Qual o preço no pix do Nike Dunk rosa?
- Tem tamanho 37 do Nike Dunk rosa?
- O Nike Dunk rosa é feminino?
- Dá para parcelar o Nike Dunk?
- Qual o link do Nike Dunk rosa?
- Tem foto do Nike Dunk rosa?
- O Nike Dunk rosa está em promoção?
- Tem entrega imediata do Nike Dunk?

Resposta curta recomendada:
O Nike Dunk Rosa está com 42% de desconto: R$ 289,00 (R$ 271,66 no pix ou 4x de R$ 72,25 sem juros), tamanhos de 34 a 43, com envio imediato. Confira: https://www.primestoremen.com.br/tenis-nike-dunk-rosa

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/tenis-nike-dunk-rosa
- Imagem: cdn.dooca.store

Divergências encontradas:
Nenhuma divergência identificada — banco (`preco=R$ 289,00`, `price_original=499`, `price_discount=289`) e site (R$ 499,00 → R$ 289,00) são consistentes.

=========================================================

# PRODUTO 04 — Camisa Corinthians Mod.2024

Produto:
Camisa Corinthians Mod.2024

Código/SKU:
Não informado

Marca:
Não informado (produto de time, sem marca licenciadora identificada na página)

Categoria:
Camisetas

Gênero:
Não informado

Status:
Ativo (site indica "Produto vendido sob encomenda")

Preço normal:
R$ 249,00

Preço promocional:
R$ 149,00

Preço no PIX:
R$ 140,06

Parcelamento:
4x de R$ 37,25 sem juros

Cores ou variações:
- Preto e branco (cores do clube, conforme descrição)

Tamanhos cadastrados:
Não informado (a página não exibiu botões de tamanho selecionáveis no momento da consulta)

Tamanhos disponíveis atualmente:
Não informado

Descrição:
Camisa do Corinthians modelo 2024, tecido de alta qualidade com tecnologia de respirabilidade e absorção de suor, gola V, mangas curtas, escudo bordado no peito.

Características:
- Tecido com tecnologia de respirabilidade
- Gola V
- Mangas curtas
- Escudo bordado no peito

Foto principal:
https://cdn.dooca.store/161486/products/large-9_1600x2000.jpg?v=1732375075

Fotos secundárias:
- https://cdn.dooca.store/161486/products/large-9_1200x1600.jpg?v=1732375075
- https://cdn.dooca.store/161486/products/4b82e4eb-49bf-4b8a-b272-697a81301452-m0rlt_600x800+crop_center.jpeg?v=1782329177

Página do produto:
https://www.primestoremen.com.br/camisa-corinthians-mod2024

Palavras-chave:
camisa corinthians, camisa corinthians 2024, camisa timão, camisa time, camisa futebol, camisa corinthians preço, camisa corinthians torcedor, camiseta futebol, camisa preto e branco, camisa corinthians barata, presente torcedor corinthians

Perguntas que este produto pode responder:
- Vocês têm camisa do Corinthians?
- Quanto custa a camisa do Corinthians?
- Qual o preço no pix da camisa do Corinthians?
- Dá para parcelar a camisa do Corinthians?
- Qual o link da camisa do Corinthians?
- Tem foto da camisa do Corinthians?
- A camisa do Corinthians é pronta entrega? (site indica "vendido sob encomenda")
- Quais tamanhos tem a camisa do Corinthians? (não informado)
- Vocês têm camisa de outros times também?

Resposta curta recomendada:
A Camisa Corinthians Mod.2024 está por R$ 149,00 (R$ 140,06 no pix ou 4x de R$ 37,25 sem juros). Produto vendido sob encomenda. Veja aqui: https://www.primestoremen.com.br/camisa-corinthians-mod2024

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/camisa-corinthians-mod2024
- Imagem: cdn.dooca.store

Divergências encontradas:
Nenhuma divergência identificada nos preços — banco (`preco=R$ 149,00`, `price_original=249`, `price_discount=149`) confere com o site (R$ 249,00 → R$ 149,00).

=========================================================

# PRODUTO 05 — Cueca Lup 006

Produto:
Cueca Lup 006 (marca no site: Lupo)

Código/SKU:
Não informado

Marca:
Lupo

Categoria:
Acessórios

Gênero:
Masculino

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 79,00

Preço promocional:
R$ 59,00

Preço no PIX:
R$ 55,46

Parcelamento:
4x de R$ 14,75 sem juros

Cores ou variações:
Não informado (a página não especifica cor além da imagem do produto)

Tamanhos cadastrados:
- P, M, G, GG, G1

Tamanhos disponíveis atualmente:
- P, M, G, GG, G1 (site declara "venda ilimitada")

Descrição:
Cueca boxer da marca Lupo, tecido em algodão e elastano, cós elástico com logo da marca, modelo com maior cobertura e conforto para o dia a dia.

Características:
- Tecido em algodão e elastano
- Cós elástico com logo da marca
- Modelo boxer

Foto principal:
https://cdn.dooca.store/161486/products/cueca-lupo3322-12ks4_1600x2000.png?v=1778159925

Fotos secundárias:
- https://cdn.dooca.store/161486/products/cueca-lupo3322-12ks4_1200x1600.png?v=1778159925

Página do produto:
https://www.primestoremen.com.br/cueca-lupo-006

Palavras-chave:
cueca lupo, cueca masculina, cueca boxer, roupa íntima masculina, cueca algodão, cueca lupo tamanhos, cueca lupo preço, cueca confortável, acessório masculino, cueca lupo 006, roupa íntima lupo

Perguntas que este produto pode responder:
- Vocês têm cueca Lupo?
- Quanto custa a cueca Lupo 006?
- Qual o preço no pix da cueca Lupo?
- Quais tamanhos tem a cueca Lupo?
- Tem cueca tamanho G1?
- Dá para parcelar a cueca Lupo?
- Qual o link da cueca Lupo 006?
- Tem foto da cueca Lupo 006?
- A cueca Lupo tem entrega rápida?

Resposta curta recomendada:
A Cueca Lupo 006 custa R$ 59,00 (R$ 55,46 no pix ou 4x de R$ 14,75 sem juros), tamanhos P ao G1, com envio imediato. Veja aqui: https://www.primestoremen.com.br/cueca-lupo-006

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/cueca-lupo-006
- Imagem: cdn.dooca.store

Divergências encontradas:
O banco registra apenas `preco=R$ 59,00`, sem `price_original`/`price_discount` (ambos nulos), mas a página pública mostra explicitamente um desconto de 25% (de R$ 79,00 por R$ 59,00) — o banco não capturou a estrutura de preço "de/por" que existe no site.

=========================================================

# PRODUTO 06 — Papete Miu Miu Feminina Bege Escuro

Produto:
Papete Miu Miu Feminina Bege Escuro (nome completo no site: "Papete Miu Miu Feminina Fim De Ano Charmosa Confortável Leve - Bege Escuro")

Código/SKU:
Não informado

Marca:
Miu Miu (conforme nome do produto; a descrição textual da página, porém, refere-se a "Plataforma Gucci Femina" — ver Divergências)

Categoria:
Calçados Femininos

Gênero:
Feminino

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 399,00

Preço promocional:
R$ 279,00

Preço no PIX:
R$ 265,05

Parcelamento:
4x de R$ 69,75 sem juros

Cores ou variações:
- Bege Escuro (única variação cadastrada nesta ficha)

Tamanhos cadastrados:
- 34, 35, 36, 37, 38, 39, 40

Tamanhos disponíveis atualmente:
- 34, 35, 36, 37, 38, 39, 40 (site declara "venda ilimitada")

Descrição:
Segundo o texto da própria página do produto, trata-se de uma plataforma feminina com salto plataforma de 10cm, solado emborrachado, acabamento em couro legítimo e detalhes em metal dourado. (O texto descreve "Plataforma Gucci Femina" — divergência de nome em relação ao título "Papete Miu Miu", presente na própria página de origem.)

Características:
- Salto plataforma de 10cm
- Solado emborrachado
- Acabamento em couro legítimo
- Detalhes em metal dourado

Foto principal:
https://mbbgqasvssueirynnoyk.supabase.co/storage/v1/object/public/produtos/papete_miu_miu_feminina_bege_escuro_1782904489472.jpg

Fotos secundárias:
- https://cdn.dooca.store/161486/products/escuro01-grande_450x600.jpeg?v=1770466035
- https://cdn.dooca.store/161486/products/ecuro04-grande_450x600.jpeg?v=1770466036
- https://cdn.dooca.store/161486/products/ecuro03-grande_450x600.jpeg?v=1770466036

Página do produto:
https://www.primestoremen.com.br/sandalia-miu-miu-2025-bege-escuro

Palavras-chave:
papete miu miu, sandália feminina, papete bege, calçado feminino, plataforma feminina, sandália plataforma, papete confortável, calçado feminino luxo, sandália salto plataforma, papete miu miu preço, sandália bege escuro

Perguntas que este produto pode responder:
- Vocês têm papete Miu Miu?
- Quanto custa a papete Miu Miu bege escuro?
- Qual o preço no pix da papete Miu Miu?
- Quais tamanhos tem a papete Miu Miu?
- Dá para parcelar a papete Miu Miu?
- Qual o link da papete Miu Miu?
- Tem foto da papete Miu Miu bege escuro?
- A papete tem entrega imediata?
- Vocês têm calçados femininos de plataforma?

Resposta curta recomendada:
A Papete Miu Miu Feminina Bege Escuro está por R$ 279,00 (R$ 265,05 no pix ou 4x de R$ 69,75 sem juros), tamanhos 34 a 40, com envio imediato. Veja aqui: https://www.primestoremen.com.br/sandalia-miu-miu-2025-bege-escuro

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/sandalia-miu-miu-2025-bege-escuro
- Imagem: Supabase Storage (bucket `produtos`)

Divergências encontradas:
(1) O nome do produto no banco ("Papete Miu Miu Feminina Bege Escuro") é mais curto que o título exibido na página pública ("...Fim De Ano Charmosa Confortável Leve - Bege Escuro"). (2) O texto de descrição da própria página se refere ao produto como "Plataforma Gucci Femina", não como Miu Miu — inconsistência de conteúdo já presente na fonte original (site), não introduzida por este documento. (3) A imagem principal do banco (Supabase Storage) é diferente das imagens exibidas na galeria da página (cdn.dooca.store) — ambas são URLs públicas e válidas, mas mostram fotos diferentes do produto.

=========================================================

# PRODUTO 07 — Club de Nuit Ico Nic

Produto:
Club de Nuit Ico Nic

Código/SKU:
Não informado

Marca:
Armaf

Categoria:
Perfumes

Gênero:
Masculino (conforme descrição da página)

Status:
Ativo (site indica "apenas 5 unidades disponíveis em estoque")

Preço normal:
R$ 599,99

Preço promocional:
R$ 499,00

Preço no PIX:
R$ 469,06

Parcelamento:
4x de R$ 124,75 sem juros

Cores ou variações:
Não informado

Tamanhos cadastrados:
Não informado (perfume, sem tamanhos de vestuário)

Tamanhos disponíveis atualmente:
Não informado

Descrição:
Perfume masculino com notas amadeiradas e cítricas, indicado para uso noturno, fixação prolongada.

Características:
- Notas amadeiradas e cítricas
- Fixação prolongada
- Indicado para uso noturno

Foto principal:
https://cdn.dooca.store/161486/products/img-9827_1600x2000.jpeg?v=1731507045

Fotos secundárias:
- https://cdn.dooca.store/161486/products/img-9827_1200x1600.jpeg?v=1731507045

Página do produto:
https://www.primestoremen.com.br/club-de-nuit-ico-nic

Palavras-chave:
club de nuit, armaf, perfume masculino, perfume importado, club de nuit ico nic, perfume amadeirado, perfume cítrico, perfume para noite, fragrância masculina, perfume armaf preço, perfume promoção

Perguntas que este produto pode responder:
- Vocês têm o perfume Club de Nuit Ico Nic?
- Quanto custa o Club de Nuit Ico Nic?
- Qual o preço no pix do Club de Nuit?
- Tem estoque do Club de Nuit Ico Nic?
- Dá para parcelar o perfume?
- Qual o link do Club de Nuit Ico Nic?
- Tem foto do perfume Club de Nuit?
- É perfume masculino ou feminino?
- Vocês têm perfumes da Armaf?

Resposta curta recomendada:
O Club de Nuit Ico Nic (Armaf) está por R$ 499,00 (R$ 469,06 no pix ou 4x de R$ 124,75 sem juros). Atenção: restam apenas 5 unidades em estoque. Veja aqui: https://www.primestoremen.com.br/club-de-nuit-ico-nic

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/club-de-nuit-ico-nic
- Imagem: cdn.dooca.store

Divergências encontradas:
Nenhuma divergência de preço identificada — banco (`preco=R$ 499,00`, `price_original=599,99`, `price_discount=499`) confere com o site.

=========================================================

# PRODUTO 08 — Boné Balenciaga Importado

Produto:
Boné Balenciaga Importado

Código/SKU:
Não informado

Marca:
Balenciaga (conforme nome do produto; a descrição textual da página, porém, refere-se a "Bone Dior Importada" — ver Divergências)

Categoria:
Bermudas (categoria cadastrada no banco — provável classificação incorreta, ver Divergências)

Gênero:
Não informado

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 499,00

Preço promocional:
R$ 319,00

Preço no PIX:
R$ 299,86

Parcelamento:
4x de R$ 79,75 sem juros

Cores ou variações:
Não informado

Tamanhos cadastrados:
Não informado (a página não exibiu tamanhos selecionáveis para este item)

Tamanhos disponíveis atualmente:
Não informado

Descrição:
Segundo o texto da própria página do produto: acessório com acabamento impecável, materiais de alta qualidade, estilo moderno e versátil, resistente e confortável. (O texto descreve "Bone Dior Importada" — divergência de marca em relação ao título "Boné Balenciaga", presente na própria página de origem.)

Características:
- Acabamento em materiais de alta qualidade
- Ajuste confortável
- Estilo versátil para diversas ocasiões

Foto principal:
https://cdn.dooca.store/161486/products/bone-balanciaga-media-gfpsz_1600x2000.jpeg?v=1774144231

Fotos secundárias:
- https://cdn.dooca.store/161486/products/bone-balanciaga-media-gfpsz_1200x1600.jpeg?v=1774144231

Página do produto:
https://www.primestoremen.com.br/bone-balenciaga-importado

Palavras-chave:
bone balenciaga, boné importado, acessório masculino, boné de luxo, boné grife, boné balenciaga preço, boné promoção, acessório importado, boné unissex, chapéu importado

Perguntas que este produto pode responder:
- Vocês têm boné Balenciaga?
- Quanto custa o boné Balenciaga importado?
- Qual o preço no pix do boné Balenciaga?
- Dá para parcelar o boné?
- Qual o link do boné Balenciaga?
- Tem foto do boné Balenciaga?
- O boné tem entrega imediata?
- Vocês têm outros bonés importados?

Resposta curta recomendada:
O Boné Balenciaga Importado está por R$ 319,00 (R$ 299,86 no pix ou 4x de R$ 79,75 sem juros), com envio imediato. Veja aqui: https://www.primestoremen.com.br/bone-balenciaga-importado

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/bone-balenciaga-importado
- Imagem: cdn.dooca.store

Divergências encontradas:
(1) O banco classifica este produto na categoria "Bermudas", o que aparenta ser um erro de categorização (é um boné/acessório, não uma bermuda). (2) O banco não tem `price_original`/`price_discount` preenchidos (nulos), mas a página exibe desconto de 36% (de R$ 499,00 por R$ 319,00). (3) O texto de descrição da própria página se refere ao produto como "Bone Dior Importada", não Balenciaga — inconsistência já presente na fonte original (site).

=========================================================

# PRODUTO 09 — Camisa Brasil Amarela Nike I 2026/27 Torcedor Masculina

Produto:
Camisa Brasil Amarela Nike I 2026/27 Torcedor Masculina

Código/SKU:
Não informado

Marca:
Nike

Categoria:
Camisetas

Gênero:
Masculino

Status:
Ativo (site indica "Envio imediato"); site oferece opção de personalização com nome do cliente

Preço normal:
R$ 449,00

Preço promocional:
R$ 189,00

Preço no PIX:
R$ 177,66

Parcelamento:
4x de R$ 47,25 sem juros

Cores ou variações:
- Amarela (única variação cadastrada nesta ficha)

Tamanhos cadastrados:
- P, M, G, GG, G1, G2

Tamanhos disponíveis atualmente:
- P, M, G, GG, G1, G2 (site declara "venda ilimitada")

Descrição:
Camisa oficial de torcedor da seleção brasileira, modelo I 2026/27, produzida pela Nike com tecnologia Dri-FIT (afasta o suor e mantém o corpo seco). Cor amarela predominante, com detalhes em verde e azul.

Características:
- Tecnologia Dri-FIT
- Cor amarela com detalhes verde/azul
- Possibilidade de personalização com nome (mencionada na página)

Foto principal:
https://cdn.dooca.store/161486/products/img-6244-copia-cwmmr_450x600.png?v=1773956821

Fotos secundárias:
- https://cdn.dooca.store/161486/products/ryi1jnql2zpafkbwvb88r4q9xmfw20lh52sg_450x600.jpg?v=1773924939
- https://cdn.dooca.store/161486/products/h4to3auzbwnopwfxsw6jtenogemiav78cpzi_450x600.jpg?v=1773924938
- https://cdn.dooca.store/161486/products/xqggito6tc5hquvejl3gwcj52ufvtmisndsb_450x600.jpg?v=1773924939

Página do produto:
https://www.primestoremen.com.br/camisa-do-brasil-ii-2627-torcedor-amarela-pro-masculina-nike-amarela-2026-copa

Palavras-chave:
camisa brasil, camisa seleção brasileira, camisa nike brasil, camisa amarela, camisa copa 2026, camisa brasil torcedor, camisa brasil personalizada, camiseta futebol brasil, camisa brasil masculina, camisa brasil preço, camisa brasil dri-fit

Perguntas que este produto pode responder:
- Vocês têm camisa do Brasil?
- Quanto custa a camisa da seleção brasileira?
- Qual o preço no pix da camisa do Brasil?
- Dá para personalizar a camisa do Brasil com nome?
- Quais tamanhos tem a camisa do Brasil?
- Dá para parcelar a camisa do Brasil?
- Qual o link da camisa do Brasil?
- Tem foto da camisa do Brasil amarela?
- A camisa do Brasil tem entrega imediata?

Resposta curta recomendada:
A Camisa Brasil Amarela Nike I 2026/27 Torcedor Masculina está por R$ 189,00 (R$ 177,66 no pix ou 4x de R$ 47,25 sem juros), tamanhos P ao G2, com opção de personalização e envio imediato. Veja aqui: https://www.primestoremen.com.br/camisa-do-brasil-ii-2627-torcedor-amarela-pro-masculina-nike-amarela-2026-copa

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/camisa-do-brasil-ii-2627-torcedor-amarela-pro-masculina-nike-amarela-2026-copa
- Imagem: cdn.dooca.store

Divergências encontradas:
O título `<title>` da página no navegador exibe "...Nik" (cortado) e menciona "26/27 Torcedor Amarela Pro Masculina Nik" enquanto o H1 visível na página usa "CAMISA BRASIL AMARELA NIKE I 2026/27 TORCEDOR MASCULINA" — variação de nome apenas entre metadados da página e o título visível, sem impacto no preço ou nos dados de compra.

=========================================================

# PRODUTO 10 — Calça Jeans Armani

Produto:
Calça Jeans Armani

Código/SKU:
Não informado

Marca:
Armani

Categoria:
Calças Jeans

Gênero:
Não informado

Status:
Ativo (site indica "Envio imediato")

Preço normal:
R$ 299,00

Preço promocional:
R$ 249,00

Preço no PIX:
R$ 234,06

Parcelamento:
4x de R$ 62,25 sem juros

Cores ou variações:
Não informado (a descrição da própria página menciona "preta", mas o título do produto não especifica cor — ver Divergências)

Tamanhos cadastrados:
- 38, 40, 42, 44, 46, 48

Tamanhos disponíveis atualmente:
- 38, 40, 42, 44, 46, 48 (site declara "venda ilimitada")

Descrição:
Segundo o texto da própria página do produto: calça com modelagem reta, cintura média, fechamento por zíper e botão, tecido resistente. (O texto descreve "Calça Jeans Calvin Preta" — divergência de marca/cor em relação ao título "Calça Jeans Armani", presente na própria página de origem.)

Características:
- Modelagem reta
- Cintura média
- Fechamento por zíper e botão

Foto principal:
https://cdn.dooca.store/161486/products/armani-0123_1600x2000.jpeg?v=1748021765

Fotos secundárias:
- https://cdn.dooca.store/161486/products/armano-00323_450x600.jpeg?v=1748021766

Página do produto:
https://www.primestoremen.com.br/calca-jeans-armani

Palavras-chave:
calça jeans armani, calça jeans masculina, calça jeans feminina, calça jeans preço, calça jeans promoção, calça reta, calça jeans grife, calça jeans importada, calça jeans 38 ao 48, calça jeans dia a dia

Perguntas que este produto pode responder:
- Vocês têm calça jeans Armani?
- Quanto custa a calça jeans Armani?
- Qual o preço no pix da calça jeans Armani?
- Quais tamanhos tem a calça jeans Armani?
- Dá para parcelar a calça jeans Armani?
- Qual o link da calça jeans Armani?
- Tem foto da calça jeans Armani?
- A calça jeans tem entrega imediata?
- De que cor é a calça jeans Armani? (não informado com certeza — ver divergência)

Resposta curta recomendada:
A Calça Jeans Armani está por R$ 249,00 (R$ 234,06 no pix ou 4x de R$ 62,25 sem juros), tamanhos 38 ao 48, com envio imediato. Veja aqui: https://www.primestoremen.com.br/calca-jeans-armani

Fonte dos dados:
- Banco: tabela `products` (Supabase)
- Página: https://www.primestoremen.com.br/calca-jeans-armani
- Imagem: cdn.dooca.store

Divergências encontradas:
O texto de descrição da própria página se refere ao produto como "Calça Jeans Calvin Preta", não Armani — inconsistência de marca/cor já presente na fonte original (site), não introduzida por este documento. Preços entre banco e site conferem.

=========================================================

## Resumo Final de Validação

- **Total de produtos:** 10
- **Produtos com página pública válida:** 10 de 10 (todas as 10 URLs foram carregadas com sucesso em navegador e localizadas no `sitemap.xml` do site; acesso via `curl` direto retorna `403` porque a loja bloqueia requisições sem navegador real — não é falha das páginas)
- **Produtos com foto direta válida:** 10 de 10 (todas as URLs de imagem principal foram confirmadas como arquivos de imagem diretos, hospedados em `cdn.dooca.store` ou no Supabase Storage bucket `produtos`)
- **Produtos com preço:** 10 de 10
- **Produtos com SKU:** 0 de 10 (campo `codigo` é `null` para todos os produtos consultados no banco; a página pública também não exibe SKU/referência)
- **Produtos com tamanhos:** 7 de 10 (Produtos 01, 02, 03, 05, 06, 09, 10 têm tamanhos; Produtos 04, 07, 08 não exibiram tamanhos — camisa sem seletor de tamanho visível, perfume e boné não se aplicam ou não exibiram)
- **Divergências entre banco e site:** 6 ocorrências identificadas — (1) Produto 01: preço de desconto do banco não confere com o site; (2) Produto 02: banco sem estrutura de desconto que existe no site; (3) Produto 05: banco sem estrutura de desconto que existe no site; (4) Produto 06: nome incompleto no banco + descrição da própria página cita marca diferente (Gucci) + imagem principal do banco diferente da galeria do site; (5) Produto 08: categoria "Bermudas" no banco parece incorreta para um boné + banco sem estrutura de desconto que existe no site + descrição da própria página cita marca diferente (Dior); (6) Produto 10: descrição da própria página cita marca/cor diferente (Calvin Preta)
- **Campos que o banco não oferece:** SKU/código real, descrição do produto, tamanhos/variações disponíveis, gênero, informação de estoque (unidades restantes), forma de pagamento detalhada (pix/parcelamento) — todos esses só existem na página pública
- **Limitações encontradas para uso no Dealism:**
  1. Sem SKU no banco, a identificação de produtos por código não é possível — depende de busca por nome.
  2. Descrições, tamanhos e estoque real só existem no site, exigindo scraping ou sincronização adicional caso o Dealism deva responder sobre esses pontos sem depender do site a cada consulta.
  3. Várias descrições de produtos no próprio site parecem ser texto genérico reaproveitado de outro produto (menções a marcas diferentes do título, ex.: "Miu Miu" descrito como "Gucci", "Balenciaga" descrito como "Dior", "Armani" descrito como "Calvin") — isso é uma fragilidade do conteúdo de origem que pode gerar respostas incorretas caso o Dealism repita literalmente o texto de descrição.
  4. `curl`/scraping direto do site é bloqueado (403); qualquer sincronização automatizada precisará simular navegador real.
  5. Preço, pix e parcelamento no banco nem sempre refletem a estrutura de desconto exibida no site — uma base de conhecimento fiel precisaria ler `price_original`/`price_discount` com cautela ou revalidar contra o site periodicamente.
