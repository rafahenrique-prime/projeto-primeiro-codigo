# PRIME Comissões V1 — LAB (09/10/2026)

## Escopo desta entrega (PR #156, base `render-lab`)
- Menu Comissões no IGNITE PRIME: Painel, Parceiras e Fechamentos.
- Filtros por mês e parceira; cada pedido apresenta data, valor, taxa congelada na venda, comissão e estado.
- Cadastro e edição de taxa por parceira (porcentagem de 0 a 100, inclusive frações).
- Fechamentos por mês; CSV (compatível com Excel) e layout de impressão para **Salvar como PDF** com logo já existente na pasta `public/`.
- Utilitário testável com cálculo em centavos e totais separados: prevista / aprovada / paga / restante aprovada.
- **Somente dados fictícios na memória da sessão**, sem persistência. Não usar dados reais de Josi ou clientes no repositório público.

## Guardrails
- Não mesclar em `main`, não alterar Gaby oficial, não tocar integrações produtivas, não escrever no Supabase real.
- Mudança na taxa afeta apenas novas vendas; `rateAtSale` permanece nos pedidos históricos.
- Cancelados excluídos dos totais. Pedidos em `a_conferir` não viram valor aprovado para pagamento.
- Contas de comissão: arredondar ao centavo por pedido; total do mês é soma das comissões por pedido, não somente percentual sobre soma bruta.
- Status `paga` no LAB é **simulação**, não comprovante bancário.
- O navegador imprime/gera PDF via caixa de impressão. Ainda **não** há download PDF automatizado do servidor.
- Link privado da influenciadora **não** foi criado. Isso exige autenticação, escopo por parceira e teste da RLS.

## Fonte esperada e importação
1. Checar se a Bagy possui API/exportação nativa para relatório por cupom e histórico de pagamentos.
2. Se não houver, aproveitar o fluxo já usado pelo INSTINCT para consultar periodicamente a interface da Bagy.
3. A rotina diária deverá salvar **um log por ciclo**, inclusive se detectar zero mudanças; payload com timestamp, fonte, status, quantidade lida, novos, alterados, erros e hash/resumo.
4. Pedidos reais precisam de identificador único estável, cupom normalizado, `partner_id`, data da venda, receita elegível em centavos, valor de desconto, frete, situação de pagamento, situação de pedido e taxa histórica.
5. **Idempotência:** `UNIQUE(source, external_order_id)`, upsert apenas após conciliar com o status do último ciclo. Não duplique pedidos.
6. Definir com Rafael antes da comissão final se a coluna `Receita` da Bagy já exclui frete, e em que status uma venda se torna elegível.
7. Persistência no Supabase só após definir projeto/banco de LAB e revisar RLS por papel. Nunca expor service-role ou segredo no frontend.
8. Portal público exige autenticação de link individual com expiração/revogação, isolamento por parceira, limite de tentativas e ausência de dados pessoais dos compradores.
9. Taxa configurável precisa de vigência e trilha de auditoria. Fechamento aprovado precisa de snapshot imutável e reversões rastreáveis.

## Dados da Josi que motivaram o projeto — fora do código do LAB
- Fonte fornecida pelo usuário: Bagy > Relatórios > Vendas por cupom > JOSIMORETTO.
- Agosto/2026: 0 vendas. Setembro/2026: 3 vendas; receita reportada R$ 1.131,74; desconto total R$ 150,90.
- 10% sobre receita reportada = R$ 113,17 **preliminar**, sem validar status de pagamento/frete.
- Print detalhado com dias 06/09, 24/09 e 26/09 (o resumo verbal anterior citou 2 vendas em 24/09; o detalhamento deve prevalecer após checagem).
- Outubro: há pedido observado em 06/10, não incluido no primeiro fechamento.

## Próxima aprovação
- Validar `npm run build` e `npm test -- --run` ou GitHub CI.
- Após CI, revisar a interface em branch isolada e aprovar merge controlado no `render-lab` (auto-deploy Render).
- No LAB, seguir com integração real somente após confirmação do mecanismo nativo Bagy/INSTINCT e estrutura segura de persistência.
