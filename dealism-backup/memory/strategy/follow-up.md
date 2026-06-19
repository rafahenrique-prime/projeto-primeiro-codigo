
### 2026-05-06 [follow-up-30min-personalizado] [chat]
**chunk_id**: ed9ea74348f24847b89feadcfbfdc4f9
**file_path**: strategy/follow-up.md
**content_hash**: 17b76689076997b83f8c04c8dfc26fc8bd9f80a9c81bff0d308c815f4f9d2e74
**category**: strategy
**content_category_tags**: follow_up_strategy
**source_type**: text
**strategy**: Follow-up personalizado por categoria após 30min de inatividade
**scenario**: Quando o cliente demora 30 minutos ou mais para responder após demonstrar interesse em algum produto
**product_or_service**: general
**asset_path**: workspace/unknown
**script**: Oi! O [nome do produto] que você viu ainda está disponível no tamanho [X]! Quer garantir o seu? Os itens mais procurados costumam esgotar rápido. Qual sua numeração?

**INSTRUÇÕES:**
1. Identificar qual tipo de produto o cliente demonstrou interesse
2. Enviar mensagem apropriada para aquela categoria
3. Personalizar com nome do produto e tamanho/numeração quando disponível

---

**CATEGORIA: TÊNIS**
Produtos: New Balance, Vans, Nike, Adidas, qualquer tênis

**Script:**
"Oi! 😊

O [nome do tênis] que você viu ainda tem na numeração [X]!

Quer garantir o seu? Os números mais procurados costumam esgotar rápido 👟"

Variações:
- Se não souber numeração: "O [tênis] que você perguntou ainda tá disponível! Qual sua numeração?"
- Se múltiplas numerações: "Temos do 34 ao 43. Qual o seu número?"

---

**CATEGORIA: ROUPAS**
Produtos: Camisetas, calças, moletons, shorts, bermudas, jaquetas

**Script:**
"Oi! 😊

A [camiseta/calça/moletom/jaqueta] que você viu ainda tem no tamanho [P/M/G/GG]!

Qual tamanho você usa? Já deixo separado pra você 👕"

Variações:
- Se não souber tamanho: "Qual tamanho você geralmente usa?"

---

**CATEGORIA: CUECAS**
Produtos: Cuecas Calvin Klein / Tommy Hilfiger

**Script:**
"Oi! 😊

As cuecas [Calvin Klein/Tommy Hilfiger] que você viu ainda tão disponíveis!

Temos M, G e GG. Qual tamanho você usa? 👔

Vale muito a pena o combo 4 unidades por R$ 100!"

---

**CATEGORIA: ACESSÓRIOS**
Produtos: Bonés, óculos, carteiras, cintos, chinelos, relógios, correntes

**Script:**
"Oi! 😊

O [boné/óculos/item] que você viu ainda tá disponível!

Quer garantir o seu? 🧢"

---

**CATEGORIA: GENÉRICO (fallback)**
Quando usar: Cliente apenas disse "oi", navegou sem perguntar produto específico, ou conversou mas não ficou claro o interesse

**Script:**
"Oi! 😊

Ficou com alguma dúvida sobre os produtos?

Tô aqui pra ajudar no que precisar! 💬"

---

**⚠️ REGRA DE SEGURANÇA CRÍTICA:**
**Se produto mencionado não estiver cadastrado na base de conhecimento, SEMPRE usar fallback genérico ao invés da mensagem personalizada.**

Não prometa produto que não está confirmado na base de dados.

---

**REGRAS IMPORTANTES:**
- ✅ SEMPRE personalizar com nome do produto quando possível
- ✅ SEMPRE mencionar tamanho/numeração quando souber
- ✅ Usar emoji apropriado (👟 tênis, 👕 roupa, 🧢 acessórios)
- ✅ Tom amigável e prestativo
- ❌ NUNCA ser genérico quando souber o produto
- ❌ NUNCA pressionar demais
- ❌ NUNCA mencionar produto não cadastrado

### 2026-05-06 [follow-up-23h45-audio] [chat]
**chunk_id**: afedc59cd1804a6bacfd24be7b845bb6
**file_path**: strategy/follow-up.md
**content_hash**: cd4212eeda0cdf13be672a8d8dacd7c62960c8b9d612686824199dcd8a4b440f
**category**: strategy
**content_category_tags**: follow_up_strategy
**source_type**: text
**strategy**: Follow-up em ÁUDIO após 23h45min de inatividade
**scenario**: Quando o cliente demonstrou interesse em algum produto mas ficou 23h45min sem responder
**format**: ÁUDIO (única exceção - todas as outras mensagens são texto)
**script_audio**: "Consegui uma condição especial pra você naquele produto que você demonstrou interesse. Posso te enviar os detalhes?"
**product_or_service**: general
**asset_path**: workspace/unknown
**script**: [Enviar áudio com voz feminina amigável] Oi! Passando para ver se você conseguiu ver o que conversamos e se ficou com alguma dúvida. Estou à disposição!

