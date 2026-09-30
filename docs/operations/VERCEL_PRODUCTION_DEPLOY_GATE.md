# Vercel Production Deploy Gate

Aplicação: IGNITE PRIME / `ignite-webhook`
Projeto Vercel: `prj_apJGLxIL6ooCFTCuboQiHwuveOw9`

## Regra operacional

Após qualquer merge em `main`:

1. Ler o SHA final do merge no GitHub.
2. Procurar um deployment Vercel de produção com:
   - `githubCommitRef=main`
   - `githubCommitSha=<SHA do merge>`
   - `target=production`
3. Até 3 minutos sem deployment correspondente: considerar atraso transitório; não intervir.
4. Entre 3 e 5 minutos: continuar observando; não criar commit artificial.
5. Após 5 minutos sem deployment do mesmo SHA: tratar como anomalia GitHub → Vercel.
6. Antes de qualquer ação manual, confirmar:
   - o SHA está realmente no topo de `main`;
   - não existe deployment já criado em QUEUED/BUILDING;
   - não houve ignore/skip por configuração.
7. Se continuar ausente, preferir deploy manual do SHA exato. Nunca criar commit vazio apenas para forçar deploy.

## Evidência que originou esta regra

Em 2026-09-30, o commit `58202407d372d7dc7e966d6f5fa4020cc228d18b` entrou em `main` e o deployment automático demorou cerca de 2 minutos para ser criado. Após a criação, o build iniciou normalmente e chegou a `READY` sem erro.

Conclusão: atraso de criação do deployment pode acontecer sem indicar falha de build ou configuração.
