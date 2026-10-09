# GABY LAB V1.5A — Fix do cruzamento de Stories na função comercial

Data: 09/10/2026.

## Causa real comprovada
A Intention `Buscar Produtos` usa `gaby-lab-shadow-context-v1` (Supabase Edge v17). O payload GPTMaker só envia `pergunta` e `cliente_id`, **não** envia Story ID ou imagem. A função guarda `selected_product` durante 15 minutos e as rotas existentes para `requestedColor`, `requestedSize` e `isGenericFollowup` reutilizam o produto anterior e emitem `CONTEXTO CONFIRMADO`, mesmo se a última pergunta vier de outro Story. Caso real ST05 perguntou valor da calça mas recebeu camiseta Armani Exchange Branca.

## Fix de contenção na origem (V1.5A)
- Novo módulo puro `story-identity-gate.ts`, sem I/O, intercepta referências visuais `essa/dessa/desse/dela/do Story/foto/vídeo` e perguntas vagas `Qual o valor?`, `Tem 42?`, `Tem tamanho M?` etc. antes de carregar `getContext()` ou chamar o catálogo.
- Para pergunta não identificável: devolve `sucesso:true`, `produtos:[]`, `should_reuse_previous_product:false`, `requires_current_product_evidence:true`, sem inventar modelo/preço/link/estoque; recomenda usar mídia já disponível na conversa ou solicitar print/modelo.
- Para pergunta com produto especificado textualmente (ex: `Nike Dunk Low Panda 42`, `Air Jordan 4 Retro Black Cat`) mantém o fluxo da busca Shadow existente.
- Escopo: **somente a Edge Function da GABY LAB COMERCIAL**. O próprio usuário autorizou experimentar com essa agente e com seus poucos atendimentos reais. A GABY OFICIAL, Bagy, Supabase RLS e outros recursos não são modificados.
- Tradeoff aceito: mensagens genéricas em conversa comum também podem pedir confirmação do produto, ao invés de herdar memória. Essa é uma contenção segura enquanto não se passa o Story ID no payload. **Não é identificação visual automática nem correção completa da Gaby**, pois a IA pode ignorar resultado da ferramenta ou responder por memória.
- Nenhum histórico/SKU/cliente deve ser escrito na rota interceptada. A função segue guardada pelo header `x-prime-lab` existente.

## Segurança de rollout
- Backup fonte remoto da v17 em `supabase/backups/gaby-lab-shadow-context-v1-v17-20261009.ts`. Para reverter, redeploy dessa fonte original na Edge com `verify_jwt=false` (valor original).
- Testes Vitest cobrem 6 padrões dos Stories reais, consultas genéricas sem Story, perguntas explícitas preservadas e contrato `produtos:[]`. CI branch `render-lab` antes de implantar.
- Deploy Supabase da Edge existente somente depois de CI PASS. Confirmar versão posterior por `get_edge_function` e testar se possível via chamada autenticada LAB, sem enviar mensagens de cliente.
- Não mude a Intention GPTMaker por enquanto: ela já aponta à Edge atual. Não precisa do Operator nem desconectar Instagram.
