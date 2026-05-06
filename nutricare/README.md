# NutriCare 🥗

**NutriCare** — Sua nutrição personalizada com inteligência artificial.

App mobile desenvolvido em **React Native (Expo)** com **Firebase** (Auth, Firestore, Cloud Functions) para gerar planos alimentares personalizados com base em uma anamnese completa.

---

## 📱 Funcionalidades

- **Onboarding** — Tela inicial com "Iniciar consulta"
- **Anamnese multi-step** — Questionário interativo sobre objetivo, rotina, alimentação, restrições, sono e atividade física
- **Plano alimentar gerado por IA** — Café da manhã, lanches, almoço e jantar com opções e substituições
- **Estratégias personalizadas** — Dicas baseadas no perfil do usuário
- **Suplementação** — Recomendações de suplementos conforme necessidades
- **Acompanhamento** — Opções de follow-up e registro de progresso
- **Planos** — Tabela comparativa Básico vs Premium
- **Contato** — Canais de comunicação

---

## 🛠️ Pré-requisitos

- **Node.js** 18+
- **npm** ou **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **Firebase CLI** (opcional, para deploy): `npm install -g firebase-tools`
- **Conta no Firebase** — [console.firebase.google.com](https://console.firebase.google.com)

---

## 🚀 Como rodar o projeto

### 1. Instalar dependências

```bash
cd nutricare
npm install
```

### 2. Configurar Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com)
2. Crie um novo projeto (ou use um existente)
3. Ative os serviços:
   - **Authentication** → Método de login: Anônimo + Email/Senha
   - **Firestore Database** → Modo de teste (ou produção com regras)
   - **Functions** (opcional, para IA avançada)
4. No menu **Configurações do Projeto > Seus apps**, adicione um app **Web**
5. Copie as credenciais do Firebase

6. Abra `src/services/firebase.js` e substitua:

```javascript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
```

### 3. Rodar o app

```bash
npx expo start
```

Escaneie o QR Code com o app **Expo Go** no celular, ou pressione:
- `a` — Android emulador
- `i` — iOS simulator (macOS)
- `w` — Web browser

---

## ☁️ Firebase Cloud Functions (opcional)

Para usar a função de IA que gera planos alimentares:

### 1. Instalar dependências das functions

```bash
cd functions
npm install
cd ..
```

### 2. Configurar variáveis de ambiente

```bash
firebase functions:config:set ai.api_key="SUA_CHAVE_OPENAI_OU_GEMINI" ai.provider="gemini"
```

### 3. Rodar localmente com emuladores

```bash
firebase emulators:start
```

### 4. Fazer deploy

```bash
firebase deploy --only functions
```

> **Nota:** O app já funciona sem as Cloud Functions usando o gerador de plano local (`aiService.js`). A função é um upgrade para usar IA generativa real (Gemini ou OpenAI).

---

## 📁 Estrutura do projeto

```
nutricare/
├── App.js                    # Entry point — Stack Navigator
├── app.json                  # Expo config
├── firebase.json             # Firebase config
├── package.json
├── functions/
│   ├── index.js              # Cloud Function: generateMealPlan
│   ├── package.json
│   └── .eslintrc.js
└── src/
    ├── components/
    │   ├── Button.js         # Botão com variantes (primary, outline, secondary)
    │   ├── Card.js           # Card container + MealCard expansível
    │   └── ProgressBar.js    # Barra de progresso animada
    ├── data/
    │   └── questions.js      # Perguntas da anamnese
    ├── navigation/           # (reservado para futura separação do navigator)
    ├── screens/
    │   ├── OnboardingScreen.js      # Tela inicial
    │   ├── ComoFuncionaScreen.js    # Como funciona
    │   ├── AnamneseScreen.js        # Questionário multi-step
    │   ├── LoadingScreen.js         # Tela de análise com IA
    │   ├── PlanoAlimentarScreen.js  # Plano alimentar
    │   ├── EstrategiasScreen.js     # Dicas personalizadas
    │   ├── SuplementacaoScreen.js   # Recomendações de suplementos
    │   ├── AcompanhamentoScreen.js  # Acompanhamento pós-consulta
    │   ├── PlanosScreen.js          # Planos Básico vs Premium
    │   └── ContatoScreen.js         # Contato / Fale conosco
    ├── services/
    │   ├── firebase.js       # Firebase init + Auth + Firestore + Functions
    │   └── aiService.js      # Motor de IA local (geração de planos)
    └── utils/
        ├── colors.js         # Paleta de cores do design system
        └── constants.js      # Constantes do app
```

---

## 🎨 Design System

| Token | Valor | Uso |
|-------|-------|-----|
| `primary` | `#22C55E` | Verde principal (botões, destaques) |
| `primaryDark` | `#16A34A` | Hover / títulos |
| `primaryLight` | `#86EFAC` | Secundário / backgrounds |
| `primaryBg` | `#F0FFF4` | Background de cards temáticos |
| `background` | `#F8FAFB` | Fundo das telas |

---

## 📄 Licença

Uso livre para estudos e projetos pessoais.
