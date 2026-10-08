# PRIME CONTROL V1.4F — roteamento nativo antes de nova IA

Data: 2026-10-08. Ambiente: `render-lab`. Escopo: GABY LAB COMERCIAL, sem GABY OFICIAL, sem integrações de saída.

## Evidências homologadas (não repetir)
- Correlação Story real / GPTMaker QA: V1.4C `FOUND`.
- Media Bridge de imagem privada: V1.4D `MEDIA_VERIFIED`.
- Gemini inicial: `VISION_PARSED`, Vans “Ultra Range” bege/marrom, 1 chamada real.
- Shadow: `Tênis Vans Ultrarange Neo | Bege`, **candidato** — não é prova de que a foto representa exatamente a versão Neo.
- JEV: `BLOCK_ASSERTION` e `confidence=0.06` na execução real.
- Visual Match: `C1`, autoconfiança declarada pelo Gemini de **0.90**, abaixo da exigência de **0.95**; `VISUAL_UNCERTAIN`.

## Encontrado no GPTMaker pelo conector de leitura
- Training existente `3F9C22DD0477D04D51EC72B5AF3F6A41`: **Story, modelo não confirmado, pedir print**. Seu texto orienta uma pergunta curta sem preço/estoque nem invenção.
- Training existente `3F90779F309300BCD5BD426E229A42AC`: **níveis HIGH / MEDIUM / LOW** para Story/fotos, com orientações de esclarecimento.

Não criar outra IA, webhook de resposta, training duplicado ou prompt comercial novo neste momento. A listagem do conector comprova os textos de training cadastrados, **não comprova execução em atendimento real**. Os dois treinamentos podem exigir uma revisão futura de precedência/confiança e exibição de Pix; não alterar sem homologação.

## Contrato de encaminhamento
- Se é um Story do chat piloto e **não está comprovado o modelo exato**, apontar para a regra **nativa de pedir print**, sem enviar mensagens por este módulo.
- Se uma imagem/print já foi reenviada pelo cliente, **não pedir o mesmo print repetidamente**; selecionar orientação de 1 detalhe útil, ligada ao training nativo de confiança.
- Só encaminhar para tratamento de **produto confirmado** quando há prova de SKU exato, consulta Shadow válida, Visual Match >= .95, **e** JEV `ALLOW_AUTO`. Um único escore visual ou nome de catálogo não basta. Preço, Pix e estoque seguem verificações próprias.
- Se o Story não foi correlacionado, usar atendimento nativo padrão; nunca inventar o contexto Story.
- Isolar todas as decisões ao GABY LAB; nenhuma mudança em `main`, production webhooks, GABY OFICIAL, Bagy ou Supabase.

## Testes
A função pura `api/_primeControlStoryNativePolicyV14f.js` representa um **contrato de política**, não uma integração já conectada ao GPTMaker.
`simulateNativeFallbackScenarios()` executa cenários determinísticos sem I/O, modelos, custos, alterações de treinamentos ou mensagens ao cliente.
O CI verifica as decisões, a exclusão da produção e a ausência de preço/estoque não autorizado.

## Próximo gate
Testar em **atendimento QA real** se a GABY LAB, usando seus próprios trainings já cadastrados, produz a pergunta de print adequada quando o modelo exato está incerto — somente com fluxo nativo e isolamento comprovado. Caso a resposta real não respeite o treinamento, diagnosticar precedência no próprio GPTMaker antes de implementar outro serviço.
