# PRIME CONTROL V1.4H — Prévia comercial compatível com GPTMaker (LAB)

Data: 08/10/2026. Escopo: **somente GABY LAB**. Sem alteração do GPTMaker nativo ou GABY OFICIAL.

## Origem e decisão
- A ferramenta GPTMaker `Buscar Produtos` ativa chama `gaby-lab-shadow-context-v1` com corpo `pergunta` + `cliente_id`. Esse destino **pode gravar** `bridge_product_context`, portanto não será chamado nesta POC.
- `V1.4G` já correlacionou com sucesso o último Story real no chat QA e escolheu a regra de training nativo de **pedir print**.
- V1.4H usa a mesma `probeStoryNativeBridgeOnce` (sem nova análise Gemini/JEV), autorizada apenas para o chat QA e a fingerprint histórica do Vans.
- Retorna um JSON de **prévia** com campos `sucesso, contexto, dados.resumo_disponibilidade, dados.produtos, dados.totalVariacoes, dados.variacoesRestantes, dados.informacao_adicional`, compatíveis por nome com os campos comerciais existentes.
- A prévia indica `BLOCK_ASSERTION`, `produtos:[]`, `tem_produtos:false`, training nativo `3F9C22DD0477D04D51EC72B5AF3F6A41`. Não há produto confirmado, preço, PIX ou estoque.

## Proteções
- Rota privada `POST /api/prime-control-gaby-tool-preview-v14h`, somente Render LAB, auth com header LAB já existente, flag `PRIME_CONTROL_GABY_TOOL_PREVIEW_ENABLED` inicialmente falsa, fingerprint permitida e confirm string.
- Aceita apenas `cliente_id` igual ao chat piloto real (config env) e pergunta exata `Qual o valor?`; não é solução geral para outras perguntas, pessoas ou novos Stories.
- Usa só GET da API GPTMaker através do resolvedor Vercel existente; sem chamada à Action comercial, sem writes Supabase, sem publicação, sem resposta Instagram, sem registro de imagem ou dados pessoais em logs.
- Uma única tentativa por processo e fingerprint. Falha -> fecha; **não** repassa automaticamente à função comercial atual.
- **Não alterar o URL da Action GPTMaker** para esta rota antes de nova homologação, pois ela aceita apenas um cenário QA histórico. Não confundir compatibilidade estrutural do JSON com prova de que o GPTMaker vai obedecer à regra em atendimento real.

## Próximo gate
Avaliar teste controlado do consumo dessa prévia pelo GPTMaker LAB e plano de rollback da Action, sem tráfego de cliente real. Antes de qualquer mudança, tratar follow-ups, mídia reenviada, Story novo, Story ausente e integridade do contexto comercial. Para perguntas não relacionadas a Story, manter o caminho nativo existente sem alterações.
