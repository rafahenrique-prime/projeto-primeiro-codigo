# 🚀 AWS REKOGNITION - QUICK START

## ⚡ COMEÇAR EM 1 HORA

Siga este checklist passo-a-passo:

---

## 📋 PASSO 1: CRIAR CONTA AWS (5 minutos)

- [ ] Abrir: https://aws.amazon.com/free/
- [ ] Clique: "Create a free account"
- [ ] Preencha email e senha
- [ ] Preencha informações pessoais
- [ ] **⚠️ IMPORTANTE: Adicione cartão de crédito** (não será cobrado!)
- [ ] Confirme email enviado pela AWS
- [ ] Faça login no Console AWS

**Verificar:** Você consegue ver "AWS Management Console"?

---

## 📋 PASSO 2: CRIAR CREDENCIAIS IAM (10 minutos)

Siga exatamente assim:

**1. Abrir IAM**
```
Dashboard AWS → Procure "IAM" → Clique
```

**2. Criar usuário**
```
IAM Menu → Users → Create User
Username: photo-recognition-user
→ Next
```

**3. Adicionar permissão**
```
Attach policies directly
→ Procure: "AmazonRekognitionFullAccess"
→ Selecione a checkbox
→ Next
→ Create user
```

**4. Criar Access Keys**
```
Clique no novo usuário
→ Security credentials
→ Create access key
→ Application running on an AWS compute service
→ Create access key
```

**5. ⚠️ COPIAR CHAVES AGORA!**

```
Access Key ID:     AKIA... (copie!)
Secret Access Key: zX7k... (copie!)

SALVE ISSO EM UM LUGAR SEGURO!
```

**Verificar:** Você tem 2 chaves copiadas?

---

## 📋 PASSO 3: CONFIGURAR .env (5 minutos)

**1. Abrir arquivo .env**

Na raiz do projeto, abra ou crie `.env`:

```bash
# Encontre ou crie:
/Users/macbook/Downloads/PROJETO\ DO\ CLAUDECODE/.env
```

**2. Adicionar credenciais**

```bash
# AWS Rekognition
VITE_AWS_ACCESS_KEY=AKIA...coleiaqui...
VITE_AWS_SECRET_KEY=zX7k...coleiaqui...
VITE_AWS_REGION=us-east-1
```

**3. Salvar arquivo**

```
⚠️ NÃO COMMIT NO GIT!
Adicione ao .gitignore:
.env
.env.local
```

**Verificar:** As 3 linhas estão no .env?

---

## 📋 PASSO 4: INSTALAR DEPENDÊNCIAS (5 minutos)

**1. Terminal**

```bash
cd /Users/macbook/Downloads/PROJETO\ DO\ CLAUDECODE
npm install aws-sdk node-fetch
```

**2. Aguardar**

```
npm baixará os pacotes (~1-2 min)
```

**3. Verificar**

```bash
npm list aws-sdk
# Deve mostrar: aws-sdk@2.x.x ✅
```

**Verificar:** Instalou sem erros?

---

## 📋 PASSO 5: RODAR BACKEND (10 minutos)

**Opção A: Terminal separado (RECOMENDADO)**

```bash
# Terminal 1: Seu app Vite
cd /Users/macbook/Downloads/PROJETO\ DO\ CLAUDECODE
npm run dev

# Terminal 2: Backend AWS
node aws-backend-example.js
```

**Opção B: Integrar ao seu servidor**

Se tiver servidor Express, adicione:

```javascript
// No seu server.js
import awsBackend from './aws-backend-example.js'
app.use(awsBackend)
```

**Verificar:** Você vê "🟠 AWS Rekognition Backend"?

---

## 📋 PASSO 6: TESTAR (5 minutos)

**1. Abrir outro terminal**

```bash
# Terminal 3: Testes
cd /Users/macbook/Downloads/PROJETO\ DO\ CLAUDECODE
```

**2. Testar conexão**

```bash
curl http://localhost:3001/api/test
```

Esperado:
```json
{
  "status": "ok",
  "message": "Backend AWS Rekognition rodando!"
}
```

**3. Testar credenciais**

```bash
curl http://localhost:3001/api/status
```

Esperado:
```json
{
  "aws": {
    "configured": true,
    "accessKeyConfigured": true,
    "secretKeyConfigured": true,
    "region": "us-east-1"
  }
}
```

**4. Testar análise (com uma URL real)**

```bash
curl -X POST http://localhost:3001/api/analyze-photo \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Nike_shoe_ad_in_1998.jpg/440px-Nike_shoe_ad_in_1998.jpg"
  }'
```

Esperado:
```json
{
  "success": true,
  "provider": "aws_rekognition",
  "labels": [
    { "description": "Shoe", "confidence": 98 },
    { "description": "Footwear", "confidence": 95 },
    ...
  ],
  "processingTime": 1247
}
```

**Verificar:** Recebeu resposta com labels?

---

