# WhatsApp Premium — Envio de mensagens de cobrança

**Data da implantação:** 2026-07-29
**Commits:**
- `5493a91` — feat: adiciona fluxo premium de envio por WhatsApp em cobranças
- `2fead88` — fix: evita duplicatas e isola testes de catálogo da produção (correção não relacionada ao WhatsApp, implantada na mesma sessão/deploy)

**Deploy:** projeto Vercel `ignite-webhook` (`https://ignite-webhook.vercel.app`), Production, via clone temporário limpo de `origin/main` (não a partir da pasta local de trabalho, que continha alterações não commitadas de outras funcionalidades).

---

## 1. Objetivo

Permitir o envio de mensagens de WhatsApp para clientes em cobrança diretamente do painel Cobranças do IGNITE PRIME, com duas opções:

- **Mensagem pronta** — usa um template oficial do PRIME Cobranças (dados de cliente/parcela resolvidos pelo backend, nunca calculados no frontend), com prévia editável antes do envio.
- **Mensagem personalizada** — texto livre, delegado 100% ao fluxo legado já existente (`EnviarMensagemManualModal.jsx`), sem nenhuma alteração nele.

## 2. Arquitetura final

```
Botão WhatsApp
(ClientesEmCobrancaTab.jsx / ParcelasTab.jsx / CobrancasPage.jsx → ClientesTab)
        ↓
WhatsAppSendModal.jsx
   ├─ "Mensagem pronta"       → escolhe parcela (se >1) → escolhe template
   │                            (listar_templates) → prévia editável
   │                            (previsualizar) → "Enviar WhatsApp"
   └─ "Mensagem personalizada" → delega 100% pro EnviarMensagemManualModal.jsx
                                  (componente legado, intocado)
        ↓
src/services/crm/cobrancasService.js
   listarTemplatesWhatsapp() / previsualizarMensagemWhatsapp() / enviarMensagemManual()
        ↓
POST /api/system-tools?tool=mensagem-manual
   (dispatcher: Origin allowlist + rate-limit por IP, delega ao helper privado)
        ↓
api/_mensagemManualProxy.js
   - validarPayloadListarTemplates / validarPayloadPrevisualizar / validarPayloadMensagemManual
     (allowlist estrita de campos — nunca aceita telefone, template_key livre,
     vendedor ou qualquer dado financeiro vindo do navegador sem validação)
   - chamarListarTemplates() / chamarPrevisualizarMensagem() / chamarEnviarMensagemManualWhatsapp()
     (mesma URL/token/timeout — modo_teste definido só server-side)
        ↓
enviarMensagemManualWhatsapp (Base44 Function, app PRIME STORE - COBRANÇAS)
        ↓
whatsappProvider (Base44) → ZAP-API → WhatsApp do cliente
```

**Princípio de reaproveitamento:** o envio de fato (`chamarEnviarMensagemManualWhatsapp`) já existia antes desta fase e não foi alterado — o Fluxo H só adicionou dois vizinhos (`chamarListarTemplates`/`chamarPrevisualizarMensagem`) que reaproveitam a mesma URL, o mesmo token de serviço (`MENSAGEM_MANUAL_SERVICE_TOKEN`) e o mesmo timeout, interceptados **antes** da validação de envio via um campo `acao` no corpo da requisição (`listar_templates` / `previsualizar` / ausente-ou-`enviar`). Nenhuma nova Function pública foi criada no Base44; nenhum novo endpoint Vercel foi criado (reaproveita `api/system-tools.js`, dentro do limite de 12 Functions do plano Hobby).

## 3. Fluxo completo

1. Usuário clica no ícone de WhatsApp num card de cliente ou parcela.
2. `WhatsAppSendModal.jsx` abre mostrando nome do cliente e telefone mascarado.
3. **Mensagem pronta:** se houver mais de uma parcela, escolhe qual; em seguida `listarTemplatesWhatsapp()` busca os templates disponíveis (badges "Recomendado"/"Pagamento" são só rótulo visual, nunca decidem nada de negócio).
4. Ao escolher um template, `previsualizarMensagemWhatsapp({ clienteId, parcelaId, templateKey })` busca o texto renderizado, com valor e vencimento resolvidos pelo backend (nunca recalculados no cliente).
5. O texto vem para um `<textarea>` editável — o usuário pode alterar livremente antes de enviar.
6. Um novo `request_id` (UUID v4, `crypto.randomUUID()`) é gerado a cada prévia carregada — nunca reaproveita idempotency key de uma tentativa anterior.
7. Ao clicar "Enviar WhatsApp": trava local contra clique duplo (`enviandoRef.current`), estado de loading ("Enviando..."), chamada a `enviarMensagemManual({ clienteId, textoMensagem, requestId })` com o texto **exatamente como editado** (nunca recalculado a partir do template no momento do envio).
8. Sucesso → mensagem de confirmação, botão vira "Fechar". Erro → mensagem amigável (mapeada por `error_code`, nunca expõe detalhe técnico cru), texto editado preservado, botão reabilitado.
9. **Mensagem personalizada** segue o pipeline legado, sem nenhuma mudança: mesmo componente (`EnviarMensagemManualModal.jsx`), mesmo `enviarMensagemManual`.

## 4. Arquivos envolvidos

