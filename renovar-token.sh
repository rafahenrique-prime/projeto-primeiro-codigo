#!/bin/bash
# renovar-token.sh — Atualiza o VITE_GPTMAKER_USER_TOKEN no .env.local
# Uso: ./renovar-token.sh              (lê token do clipboard)
#      ./renovar-token.sh <token>       (token como argumento)

ENV_FILE="$(dirname "$0")/.env.local"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Pega token do argumento ou clipboard
if [ -n "$1" ]; then
  TOKEN="$1"
else
  TOKEN=$(pbpaste 2>/dev/null)
fi

TOKEN=$(echo "$TOKEN" | tr -d '[:space:]"')

# Valida que é um JWT válido
if [[ ! "$TOKEN" == eyJ* ]] || [[ ${#TOKEN} -lt 100 ]]; then
  echo -e "${RED}❌ Token inválido no clipboard.${NC}"
  echo ""
  echo "Como obter o token:"
  echo "  1. Abra app.gptmaker.ai logado"
  echo "  2. Pressione Option+Cmd+U (código-fonte)"
  echo "  3. Cmd+F → pesquise: pageProps"
  echo "  4. Copie o valor de \"token\":\"eyJ...\" (só o eyJ...)"
  echo "  5. Rode novamente: ./renovar-token.sh"
  exit 1
fi

# Decodifica o exp do token
EXP=$(echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('exp','?'))" 2>/dev/null)

if [ -n "$EXP" ] && [ "$EXP" != "?" ]; then
  EXPDATE=$(date -r "$EXP" "+%d/%m/%Y %H:%M" 2>/dev/null)
  NOW=$(date +%s)
  HOURS_LEFT=$(( ($EXP - $NOW) / 3600 ))

  if [ "$EXP" -lt "$NOW" ] 2>/dev/null; then
    echo -e "${RED}❌ Este token já está expirado! Obtenha um novo no app.gptmaker.ai${NC}"
    exit 1
  fi
  echo -e "${YELLOW}⏰ Token expira em: $EXPDATE (${HOURS_LEFT}h restantes)${NC}"
fi

# Atualiza .env.local
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ .env.local não encontrado em: $ENV_FILE${NC}"
  exit 1
fi

sed -i '' "s|VITE_GPTMAKER_USER_TOKEN=.*|VITE_GPTMAKER_USER_TOKEN=$TOKEN|" "$ENV_FILE"

echo -e "${GREEN}✅ Token atualizado no .env.local!${NC}"
echo ""
echo "Próximos passos:"
echo "  • Reinicie o servidor: Ctrl+C → npm run dev"
echo "  • OU use o botão '🔑 Renovar Token' no sistema (sem restart)"
