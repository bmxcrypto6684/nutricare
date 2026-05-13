# 🥗 NutriCare

**Sistema completo de consulta nutricional** — versão Web + App Mobile.

Gera planos alimentares personalizados com base em uma anamnese detalhada (objetivo, rotina, restrições, atividade física, etc.).

---

## 🔗 Acessar

- **Web**: [`https://nutricare.app`](https://nutricare.app) — interface direta no navegador
- **Mobile**: App React Native (Expo) na pasta [`/nutricare`](./nutricare)

---

## 🖥️ Web (HTML/CSS/JS)

A versão web é um SPA (Single Page Application) com motor de IA próprio que roda direto no navegador.

### Funcionalidades

- Questionário de anamnese interativo
- Geração de plano alimentar com café, almoço, jantar e lanches
- Estratégias personalizadas e recomendações de suplementos
- Acompanhamento pós-consulta
- Design responsivo e moderno

### Como rodar

```bash
# Instalar dependências
npm install
cd server && npm install && cd ..

# Iniciar (API + Frontend)
npm run dev

# Ou apenas o frontend estático
npx serve -s . -l 3000
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 📱 Mobile (React Native / Expo)

App multiplataforma com Firebase (Auth, Firestore, Cloud Functions).

### Como rodar

```bash
cd nutricare
npm install
npx expo start
```

Escaneie o QR Code com o app **Expo Go** ou pressione `a` (Android) / `i` (iOS).

Mais detalhes em: [`/nutricare/README.md`](./nutricare/README.md)

---

## 📁 Estrutura do projeto

```
├── index.html           # Entrada da versão Web
├── style.css            # Estilos da versão Web
├── script.js            # Motor de IA e telas da versão Web
├── server/              # API Node.js (Express)
├── package.json         # Dependências da versão Web
├── iniciar.bat          # Atalho para iniciar no Windows
│
├── nutricare/           # App Mobile (React Native / Expo)
│   ├── App.js           # Entry point
│   ├── src/             # Telas, componentes, serviços
│   │   ├── screens/     # Onboarding, Anamnese, Plano, etc.
│   │   ├── components/  # Button, Card, ProgressBar
│   │   └── services/    # Firebase, AI Service
│   └── functions/       # Firebase Cloud Functions
│
└── README.md            # Este arquivo
```

---

## 🛠️ Tecnologias

| Versão | Stack |
|--------|-------|
| **Web** | HTML, CSS, JavaScript puro + Node.js (Express) |
| **Mobile** | React Native (Expo), Firebase Auth, Firestore, Cloud Functions |
| **IA** | Motor próprio em JavaScript + integração com Gemini/OpenAI |

---

## 📄 Licença

Uso livre para estudos e projetos pessoais.