IMPORTANTE:
- Este é o ÚNICO momento em que o agente envia áudio
- Usar text_to_speech com voz feminina e tom amigável/cheerful
- Enviar após exatamente 23h45min de silêncio
- Após enviar o áudio, aguardar 15 minutos
- Se cliente NÃO responder em 15min → enviar automaticamente a mensagem de texto de 24h
- Se cliente RESPONDER → enviar a mensagem de texto de 24h imediatamente

### 2026-05-06 [follow-up-24h-condicao-especial] [chat]
**chunk_id**: e90f1e452a8f4b63960e57288f149b16
**file_path**: strategy/follow-up.md
**content_hash**: 7bddf828690096150dcb40cce7dff245b1aa50077b835b61ad3880675bfed022
**category**: strategy
**content_category_tags**: follow_up_strategy
**source_type**: text
**strategy**: Follow-up com condição especial após áudio de 23h45min
**scenario**: Enviado 15 minutos após o áudio de 23h45min (independente de resposta) OU imediatamente se cliente responder
**format**: TEXTO
**script**: "Oi! Sou eu, Gabriela 😊
**product_or_service**: general
**asset_path**: workspace/unknown

Passando aqui pra te dar uma ajudinha: consegui liberar uma CONDIÇÃO ESPECIAL pra você no(a) [NOME DO PRODUTO] que você viu ontem.

Se ainda tiver interesse, posso aplicar pra você agora mesmo! 😉

Me chama aqui que já te ajudo a finalizar!"

IMPORTANTE: 
- Substituir [NOME DO PRODUTO] pelo produto específico que o cliente demonstrou interesse
- Enviar automaticamente 15min após o áudio (se cliente não respondeu) OU imediatamente (se cliente respondeu)
- Ser educado, amigável e natural
- Criar leve senso de urgência sem pressionar
- "Condição especial" = flexibilidade para negociar (desconto, parcelamento especial, brinde, etc.)
- Não especificar % de desconto na mensagem inicial
- Sempre se apresentar como "Sou eu, Gabriela" no início da mensagem
- Se cliente perguntar sobre a condição, pode oferecer desconto de até 10% ou outra vantagem

### 2026-05-06 20:05 [onboarding-history]
**chunk_id**: c6e94d02c6f64c8ba6125aba5c349a95
**file_path**: strategy/follow-up.md
**content_hash**: adf82333759e868b4c08d49128f67be0907f8078c6672535599fb2161072a15e
**category**: follow_up_strategy
**content_category_tags**: follow_up_strategy
**strategy**: Avisar quando chegar o tamanho
**scenario**: Quando o tamanho desejado está esgotado mas há previsão de reposição
**script**: Quando chegar mais você me fala. Sexta chega mais? Aí já passo aí pra ver no corpo.
**product_or_service**: general
**source_type**: text
**asset_path**: workspace/unknown

**Notificação proativa de reposição**


### 2026-05-06 20:07 [onboarding-history]
**chunk_id**: ded4b07bff434eddb740764ed7bb7c58
**file_path**: strategy/follow-up.md
**content_hash**: b0783feb158ff786d487ea2b25533ec919e8ab0653e39910cede65e8af266d1c
**category**: follow_up_strategy
**content_category_tags**: follow_up_strategy
**strategy**: Aguardar retorno pós-compromisso
**scenario**: Quando o cliente menciona que está saindo (almoço, reunião) e voltará depois
**script**: Sem problemas! Estarei aqui quando você voltar. Aproveite o almoço! 😊
**product_or_service**: general
**source_type**: text
**asset_path**: workspace/unknown

**Aguardar retorno do cliente após compromisso**
Cliente indica que está saindo para almoço e retornará depois. Momento ideal para aguardar pacientemente e estar disponível quando o cliente voltar, sem pressionar.

### 2026-05-06 20:14 [onboarding-history]
**chunk_id**: 0b167ae92b804c05867d6ddc679708ed
**file_path**: strategy/follow-up.md
**content_hash**: 5b8aec8c4e45278d2cd0f95f2b51597a4f8762d5f1a6778a76f66b9f081243d6
**category**: follow_up_strategy
**content_category_tags**: follow_up_strategy
**strategy**: Aviso proativo de chegada
**scenario**: Quando produto encomendado chega na loja
**script**: ola boa tarde! ja chegou a sandalia se quiser vim exprimentar e pegar ela!
**product_or_service**: sandália
**source_type**: text
**asset_path**: workspace/unknown

**Notificar chegada de produto**
Avisar proativamente quando produto chega ('ja chegou a sandalia se quiser vim exprimentar') gera senso de urgência e facilita conversão.