| Arquivo | Papel | Alterado nesta fase? |
|---|---|---|
| `src/components/cobrancas/WhatsAppSendModal.jsx` | Modal novo — escolha de fluxo, seleção de parcela/template, prévia editável | Novo |
| `src/components/cobrancas/EnviarMensagemManualModal.jsx` | Modal legado de mensagem personalizada | Não alterado (só passou a ser aberto de dentro do novo modal) |
| `src/services/crm/cobrancasService.js` | `listarTemplatesWhatsapp`, `previsualizarMensagemWhatsapp`, `enviarMensagemManual` (pré-existente) | Sim — 2 funções novas + `postMensagemManualTool` (helper compartilhado) |
| `api/system-tools.js` | Dispatcher — `case 'mensagem-manual'`, roteia por `acao` | Sim — 2 ramos novos (`listar_templates`/`previsualizar`), envio pré-existente intocado |
| `api/_mensagemManualProxy.js` | Helper privado — validação de payload, chamada HTTP ao Base44, filtragem de resposta | Sim — 2 funções novas (`chamarListarTemplates`/`chamarPrevisualizarMensagem`) + as já existentes |
| `src/pages/CobrancasPage.jsx` | Header, abas, cards de totalizadores, ponto de montagem do modal para a aba Clientes | Sim — redesign visual completo (dependência necessária para expor o botão de WhatsApp) |
| `src/components/cobrancas/ClientesEmCobrancaTab.jsx` | Lista de clientes em cobrança, botão de WhatsApp por linha | Sim — redesign visual completo |
| `src/components/cobrancas/ParcelasTab.jsx` | Lista de parcelas agrupadas por criticidade, botão de WhatsApp por card | Sim — redesign visual completo |

## 5. Validação realizada

**Ambiente:** produção real (`https://ignite-webhook.vercel.app`), deploy limpo do commit `2fead88` (confirmado pelo rodapé da própria aplicação: `prod · 29/07 · 2fead88`).

**Cliente de teste usado:** RAFAEL TESTE, telefone mascarado `34*****1296` — cliente explicitamente identificado como teste (valor simbólico, R$ 1,01). Nenhuma mensagem real foi enviada a clientes reais durante a validação.

| Item | Resultado |
|---|---|
| Página de Cobranças abre, redesign renderiza | ✅ |
| Botão de WhatsApp abre o modal, cliente/telefone corretos | ✅ |
| Opções "Mensagem pronta" / "Mensagem personalizada" aparecem | ✅ |
| Templates carregam do backend real | ✅ (2 templates: Lembrete Automático, Pagamento Confirmado) |
| Prévia gerada com valor/vencimento corretos | ✅ |
| Texto editável (inserir + remover 1 caractere, texto final idêntico) | ✅ |
| Envio de mensagem pronta (1 clique) | ✅ — HTTP 200, "Mensagem enviada com sucesso" |
| Envio de mensagem personalizada (1 clique) | ✅ — HTTP 200, "Mensagem enviada com sucesso." |
| Confirmação de recebimento no WhatsApp de teste | ✅ (confirmado pelo usuário) |
| Console do navegador sem erros | ✅ |
| Rede sem duplicidade de requisição (1 POST de envio por clique) | ✅ |
| Proteção contra clique duplo | Confirmada por revisão de código (`enviandoRef.current` + dedup por `request_id` no backend); não forçada por clique duplo real em produção para não arriscar duplicar o envio ao contato de teste |

## 6. Limitações conhecidas

- **Rate-limit e dedup de `request_id` são best-effort, em memória do processo** — resetam a cada cold start da função serverless, não são compartilhados entre instâncias/regiões da Vercel. Mesma limitação já documentada para o restante do módulo Cobranças (Fluxo F.1).
- **Autenticação é só por Origin exata**, sem sessão de usuário real (o CRM não tem login hoje) — mesma limitação estrutural do restante do projeto.
- **"Mensagem pronta" não envia o Pix Copia e Cola** — o template atual (`Lembrete Automático`) menciona "Na próxima mensagem enviaremos o Pix Copia e Cola", mas esse envio automático de Pix não está implementado nesta fase (ver Pendências Futuras).
- **Edição de texto não foi validada por clique de teclado real durante a automação de testes** — validada por simulação de evento de input equivalente e por revisão de código (`<textarea>` React controlado padrão); comportamento correto, mas a lacuna de ferramenta de teste fica registrada por transparência.
- **Templates disponíveis são só 2** (`Lembrete Automático`, `Pagamento Confirmado`) — biblioteca de templates gerenciada inteiramente do lado do Base44, fora do controle direto deste frontend.
- **Deploy foi feito via CLI (`vercel --prod`) a partir de um clone limpo**, não pela integração Git nativa da Vercel — não há metadado de commit anexado automaticamente ao deployment na Vercel (confirmado só pelo rodapé da própria aplicação, que lê o hash do build).

## 7. Pendências Futuras

- **Limpeza do projeto Vercel órfão `deploy-clean`** — criado por engano durante a correção do vínculo de deploy desta sessão (antes de vincular corretamente ao projeto `ignite-webhook`), publicado em `deploy-clean-neon.vercel.app`. Não afeta produção, mas segue pendente de remoção mediante confirmação explícita do usuário.
- **Integração futura do Pix Copia e Cola** — o template "Lembrete Automático" já menciona o envio do Pix numa mensagem seguinte, mas esse envio automático ainda não existe; avaliar se entra no mesmo pipeline (`mensagem-manual`) ou como fluxo separado.
- **Melhorias futuras de templates** — hoje só 2 templates disponíveis, geridos inteiramente no Base44; avaliar necessidade de mais variações (ex.: cobrança crítica, segundo lembrete) e se o CRM deve ganhar alguma visibilidade/gestão sobre a biblioteca de templates.
- **Migração da chave Base44 exposta no frontend** (`cobrancasService.js`) — dívida técnica de segurança pré-existente, já documentada em `docs/ARCHITECTURE.md` (seção 8, item 10) e não relacionada ao WhatsApp Premium em si, mas relevante para qualquer evolução futura deste módulo.
