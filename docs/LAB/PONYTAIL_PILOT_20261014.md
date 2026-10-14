# Ponytail — piloto seguro do IGNITE PRIME V2 (2026-10-14)

## Origem e limites
- Fonte oficial: https://github.com/DietrichGebert/ponytail
- Revision fixada: `2961b52fc1fe6a5a87c7a959a79512e5c2f3ffe5`; licença MIT preservada em `docs/LAB/PONYTAIL_LICENSE_20261014.txt`.
- Escopo: APENAS branch `lab/ponytail-pilot-20261014` em `rafahenrique-prime/projeto-primeiro-codigo`.
- Habilidades copiadas: `ponytail` e `ponytail-audit`, para Claude Code (`.claude/skills/`) e Codex (`.agents/skills/`).
- Esta fase é SKILL-ONLY: não instala o plugin global, hooks Node, statusline ou injeção automática em todas as sessões.
- Não modificar `AGENTS.md`, `CLAUDE.md`, aplicações, APIs, bancos, secrets, Gaby oficial, Bagy/PRIME, Render, Vercel nem produção.
- Instruções locais de segurança, testes, compatibilidade, proteção dos dados e aprovação prevalecem se houver conflito com as recomendações de redução de código.

## Teste comparativo a executar depois, sem escrita
1. Abrir duas sessões independentes do mesmo modelo e mesmo checkout/snapshot dessa branch, sem plugins globais do Ponytail interferindo no grupo de controle.
2. Rodar UMA auditoria pontual, somente leitura, em módulo delimitado no repositório.
3. Controle: seguir instruções atuais da base; experimento: invocar `ponytail-audit` explicitamente.
4. Exigir evidência com arquivo/linha, risco concreto, proposta mínima e delimitação do que não foi checado.
5. Comparar tempo, tokens, achados relevantes confirmáveis, falsos positivos e risco. Não presumir economia com base no benchmark externo.
6. Nenhuma correção, merge para `render-lab`/`main`, deploy ou ativação global nesta fase.

## Condição para expandir
Somente depois de verificar benefícios reais, ausência de conflitos de regras e aprovação explícita para o próximo passo. Descartar piloto se não houver ganho claro.
