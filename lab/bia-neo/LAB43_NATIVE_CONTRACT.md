# LAB-43 — contrato nativo GPT Maker / BIA NEO (pré-homologação)

**Data:** 2026-10-14. **Estado:** somente branch LAB; nenhuma configuração publicada no GPT Maker ou Supabase.

## Objetivo
Reaproveitar a ferramenta nativa **Buscar Produtos** e o contrato existente da Edge Function BIA, sem desenvolver um segundo mecanismo de busca, sem conectar GABY e sem ativar a Bagy V2.

## Interface prevista (NÃO configurar ainda)
- Agente: **BIA NEO experimental**, identidade a confirmar no workspace GPT Maker. Não usar um dos agentes GABY como substituto.
- Método: `POST` na URL da **Edge Function LAB isolada**; URL só pode ser definida depois de um deploy em projeto isolado, atualmente inexistente.
- Body JSON: `{"pergunta":"Tênis Vans bege 40"}`. O código também aceita `prompt`, porém prefira `pergunta`.
- Identidade: header `x-prime-agent-id` vinculado ao agente LAB; header `x-prime-bia-key` com segredo exclusivo de LAB (mínimo 48 caracteres). Nunca registrar ou entregar segredos no chat, frontend, GitHub ou treinamento do agente.
- JWT: confirmar suporte a Authorization de cliente servidor no GPT Maker **antes** de escolher `verify_jwt=true`; preferir JWT habilitado. Não desabilitar JWT só para contornar integração sem projeto isolado, revisão de credenciais e aprovação explícita.
- Segredos do servidor LAB: `PRIME_CONTROL_BIA_AGENT_ID`, `PRIME_CONTROL_BIA_LAB_READ_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (somente dentro do projeto de catálogo isolado).
- Fonte: cópia de catálogo fictício ou snapshot separado no LAB. O projeto PRIME CATÁLOGO LAB encontra-se inativo; não ativar ou migrar sem homologação e autorização.

## Resposta válida da ferramenta
```json
{
  "sucesso": true,
  "contexto": {
    "pergunta": "Tênis Vans bege 40",
    "source": "PRIME_SHADOW_READ_ONLY",
    "produtos_encontrados": 1,
    "produto_exato_confirmado": false,
    "preco_atual_verificado": false,
    "estoque_atual_verificado": false,
    "ultima_sincronizacao_mirror": "NAO_VERIFICADA"
  },
  "dados": {
    "produtos": [{
      "nome": "Tênis Vans Ultrarange Neo Bege",
      "marca": "Vans",
      "categoria": "Tênis",
      "imagem": "https://cdn.dooca.store/EXEMPLO-FICTICIO.jpg",
      "link": "https://www.primestoremen.com.br/EXEMPLO-FICTICIO",
      "confirmacao": "CANDIDATO_NAO_CONFIRMADO"
    }],
    "informacao_adicional": "Resultados apenas como candidatos."
  }
}
```
O exemplo acima é FICTÍCIO e não comprova existência de fotos nem preço/estoque atuais.

## Comportamento correto da BIA
- Mostrar apenas candidatos e no máximo cinco resultados; nome, marca, foto, URL direta (se válida) e mensagem de confirmação comercial pendente.
- **Nunca** dizer que tamanho/preço/estoque está disponível, nem classificar o produto como correspondência exata, com base nesse retorno.
- Quando cliente solicitar tamanho, registrar tamanho informado, sem alegar confirmação. Quando solicitar teto de preço, não filtrar pela tabela comercial antiga.
- Se `produtos=[]`, dizer que a busca não trouxe resultados; não afirmar que a loja não vende.
- Se erro HTTP, falha no schema, chave ou backend, não inventar resultado e não anunciar que verificou.
- Qualquer envio automático de imagem ou encaminhamento a humano depende de ferramenta real correspondente e confirmação de execução; nunca afirmar 'enviei'/'encaminhei' sem evidência.
- Respeitar o comportamento nativo do GPT Maker antes de implementar qualquer adaptador customizado.

## Evidência e limitações
- LAB-42: Deno 2.9.7 check passou; 11/11 cenários offline chamando o handler real passaram.
- LAB-43: testes adicionais do contrato no mesmo handler e CI devem ser inspecionados no GitHub Actions. **Não declarar sucesso até conclusão verde.**
- O conector GPTMaker atual lista apenas **Gabi teste**, **GABY OFICIAL** e **GABY LAB COMERCIAL**. **BIA NEO não está autorizada ao conector.** Portanto não é possível consultar a intention real, configurá-la, rodar “Teste sua IA” ou verificar como a plataforma autentica as chamadas.
- Nenhum deploy, nenhuma alteração no GPT Maker/GABY, no Supabase produção, no Render ou Bagy V2.
- A recuperação Bagy V2 continua para o fim, conforme escolha do usuário.

## Próximo gate externo
Liberar acesso legítimo à BIA experimental **ou** o mecanismo de teste nativo da BIA; confirmar que a ferramenta Buscar Produtos está cadastrada nela. Na sequência, com LAB isolado e identidade/headers autenticados, provar uma consulta ponta a ponta. Não usar GABY oficial nem testes em clientes reais.