## 📋 PASSO 7: INTEGRAR AO SEU SISTEMA (15 minutos)

**1. Editar photoFlowService.js**

Encontre esta linha:

```javascript
// Em: src/services/photoFlowService.js
// Linha ~5:
import { recognizePhoto } from './photoRecognitionService'
```

Adicione acima:

```javascript
async function analyzeImageWithAWS(imageUrl) {
  const response = await fetch('/api/analyze-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  })

  if (!response.ok) {
    throw new Error(`AWS API error: ${response.status}`)
  }

  const data = await response.json()

  if (!data.success) {
    throw new Error(data.error)
  }

  return {
    provider: 'aws_rekognition',
    labels: data.labels,
    objects: data.labels, // Mesmo objeto para compatibility
    text: data.text || '',
    colors: [],
    raw: data,
  }
}
```

**2. Trocar a função de reconhecimento**

Encontre:

```javascript
// Linha ~60:
async function analyzeImage(imageUrl, provider = DEFAULT_PROVIDER) {
  ...
  switch (provider) {
    case PROVIDERS.GOOGLE_VISION:
      return await analyzeWithGoogleVision(imageUrl)
    ...
```

Adicione:

```javascript
    case PROVIDERS.AWS_REKOGNITION:
      return await analyzeImageWithAWS(imageUrl)
```

**3. Trocar o provedor padrão**

Encontre em `photoRecognitionService.js`:

```javascript
// Linha ~20:
const DEFAULT_PROVIDER = PROVIDERS.GOOGLE_VISION
```

Mude para:

```javascript
const DEFAULT_PROVIDER = PROVIDERS.AWS_REKOGNITION
```

**Verificar:** O arquivo salvo sem erros?

---

## 📋 PASSO 8: TESTAR NO NAVEGADOR (5 minutos)

**1. Abrir navegador**

```
http://localhost:5173
```

**2. Ir para 📸 Fotos**

```
Menu lateral → 📸 Fotos
```

**3. Testar com uma URL**

```
Cole: https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Nike_shoe_ad_in_1998.jpg/440px-Nike_shoe_ad_in_1998.jpg
Clique: 🔍 Analisar
```

**4. Ver resultado**

```
Deve mostrar:
✅ Produtos encontrados
📊 Confiança
⏱️ Tempo de processamento
```

**Verificar:** Viu os produtos encontrados?

---

## ✅ SUCESSO!

Se chegou até aqui com tudo funcionando:

```
🎉 Parabéns!
   Você tem AWS Rekognition rodando!
   
✅ Sistema está analisando fotos
✅ Cache funcionando
✅ Matching funcionando
✅ Performance monitorada

📊 PRÓXIMO: Analisar performance por 2-3 semanas
   Depois: Decidir se continua ou migra para Google Vision
```

---

## 🚨 TROUBLESHOOTING

### ❌ Erro: "Credenciais não encontradas"

```
Solução:
1. Abra .env
2. Verifique as 3 linhas estão lá
3. Salve o arquivo
4. Reinicie o backend (Ctrl+C e rode novamente)
```

### ❌ Erro: "Access Denied" na análise

```
Solução:
1. Verificar credenciais copiar corretamente
2. Testar /api/status
3. Se disser "not configured", repetir PASSO 3
4. Delete e recrie a access key no AWS IAM
```

### ❌ Erro: "Failed to download image"

```
Solução:
1. URL da imagem é válida? (abra no navegador)
2. Imagem é acessível publicamente? (não privada)
3. Use outra URL de teste
```

### ❌ Backend não inicia

```
Solução:
1. Verifique Node.js está instalado: node -v
2. Verifique npm install foi rodar: npm list aws-sdk
3. Tente: npm install --save aws-sdk node-fetch
4. Tente porta diferente: PORT=3002 node aws-backend-example.js
```

---

## 💰 MONITORAR USAGE

**Acompanhar quantas imagens você analisou:**

```
1. Ir para: https://console.aws.amazon.com/billing/
2. Procurar: "Billing Dashboard"
3. Ver: "Free Tier Usage"
4. Monitorar: Rekognition calls
```

**Meta:** 5.000 imagens/mês = FREE

---

## 📚 DOCUMENTAÇÃO

- Setup AWS: `AWS_SETUP_GUIDE.md`
- Integração: `src/services/awsRekognitionService.js`
- Backend exemplo: `aws-backend-example.js`
- Guide completo: `PHOTO_RECOGNITION_GUIDE.md`

---

## 🎯 TIMELINE

```
⏱️  5 min   - Criar conta AWS
⏱️  10 min  - Criar credenciais IAM
⏱️  5 min   - Configurar .env
⏱️  5 min   - npm install
⏱️  10 min  - Rodar backend
⏱️  5 min   - Testar
⏱️  15 min  - Integrar ao código
⏱️  5 min   - Testar no navegador

Total: ~1 hora para tudo pronto! ✅
```

---

**Está pronto! Comece pelo PASSO 1! 🚀**
