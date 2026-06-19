# 🟠 SETUP AWS REKOGNITION - GUIA COMPLETO

## 📋 ÍNDICE
1. Criar Conta AWS
2. Ativar Free Tier
3. Criar Credenciais IAM
4. Instalar SDK
5. Testar Funcionamento

---

## 1️⃣ CRIAR CONTA AWS (5 minutos)

### Passo 1: Abrir site
```
Acesse: https://aws.amazon.com/free/
Clique: "Create a free account"
```

### Passo 2: Email e Senha
```
Email: seu-email@gmail.com
Senha: Algo forte (mínimo 8 caracteres)
```

### Passo 3: Informações Pessoais
```
Nome completo: Seu Nome
País: Brazil
Endereço: Seu endereço
Telefone: Seu telefone (com +55 55)
```

### Passo 4: Método de Pagamento
```
⚠️ IMPORTANTE: Mesmo na free tier, precisa de cartão
MAS você NÃO será cobrado (5.000 imagens/mês = FREE)

Adicione seu cartão de crédito
```

### Passo 5: Verificação
```
AWS enviará email de confirmação
Clique no link
Pronto! Conta criada ✅
```

---

## 2️⃣ ATIVAR FREE TIER (1 minuto)

```
1. Fazer login em aws.amazon.com
2. Ir para: AWS Management Console
3. Procurar: "Billing Dashboard"
4. Verificar: "Free Tier Usage"
5. Confirmar: Rekognition está no free tier
```

---

## 3️⃣ CRIAR CREDENCIAIS IAM (10 minutos)

### O que são credenciais?
```
São as "chaves" para seu código acessar AWS
Nunca compartilhe essas chaves!
```

### Passo-a-Passo:

**Step 1: Acessar IAM**
```
1. No Console AWS, procure: "IAM"
2. Clique em: "Users"
3. Clique em: "Create User"
```

**Step 2: Nome do Usuário**
```
User name: "photo-recognition-user"
Clique: "Next"
```

**Step 3: Permissões**
```
Clique: "Attach policies directly"
Procure: "AmazonRekognitionFullAccess"
Selecione: A checkbox
Clique: "Next"
```

**Step 4: Criar Access Keys**
```
Clique: "Create user"
Depois clique no novo usuário
Vá para: "Security credentials"
Clique: "Create access key"
```

**Step 5: Copiar as Chaves**
```
⚠️ COPIE AGORA! (depois não consegue mais)

Access Key ID:       AKIA...
Secret Access Key:   zX7k...

GUARDE EM LUGAR SEGURO!
```

---

## 4️⃣ ADICIONAR CREDENCIAIS AO .env

### Passo 1: Abrir arquivo .env

```bash
# Se não existir, crie:
touch .env
```

### Passo 2: Adicionar credenciais

```bash
# AWS Rekognition
VITE_AWS_ACCESS_KEY=AKIA...coleiaqui...
VITE_AWS_SECRET_KEY=zX7k...coleiaqui...
VITE_AWS_REGION=us-east-1
```

### Passo 3: Salvar

```bash
# Salve o arquivo
# NÃO commit no git! (nunca!)
```

---

## 5️⃣ INSTALAR SDK AWS (5 minutos)

### Passo 1: Terminal

```bash
cd /Users/macbook/Downloads/PROJETO\ DO\ CLAUDECODE
npm install aws-sdk
```

### Passo 2: Aguardar instalação

```
npm vai baixar o SDK
Leva 1-2 minutos
```

### Passo 3: Confirmar

```bash
# Verificar se instalou:
npm list aws-sdk

# Deve mostrar: aws-sdk@2.x.x
```

---

## ✅ PRONTO!

Você tem:
- ✅ Conta AWS criada
- ✅ Free tier ativado
- ✅ Credenciais IAM criadas
- ✅ Access keys copiadas
- ✅ .env configurado
- ✅ SDK instalado

**Próximo passo:** Ir para o arquivo de integração AWS!

---

## 🚨 TROUBLESHOOTING

### Erro: "Access Denied"
```
Solução: Verifique se as credenciais estão corretas no .env
```

### Erro: "Invalid credentials"
```
Solução: Copie novamente as credenciais (delete e crie novas)
```

### Erro: "Region not found"
```
Solução: Use sempre "us-east-1"
```

### Pergunta: E se esgotar as 5k imagens?
```
Resposta: 
  1. AWS avisará por email
  2. Você terá 2 opções:
     a) Migrar para Google Vision (1 linha!)
     b) Pagar AWS ($0.001/imagem = bem barato)
```

---

## 📊 MONITORAR USAGE

```
1. Ir para: AWS Console
2. Procurar: "Billing Dashboard"
3. Ver: "Free Tier Usage"
4. Monitorar: Rekognition calls usados
```

---

**Você está pronto para testar! 🎉**

Próximo passo: Ir para `AWS_INTEGRATION.md`
