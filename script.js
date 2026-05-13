// ============================================================
// NutriCare — Engine de Estado JSON
// Arquitetura: UserInput → dispatch() → Engine(state,data) → JSON Response → Renderer(DOM)
// ============================================================

// ---- Crypto utilitário (Web Crypto API + fallback para file://) ----
function _cryptoOk() {
  return typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest;
}

// Fallback: hash iterativo (FNV-1a + rounds) para contextos não-seguros (file://).
// Não é criptograficamente forte, mas ofusca o PIN contra leitura casual do localStorage.
function _hashFallback(texto) {
  let h = 0x811c9dc5; // FNV-1a offset
  for (let r = 0; r < 1000; r++) {
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= r;
  }
  // Converte para hex (32-bit → 8 hex chars), repete até ~64 chars para imitar SHA-256
  let hex = (h >>> 0).toString(16).padStart(8, '0');
  while (hex.length < 64) hex += hex;
  return hex.slice(0, 64);
}

async function hashSHA256(texto) {
  if (_cryptoOk()) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback para file:// ou contextos sem Web Crypto
  return _hashFallback(texto);
}

function getChaveAssinatura() {
  let chave = localStorage.getItem('nutricare_sign_key');
  if (!chave) {
    chave = Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join('');
    localStorage.setItem('nutricare_sign_key', chave);
  }
  return chave;
}

async function assinarHMAC(dados) {
  const chave = getChaveAssinatura();
  if (_cryptoOk()) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(chave),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dados));
    const sigArray = Array.from(new Uint8Array(signature));
    return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: hash iterativo com a chave
  return _hashFallback(chave + ':' + dados);
}

async function dadosAssinados(valor, dataISO) {
  const payload = JSON.stringify({ v: valor, d: dataISO, t: Date.now() });
  const sig = await assinarHMAC(payload);
  return JSON.stringify({ p: payload, s: sig });
}

async function verificarDadosAssinados(raw) {
  try {
    const { p: payload, s: signature } = JSON.parse(raw);
    const sigEsperada = await assinarHMAC(payload);
    if (signature !== sigEsperada) return null;
    return JSON.parse(payload);
  } catch (e) { return null; }
}

// ---- PIN com hash SHA-256 (previne exposição em texto puro) ----
async function hashPinSHA256(pin) {
  const salt = getChaveAssinatura();
  return hashSHA256(pin + ':' + salt);
}


// ---- AES-GCM localStorage Encryption (Web Crypto API) ----
// Protege dados sensíveis (saúde, PII) com criptografia autenticada AES-256-GCM.
// A chave é armazenada no IndexedDB (sandbox do navegador), isolada do escopo do
// localStorage — protegendo contra XSS que tente ler localStorage.
// Se IndexedDB for limpo, dados criptografados tornam-se irrecuperáveis.
const CHAVES_SENSIVEIS = new Set([
  'nutricare_historico',
  'nutricare_progresso',
  'nutricare_premium_info',
  'nutricare_premium_expira'
]);
let _aesKeyCache = null;
let _aesDbReady = false;
// Cache síncrono de dados descriptografados (populado na inicialização)
const _decryptedCache = {};

function _abrirCryptoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('NutriCareCrypto', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function _gerarAESKey() {
  if (!_cryptoOk()) return null;
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt', 'decrypt']
  );
}

async function _exportarRawKey(key) {
  if (!_cryptoOk() || !key) return null;
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

async function _importarRawKey(raw) {
  if (!_cryptoOk() || !raw) return null;
  return crypto.subtle.importKey(
    'raw', raw,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function _initAESKey() {
  if (_aesKeyCache) return _aesKeyCache;
  if (!_cryptoOk()) return null;
  const db = await _abrirCryptoDB();
  if (!db) return null;
  try {
    const tx = db.transaction('keys', 'readonly');
    const store = tx.objectStore('keys');
    const rawKey = await new Promise((res, rej) => {
      const req = store.get('aes_key');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    if (rawKey) {
      _aesKeyCache = await _importarRawKey(new Uint8Array(rawKey));
      _aesDbReady = true;
      db.close();
      return _aesKeyCache;
    }
    const key = await _gerarAESKey();
    const exported = await _exportarRawKey(key);
    const tx2 = db.transaction('keys', 'readwrite');
    tx2.objectStore('keys').put(exported, 'aes_key');
    await new Promise((res, rej) => {
      tx2.oncomplete = () => res();
      tx2.onerror = () => rej(tx2.error);
    });
    _aesKeyCache = key;
    _aesDbReady = true;
    db.close();
    return key;
  } catch (err) {
    db.close();
    return null;
  }
}

async function _aesEncrypt(plaintext) {
  if (!plaintext) return plaintext;
  if (!_cryptoOk()) return null;
  const key = await _initAESKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

async function _aesDecrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.startsWith('enc:')) {
    return ciphertext;
  }
  if (!_cryptoOk()) return null;
  const key = await _initAESKey();
  if (!key) return null;
  try {
    const raw = Uint8Array.from(atob(ciphertext.slice(4)), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// Criptografa dado sensível no localStorage (fire-and-forget após salvar)
// Retorna true se conseguiu criptografar, false se crypto indisponível
async function _encryptStorageKey(key) {
  try {
    if (!_cryptoOk()) return false;
    const raw = localStorage.getItem(key);
    if (!raw || raw.startsWith('enc:')) return true;
    const encrypted = await _aesEncrypt(raw);
    if (encrypted && encrypted !== raw) {
      localStorage.setItem(key, encrypted);
      const parsed = JSON.parse(raw);
      _decryptedCache[key] = Array.isArray(parsed) ? parsed : parsed;
      return true;
    }
    return false;
  } catch { return false; }
}

// Descriptografa dado sensível do localStorage, retorna e popula cache
async function _decryptStorageKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    if (!raw.startsWith('enc:')) {
      const parsed = JSON.parse(raw);
      _decryptedCache[key] = Array.isArray(parsed) ? parsed : parsed;
      return parsed;
    }
    const decrypted = await _aesDecrypt(raw);
    if (decrypted) {
      const parsed = JSON.parse(decrypted);
      _decryptedCache[key] = Array.isArray(parsed) ? parsed : parsed;
    }
    return decrypted ? JSON.parse(decrypted) : null;
  } catch { return null; }
}

// Leitura síncrona do cache (populado por _decryptStorageKey na inicialização)
function _getDecryptedSync(key, fallback) {
  const cached = _decryptedCache[key];
  if (cached) return cached;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  if (raw.startsWith('enc:')) return fallback; // ainda não foi descriptografado
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

// Inicializa criptografia na inicialização
async function initCrypto() {
  const key = await _initAESKey();
  if (key) {
    for (const k of CHAVES_SENSIVEIS) {
      _decryptStorageKey(k).catch(() => {});
    }
  }
}

// ---- Estado Global ----
const STATE = {
  screen: 'onboarding',
  lastUserInput: null,
  profile: {
    name: '', goal: '', routine: '', diet: '',
    restrictions: [], restrictionDetail: '',
    hasExams: false, sleep: '', activity: '',
    age: '', weight: '', height: '', gender: '',
    medications: '', difficulties: [], emotionalEating: '',
    motivation: 3, extraInfo: ''
  },
  anamneseStep: 0,
  anamneseExtraStep: 0,
  chatPremiumStep: 0,
  chatCategoryMode: 'categories', // 'categories' | 'questions'
  chatSelectedCategory: null,
  plano: null
};

// ---- Nutritionist Engine ----
// Retorna { screen, message, components, actions }
// Função pura — manipula apenas STATE através de dispatch()
function engine(action, payload) {
  switch (STATE.screen) {

    // ============================
    case 'onboarding': {
      const btnProgresso = isPremium()
        ? [{ text: '📈 Meu Progresso', action: 'ver_progresso', variant: 'outline' }]
        : [];
      const btnSairPremium = isPremium()
        ? [{ text: '🔓 Sair do Premium', action: 'sair_premium', variant: 'outline' }]
        : [];
      const btnLiberarCliente = { text: '⭐ Liberar Premium →', action: 'liberar_cliente', variant: 'outline' };
      return {
        screen: 'onboarding',
        message: '',
        components: [
          { type: 'hero', title: 'Olá! Vou montar seu plano alimentar personalizado 🥗', subtitle: 'Atendimento humanizado com plano feito sob medida para você.' },
          { type: 'buttons', items: [
            { text: '▶️ Iniciar consulta', action: 'iniciar_consulta', variant: 'primary' },
            { text: '🗂️ Histórico', action: 'ver_historico', variant: 'outline' },
            ...btnProgresso,
            { text: 'ℹ️ Como funciona', action: 'como_funciona', variant: 'outline' },
            ...btnSairPremium,
            btnLiberarCliente,
            { text: '💰 Ver planos', action: 'ver_planos', variant: 'outline' }
          ]}
        ],
        actions: [
          { id: 'iniciar_consulta', next: 'anamnese_step' },
          { id: 'como_funciona', next: 'how_it_works' },
          { id: 'ver_planos', next: 'planos' }
        ]
      };
    }

    // ============================
    case 'how_it_works':
      return {
        screen: 'how_it_works',
        message: '',
        components: [
          { type: 'back', action: 'voltar_menu' },
          { type: 'title', text: 'Como funciona' },
          { type: 'steps', items: [
            { num: '1', title: 'Anamnese', desc: 'Você responde perguntas sobre seus objetivos, rotina, alimentação e saúde.' },
            { num: '2', title: 'Avaliação', desc: 'Analiso seus dados para identificar padrões, deficiências e oportunidades.' },
            { num: '3', title: 'Plano personalizado', desc: 'Gero um plano alimentar com refeições, substituições e dicas práticas.' },
            { num: '4', title: 'Acompanhamento', desc: 'Você pode agendar retornos, tirar dúvidas e atualizar seu progresso.' }
          ]},
          { type: 'button', text: 'Quero começar', action: 'iniciar_consulta', variant: 'primary' }
        ],
        actions: [
          { id: 'voltar_menu', next: 'onboarding' },
          { id: 'iniciar_consulta', next: 'anamnese_step' }
        ]
      };

    // ============================
    case 'planos':
      return {
        screen: 'planos',
        message: '',
        components: [
          { type: 'back', action: 'voltar_menu' },
          { type: 'title', text: 'Nossos planos', subtitle: 'Escolha a opção ideal para sua jornada nutricional' },
          { type: 'pricing', items: [
            {
              badge: 'Básico', value: 'Grátis', recommended: false,
              features: [
                { text: 'Consulta única online', included: true },
                { text: 'Plano alimentar personalizado', included: true },
                { text: 'Recomendações gerais', included: true },
                { text: 'Acompanhamento', included: false },
                { text: 'Ajustes periódicos', included: false }
              ],
              action: 'iniciar_consulta'
            },
            {
              badge: 'Recomendado', value: 'Premium 3M', recommended: true,
              features: [
                { text: 'Consulta completa', included: true },
                { text: 'Plano alimentar personalizado', included: true },
                { text: 'Retorno para ajustes', included: true },
                { text: 'Acompanhamento contínuo', included: true },
                { text: 'Suporte por chat', included: true }
              ],
              action: 'assinar_trimestral'
            }
          ]}
        ],
        actions: [
          { id: 'voltar_menu', next: 'onboarding' },
          { id: 'iniciar_consulta', next: 'anamnese_step' },
          { id: 'assinar_premium', next: 'assinar_premium' },
          { id: 'assinar_trimestral', next: 'assinar_trimestral' },
          { id: 'falar_contato', next: 'contato' }
        ]
      };

    // ============================
    case 'contato':
      return {
        screen: 'contato',
        message: '',
        components: [
          { type: 'back', action: 'voltar_planos' },
          { type: 'title', text: 'Fale conosco' },
          { type: 'contact_card', items: [
            { label: '📧 Email', value: 'nutricare@consulta.com' },
            { label: '📱 WhatsApp', value: '(11) 99999-8888' },
            { label: '⏰ Horário', value: 'Seg a Sex, 8h às 18h' }
          ]},
          { type: 'button', text: 'Voltar aos planos', action: 'voltar_planos', variant: 'secondary' }
        ],
        actions: [
          { id: 'voltar_planos', next: 'planos' },
          { id: 'voltar_menu', next: 'onboarding' }
        ]
      };

    // ============================
    case 'anamnese_step': {
      const step = STATE.anamneseStep;

      // Handle action if this is a response
      if (action && action.startsWith('ans_')) {
        handleAnamneseAnswer(action, payload);

        // Exams = yes → file upload (stay on same step)
        if (action === 'ans_exams_yes') {
          STATE.anamneseStep = step;
          return {
            screen: 'anamnese_step',
            message: 'Envie seus exames (opcional):',
            components: [{ type: 'file_upload', action_skip: 'ans_exams_skip', action_confirm: 'ans_exams_done' }],
            actions: [
              { id: 'ans_exams_skip', next: 'anamnese_step' },
              { id: 'ans_exams_done', next: 'anamnese_step' }
            ]
          };
        }

        // Exams skip/done
        if (action === 'ans_exams_skip' || action === 'ans_exams_done') {
          STATE.anamneseStep++;
          if (STATE.anamneseStep >= ANAMNESE_TOTAL_STEPS) { return transitionToAnalise(); }
          return showAnamneseQuestion(STATE.anamneseStep);
        }

        // Normal answer — advance step
        STATE.anamneseStep++;
        if (STATE.anamneseStep >= ANAMNESE_TOTAL_STEPS) { return transitionToAnalise(); }
        return showAnamneseQuestion(STATE.anamneseStep);
      }

      // Initial render — show first question
      return showAnamneseQuestion(0);
    }

    // ============================
    case 'anamnese_extra': {
      if (!isPremium()) return { screen: 'premium_block' };

      const step = STATE.anamneseExtraStep;

      if (action && action.startsWith('ans_extra_')) {
        const val = action.replace('ans_extra_', '');
        const keyMap = {
          'diet_lowcarb': 'preferredDiet', 'diet_med': 'preferredDiet', 'diet_balanced': 'preferredDiet', 'diet_any': 'preferredDiet',
          'cook_yes': 'cookingStyle', 'cook_no': 'cookingStyle', 'cook_sometimes': 'cookingStyle',
          'meal_fast': 'mealSpeed', 'meal_elaborate': 'mealSpeed', 'meal_both': 'mealSpeed',
          'digest_yes': 'digestiveIssues', 'digest_no': 'digestiveIssues',
          'water_less': 'waterIntake', 'water_mid': 'waterIntake', 'water_more': 'waterIntake',
          'sleep_good': 'sleep', 'sleep_mid': 'sleep', 'sleep_bad': 'sleep',
          'exams_yes': 'hasExams', 'exams_no': 'hasExams'
        };
        const valueMap = {
          'diet_lowcarb': 'Low carb', 'diet_med': 'Mediterrânea', 'diet_balanced': 'Equilibrada', 'diet_any': 'Tanto faz',
          'cook_yes': 'Sim, cozinho', 'cook_no': 'Não cozinho', 'cook_sometimes': 'Às vezes',
          'meal_fast': 'Rápidas', 'meal_elaborate': 'Elaboradas', 'meal_both': 'Ambos',
          'digest_yes': 'Sim', 'digest_no': 'Não',
          'water_less': 'Menos de 1L', 'water_mid': '1-2L', 'water_more': 'Mais de 2L',
          'sleep_good': 'Bom', 'sleep_mid': 'Médio', 'sleep_bad': 'Ruim',
          'exams_yes': 'Sim', 'exams_no': 'Não'
        };

        if (keyMap[val]) {
          STATE.profile[keyMap[val]] = valueMap[val] || val;
        }

        STATE.anamneseExtraStep++;
        if (STATE.anamneseExtraStep >= ANAMNESE_EXTRA_TOTAL) {
          STATE.anamneseExtraStep = 0;
          return showFirstChatPremiumStep();
        }
        return showAnamneseExtraQuestion(STATE.anamneseExtraStep);
      }

      // Text input for free-text questions
      if (action === 'ans_extra_text') {
        STATE.profile.favFoods = payload || '';
        STATE.anamneseExtraStep++;
        if (STATE.anamneseExtraStep >= ANAMNESE_EXTRA_TOTAL) {
          STATE.anamneseExtraStep = 0;
          return showFirstChatPremiumStep();
        }
        return showAnamneseExtraQuestion(STATE.anamneseExtraStep);
      }

      return showAnamneseExtraQuestion(0);
    }

    // ============================
    case 'chat_premium': {
      if (!isPremium()) return { screen: 'premium_block' };

      // Finalizar e gerar plano
      if (action === 'chat_finalizar') {
        STATE.chatPremiumStep = 0;
        return { screen: 'analise_loading', message: '', components: [], actions: [] };
      }

      // Mostra tela do chat (com histórico se houver)
      STATE.chatPremiumStep = 1;
      return {
        screen: 'chat_premium',
        message: '',
        components: [],
        actions: [{ id: 'chat_msg', next: 'chat_premium' }]
      };
    }

    // ============================
    case 'analise': {
      // Usa diagnostico do backend se disponível, senão gera local
      const diag = STATE.plano && STATE.plano.diagnostico
        ? STATE.plano.diagnostico
        : gerarDiagnostico(STATE.profile);
      STATE.plano = diag;
      STATE.lastDiagnostico = diag.resumo && diag.resumo.length > 0
        ? diag.resumo.join(' · ') : STATE.profile.goal || '';
      STATE.lastPlano = true;
      const btnEstrategias = isPremium()
        ? [{ type: 'button', text: '💡 Ver estratégias', action: 'ver_estrategias', variant: 'outline' }]
        : [];
      return {
        screen: 'analise',
        message: 'Analisei seus dados e identifiquei pontos importantes...',
        components: [
          { type: 'bullet_list', title: '📋 Resumo da avaliação', items: diag.resumo },
          { type: 'bullet_list', title: '⚠️ Pontos de atenção', items: diag.atencao },
          { type: 'bullet_list', title: '✅ Oportunidades', items: diag.oportunidades },
          { type: 'button', text: '🥗 Ver meu plano alimentar', action: 'ver_plano', variant: 'primary' },
          ...btnEstrategias
        ],
        actions: [
          { id: 'ver_plano', next: 'plano' },
          ...(isPremium() ? [{ id: 'ver_estrategias', next: 'estrategias' }] : [])
        ]
      };
    }

    // ============================
    case 'plano': {
      const meals = gerarRefeicoes(STATE.profile, isPremium());
      const premiumBtns = isPremium() ? [
        { text: '🔄 Ver substituições', action: 'ver_subs', variant: 'secondary' },
        { text: '🛒 Gerar lista de compras', action: 'ver_lista', variant: 'secondary' },
        { text: '📊 Gráficos nutricionais', action: 'ver_graficos', variant: 'secondary' },
        { text: '💡 Estratégias', action: 'ver_estrategias', variant: 'outline' },
        { text: '💊 Suplementação', action: 'ver_suplementacao', variant: 'outline' }
      ] : [
        { text: '⬅️ Voltar ao menu', action: 'voltar_menu', variant: 'outline' }
      ];
      return {
        screen: 'plano',
        message: 'Aqui está seu <strong>plano alimentar personalizado</strong>:',
        components: [
          { type: 'meal_plan', meals },
          { type: 'buttons', items: premiumBtns }
        ],
        actions: isPremium() ? [
          { id: 'ver_subs', next: 'substituicoes' },
          { id: 'ver_lista', next: 'lista_compras' },
          { id: 'ver_graficos', next: 'nutrition_charts' },
          { id: 'ver_estrategias', next: 'estrategias' },
          { id: 'ver_suplementacao', next: 'suplementacao' }
        ] : [
          { id: 'voltar_menu', next: 'onboarding' }
        ]
      };
    }

    // ============================
    case 'nutrition_charts': {
      if (!isPremium()) return { screen: 'premium_block' };
      const nd = gerarDadosNutricionais(STATE.profile);
      return {
        screen: 'nutrition_charts',
        message: '',
        components: [
          { type: 'nutrition_charts', data: nd },
          { type: 'button', text: '← Voltar ao plano alimentar', action: 'voltar_plano', variant: 'primary' }
        ],
        actions: [{ id: 'voltar_plano', next: 'plano' }]
      };
    }

    // ============================
    case 'substituicoes': {
      if (!isPremium()) return { screen: 'premium_block' };
      const subs = gerarSubstituicoes();
      return {
        screen: 'substituicoes',
        message: '💡 <strong>Substituições inteligentes</strong> para variar seu cardápio:',
        components: [
          { type: 'card_list', items: subs },
          { type: 'button', text: '← Voltar ao plano', action: 'voltar_plano', variant: 'primary' }
        ],
        actions: [{ id: 'voltar_plano', next: 'plano' }]
      };
    }

    // ============================
    case 'lista_compras': {
      if (!isPremium()) return { screen: 'premium_block' };
      const list = gerarListaCompras();
      return {
        screen: 'lista_compras',
        message: '🛒 <strong>Lista de compras</strong> — marque o que precisa:',
        components: [
          { type: 'shopping_grid', categories: list },
          { type: 'button', text: '← Voltar ao plano', action: 'voltar_plano', variant: 'primary' }
        ],
        actions: [{ id: 'voltar_plano', next: 'plano' }]
      };
    }

    // ============================
    case 'estrategias': {
      if (!isPremium()) return { screen: 'premium_block' };
      const tips = gerarDicas(STATE.profile);
      return {
        screen: 'estrategias',
        message: '💡 <strong>Estratégias personalizadas</strong> para o seu dia a dia:',
        components: [
          { type: 'strategy_list', items: tips },
          { type: 'buttons', items: [
            { text: '🥗 Ver plano alimentar', action: 'ver_plano', variant: 'primary' },
            { text: '💊 Suplementação', action: 'ver_suplementacao', variant: 'outline' },
            { text: '📊 Acompanhamento', action: 'ver_acompanhamento', variant: 'outline' }
          ]}
        ],
        actions: [
          { id: 'ver_plano', next: 'plano' },
          { id: 'ver_suplementacao', next: 'suplementacao' },
          { id: 'ver_acompanhamento', next: 'acompanhamento' }
        ]
      };
    }

    // ============================
    case 'suplementacao': {
      if (!isPremium()) return { screen: 'premium_block' };
      const sups = gerarSuplementos(STATE.profile);
      if (sups.length === 0) {
        return {
          screen: 'suplementacao',
          message: '💊 <strong>Suplementação</strong>',
          components: [
            { type: 'card', title: 'Sem necessidade no momento', text: 'Sua alimentação pode suprir todas as necessidades nutricionais. Foco em variedade e qualidade!' },
            { type: 'buttons', items: [
              { text: '🥗 Ver plano alimentar', action: 'ver_plano', variant: 'primary' },
              { text: '📊 Acompanhamento', action: 'ver_acompanhamento', variant: 'outline' }
            ]}
          ],
          actions: [
            { id: 'ver_plano', next: 'plano' },
            { id: 'ver_acompanhamento', next: 'acompanhamento' }
          ]
        };
      }
      return {
        screen: 'suplementacao',
        message: '💊 <strong>Suplementos sugeridos</strong> com base no seu perfil. Consulte um médico antes de iniciar:',
        components: [
          { type: 'supplement_list', items: sups },
          { type: 'buttons', items: [
            { text: '🥗 Ver plano alimentar', action: 'ver_plano', variant: 'primary' },
            { text: '📊 Acompanhamento', action: 'ver_acompanhamento', variant: 'outline' }
          ]}
        ],
        actions: [
          { id: 'ver_plano', next: 'plano' },
          { id: 'ver_acompanhamento', next: 'acompanhamento' }
        ]
      };
    }

    // ============================
    case 'acompanhamento': {
      if (!isPremium()) return { screen: 'premium_block' };
      return {
        screen: 'acompanhamento',
        message: '📊 <strong>Seu progresso depende de ajustes contínuos.</strong> Estou aqui para ajudar!',
        components: [
          { type: 'followup_cards', items: [
            { icon: '🔄', text: 'Atualizar progresso', action: 'reiniciar' },
            { icon: '📅', text: 'Agendar retorno', action: 'agendar' },
            { icon: '💬', text: 'Tirar dúvidas', action: 'duvidas' },
            { icon: '💰', text: 'Ver planos', action: 'ver_planos' }
          ]}
        ],
        actions: [
          { id: 'reiniciar', next: 'reiniciar' },
          { id: 'agendar', next: 'agendar' },
          { id: 'duvidas', next: 'duvidas' },
          { id: 'ver_planos', next: 'planos' }
        ]
      };
    }

    // ============================
    case 'reiniciar':
      resetState();
      return engine(null, null);

    case 'agendar':
      return {
        screen: 'agendar',
        message: '📅 Retorno agendado! Em breve você receberá instruções por email.',
        components: [
          { type: 'button', text: '← Voltar', action: 'voltar_acomp', variant: 'primary' }
        ],
        actions: [{ id: 'voltar_acomp', next: 'acompanhamento' }]
      };

    case 'duvidas':
      return {
        screen: 'duvidas',
        message: '💬 Em breve um nutricionista entrará em contato para tirar suas dúvidas.',
        components: [
          { type: 'button', text: '← Voltar', action: 'voltar_acomp', variant: 'primary' }
        ],
        actions: [{ id: 'voltar_acomp', next: 'acompanhamento' }]
      };

    // ============================
    case 'historico':
      return { screen: 'historico', message: '', components: [], actions: [
        { id: 'voltar_menu', next: 'onboarding' }
      ]};

    case 'progresso':
      return { screen: 'progresso', message: '', components: [], actions: [
        { id: 'voltar_menu', next: 'onboarding' }
      ]};

    case 'detalhe_consulta': {
      const historico = _getDecryptedSync(STORAGE_KEY_HISTORICO, []);
      const consulta = payload ? historico.find(h => String(h.id) === String(payload)) : null;
      return {
        screen: 'detalhe_consulta',
        message: '',
        consulta: consulta,
        components: [],
        actions: [
          { id: 'voltar_menu', next: 'onboarding' },
          { id: 'ver_historico', next: 'historico' }
        ]
      };
    }

    case 'assinar_premium':
      return { screen: 'assinar_premium', message: '', components: [], actions: [] };
    case 'assinar_trimestral':
      return { screen: 'assinar_trimestral', message: '', components: [], actions: [] };

    default:
      console.error('Tela desconhecida:', STATE.screen);
      STATE.screen = 'onboarding';
      return { screen: 'onboarding', message: '', components: [], actions: [] };
  }
}

// ---- Anamnese Helpers ----
function transitionToAnalise() {
  if (isPremium()) {
    return showAnamneseExtraQuestion(0);
  }
  return { screen: 'analise_loading', message: '', components: [], actions: [] };
}

function showAnamneseQuestion(step) {
  const questions = [
    { msg: `Qual seu <strong>objetivo principal</strong>?`, type: 'options', key: 'goal', items: [
        { text: 'Emagrecimento', action: 'ans_goal_loss' },
        { text: 'Ganho de massa muscular', action: 'ans_goal_mass' },
        { text: 'Saúde / metabolismo', action: 'ans_goal_health' },
        { text: 'Bem-estar geral', action: 'ans_goal_wellness' }
    ]},
    { msg: `Você tem <strong>comorbidades</strong>? (opcional)`, type: 'checkboxes', key: 'restrictionDetail', action: 'ans_comorbidades', items: [
        { text: 'Diabetes', value: 'Diabetes' },
        { text: 'Hipertensão', value: 'Hipertensão' },
        { text: 'Colesterol alto', value: 'Colesterol alto' },
        { text: 'Obesidade', value: 'Obesidade' },
        { text: 'Doença celíaca', value: 'Doença celíaca' },
        { text: 'Intolerância à lactose', value: 'Intolerância à lactose' },
        { text: 'Gastrite / refluxo', value: 'Gastrite/refluxo' },
        { text: 'Hipotireoidismo', value: 'Hipotireoidismo' },
        { text: 'Nenhuma', value: '__none__', exclusive: true }
    ]},
    { msg: `Nível de <strong>atividade física</strong>?`, type: 'options', key: 'activity', items: [
        { text: 'Sedentário', action: 'ans_act_sed' },
        { text: 'Leve', action: 'ans_act_light' },
        { text: 'Moderado', action: 'ans_act_mod' },
        { text: 'Intenso', action: 'ans_act_int' }
    ]},
    { msg: `Qual seu <strong>sexo</strong>?`, type: 'options', key: 'gender', items: [
        { text: 'Masculino', action: 'ans_gender_m' },
        { text: 'Feminino', action: 'ans_gender_f' }
    ]},
    { msg: `Qual seu <strong>peso</strong>? (kg)`, type: 'text', key: 'weight', placeholder: 'Ex: 70' },
    { msg: `Qual sua <strong>altura</strong>? (cm)`, type: 'text', key: 'height', placeholder: 'Ex: 170' }
  ];

  if (step >= questions.length) {
    return transitionToAnalise();
  }

  const q = questions[step];
  return {
    screen: 'anamnese_step',
    message: q.msg,
    components: q.type === 'options'
      ? [{ type: 'options', items: q.items, multi: false }]
      : [{ type: 'text_input', placeholder: q.placeholder || 'Digite...', action: `ans_text_${q.key}`, optional: false }],
    actions: q.items ? q.items.map(i => ({ id: i.action, next: 'anamnese_step' })) : [{ id: `ans_text_${q.key}`, next: 'anamnese_step' }]
  };
}

function handleAnamneseAnswer(action, payload) {
  const map = {
    'ans_goal_loss': ['goal', 'Emagrecimento'],
    'ans_goal_mass': ['goal', 'Ganho de massa muscular'],
    'ans_goal_health': ['goal', 'Saúde / metabolismo'],
    'ans_goal_wellness': ['goal', 'Bem-estar geral'],
    'ans_sleep_good': ['sleep', 'Bom'],
    'ans_sleep_mid': ['sleep', 'Médio'],
    'ans_sleep_bad': ['sleep', 'Ruim'],
    'ans_act_sed': ['activity', 'Sedentário'],
    'ans_act_light': ['activity', 'Leve'],
    'ans_act_mod': ['activity', 'Moderado'],
    'ans_act_int': ['activity', 'Intenso'],
    'ans_restr_no': ['restrictions', []],
    'ans_comorbidades': (key, payload) => {
      STATE.profile.restrictionDetail = payload;
      STATE.profile.restrictions = payload ? ['Sim'] : [];
    },
    'ans_exams_no': ['hasExams', false],
    'ans_exams_yes': ['hasExams', true],
    'ans_exams_done': ['hasExams', true],
    'ans_exams_skip': ['hasExams', false],
    'ans_gender_m': ['gender', 'Masculino'],
    'ans_gender_f': ['gender', 'Feminino']
  };

  if (map[action]) {
    if (typeof map[action] === 'function') {
      map[action](action, payload);
    } else {
      const [key, val] = map[action];
      STATE.profile[key] = val;
    }
  }

  if (action && action.startsWith('ans_text_')) {
    const key = action.replace('ans_text_', '');
    STATE.profile[key] = payload || '';
  }
}

function showAnamneseExtraQuestion(step) {
  const extraQuestions = [
    {
      msg: `Qual <strong>tipo de dieta</strong> você prefere?`,
      type: 'options', items: [
        { text: 'Low carb', action: 'ans_extra_diet_lowcarb' },
        { text: 'Mediterrânea', action: 'ans_extra_diet_med' },
        { text: 'Equilibrada', action: 'ans_extra_diet_balanced' },
        { text: 'Tanto faz', action: 'ans_extra_diet_any' }
      ]
    },
    {
      msg: `Você <strong>cozinha</strong> ou prefere opções prontas?`,
      type: 'options', items: [
        { text: 'Sim, cozinho', action: 'ans_extra_cook_yes' },
        { text: 'Não cozinho', action: 'ans_extra_cook_no' },
        { text: 'Às vezes', action: 'ans_extra_cook_sometimes' }
      ]
    },
    {
      msg: `Prefere refeições <strong>rápidas ou elaboradas</strong>?`,
      type: 'options', items: [
        { text: 'Rápidas', action: 'ans_extra_meal_fast' },
        { text: 'Elaboradas', action: 'ans_extra_meal_elaborate' },
        { text: 'Ambos', action: 'ans_extra_meal_both' }
      ]
    },
    {
      msg: `Tem <strong>problemas digestivos</strong>? (gases, azia, intestino preso)`,
      type: 'options', items: [
        { text: 'Sim', action: 'ans_extra_digest_yes' },
        { text: 'Não', action: 'ans_extra_digest_no' }
      ]
    },
    {
      msg: `Qual sua <strong>ingestão de água</strong> diária?`,
      type: 'options', items: [
        { text: 'Menos de 1L', action: 'ans_extra_water_less' },
        { text: '1 a 2L', action: 'ans_extra_water_mid' },
        { text: 'Mais de 2L', action: 'ans_extra_water_more' }
      ]
    },
    {
      msg: `Tem algum <strong>alimento que ama</strong> e gostaria de incluir no plano?`,
      type: 'text', placeholder: 'Ex: chocolate, pizza, açaí...'
    },
    {
      msg: `Como está seu <strong>sono</strong>?`,
      type: 'options', items: [
        { text: 'Bom', action: 'ans_extra_sleep_good' },
        { text: 'Médio', action: 'ans_extra_sleep_mid' },
        { text: 'Ruim', action: 'ans_extra_sleep_bad' }
      ]
    },
    {
      msg: `Possui <strong>exames recentes</strong>?`,
      type: 'options', items: [
        { text: 'Sim', action: 'ans_extra_exams_yes' },
        { text: 'Não', action: 'ans_extra_exams_no' }
      ]
    }
  ];

  const q = extraQuestions[step];
  if (!q) return showFirstChatPremiumStep();

  if (q.type === 'options') {
    return {
      screen: 'anamnese_extra',
      message: q.msg,
      components: [
        { type: 'options', items: q.items, layout: 'grid' }
      ],
      actions: q.items.map(i => ({ id: i.action, next: 'anamnese_extra' }))
    };
  }

  return {
    screen: 'anamnese_extra',
    message: q.msg,
    components: [
      { type: 'text_input', placeholder: q.placeholder || 'Digite aqui...', action: 'ans_extra_text' }
    ],
    actions: [{ id: 'ans_extra_text', next: 'anamnese_extra' }]
  };
}

// ============================================================
// Chat IA — Bot Nutricionista Local (sem API)
// ============================================================

// ---- Banco de Conhecimento do Bot Nutricionista ----
const BOT_CONHECIMENTO = {
  saudacao: [
    { palavras: ['ola', 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'e aí', 'eai', 'fala', 'oie', 'bão', 'salve'],
      respostas: [
        p => `Olá ${p.name || 'amigo(a)'}! 😊 Como posso ajudar você hoje? Pode perguntar sobre nutrição, receitas, dicas para sua dieta, e muito mais!`,
        p => `Oi ${p.name || 'tudo bem'}! Pronto(a) para tirar dúvidas sobre alimentação. O que você gostaria de saber? 🥗`,
        p => `Fala ${p.name || 'galera'}! 🥦 Tô aqui pra ajudar com dicas de nutrição. Pode mandar suas perguntas!`
      ]}
  ],

  pre_treino: [
    { palavras: ['pré treino', 'pre treino', 'pré-treino', 'antes de treinar', 'antes do treino', 'treinar', 'academia', 'musculação', 'treino', 'pré'],
      respostas: [p => {
        const isLoss = p.goal?.includes('Emagrecimento');
        const isGain = p.goal?.includes('massa muscular');
        let sugestao = '';
        if (isLoss) sugestao = '🥣 Café preto + 1 banana + 5 castanhas — energia sem excesso calórico.';
        else if (isGain) sugestao = '🥣 2 bananas + pasta de amendoim + café — carboidrato e proteína pra performance.';
        else sugestao = '🥣 1 fruta + café preto ou chá verde + 1 fatia de pão integral.';
        return `🔋 <strong>Pré-treino ideal:</strong><br><br>${sugestao}<br><br>💡 <strong>Dica:</strong> Coma 40-60 minutos antes do treino. Evite alimentos gordurosos ou muito pesados. Hidrate-se bem antes!<br><br>📌 <strong>Pós-treino:</strong> whey protein, frango com arroz, ou iogurte com granola nas primeiras 2 horas.`;
      }]}
  ],

  pos_treino: [
    { palavras: ['pós treino', 'pos treino', 'pós-treino', 'depois de treinar', 'depois do treino', 'pós', 'recuperação', 'recuperar'],
      respostas: [
        p => `💪 <strong>Pós-treino — janela de recuperação:</strong><br><br>🥤 <strong>Opções rápidas:</strong> whey protein + banana, ou iogurte grego + mel + granola.<br><br>🍽️ <strong>Refeição completa:</strong> frango grelhado + arroz integral + brocolis (ou a receita equivalente que esta no seu plano).<br><br>⏱️ O ideal e se alimentar ate 2 horas apos o treino. Nao pule essa rejeicao, ${p.name || 'campeao(ã)'}!`,
        p => `🏋️ <strong>Recuperação pós-treino feita do jeito certo:</strong><br><br>` +
          `🥤 <strong>Até 30 min após o treino (janela ideal):</strong> whey protein + banana OU shake de frutas com scoop de proteína<br><br>` +
          `🍽️ <strong>Refeição completa (até 2h depois):</strong><br>` +
          `• Proteína: frango, peixe, ovos ou tofu 🐔<br>` +
          `• Carbo: batata doce, arroz, aveia ou mandioca 🥔<br>` +
          `• Vegetais: brócolis, couve, salada 🥬<br><br>` +
          `💧 <strong>Não esqueça:</strong> reponha líquidos perdidos no treino!<br><br>` +
          `📌 Dica: suas refeições do plano já incluem opções pós-treino balanceadas!`,
        p => `⏳ <strong>Pós-treino sem complicação:</strong><br><br>` +
          `Se você não tem tempo para preparar algo elaborado:<br><br>` +
          `🥤 <strong>Opções em ≤5 minutos:</strong><br>` +
          `• 1 banana + 1 scoop de whey + água/leite 🍌<br>` +
          `• 1 pote de iogurte grego + granola + mel 🥛<br>` +
          `• 2 ovos cozidos + 1 torrada integral + café ☕<br>` +
          `• Sanduíche de frango desfiado + requeijão light 🥪<br><br>` +
          `💡 <strong>Macete:</strong> deixe ovos cozidos e frango desfiado prontos na geladeira!`
      ]}
  ],

  emagrecimento: [
    { palavras: ['emagrecer', 'perder peso', 'perder barriga', 'emagrecimento', 'dieta', 'calorias', 'déficit', 'perder gordura', 'secar', 'definir', 'perder', 'quilos'],
      respostas: [p => {
        const hasImc = parseFloat(p.weight) && parseFloat(p.height);
        const imc = hasImc ? (parseFloat(p.weight) / Math.pow(parseFloat(p.height)/100, 2)).toFixed(1) : null;
        return `🎯 <strong>Dicas para emagrecimento com saúde:</strong><br><br>${hasImc ? `📊 Seu IMC é <strong>${imc}</strong>. ` : ''}O segredo não é passar fome, mas fazer escolhas inteligentes:<br><br>` +
          `✅ <strong>Priorize proteína</strong> em todas as refeições (frango, ovos, peixe, tofu) — aumenta saciedade<br>` +
          `✅ <strong>Café da manhã reforçado</strong> — 2 ovos + pão integral + fruta já ajuda a controlar a fome no resto do dia<br>` +
          `✅ <strong>Evite ultraprocessados</strong> — refrigerante, biscoito recheado, embutidos<br>` +
          `✅ <strong>Beba água</strong> — 35ml por kg de peso = ${parseFloat(p.weight) ? Math.round(parseFloat(p.weight) * 35) + 'ml' : 'calcule 35ml por kg'} por dia<br>` +
          `✅ <strong>Coma devagar</strong> — cada refeição deve durar 15-20 minutos<br><br>` +
          `📌 Lembre-se: emagrecimento saudável é 0,5kg a 1kg por semana. Nada de dietas restritivas!`;
      }]
    },
    // Item específico para "quantos quilos posso perder" (score mais alto que cardapio_semanal)
    { palavras: ['quantos quilos', 'quantos kg', 'kg por semana', 'quilos por semana', 'perder por semana', 'perder quantos', 'posso perder'],
      respostas: [p => {
        const peso = parseFloat(p.weight);
        return `🎯 <strong>Quantos quilos você pode perder por semana?</strong><br><br>` +
          `📊 A perda de peso <strong>saudável e sustentável</strong> é de <strong>0,5kg a 1kg por semana</strong>.<br><br>` +
          `✅ <strong>Por que esse ritmo?</strong><br>` +
          `• Perder mais que 1kg/semana geralmente é <strong>água e massa magra</strong>, não gordura 💧<br>` +
          `• Perda muito rápida pode desacelerar o metabolismo 🔄<br>` +
          `• Ritmo agressivo aumenta risco de efeito sanfona 📉📈<br>` +
          `• 0,5-1kg/semana = perda de gordura preservando músculo 💪<br><br>` +
          `${peso ? `📌 <strong>No seu caso (${peso}kg):</strong> em 1 mês saudável = 2 a 4kg. Em 3 meses = 6 a 12kg. 🔥` : ''}<br><br>` +
          `💡 <strong>Lembre-se:</strong> seu plano alimentar já está ajustado para esse ritmo ideal. O segredo é <strong>consistência</strong>, não pressa!`;
      }]
    }
  ],

  ganho_massa: [
    { palavras: ['ganhar massa', 'hipertrofia', 'muscular', 'músculo', 'crescer', 'bulking', 'fichinha', 'pesado', 'massa muscular'],
      respostas: [
        p => `💪 <strong>Dicas para ganho de massa muscular:</strong><br><br>` +
        `🥩 <strong>Proteína em todas as refeições</strong> — 1.6 a 2.2g por kg de peso. Exemplo: ${parseFloat(p.weight) ? Math.round(parseFloat(p.weight) * 1.8) + 'g de proteína por dia' : 'calcule 1.8g por kg'}<br>` +
        `🍚 <strong>Carboidrato é seu amigo</strong> — arroz, batata doce, aveia, pão integral. Sem energia não há crescimento<br>` +
        `🥜 <strong>Gorduras boas</strong> — castanhas, azeite, abacate, pasta de amendoim<br>` +
        `😴 <strong>Durma bem</strong> — é dormindo que o músculo se regenera e cresce<br>` +
        `🔄 <strong>Treine com progressão</strong> — aumente carga ou repetições gradualmente<br><br>` +
        `📌 No seu plano alimentar você já tem opções ricas em proteína como ovos, frango e o smoothie proteico!`,
        p => `🔥 <strong>Ganho de massa — o que NÃO pode faltar:</strong><br><br>` +
        `1️⃣ <strong>Superávit calórico</strong> — coma mais do que gasta (cerca de 300-500 calorias acima do basal)<br>` +
        `2️⃣ <strong>Proteína distribuída</strong> — 20-40g de proteína a cada 3-4h em 4-5 refeições 🥩<br>` +
        `3️⃣ <strong>Carbo nos treinos</strong> — batata doce, arroz, banana antes e depois 💪<br>` +
        `4️⃣ <strong>Gordura boa</strong> — pasta de amendoim, azeite, castanhas (não tenha medo) 🥜<br>` +
        `5️⃣ <strong>Progressão de carga</strong> — treino parado não gera estímulo 🏋️<br><br>` +
        `📌 No seu plano: ${parseFloat(p.weight) ? Math.round(parseFloat(p.weight) * 2) + 'g de proteína/dia' : 'proteína ajustada'} espalhadas em todas as refeições!`
      ]}
  ],

  receitas: [
    { palavras: ['receita', 'receitas', 'comer', 'cozinhar', 'prato', 'refeição', 'café da manhã', 'almoço', 'jantar', 'lanche', 'comida'],
      respostas: [p => {
        const meals = gerarRefeicoes(p, true);
        const receitasDisponiveis = Object.values(RECEITAS).flat();
        const aleatoria = receitasDisponiveis[Math.floor(Math.random() * receitasDisponiveis.length)];
        return `🍽️ <strong>Que tal experimentar esta receita?</strong><br><br>` +
          `📌 <strong>${aleatoria.nome}</strong><br>` +
          `⏱️ Tempo: ${aleatoria.tempo}<br><br>` +
          `📝 <strong>Ingredientes:</strong><br>${aleatoria.ingredientes.map(i => '• ' + i).join('<br>')}<br><br>` +
          `👨‍🍳 <strong>Modo de Preparo:</strong><br>${aleatoria.preparo.map((p, i) => `${i+1}. ${p}`).join('<br>')}<br><br>` +
          `${aleatoria.dicas ? '💡 ' + aleatoria.dicas + '<br><br>' : ''}` +
          `📋 Quer ver todas as receitas do seu plano? Toque em uma refeição no cardápio para ver opções detalhadas!`;
      }]}
  ],

  substituicoes: [
    { palavras: ['substituir', 'substituição', 'trocar', 'alternativa', 'no lugar', 'versão', 'opção', 'subs', 'diferente'],
      respostas: [p => {
        const subs = gerarSubstituicoes();
        return `🔄 <strong>Substituições inteligentes:</strong><br><br>` +
          subs.map(s => `${s.icon} <strong>${s.title}:</strong> ${s.text}`).join('<br>') +
          `<br><br>📌 Essas trocas mantêm o valor nutricional e ajudam a variar o cardápio sem sair da dieta!`;
      }]}
  ],

  agua: [
    { palavras: ['água', 'agua', 'hidratação', 'hidratar', 'beber água', 'beber agua', 'sede', 'líquido', 'liquido'],
      respostas: [p => {
        const peso = parseFloat(p.weight);
        const meta = peso ? Math.round(peso * 35) : null;
        return `💧 <strong>Hidratação:</strong><br><br>` +
          `A recomendação é <strong>35ml de água por kg de peso</strong>.<br>` +
          `${meta ? `👉 Para você: <strong>${meta}ml por dia</strong> (aproximadamente ${Math.round(meta/200)} copos de 200ml)<br>` : ''}` +
          `<br>✅ <strong>Dicas pra beber mais água:</strong><br>` +
          `• Deixe uma garrafa sempre à vista<br>` +
          `• Coloque alarme no celular de hora em hora<br>` +
          `• Temperos como limão, hortelã ou gengibre deixam mais gostosa<br>` +
          `• Água com gás pode ajudar quem sente falta de refrigerante<br><br>` +
          `🥤 Chás (sem açúcar) e água de coco também contam!`;
      }]}
  ],

  sono: [
    { palavras: ['sono', 'dormir', 'insônia', 'insonia', 'noite', 'dorme', 'descansar', 'cansaço', 'cansaço'],
      respostas: [
        p => {
        const sleepStatus = p.sleep;
        return `😴 <strong>Alimentação e sono de qualidade:</strong><br><br>` +
          `✅ <strong>O que ajuda:</strong><br>` +
          `• Chá de camomila, erva-doce ou maracujá 1h antes de dormir<br>` +
          `• Banana com canela ou leite morno — contém triptofano, precursor da serotonina<br>` +
          `• Jantar leve — omelete, salada, sopa (evite frituras à noite)<br><br>` +
          `❌ <strong>O que atrapalha:</strong><br>` +
          `• Cafeína após as 16h (café, chá preto, energético, refrigerante de cola)<br>` +
          `• Refeições pesadas perto da hora de dormir<br>` +
          `• Telas (celular/TV) 1h antes de deitar<br><br>` +
          `${sleepStatus ? `📌 Você relatou seu sono como "${sleepStatus}". ` : ''}Um bom sono regula os hormônios da fome (grelina e leptina) e melhora suas escolhas alimentares!`;
      },
        p => `🌙 <strong>Sono reparador — o segredo que poucos seguem:</strong><br><br>` +
        `💤 O hormônio do crescimento (GH) é liberado DURANTE o sono profundo — essencial pra recuperação muscular e queima de gordura!<br><br>` +
        `✅ <strong>Checklist noturno:</strong><br>` +
        `☑️ Jantar até 2h antes de dormir<br>` +
        `☑️ Nada de telas 30 min antes (luz azul inibe melatonina) 📵<br>` +
        `☑️ Quarto escuro e fresco (18-22°C) 🌑<br>` +
        `☑️ Chá calmante (camomila, melissa, erva-doce) 🍵<br>` +
        `☑️ Mesmo horário para dormir e acordar (sim, fins de semana também!) ⏰<br><br>` +
        `📌 Sono ruim → mais fome, mais desejo por açúcar, menos disposição pra treinar. Tudo conectado!`,
        p => `😴 <strong>Ritual do sono para quem tem agenda cheia:</strong><br><br>` +
        `⏰ <strong>Rotina noturna em 3 passos:</strong><br><br>` +
        `1️⃣ <strong>20:00 — Última refeição</strong> (leve: sopa, omelete, salada com proteína)<br>` +
        `2️⃣ <strong>21:00 — Desconectar</strong> (nada de trabalho, telas no modo noturno) 🧘<br>` +
        `3️⃣ <strong>22:00 — Dormir</strong> (7-9h de sono de qualidade)<br><br>` +
        `🥣 <strong>Jantar ideal pra dormir bem:</strong> proteína magra + vegetais cozidos + gordura boa (azeite). Evite carboidratos simples à noite se tem insônia.<br><br>` +
        `💡 Sua alimentação atual ${p.goal ? `focada em "${p.goal}"` : ''} já pode estar afetando seu sono — me pergunte mais se quiser ajustar!`
      ]}
  ],

  proteinas: [
    { palavras: ['proteína', 'proteina', 'aminoácidos', 'aminoacidos'],
      respostas: [
        p => `🥩 <strong>Proteínas na alimentação:</strong><br><br>` +
        `📌 Fontes de proteína magra:<br>` +
        `• Frango (peito) ≈ 30g proteína / 100g 🐔<br>` +
        `• Ovos ≈ 6g proteína por unidade 🥚<br>` +
        `• Peixe (salmão, atum, tilápia) ≈ 25g / 100g 🐟<br>` +
        `• Carne magra (patinho) ≈ 26g / 100g 🥩<br>` +
        `• Iogurte grego ≈ 10g / 100g 🥛<br>` +
        `• Grão-de-bico, lentilha ≈ 9g / 100g 🌱<br><br>` +
        `💪 <strong>Proteína ideal por dia:</strong> 1.6 a 2.2g por kg de peso para quem treina.` +
        `${parseFloat(p.weight) ? ` No seu caso, cerca de <strong>${Math.round(parseFloat(p.weight) * 1.8)}g/dia</strong>.` : ''}<br><br>` +
        `📌 Sobre suplementos: whey protein é conveniente mas não obrigatório. A proteína dos alimentos é tão eficaz quanto!`,
        p => `🥚 <strong>Proteína — o bloco de construção do corpo:</strong><br><br>` +
        `✅ <strong>Como distribuir a proteína ao longo do dia:</strong><br>` +
        `• Café da manhã: 2 ovos + 1 fatia de queijo 🥚<br>` +
        `• Almoço: 150g de frango ou bife 🥩<br>` +
        `• Lanche: 1 iogurte grego + castanhas 🥛<br>` +
        `• Jantar: 150g de peixe ou tofu 🐟<br><br>` +
        `💪 <strong>Bônus:</strong> distribuir a proteína em 4-5 refeições aumenta a síntese muscular comparado a concentrar tudo numa refeição!<br><br>` +
        `📌 Fontes vegetais também contam: combinando arroz + feijão você tem proteína completa! 🌱`,
        p => `🐟 <strong>Proteína — quanto e quando comer:</strong><br><br>` +
        `📊 <strong>Referência rápida (por kg de peso):</strong><br>` +
        `• Sedentário: 0.8g/kg/dia — só pra manutenção básica<br>` +
        `• Ativo/treino: 1.6-2.2g/kg/dia — para ganho muscular 💪<br>` +
        `• Emagrecimento: 1.8-2.4g/kg/dia — ajuda a preservar músculo no déficit 🔥<br><br>` +
        `🍽️ <strong>Equivalência prática (20g de proteína):</strong><br>` +
        `• 100g de frango/peixe/carne magra 🥩<br>` +
        `• 3 ovos 🥚<br>` +
        `• 1 pote de iogurte grego + 1 scoop de whey 🥛<br>` +
        `• 200g de tofu + 4 colheres de grão-de-bico 🌱<br><br>` +
        `💡 <strong>Regra de ouro:</strong> pelo menos 20-30g de proteína em CADA refeição principal!`
      ]}
  ],

  carboidratos: [
    { palavras: ['carboidrato', 'carbo', 'carboidratos', 'carb', 'arroz', 'pão', 'pao', 'massa', 'batata', 'macarrão', 'macarrao'],
      respostas: [
        p => `🍚 <strong>Carboidratos — o combustível do corpo:</strong><br><br>` +
        `❌ <strong>Não tenha medo dos carboidratos!</strong> Eles são essenciais para energia, função cerebral e rendimento nos treinos.<br><br>` +
        `✅ <strong>Prefira integrais:</strong><br>` +
        `• Arroz integral (ou parboilizado) 🍚<br>` +
        `• Pão integral / torrada integral 🍞<br>` +
        `• Aveia, quinoa, granola sem açúcar 🌾<br>` +
        `• Batata doce, mandioca, cará 🥔<br>` +
        `• Frutas (banana, maçã, mamão) 🍌<br><br>` +
        `⚠️ <strong>Modere:</strong> açúcar refinado, refrigerante, biscoitos recheados, farinha branca, sucos de caixinha.<br><br>` +
        `📌 No seu plano alimentar você tem opções balanceadas de carboidratos em cada refeição!`,
        p => `🍞 <strong>Carboidratos sem culpa:</strong><br><br>` +
        `🧠 O cérebro consome ~120g de glicose por dia — carboidrato é o combustível preferido do corpo!<br><br>` +
        `✅ <strong>Carboidratos de qualidade:</strong><br>` +
        `• <strong>Alta absorção</strong> (pós-treino): arroz, batata, tapioca, pão — repõem energia rápido ⚡<br>` +
        `• <strong>Média absorção</strong> (dia a dia): batata doce, macarrão integral, aveia — energia sustentada 🌾<br>` +
        `• <strong>Baixa absorção</strong> (saciedade): verduras, legumes, feijão — fibras que regulam glicemia 🫘<br><br>` +
        `💡 <strong>Dica:</strong> Combinar carbo + proteína + gordura + fibra em toda refeição mantém a glicemia estável!`
      ]}
  ],

  fibras: [
    { palavras: ['fibra', 'fibras', 'intestino', 'prisão', 'prisão de ventre', 'constipação', 'constipacao', 'aveia', 'chia', 'linhaça', 'linhaca'],
      respostas: [p => `🌿 <strong>Fibras — saúde intestinal e saciedade:</strong><br><br>` +
        `✅ <strong>Fontes de fibra:</strong><br>` +
        `• Aveia, chia, linhaça 🌾 — ótimas no café da manhã ou lanches<br>` +
        `• Vegetais folhosos (couve, espinafre, alface) 🥬<br>` +
        `• Frutas com casca (maçã, pera, uva) 🍎<br>` +
        `• Leguminosas (feijão, lentilha, grão-de-bico) 🫘<br>` +
        `• Castanhas e sementes 🥜<br><br>` +
        `🥤 <strong>Dica prática:</strong> 1 colher de sopa de chia + 200ml de água = gel de fibra. Deixa de molho 15 min e bebe!<br><br>` +
        `🚰 Lembre-se: fibras funcionam melhor com bastante água!`
      ]}
  ],

  gorduras: [
    { palavras: ['gordura', 'gorduras', 'azeite', 'castanha', 'abacate', 'oleaginosas', 'pasta de amendoim', 'lipídios', 'lipideos'],
      respostas: [
        p => `🥑 <strong>Gorduras boas — essenciais para sua saúde:</strong><br><br>` +
        `✅ <strong>Fontes de gordura boa:</strong><br>` +
        `• Azeite de oliva extra virgem (1 colher de sopa/dia)🫒<br>` +
        `• Abacate 🥑 — rico em gordura monoinsaturada<br>` +
        `• Castanhas (do Pará, amêndoas, nozes) — 5-8 unidades/dia 🥜<br>` +
        `• Pasta de amendoim (1 colher de sopa) 🥜<br>` +
        `• Sementes (chia, linhaça, gergelim) 🌱<br>` +
        `• Peixes ricos em ômega-3 (salmão, sardinha, atum) 🐟<br><br>` +
        `⚠️ <strong>Evite:</strong> frituras imersas, óleos vegetais refinados, margarina, gordura hidrogenada.<br><br>` +
        `📌 Gorduras boas ajudam na produção hormonal, absorção de vitaminas e saúde cardiovascular!`,
        p => `🫒 <strong>Gordura não é vilã — escolha as certas!</strong><br><br>` +
        `🌸 <strong>Tipos de gordura:</strong><br>` +
        `• <strong>Monoinsaturada</strong> (azeite, abacate, castanhas) — anti-inflamatória, boa pro coração ❤️<br>` +
        `• <strong>Poli-insaturada (Ômega-3)</strong> (salmão, sardinha, chia, linhaça) — cérebro e articulações 🧠<br>` +
        `• <strong>Saturada</strong> (coco, manteiga, carnes) — necessária mas com moderação ⚖️<br>` +
        `• <strong>Trans</strong> (ultraprocessados, margarina) — evite ao máximo! 🚫<br><br>` +
        `💡 <strong>Dica de ouro:</strong> adicione 1 colher de azeite extra virgem na salada, 1 abacate no meio da semana e um punhado de castanhas por dia!`,
        p => `🥑 <strong>Quanta gordura boa comer por dia?</strong><br><br>` +
        `✅ <strong>Porções diárias recomendadas:</strong><br>` +
        `• <strong>Azeite de oliva:</strong> 1-2 colheres de sopa (120-240kcal) 🫒<br>` +
        `• <strong>Castanhas:</strong> 1 punhado (5-8 unidades, ~150kcal) 🥜<br>` +
        `• <strong>Abacate:</strong> 1/2 unidade média (~130kcal) 🥑<br>` +
        `• <strong>Pasta de amendoim:</strong> 1 colher de sopa (~90kcal) 🥜<br>` +
        `• <strong>Sementes (chia/linhaça):</strong> 1 colher de sopa (~60kcal) 🌱<br><br>` +
        `📌 Gordura tem 9 calorias por grama (vs 4 de proteína/carboidrato). É mais calórica, mas ESSENCIAL para hormônios, absorção de vitaminas e saciedade!`
      ]}
  ],

  vegan: [
    { palavras: ['vegano', 'vegana', 'vegan', 'vegetariano', 'vegetariana', 'vegetariano', 'sem carne', 'sem frango', 'sem leite', 'sem ovo', 'tofu', 'plant based'],
      respostas: [
        p => `🌱 <strong>Alimentação vegetariana/vegana e nutrição:</strong><br><br>` +
        `✅ <strong>Fontes de proteína vegetal:</strong><br>` +
        `• Grão-de-bico 🫘 — 9g proteína/100g<br>` +
        `• Lentilha — 9g proteína/100g<br>` +
        `• Tofu — 8g proteína/100g 🧈<br>` +
        `• Quinoa — 4g proteína/100g (todos aminoácidos!) 🌾<br>` +
        `• Feijão preto, carioca, fradinho 🫘<br>` +
        `• Pasta de amendoim integral 🥜<br><br>` +
        `⚠️ <strong>Atenção:</strong><br>` +
        `• Vitamina B12 → essencial suplementar para veganos<br>` +
        `• Ferro → consumir com fonte de vitamina C (laranja, limão) pra melhor absorção<br>` +
        `• Cálcio → leite vegetal fortificado, couve, brócolis, tofu com cálcio<br><br>` +
        `📌 O NutriCare tem opções de substituições (tofu mexido no lugar de ovos, etc.) no seu plano!`,
        p => `🌿 <strong>Veganismo forte e saudável — é possível sim!</strong><br><br>` +
        `💪 <strong>Cardápio vegano de exemplo:</strong><br>` +
        `🌅 <strong>Café da manhã:</strong> vitamina de banana + pasta de amendoim + leite vegetal 🥤<br>` +
        `☀️ <strong>Almoço:</strong> arroz integral + feijão preto + couve refogada + tofu grelhado 🫘<br>` +
        `🌆 <strong>Lanche:</strong> 1 fruta + mix de castanhas 🥜<br>` +
        `🌙 <strong>Jantar:</strong> sopa de lentilha + pão integral 🥣<br><br>` +
        `📌 <strong>Suplementos essenciais para veganos:</strong><br>` +
        `• Vitamina B12 — NEGOCIÁVEL (todo vegano precisa) 💊<br>` +
        `• Vitamina D — se pega pouco sol ☀️<br>` +
        `• Ferro — monitore exames anualmente 🩸`
      ]}
  ],

  compulsao: [
    { palavras: ['compulsão', 'compulsao', 'ansiedade', 'ansiedade', 'comer emocional', 'fome emocional', 'atacar', 'gula', 'descontrolar', 'beliscar', 'vontade'],
      respostas: [
        p => `🧠 <strong>Fome emocional X fome física:</strong><br><br>` +
        `❓ <strong>Pergunte a si mesmo(a):</strong><br>` +
        `• A fome veio de repente? (emocional) ou foi gradual? (física)<br>` +
        `• Você quer comer algo específico? (emocional) ou qualquer coisa serve? (física)<br>` +
        `• Comeu e se sentiu culpado(a)? (emocional) ou satisfeito(a)? (física)<br><br>` +
        `✅ <strong>Estratégias práticas:</strong><br>` +
        `• Antes de comer, pare 5 segundos e respire fundo 🧘<br>` +
        `• Beba um copo de água e espere 10 minutos<br>` +
        `• Coma de 3 em 3 horas para evitar picos de fome ⏰<br>` +
        `• Tenha opções saudáveis à mão (frutas, castanhas, iogurte)<br>` +
        `• Movimento físico ajuda a regular a ansiedade 🚶<br><br>` +
        `💬 Você não está sozinho(a) nessa. O importante é não se culpar e recomeçar na próxima refeição!`,
        p => `🧘 <strong>Estratégias para lidar com a ansiedade por comida:</strong><br><br>` +
        `🤔 <strong>Antes de beliscar, tente:</strong><br>` +
        `1️⃣ Beba 1 copo de água GELADA — o choque térmico distrai o cérebro 🧊<br>` +
        `2️⃣ Saia do ambiente por 5 min (se estiver perto da comida, se afaste) 🚶<br>` +
        `3️⃣ Escove os dentes — o sabor de pasta de dente diminui a vontade de comer 😁<br>` +
        `4️⃣ Mascou chiclete sem açúcar por 5-10 min 🍬<br>` +
        `5️⃣ Ligue pra alguém e converse 5 min sobre outro assunto 📞<br><br>` +
        `💡 O melhor tratamento pra compulsão é PREVENÇÃO: não pule refeições, coma proteína em todas as refeições e não proíba completamente nenhum alimento (a restrição excessiva gera a compulsão).<br><br>` +
        `🆘 Se a compulsão for frequente, considere buscar ajuda de um psicólogo ou psiquiatra — não é fraqueza, é uma condição que tem tratamento! 🤝`
      ]}
  ],

  frutas: [
    { palavras: ['fruta', 'frutas', 'banana', 'maçã', 'maca', 'laranja', 'mamão', 'mamao', 'melancia', 'uva'],
      respostas: [
        p => `🍎 <strong>Frutas — doces da natureza:</strong><br><br>` +
        `✅ Comer fruta não engorda! A OMS recomenda 3-5 porções por dia.<br><br>` +
        `🍌 <strong>Banana</strong> — rica em potássio, ótima pré-treino<br>` +
        `🍎 <strong>Maçã</strong> — fibra pectina, ajuda saciedade<br>` +
        `🍊 <strong>Laranja</strong> — vitamina C, fortalece imunidade<br>` +
        `🥝 <strong>Mamão</strong> — enzimas digestivas, regula intestino<br>` +
        `🍇 <strong>Frutas vermelhas</strong> — antioxidantes poderosos<br>` +
        `🥑 <strong>Abacate</strong> — gordura boa, versátil em receitas<br><br>` +
        `💡 <strong>Dica:</strong> prefira a fruta inteira ao suco (mais fibra, menos açúcar, mais saciedade)!`,
        p => `🍌 <strong>Frutas da estação — mais sabor, mais nutrientes:</strong><br><br>` +
        `📅 <strong>Frutas de maio (outono no Brasil):</strong><br>` +
        `• Banana, laranja, mamão, caqui 🍊<br>` +
        `• Abacate, limão, tangerina 🥑<br>` +
        `• Goiaba, maracujá, coco verde 🥥<br><br>` +
        `✅ <strong>Combine com:</strong><br>` +
        `• Aveia + canela → café da manhã que segura a fome até o almoço 🌅<br>` +
        `• Iogurte + chia → lanche proteico 🥛<br>` +
        `• Pasta de amendoim → lanche pré-treino energético 🥜<br><br>` +
        `💡 Fruta congelada também vale! Bata com iogurte para um smoothie cremoso 🥤`,
        p => `🍇 <strong>Mito ou verdade sobre frutas?</strong><br><br>` +
        `❌ <strong>"Fruta engorda porque tem açúcar"</strong> — MITO!<br>` +
        `✅ O açúcar da fruta (frutose) vem com fibras, vitaminas e antioxidantes. O processamento é totalmente diferente do açúcar refinado!<br><br>` +
        `❌ <strong>"Suco é igual à fruta"</strong> — MITO!<br>` +
        `✅ No suco você perde as fibras e o açúcar é absorvido mais rápido. Prefira a fruta inteira 🍎<br><br>` +
        `🍌 <strong>Melhores frutas pra cada momento:</strong><br>` +
        `• <strong>Pré-treino:</strong> Banana, maçã, tâmara ⚡<br>` +
        `• <strong>Pós-treino:</strong> Mamão, laranja, kiwi (vitamina C + recuperação) 🥝<br>` +
        `• <strong>Noite:</strong> Banana (triptofano ajuda o sono) 😴<br><br>` +
        `📌 Meta: 3-5 porções de fruta por dia! Uma porção = 1 unidade média ou 1 xícara de frutas picadas.`
      ]}
  ],

  suplementos: [
    { palavras: ['suplemento', 'suplementação', 'whey', 'creatina', 'BCAA', 'pré treino', 'termogênico', 'vitamina', 'complexo', 'multivitamínico', 'multivitaminico'],
      respostas: [
        p => `💊 <strong>Suplementação — o que realmente funciona?</strong><br><br>` +
        `✅ <strong>Com evidência científica:</strong><br>` +
        `• <strong>Whey protein</strong> — praticidade pra bater proteína. Não é obrigatório, mas ajuda<br>` +
        `• <strong>Creatina</strong> — 3-5g/dia. Mais estudado suplemento do mundo. Força, cognição, recuperação 💪<br>` +
        `• <strong>Vitamina D</strong> — especialmente se você pega pouco sol ☀️<br>` +
        `• <strong>Ômega-3</strong> — se não come peixe 2x/semana 🐟<br><br>` +
        `⚠️ <strong>Cuidado:</strong><br>` +
        `• Termogênicos — efeito modesto, muitos com cafeína em excesso<br>` +
        `• BCAA — desnecessário se você já come proteína suficiente<br>` +
        `• "Queimadores" — milagre não existe, fuja de fórmulas secretas<br><br>` +
        `📌 Lembre-se: suplemento <strong>suplementa</strong>, não substitui uma alimentação equilibrada!`,
        p => `⚡ <strong>Guia rápido de suplementação:</strong><br><br>` +
        `🥤 <strong>Whey Protein:</strong> 1-2 scoops/dia (se precisar bater proteína). Tome pós-treino ou entre refeições.<br>` +
        `💪 <strong>Creatina:</strong> 3-5g/dia. Todos os dias (não precisa ciclar). Demora 2-4 semanas pra saturar.<br>` +
        `🌿 <strong>Ômega-3:</strong> 1-2g/dia (EPA+DHA). Anti-inflamatório, coração e cérebro.<br>` +
        `☀️ <strong>Vitamina D:</strong> 1000-2000 UI/dia (ideal fazer exame de sangue primeiro).<br><br>` +
        `🥇 <strong>Ordem de prioridade:</strong> Creatina > Whey > Vitamina D > Ômega-3 > Outros`
      ]}
  ],

  motivacao: [
    { palavras: ['motivação', 'motivacao', 'motivado', 'desanimado', 'difícil', 'dificil', 'desistir', 'não consigo', 'nao consigo', 'força', 'determinação', 'determinacao'],
      respostas: [p => `💪 <strong>Mensagem especial pra você, ${p.name || 'guerreiro(a)'}:</strong><br><br>` +
        `A mudança de hábito não é uma linha reta — tem altos e baixos, e <strong>tudo bem</strong>.<br><br>` +
        `🌟 <strong>Lembre-se:</strong><br>` +
        `• Você não precisa ser perfeito(a), apenas consistente<br>` +
        `• Um dia "fora da dieta" não apaga uma semana de acertos<br>` +
        `• Pequenas mudanças sustentáveis vencem dietas radicais<br>` +
        `• O importante não é a velocidade, é não parar 🏃<br><br>` +
        `📊 Você já deu o primeiro passo — se conhecer melhor através do NutriCare. Parabéns por isso! 🎉<br><br>` +
        `📌 Vamos focar no progresso, não na perfeição. Tá bem? 😊`
      ]}
  ],

  janta_leve: [
    { palavras: ['jantar leve', 'jantar', 'ceia', 'noite', 'não engordar', 'nao engordar'],
      respostas: [
        p => `🌙 <strong>Jantar leve e nutritivo:</strong><br><br>` +
          `✅ <strong>Opções leves:</strong><br>` +
          `• Omelete de 2 ovos + espinafre + salada verde 🥗<br>` +
          `• Sopa de legumes com frango desfiado 🥣<br>` +
          `• Salada grande + proteína (atum, frango, ovo) 🥬<br>` +
          `• Wrap integral com ricota e frango desfiado 🌮<br>` +
          `• Iogurte com frutas e granola 🥛<br><br>` +
          `⚠️ Evite: frituras, carboidratos em excesso e refeições pesadas perto de dormir.`,
        p => `🌙 <strong>Jantar leve — 3 ideias práticas:</strong><br><br>` +
          `🥣 <strong>Sopa detox:</strong> abóbora + gengibre + frango desfiado<br>` +
          `🥗 <strong>Salada completa:</strong> folhas + quinoa + atum + azeite + limão<br>` +
          `🍳 <strong>Omelete power:</strong> 2 ovos + cottage + espinafre + tomate<br><br>` +
          `💡 Jantar até 2h antes de dormir melhora a qualidade do sono e a digestão!`
      ]}
  ],

  cafe_da_manha: [
    { palavras: ['café da manhã', 'cafe da manha', 'café', 'cafe', 'primeira refeição', 'desjejum', 'jejum'],
      respostas: [
        p => `🌅 <strong>Café da manhã equilibrado:</strong><br><br>` +
        `✅ <strong>Monte seu café da manhã ideal:</strong><br>` +
        `1️⃣ <strong>Proteína</strong> — ovos, iogurte grego, cottage, whey (segura a fome!)<br>` +
        `2️⃣ <strong>Carboidrato bom</strong> — pão integral, aveia, banana, tapioca<br>` +
        `3️⃣ <strong>Gordura boa</strong> — pasta de amendoim, castanhas, azeite, abacate<br>` +
        `4️⃣ <strong>Hidratação</strong> — café, chá, ou água<br><br>` +
        `🍳 <strong>Combinação clássica:</strong> 2 ovos mexidos + 1 fatia pão integral + café ☕ + 1 fruta 🍌<br><br>` +
        `📌 Olhe seu plano alimentar — você já tem opções de café da manhã lá!`,
        p => `☀️ <strong>Café da manhã rápido (≤5 min) pra quem tem pressa:</strong><br><br>` +
        `⏰ <strong>Opções práticas:</strong><br><br>` +
        `🥤 <strong>Opção 1 — Smoothie proteico:</strong> 1 banana + 1 scoop whey + 200ml leite + 1 colher aveia. Bate tudo e bebe!<br>` +
        `🥪 <strong>Opção 2 — Sanduíche prático:</strong> pão integral + cottage + peito de peru + 1 copo de leite<br>` +
        `🥣 <strong>Opção 3 — Tigela power:</strong> iogurte grego + granola + frutas vermelhas + chia<br>` +
        `🥚 <strong>Opção 4 — Ovos de microondas:</strong> 2 ovos batidos no refratário, 1 minuto no micro, pão integral + café<br><br>` +
        `💡 <strong>Dica:</strong> Prepare noite anterior o que puder (deixe frutas cortadas, porcione a granola) — de manhã cada minuto conta!`,
        p => `🥣 <strong>Café da manhã que segura a fome até o almoço:</strong><br><br>` +
        `🔑 <strong>O segredo é: proteína + fibra + gordura boa</strong><br><br>` +
        `🥇 <strong>Top 3 cafés da manhã campeões de saciedade:</strong><br>` +
        `1️⃣ 2 ovos mexidos + 1 fatia pão integral + 1/2 abacate + café ☕<br>` +
        `2️⃣ 1 pote iogurte grego + 2 colheres aveia + 1 colher chia + frutas vermelhas 🫐<br>` +
        `3️⃣ Vitamina de banana + pasta de amendoim + leite + aveia 🥤<br><br>` +
        `💡 Estudos mostram que um café da manhã rico em proteína reduz em até 30% a ingestão calórica no resto do dia!`
      ]}
  ],

  cardapio_semanal: [
    { palavras: ['cardápio', 'cardapio', 'cardápio semanal', 'menu', 'planejamento', 'marmita', 'organização', 'organizar', 'preparar', 'semana'],
      respostas: [p => `📋 <strong>Planejamento semanal — o segredo do sucesso:</strong><br><br>` +
        `🗓️ <strong>Reserve 1h no domingo para:</strong><br>` +
        `• Olhar seu plano alimentar no NutriCare 📱<br>` +
        `• Fazer a lista de compras (você já tem uma no app!) 🛒<br>` +
        `• Pré-preparar: lavar vegetais, cozinhar arroz integral, temperar proteínas<br>` +
        `• Separar porções em potes individuais 🧊<br><br>` +
        `💡 <strong>Vantagens:</strong><br>` +
        `• Menos estresse na correria do dia a dia<br>` +
        `• Menos chance de pedir comida não saudável<br>` +
        `• Economia de tempo e dinheiro 💰<br>` +
        `• Mais aderência ao plano 📈`
      ]}
  ],

  digestao: [
    { palavras: ['digestão', 'digestao', 'digestivo', 'estômago', 'estomago', 'intestino', 'probiótico', 'probiotico', 'fermentado', 'kefir', 'iogurte natural', 'enzima', 'gases', 'azia', 'queimação', 'queimacao', 'estufamento', 'barriga inchada'],
      respostas: [
        p => `🫘 <strong>Saúde digestiva —肠道 feliz, vida feliz:</strong><br><br>` +
          `✅ <strong>Alimentos que ajudam a digestão:</strong><br>` +
          `• Kefir, iogurte natural, kombucha — probióticos naturais 🥛<br>` +
          `• Gengibre, hortelã, erva-doce — chás que aliviam gases 🌿<br>` +
          `• Mamão e abacaxi — enzimas digestivas naturais (papaína e bromelina) 🍍<br>` +
          `• Água morna com limão em jejum — estimula o sistema digestivo 🍋<br>` +
          `• Fibras solúveis (aveia, chia, banana) — regulam o intestino 🍌<br><br>` +
          `⚠️ <strong>Evite:</strong> frituras, ultraprocessados, refrigerantes, excesso de café em jejum.<br><br>` +
          `💡 <strong>Dica:</strong> Coma devagar e mastigue bem os alimentos — a digestão começa na boca!`,
        p => `🌿 <strong>Probióticos e saúde intestinal:</strong><br><br>` +
          `🥛 <strong>Fontes de probióticos (micro-organismos vivos benéficos):</strong><br>` +
          `• Iogurte natural (com fermento lácteo ativo)<br>` +
          `• Kefir (leite ou água) — mais potente que o iogurte<br>` +
          `• Kombucha — chá fermentado<br>` +
          `• Chucrute (repolho fermentado) 🥬<br>` +
          `• Missô, tempeh (soja fermentada) 🫘<br><br>` +
          `🥣 <strong>Prebióticos (alimento dos probióticos):</strong><br>` +
          `• Alho, cebola, banana verde, aveia, maçã 🍎<br><br>` +
          `📌 Um intestino saudável melhora a absorção de nutrientes, imunidade e até o humor!`
      ]}
  ],

  imunidade: [
    { palavras: ['imunidade', 'imune', 'imunológico', 'imunologico', 'defesa', 'anticorpo', 'vitamina c', 'vitamina d', 'zinco', 'gripe', 'resfriado', 'doente', 'fortalecer', 'imunizar'],
      respostas: [
        p => `🛡️ <strong>Alimentos que fortalecem a imunidade:</strong><br><br>` +
          `✅ <strong>Nutrientes-chave para o sistema imune:</strong><br>` +
          `• <strong>Vitamina C</strong> — laranja, acerola, kiwi, pimentão, brócolis 🍊<br>` +
          `• <strong>Vitamina D</strong> — sol (15min/dia), peixes gordurosos, ovos, cogumelos ☀️<br>` +
          `• <strong>Zinco</strong> — carnes, frutos do mar, sementes de abóbora, castanhas 🥜<br>` +
          `• <strong>Selênio</strong> — castanha-do-pará (1 unidade/dia já basta!)<br>` +
          `• <strong>Ômega-3</strong> — salmão, sardinha, chia, linhaça 🐟<br>` +
          `• <strong>Ferro</strong> — feijão, lentilha, carne magra, couve 🫘<br><br>` +
          `💤 <strong>Não esqueça:</strong> sono de qualidade ≥7h é ESSENCIAL para imunidade!<br><br>` +
          `📌 Uma alimentação colorida (5+ cores por dia) garante variedade de nutrientes!`,
        p => `🛡️ <strong>Como fortalecer seu sistema imune com alimentos:</strong><br><br>` +
          `🔬 <strong>Cada nutriente tem um papel específico:</strong><br>` +
          `• <strong>Vitamina C</strong> — aumenta produção de glóbulos brancos. Fontes: acerola, laranja, kiwi, pimentão 🍊<br>` +
          `• <strong>Vitamina D</strong> — modula resposta imune. Fontes: sol (15min/dia), salmão, ovos, cogumelos ☀️<br>` +
          `• <strong>Zinco</strong> — maturação das células de defesa. Fontes: ostras, carne, castanha de caju 🥩<br>` +
          `• <strong>Selênio</strong> — potente antioxidante. Fontes: 1 castanha-do-pará/dia já basta! 🥜<br>` +
          `• <strong>Ômega-3</strong> — ação anti-inflamatória. Fontes: sardinha, atum, chia, linhaça 🐟<br>` +
          `• <strong>Ferro</strong> — transporte de oxigênio para células imunes. Fontes: feijão, lentilha, couve 🫘<br><br>` +
          `💡 <strong>Dica prática:</strong> prato colorido (3+ cores) = variedade de nutrientes imunoprotetores naturalmente!<br><br>` +
          `🧘 <strong>Fatores além da dieta:</strong> sono ≥7h, exercício moderado e controle do estresse são tão importantes quanto a alimentação.`
      ]}
  ],

  lanches: [
    { palavras: ['lanche', 'lanches', 'beliscar', 'petisco', 'entre refeições', 'intervalo', 'tarde', 'sede', 'fome fora de hora', 'snack', 'tira gosto'],
      respostas: [
        p => `🥤 <strong>Lanches saudáveis — matam a fome sem sabotar a dieta:</strong><br><br>` +
          `✅ <strong>Opções de lanches práticos:</strong><br>` +
          `• 1 iogurte natural + 1 colher de granola sem açúcar 🥛<br>` +
          `• 1 banana + 1 colher de pasta de amendoim integral 🍌<br>` +
          `• 3 castanhas-do-pará + 1 fruta 🥜<br>` +
          `• 1 ovo cozido + torrada integral 🥚<br>` +
          `• 1 fatia de pão integral + cottage + tomate 🍞<br>` +
          `• 1 polenguinho light + cenoura baby 🥕<br>` +
          `• 1 scoop de whey com água ou leite 🥤<br><br>` +
          `⏰ <strong>Ideal:</strong> um lanche no meio da manhã e outro no meio da tarde, ~3h após cada refeição principal.`,
        p => `🍎 <strong>Lanches inteligentes para sua rotina:</strong><br><br>` +
          `💡 A chave do lanche ideal = <strong>proteína + fibra + gordura boa</strong>, assim você não sente fome até a próxima refeição.<br><br>` +
          `🥑 <strong>Combinações rápidas (≤5 min de preparo):</strong><br>` +
          `• Pasta de amendoim + maçã fatiada 🍎<br>` +
          `• Iogurte grego + chia + frutas vermelhas 🫐<br>` +
          `• Palitos de cenoura/pepino + homus 🥕<br>` +
          `• Mix de castanhas + uvas passas 🥜<br>` +
          `• Queijo minas + goiabada (versão fit) 🧀<br><br>` +
          `⚠️ <strong>Evite:</strong> barrinhas de cereal industrializadas, bolachas, salgadinhos, refrigerantes.`
      ]}
  ],

  bebidas: [
    { palavras: ['bebida', 'suco', 'sucos', 'chá', 'cha', 'café', 'cafe', 'refrigerante', 'bebida alcoólica', 'alcool', 'cerveja', 'vinho', 'energético', 'isotônico', 'agua saborizada', 'limonada'],
      respostas: [
        p => `🥤 <strong>Bebidas — escolhas que fazem diferença:</strong><br><br>` +
          `✅ <strong>Bebidas recomendadas:</strong><br>` +
          `• Água é sempre a melhor opção 💧<br>` +
          `• Chás sem açúcar (verde, hibisco, camomila, hortelã) 🍵<br>` +
          `• Café puro (até 3 xícaras/dia — antioxidantes + energia) ☕<br>` +
          `• Água com gás + limão ou hortelã 🍋<br>` +
          `• Sucos naturais (pouco coados, para manter a fibra) 🍊<br><br>` +
          `⚠️ <strong>Modere ou evite:</strong><br>` +
          `• Refrigerantes (açúcar ou adoçantes em excesso) 🥤<br>` +
          `• Sucos de caixinha (pouca fibra, muito açúcar)<br>` +
          `• Bebidas alcoólicas (calorias vazias, atrapalham o sono e a recuperação muscular) 🍺<br>` +
          `• Energéticos (cafeína em excesso, mistura perigosa com álcool) ⚡<br><br>` +
          `💡 <strong>Dica:</strong> Para cada bebida alcoólica, intercale com 1 copo de água!`,
        p => `☕ <strong>Café e nutrição — o que você precisa saber:</strong><br><br>` +
          `✅ <strong>Benefícios do café (com moderação):</strong><br>` +
          `• Rico em antioxidantes ☕<br>` +
          `• Melhora foco e disposição para treinar ⚡<br>` +
          `• Pode ajudar no metabolismo (termogênese leve)<br><br>` +
          `⚠️ <strong>Cuidados:</strong><br>` +
          `• Não exceda 3-4 xícaras/dia (400mg cafeína)<br>` +
          `• Evite após as 16h para não atrapalhar o sono 😴<br>` +
          `• De preferência ao café preto/filtrado — evite versões com creme, chantilly, muito açúcar<br><br>` +
          `🍵 <strong>Alternativas:</strong> chá verde (menos cafeína, antioxidante), chá de hibisco, café descafeinado.`
      ]}
  ],

  alergias: [
    { palavras: ['alergia', 'alergias', 'intolerância', 'intolerancia', 'lactose', 'glúten', 'gluten', 'drágea', 'dragea', 'intolerante', 'alérgico', 'alergico', 'restrição', 'restricao'],
      respostas: [
        p => `⚠️ <strong>Alergias e intolerâncias alimentares:</strong><br><br>` +
          `❓ <strong>Diferença importante:</strong><br>` +
          `• <strong>Alergia</strong> — reação do sistema imune (urticária, inchaço, anafilaxia). Pode ser GRAVE. 🚨<br>` +
          `• <strong>Intolerância</strong> — dificuldade de digerir (gases, dor abdominal, diarreia). Desconfortável mas não fatal.<br><br>` +
          `🥛 <strong>Intolerância à lactose:</strong><br>` +
          `• Alternativas: leite zero lactose, leites vegetais (amêndoas, aveia, soja), queijos curados<br>` +
          `• Suplemento de lactase pode ajudar 🧪<br><br>` +
          `🌾 <strong>Sensibilidade ao glúten / Doença Celíaca:</strong><br>` +
          `• Alternativas: arroz, quinoa, milho, batata, mandioca, aveia sem contaminação cruzada<br>` +
          `• Pães e massas sem glúten disponíveis em mercados 🍞<br><br>` +
          `📌 <strong>Importante:</strong> Consulte um médico ou nutricionista para diagnóstico. Não se auto-diagnostique!<br><br>` +
          `🫘 No seu plano, ${p.name || 'você'} tem opções variadas que podem ser adaptadas!`,
        p => `🥜 <strong>Vivendo bem com restrições alimentares:</strong><br><br>` +
          `✅ <strong>Dicas práticas:</strong><br>` +
          `• Sempre leia os rótulos dos alimentos (mesmo produtos que você já conhece — fórmulas mudam) 🏷️<br>` +
          `• Ao comer fora, avise o restaurante sobre sua restrição 🍽️<br>` +
          `• Tenha versões seguras em casa para emergências<br>` +
          `• Não substitua um alimento por ultraprocessados "versão diet" 🥫<br><br>` +
          `🔬 Consulte um nutricionista para um plano totalmente adaptado às suas necessidades!`
      ]}
  ],

  vegetais: [
    { palavras: ['vegetal', 'vegetais', 'legume', 'legumes', 'verdura', 'verduras', 'salada', 'couve', 'espinafre', 'brócolis', 'brocolis', 'cenoura', 'abobrinha', 'berinjela', 'chuchu', 'vagem'],
      respostas: [
        p => `🥬 <strong>Vegetais — o arco-íris no prato:</strong><br><br>` +
          `🌈 <strong>Quanto mais cor, melhor!</strong><br><br>` +
          `• 🟢 <strong>Verdes</strong> (couve, espinafre, brócolis) — ferro, cálcio, fibras, vitamina K<br>` +
          `• 🟠 <strong>Laranja/Amarelo</strong> (cenoura, abóbora, pimentão) — vitamina A, betacaroteno<br>` +
          `• 🔴 <strong>Vermelhos</strong> (tomate, pimentão) — licopeno, antioxidante potente<br>` +
          `• 🟣 <strong>Roxos</strong> (berinjela, repolho roxo) — antocianinas, anti-inflamatório<br>` +
          `• ⚪ <strong>Brancos</strong> (couve-flor, cebola, alho) — alicina, enxofre, imunidade<br><br>` +
          `💡 <strong>Meta:</strong> pelo menos 3 cores diferentes no almoço e 2 no jantar!<br><br>` +
          `👨‍🍳 <strong>Dica:</strong> Se você não gosta de salada, experimente refogados, assados ou cremes — muda completamente o sabor!`,
        p => `🥦 <strong>Como incluir mais vegetais no dia a dia:</strong><br><br>` +
          `✅ <strong>Estratégias práticas:</strong><br>` +
          `• Café da manhã: adicione espinafre ao omelete ou vitamina 🥬<br>` +
          `• Almoço: encha metade do prato com vegetais variados 🥗<br>` +
          `• Jantar: sopa de legumes + proteína — refeição leve e nutritiva 🥣<br>` +
          `• Lanches: palitos de cenoura, pepino, salsão com homus 🥕<br><br>` +
          `🔥 <strong>Formas de preparo que preservam nutrientes:</strong><br>` +
          `• No vapor (preserva mais vitaminas)<br>` +
          `• Refogado rápido no azeite (pouco tempo, muito sabor)<br>` +
          `• Assado no forno (realça o sabor adocicado natural) 🎯<br><br>` +
          `📌 No seu plano alimentar você já tem vegetais incluídos em cada refeição!`
      ]}
  ],

  criancas: [
    { palavras: ['criança', 'crianca', 'crianças', 'criancas', 'infantil', 'filho', 'filha', 'bebê', 'bebe', 'papinha', 'introdução alimentar', 'introducao alimentar', 'escola', 'merenda', 'criançada'],
      respostas: [
        p => `👶 <strong>Alimentação infantil — criando hábitos saudáveis desde cedo:</strong><br><br>` +
          `🍼 <strong>Introdução alimentar (6 meses+):</strong><br>` +
          `• Ofereça um alimento de cada vez para identificar aceitação e possíveis alergias<br>` +
          `• Amasse com o garfo (não bata no liquidificador) — a criança precisa sentir texturas<br>` +
          `• Sem açúcar, sal ou mel no primeiro ano de vida 🚫<br><br>` +
          `🧒 <strong>Crianças maiores (2-10 anos):</strong><br>` +
          `• Ofereça alimentos coloridos e em formatos divertidos 🎨<br>` +
          `• Envolva a criança no preparo das refeições 👩‍🍳<br>` +
          `• Seja exemplo: se você come salada, ela também vai querer 🥗<br>` +
          `• Não use comida como recompensa ou castigo 🚫<br><br>` +
          `⚠️ Consulte um pediatra ou nutricionista infantil para orientação individualizada!`
      ]}
  ],

  idosos: [
    { palavras: ['idoso', 'idosa', 'idosos', 'terceira idade', 'melhor idade', 'envelhecimento', 'envelhecer', 'osteoporose', 'sarcopenia', 'queda', 'memória', 'memoria', 'vitamina b12', 'enxergar'],
      respostas: [
        p => `👴 <strong>Nutrição na melhor idade — envelhecer com saúde:</strong><br><br>` +
          `✅ <strong>Nutrientes essenciais para 60+:</strong><br>` +
          `• <strong>Proteína</strong> — previne sarcopenia (perda de massa muscular). 1.2-1.5g por kg de peso! 💪<br>` +
          `• <strong>Cálcio + Vitamina D</strong> — previnem osteoporose. Leite, derivados, sol ☀️<br>` +
          `• <strong>Vitamina B12</strong> — função cerebral e energia. (absorção diminui com idade) 🧠<br>` +
          `• <strong>Fibras</strong> — regulam o intestino, que tende a ficar mais lento 🫘<br>` +
          `• <strong>Ômega-3</strong> — saúde cerebral e cardiovascular 🐟<br><br>` +
          `💧 <strong>Hidratação extra!</strong> A sensação de sede diminui com a idade — programe lembretes para beber água.<br><br>` +
          `🥣 <strong>Dica:</strong> Refeições menores e mais frequentes ajudam na digestão e no apetite.`
      ]}
  ],

  gestacao: [
    { palavras: ['gravidez', 'gestação', 'gestacao', 'grávida', 'gravida', 'gestante', 'amamentação', 'amamentacao', 'lactante', 'barriga', 'pré natal', 'pre natal'],
      respostas: [
        p => `🤰 <strong>Nutrição na gestação e amamentação:</strong><br><br>` +
          `✅ <strong>Nutrientes fundamentais:</strong><br>` +
          `• <strong>Ácido fólico (Vitamina B9)</strong> — essencial no 1º trimestre. Folhas verdes, feijão, laranja 🥬<br>` +
          `• <strong>Ferro</strong> — previne anemia. Carnes magras, feijão, beterraba + vitamina C 🩸<br>` +
          `• <strong>Cálcio</strong> — formação óssea do bebê. Leite, derivados, brócolis 🥛<br>` +
          `• <strong>Ômega-3 (DHA)</strong> — desenvolvimento cerebral do bebê. Peixes, chia, linhaça 🐟<br>` +
          `• <strong>Proteína</strong> — 1.1g por kg de peso (ligeiramente acima do normal)<br><br>` +
          `⚠️ <strong>Evite:</strong> álcool, cafeína em excesso, carnes cruas/malpassadas, peixes com alto mercúrio, laticínios não pasteurizados. 🚫<br><br>` +
          `👨‍⚕️ <strong>Importante:</strong> Consulte seu obstetra e nutricionista para orientação individualizada! Essa é uma fase única que merece acompanhamento profissional.`
      ]}
  ],

  fora_de_nutricao: [
    { palavras: ['medicamento', 'remédio', 'doença', 'doenca', 'diagnóstico', 'diagnostico', 'cirurgia', 'câncer', 'cancer', 'tumor', 'prescrição', 'prescricao'],
      respostas: [p => `⚠️ <strong>Sou um assistente de nutrição, não um médico!</strong><br><br>` +
        `Não posso prescrever ou recomendar tratamentos médicos. Essas perguntas devem ser feitas ao seu médico ou nutricionista clínico.<br><br>` +
        `✅ Posso ajudar com:<br>` +
        `• Dúvidas sobre alimentação saudável 🥗<br>` +
        `• Receitas e substituições 🍳<br>` +
        `• Dicas para seus objetivos 🎯<br>` +
        `• Interpretação do seu plano alimentar 📋<br><br>` +
        `👨‍⚕️ Consulte sempre um profissional de saúde para questões clínicas!`
      ]}
  ]
};

// ---- Banco de Perguntas Pré-Definidas do Bot Nutricionista ----
const BOT_PERGUNTAS = [
  {
    key: 'pre_treino',
    icon: '⚡',
    label: 'Pré-Treino',
    perguntas: [
      'O que comer antes de treinar?',
      'Quanto tempo antes do treino devo comer?',
      'Melhor pré-treino natural para energia'
    ]
  },
  {
    key: 'pos_treino',
    icon: '💪',
    label: 'Pós-Treino',
    perguntas: [
      'O que comer depois do treino?',
      'Janela de recuperação pós-treino',
      'Receita rápida de pós-treino'
    ]
  },
  {
    key: 'emagrecimento',
    icon: '🔥',
    label: 'Emagrecimento',
    perguntas: [
      'Dicas para emagrecer com saúde',
      'Quantos quilos posso perder por semana?',
      'O que evitar na dieta'
    ]
  },
  {
    key: 'ganho_massa',
    icon: '🏋️',
    label: 'Ganho de Massa',
    perguntas: [
      'Dicas para ganhar massa muscular',
      'O que não pode faltar na dieta?',
      'Quantas refeições por dia?'
    ]
  },
  {
    key: 'proteinas',
    icon: '🥩',
    label: 'Proteínas',
    perguntas: [
      'Quanto de proteína comer por dia?',
      'Melhores fontes de proteína',
      'Whey protein vale a pena?'
    ]
  },
  {
    key: 'carboidratos',
    icon: '🍚',
    label: 'Carboidratos',
    perguntas: [
      'Preciso cortar carboidrato para emagrecer?',
      'Melhores fontes de carboidrato'
    ]
  },
  {
    key: 'gorduras',
    icon: '🥑',
    label: 'Gorduras',
    perguntas: [
      'Gordura faz mal?',
      'Quais gorduras comer no dia a dia'
    ]
  },
  {
    key: 'sono',
    icon: '😴',
    label: 'Sono',
    perguntas: [
      'O que comer para dormir melhor?',
      'Alimentação atrapalha o sono?'
    ]
  },
  {
    key: 'receitas',
    icon: '🍳',
    label: 'Receitas',
    perguntas: [
      'Me dica uma receita saudável',
      'Opções de café da manhã rápido'
    ]
  },
  {
    key: 'suplementos',
    icon: '💊',
    label: 'Suplementos',
    perguntas: [
      'Quais suplementos realmente funcionam?',
      'Creatina e whey: como tomar?'
    ]
  },
  {
    key: 'agua',
    icon: '💧',
    label: 'Hidratação',
    perguntas: [
      'Quanto de água devo beber por dia?',
      'Dicas para beber mais água'
    ]
  },
  {
    key: 'vegan',
    icon: '🌱',
    label: 'Vegano',
    perguntas: [
      'Como ter proteína na dieta vegana?',
      'Suplementos essenciais para veganos'
    ]
  },
  {
    key: 'compulsao',
    icon: '🧠',
    label: 'Fome Emocional',
    perguntas: [
      'Diferença entre fome física e emocional',
      'Estratégias para lidar com a ansiedade por comida'
    ]
  },
  {
    key: 'digestao',
    icon: '🫘',
    label: 'Digestão',
    perguntas: [
      'Alimentos que ajudam a digestão',
      'Probióticos e saúde intestinal'
    ]
  },
  {
    key: 'imunidade',
    icon: '🛡️',
    label: 'Imunidade',
    perguntas: [
      'Alimentos que fortalecem a imunidade',
      'Nutrientes essenciais para defesa do corpo'
    ]
  },
  {
    key: 'lanches',
    icon: '🥤',
    label: 'Lanches',
    perguntas: [
      'Opções de lanches saudáveis',
      'Lanches rápidos para levar na bolsa'
    ]
  },
  {
    key: 'cafe_da_manha',
    icon: '🌅',
    label: 'Café da Manhã',
    perguntas: [
      'Café da manhã equilibrado',
      'Café da manhã rápido (menos de 5 min)'
    ]
  },
  {
    key: 'frutas',
    icon: '🍎',
    label: 'Frutas',
    perguntas: [
      'Fruta engorda? Pode comer à vontade?',
      'Melhores frutas para cada momento do dia'
    ]
  }
];

// ---- Sanitização HTML (DOM-based, segura contra XSS) ----
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---- Sanitiza perfil do usuário para uso em respostas HTML ----
function sanitizeProfileForBot(p) {
  if (!p) return p;
  const safe = {};
  for (const [key, val] of Object.entries(p)) {
    if (typeof val === 'string') safe[key] = escapeHtml(val);
    else if (Array.isArray(val)) safe[key] = val.map(v => typeof v === 'string' ? escapeHtml(v) : v);
    else safe[key] = val;
  }
  return safe;
}

// ---- Stemming: gera variações de palavras em português ----
const _STEM_CACHE = {};
function gerarVariacoes(palavra) {
  if (_STEM_CACHE[palavra]) return _STEM_CACHE[palavra];
  const vars = [palavra];
  // Regras simples de stemming para português
  if (palavra.endsWith('ar')) {
    vars.push(palavra.slice(0, -2));       // treinar → treina
    vars.push(palavra.slice(0, -1));       // treinar → treina (com r)
    vars.push(palavra.slice(0, -2) + 'o'); // treinar → treino
    vars.push(palavra.slice(0, -2) + 'ou');// treinar → treinou
    vars.push(palavra.slice(0, -2) + 'ando'); // treinar → treinando
  } else if (palavra.endsWith('er')) {
    vars.push(palavra.slice(0, -2));       // comer → come
    vars.push(palavra.slice(0, -1));       // comer → comer (com r)
    vars.push(palavra.slice(0, -2) + 'o'); // comer → como
    vars.push(palavra.slice(0, -2) + 'eu');// comer → comeu
    vars.push(palavra.slice(0, -2) + 'endo'); // comer → comendo
  } else if (palavra.endsWith('ir')) {
    vars.push(palavra.slice(0, -2));       // dormir → dorme
    vars.push(palavra.slice(0, -1));       // dormir → dormi
    vars.push(palavra.slice(0, -2) + 'o'); // dormir → durmo
    vars.push(palavra.slice(0, -2) + 'iu');// dormir → dormiu
    vars.push(palavra.slice(0, -2) + 'indo'); // dormir → dormindo
  } else if (palavra.endsWith('ão')) {
    vars.push(palavra.slice(0, -2));       // proteína (opção)
    vars.push(palavra.slice(0, -2) + 's'); // proteínas
  } else if (palavra.endsWith('s') && palavra.length > 3) {
    vars.push(palavra.slice(0, -1));       // proteínas → proteína
  }
  // Plural
  if (palavra.endsWith('s') && palavra.length > 3) {
    vars.push(palavra.slice(0, -1));
  } else if (!palavra.endsWith('s')) {
    vars.push(palavra + 's');
  }
  // Aumentativos/diminutivos comuns
  if (palavra.endsWith('inho')) vars.push(palavra.slice(0, -4));
  if (palavra.endsWith('inha')) vars.push(palavra.slice(0, -4));

  _STEM_CACHE[palavra] = [...new Set(vars)];
  return _STEM_CACHE[palavra];
}

// ---- Detecta se é follow-up (pergunta curta referindo-se ao tópico anterior) ----
function isFollowUp(texto) {
  const t = texto.trim().toLowerCase();
  // Só textos muito curtos (≤5 chars) são considerados follow-up automático
  // Textos >5 chars são tratados como nova pergunta, não follow-up
  // Isso evita que perguntas como "proteína" (8), "receitas" (8), "pre treino" (9)
  // sejam forçadas a receber resposta da mesma categoria anterior
  if (t.length <= 5) return true;
  if (/^(e\b|mas|também|tambem|então|entao|aí|dai)/.test(t)) return true;
  return false;
}

// ---- Extrai palavras negativas que precedem keywords ----
function hasNegacao(texto, keyword) {
  const idx = texto.indexOf(keyword);
  if (idx < 0) return false;
  const before = texto.substring(Math.max(0, idx - 20), idx);
  return /\b(não|nao|nunca|jamais|sem|exceto|menos|evito|odeio|detesto|tenho medo|nao como|não como|nao gosto|não gosto)\b/i.test(before);
}

// ---- Sistema de matching inteligente ----
function encontrarMelhorResposta(texto, profile) {
  const textoLower = texto.toLowerCase().trim();
  const isFollow = isFollowUp(textoLower);

  // 1. Verifica se é pergunta sobre fora do escopo (prioridade máxima)
  const termosMedicos = ['remédio', 'remedio', 'medicamento', 'doença', 'doenca', 'diagnóstico', 'diagnostico',
    'câncer', 'cancer', 'tumor', 'cirurgia', 'prescrição', 'prescricao', 'receita médica', 'receita medica',
    'antibiótico', 'antibiotico', 'doente', 'internação', 'internacao', 'quimioterapia', 'radioterapia'];
  if (termosMedicos.some(t => textoLower.includes(t))) {
    STATE.lastBotCategory = 'fora_de_nutricao';
    const cat = BOT_CONHECIMENTO.fora_de_nutricao[0];
    return cat.respostas[Math.floor(Math.random() * cat.respostas.length)](profile);
  }

  // 2. Calcula score para cada categoria com stemming + negação + contexto
  let melhorCategoria = null;
  let melhorScore = 0;
  let melhorResposta = null;
  const scoresPorCategoria = {};

  for (const [categoria, items] of Object.entries(BOT_CONHECIMENTO)) {
    if (categoria === 'fora_de_nutricao') continue; // já verificamos
    let catScore = 0;

    for (const item of items) {
      let score = 0;
      for (const palavra of item.palavras) {
        // Gera variações da palavra (stemming)
        const variacoes = gerarVariacoes(palavra);
        for (const v of variacoes) {
          if (v.length < 3) continue;
          let found = false;
          // Busca como palavra inteira ou substring
          const idx = textoLower.indexOf(v);
          if (idx >= 0) {
            found = true;
            // Verifica negação antes da palavra
            if (hasNegacao(textoLower, v)) {
              score -= Math.min(v.length / 2, 3); // penaliza
            } else {
              // Palavras mais longas = mais específicas = maior peso
              const pesoBase = Math.min(v.length / 3, 5);
              // Bônus se é palavra completa (não apenas substring de outra)
              const bordaAntes = idx === 0 || /[\s,.\-!?/]/.test(textoLower[idx - 1]);
              const bordaDepois = idx + v.length >= textoLower.length || /[\s,.\-!?/]/.test(textoLower[idx + v.length]);
              score += bordaAntes && bordaDepois ? pesoBase * 1.5 : pesoBase;
            }
          }
          if (found) break; // Uma variação já basta
        }
      }

      // Bônus se a categoria tem match com o objetivo do usuário
      if (categoria === 'emagrecimento' && profile.goal?.includes('Emagrecimento')) score += 2;
      if (categoria === 'ganho_massa' && profile.goal?.includes('massa muscular')) score += 2;
      if (categoria === 'vegan' && profile.restrictions?.some?.(r => /vegan|vegetar/i.test(r))) score += 2;
      if (categoria === 'vegan' && String(profile.restrictionDetail || '').toLowerCase().includes('vegan')) score += 2;
      if (categoria === 'receitas' && profile.favFoods) score += 1;

      catScore += score;

      if (score > melhorScore) {
        melhorScore = score;
        melhorCategoria = categoria;
        melhorResposta = item.respostas[Math.floor(Math.random() * item.respostas.length)];
      }
    }
    scoresPorCategoria[categoria] = catScore;
  }

  // 3. Bônus de contexto: se é follow-up, dá peso extra à última categoria
  if (isFollow && STATE.lastBotCategory && STATE.lastBotCategory !== 'fora_de_nutricao') {
    const bonusFollow = melhorScore < 2 ? 3 : 1.5; // Maior bônus quando não achou nada
    for (const item of BOT_CONHECIMENTO[STATE.lastBotCategory] || []) {
      const r = item.respostas[Math.floor(Math.random() * item.respostas.length)];
      if (melhorScore < 2 || melhorCategoria === STATE.lastBotCategory) {
        melhorScore += bonusFollow;
        melhorCategoria = STATE.lastBotCategory;
        melhorResposta = r;
      }
    }
  }

  // 4. Se encontrou match, salva contexto e retorna (com sanitização)
  if (melhorScore >= 2 && melhorResposta) {
    STATE.lastBotCategory = melhorCategoria;
    const safe = sanitizeProfileForBot(profile);
    return melhorResposta(safe);
  }

  // 5. Detecta perguntas compostas (múltiplas categorias com score baixo)
  const catsComScore = Object.entries(scoresPorCategoria)
    .filter(([_, s]) => s > 0)
    .sort(([_, a], [__, b]) => b - a);

  if (catsComScore.length >= 2) {
    const [cat1, cat2] = catsComScore.slice(0, 2).map(([c]) => c);
    const resp1 = BOT_CONHECIMENTO[cat1]?.[0]?.respostas?.[0];
    const resp2 = BOT_CONHECIMENTO[cat2]?.[0]?.respostas?.[0];
    if (resp1 && resp2) {
      STATE.lastBotCategory = cat1;
      const safe = sanitizeProfileForBot(profile);
      return resp1(safe) + '<br><br>' + resp2(safe);
    }
  }

  // 6. Se a pergunta é curta demais, pede mais contexto
  if (textoLower.length < 8) {
    return `Pode falar um pouco mais, ${escapeHtml(profile.name) || 'amigo(a)'}? 😊 Me conta o que você gostaria de saber sobre nutrição que te respondo com dicas práticas!`;
  }

  // 7. Fallback melhorado
  STATE.lastBotCategory = null;
  return gerarRespostaContextual(profile, textoLower);
}

function gerarRespostaContextual(p, textoLower) {
  const isLoss = p.goal?.includes('Emagrecimento');
  const isGain = p.goal?.includes('massa muscular');

  // Tenta encontrar palavras conhecidas na pergunta que não deram match forte
  const palavrasConhecidas = [];
  for (const [categoria, items] of Object.entries(BOT_CONHECIMENTO)) {
    if (categoria === 'fora_de_nutricao') continue;
    for (const item of items) {
      for (const palavra of item.palavras) {
        const variacoes = gerarVariacoes(palavra);
        for (const v of variacoes) {
          if (v.length >= 4 && textoLower?.includes(v)) {
            palavrasConhecidas.push(v);
            break;
          }
        }
      }
    }
  }

  let foco = '';
  if (isLoss) foco = '💪 Você está focado(a) em emagrecimento — que tal darmos uma olhada em opções de lanches leves ou substituições inteligentes?';
  else if (isGain) foco = '🔥 Você está focado(a) em ganho de massa muscular — que tal vermos opções de refeições ricas em proteína?';
  else foco = '🥗 Que tal explorarmos receitas saudáveis ou dicas de hidratação?';

  // Se encontrou palavras conhecidas mas não deu match forte, sugere refinar
  const sugestaoExtra = palavrasConhecidas.length > 0
    ? `<br><br>💡 Você mencionou "<strong>${[...new Set(palavrasConhecidas)].slice(0, 3).join(', ')}</strong>" — tente perguntar de forma mais direta!`
    : `<br><br>💡 <strong>Sugestões:</strong> Tente perguntar sobre um tópico específico como "dicas para emagrecer", "pré-treino", "receitas", "proteínas" ou "sono".`;

  return (
    `Olá ${p.name || 'amigo(a)'}! 😊<br><br>` +
    `${foco}<br><br>` +
    `📌 <strong>Você pode me perguntar sobre:</strong><br>` +
    `• 🍳 Receitas e substituições<br>` +
    `• 💪 Pré e pós-treino<br>` +
    `• 🥩 Proteínas, carboidratos e gorduras<br>` +
    `• 😴 Sono e alimentação<br>` +
    `• 🧠 Fome emocional<br>` +
    `• 🌱 Opções vegetarianas/veganas<br>` +
    `• 🫘 Digestão e fibras<br>` +
    `• 🛡️ Imunidade<br>` +
    `• 🥤 Lanches e bebidas<br><br>` +
    `É só mandar a pergunta! 🎯` +
    sugestaoExtra
  );
}

async function sendChatMessage() {
  const input = document.getElementById('chat-text-input');
  const text = input?.value?.trim();
  if (!text || text.length < 2) return;

  // Adiciona mensagem do usuário ao histórico
  if (!STATE.chatHistory) STATE.chatHistory = [];
  STATE.chatHistory.push({ role: 'user', text });

  // Limpa input e mostra loading
  input.value = '';
  STATE.chatLoading = true;
  render({ screen: 'chat_premium', message: '', components: [], actions: [] });

  // Simula um pequeno delay pra dar sensação de processamento
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

  // Gera resposta local inteligente
  const resposta = encontrarMelhorResposta(text, STATE.profile);
  STATE.chatHistory.push({ role: 'bot', text: resposta });

  STATE.chatLoading = false;
  render({ screen: 'chat_premium', message: '', components: [], actions: [] });

  // Scroll automático pro final do chat
  setTimeout(() => {
    const chatContainer = document.getElementById('chat-inner');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 100);
}

function showFirstChatPremiumStep() {
  STATE.chatPremiumStep = 0;
  STATE.chatHistory = [];
  STATE.lastBotCategory = null;
  STATE.chatCategoryMode = 'categories';
  STATE.chatSelectedCategory = null;
  const msg = '👋 <strong>Olá!</strong> Sou o Bot Nutricionista do NutriCare! 🥗<br><br>' +
    'Escolha um assunto abaixo para tirar suas dúvidas:';
  return {
    screen: 'chat_premium',
    message: msg,
    components: [],
    actions: [{ id: 'chat_msg', next: 'chat_premium' }]
  };
}

// ---- Handlers do chat por categorias ----
function handleCategoryClick(key) {
  STATE.chatCategoryMode = 'questions';
  STATE.chatSelectedCategory = key;
  render({ screen: 'chat_premium', message: '', components: [], actions: [] });
  setTimeout(() => {
    const chatContainer = document.getElementById('chat-inner');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 50);
}

function handleQuestionClick(text) {
  if (!text || text.length < 2 || STATE.chatLoading) return;
  if (!STATE.chatHistory) STATE.chatHistory = [];
  STATE.chatHistory.push({ role: 'user', text });
  STATE.chatLoading = true;
  render({ screen: 'chat_premium', message: '', components: [], actions: [] });
  setTimeout(async () => {
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 300));
    const resposta = encontrarMelhorResposta(text, STATE.profile);
    STATE.chatHistory.push({ role: 'bot', text: resposta });
    STATE.chatLoading = false;
    render({ screen: 'chat_premium', message: '', components: [], actions: [] });
    setTimeout(() => {
      const chatContainer = document.getElementById('chat-inner');
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
  }, 50);
}

function handleBackToCategories() {
  STATE.chatCategoryMode = 'categories';
  STATE.chatSelectedCategory = null;
  // Mantém o histórico visível
  render({ screen: 'chat_premium', message: '', components: [], actions: [] });
}

// ---- Diagnóstico ----
function gerarDiagnostico(p) {
  const resumo = [];
  const atencao = [];
  const oportunidades = [];

  if (p.goal) resumo.push(`🎯 Objetivo: <strong>${p.goal}</strong>`);
  if (p.sleep) resumo.push(`😴 Sono: <strong>${p.sleep}</strong>`);
  if (p.activity) resumo.push(`🏃 Atividade: <strong>${p.activity}</strong>`);

  // Dados antropométricos
  const peso = parseFloat(p.weight);
  const altura = parseFloat(p.height);
  const idade = parseInt(p.age, 10);
  if (peso && altura) {
    const imc = peso / Math.pow(altura / 100, 2);
    const imcStr = imc.toFixed(1);
    let categoria = '';
    if (imc < 18.5) categoria = 'Abaixo do peso';
    else if (imc < 25) categoria = 'Peso adequado';
    else if (imc < 30) categoria = 'Sobrepeso';
    else if (imc < 35) categoria = 'Obesidade grau I';
    else if (imc < 40) categoria = 'Obesidade grau II';
    else categoria = 'Obesidade grau III';
    resumo.push(`📊 IMC: <strong>${imcStr}</strong> — ${categoria}`);
    if (idade) resumo.push(`🎂 Idade: <strong>${idade} anos</strong>`);
    if (p.gender) resumo.push(`⚧️ Sexo: <strong>${p.gender}</strong>`);

    if (imc >= 30) atencao.push('IMC elevado — acompanhamento profissional é recomendado para saúde metabólica');
    else if (imc < 18.5) atencao.push('IMC abaixo do ideal — importante focar em ganho de massa magra com acompanhamento');

    // TMB
    const tmb = calcularTMB(p);
    if (tmb) {
      resumo.push(`🔥 TMB: <strong>${tmb} kcal/dia</strong> (metabolismo basal)`);
      const get = calcularGET(p);
      if (get) resumo.push(`⚡ GET: <strong>${get} kcal/dia</strong> (gasto energético total)`);
    }
  }

  if (p.diet) {
    const d = p.diet.toLowerCase();
    if (d.includes('refri') || d.includes('fritura') || d.includes('ultraprocessado')) {
      atencao.push('Presença de ultraprocessados — reduzir melhora energia e composição corporal');
    }
    if (!d.includes('fruta') && !d.includes('salada') && !d.includes('verdura')) {
      atencao.push('Baixo consumo de vegetais e frutas — fontes essenciais de vitaminas e fibras');
    }
  }

  if (p.sleep && (p.sleep === 'Ruim' || p.sleep === 'Médio')) {
    atencao.push('Sono prejudicado — impacta hormônios da fome (grelina/leptina) e escolhas alimentares');
  }

  if (p.activity && p.activity === 'Sedentário') {
    atencao.push('Sedentarismo — movimento é parte essencial do processo, mesmo que comece leve');
  }

  if (p.restrictions && p.restrictions.includes('Sim') && p.restrictionDetail) {
    resumo.push(`🚫 Restrições: <strong>${escapeHtml(p.restrictionDetail)}</strong>`);
  }

  oportunidades.push('Aumentar consumo de água — 35ml por kg de peso');
  oportunidades.push('Incluir proteína em todas as refeições para maior saciedade');
  oportunidades.push('Adicionar mais fibras (aveia, chia, vegetais) para saúde intestinal');
  oportunidades.push('Fazer refeições regulares a cada 3-4 horas para evitar compulsão');

  if (resumo.length === 0) resumo.push('Perfil geral — vamos construir hábitos saudáveis juntos!');
  if (atencao.length === 0) atencao.push('Perfil equilibrado — vamos potencializar ainda mais!');

  return { resumo, atencao, oportunidades };
}

// ---- Receitas Detalhadas ----
const RECEITAS = {
  cafe: [
    {
      nome: 'Ovos Mexidos com Pão Integral',
      ingredientes: ['2 ovos', '1 fatia de pão integral', '1 colher (chá) de azeite', 'Sal e pimenta a gosto', 'Salsinha picada'],
      preparo: ['Aqueça o azeite em uma frigideira antiaderente', 'Bata os ovos com sal e pimenta', 'Despeje na frigideira e mexa até cozinhar', 'Torre o pão integral e sirva com os ovos'],
      tempo: '10 min',
      dicas: 'Adicione cottage ou requeijão light para mais proteína',
      objetivos: ['Emagrecimento', 'Manutenção']
    },
    {
      nome: 'Panqueca de Banana e Aveia',
      ingredientes: ['1 banana madura', '2 colheres (sopa) de aveia', '1 ovo', 'Canela em pó a gosto', 'Mel a gosto'],
      preparo: ['Amasse a banana com um garfo', 'Misture o ovo, aveia e canela até formar uma massa', 'Aqueça uma frigideira untada', 'Despeje a massa e doure dos dois lados'],
      tempo: '12 min',
      dicas: 'Sirva com pasta de amendoim ou iogurte grego',
      objetivos: ['Ganho de massa muscular', 'Manutenção']
    },
    {
      nome: 'Tapioca Recheada com Queijo',
      ingredientes: ['3 colheres (sopa) de goma de tapioca', '2 fatias de queijo branco', '1 colher (chá) de manteiga', 'Orégano a gosto'],
      preparo: ['Umedeça a goma e peneire em uma frigideira quente', 'Espalhe bem e deixe dourar de um lado', 'Vire a tapioca e adicione o queijo', 'Dobre ao meio e sirva'],
      tempo: '8 min',
      dicas: 'Adicione frango desfiado para uma versão mais proteica',
      objetivos: ['Emagrecimento', 'Ganho de massa muscular']
    }
  ],
  lanche_manha: [
    {
      nome: 'Iogurte com Frutas e Granola',
      ingredientes: ['1 pote de iogurte natural', '1/2 xícara de frutas vermelhas', '2 colheres (sopa) de granola', '1 colher (chá) de mel'],
      preparo: ['Coloque o iogurte em uma tigela', 'Lave as frutas e adicione por cima', 'Finalize com granola e mel'],
      tempo: '5 min',
      dicas: 'Use frutas da estação para mais sabor e economia',
      objetivos: ['Emagrecimento', 'Manutenção', 'Ganho de massa muscular']
    },
    {
      nome: 'Banana com Pasta de Amendoim',
      ingredientes: ['1 banana', '1 colher (sopa) de pasta de amendoim', '1 colher (sopa) de aveia', 'Canela a gosto'],
      preparo: ['Corte a banana em rodelas', 'Espalhe a pasta de amendoim', 'Polvilhe aveia e canela por cima'],
      tempo: '3 min',
      dicas: 'Excelente pré-treino por carboidrato + proteína',
      objetivos: ['Ganho de massa muscular', 'Manutenção']
    }
  ],
  almoco: [
    {
      nome: 'Frango Grelhado com Arroz Integral e Legumes',
      ingredientes: ['150g de peito de frango', '4 colheres (sopa) de arroz integral cozido', '1 xícara de brócolis', '1 cenoura em cubos', '2 dentes de alho', 'Azeite, sal e temperos'],
      preparo: ['Tempere o frango com alho, sal e ervas', 'Grelhe o frango em frigideira com azeite até dourar', 'Cozinhe o arroz integral conforme instrução', 'Refogue os legumes no alho e azeite', 'Sirva tudo em um prato'],
      tempo: '30 min',
      dicas: 'Faça em quantidade maior e congele porções',
      objetivos: ['Emagrecimento', 'Manutenção', 'Ganho de massa muscular']
    },
    {
      nome: 'Salmão ao Forno com Batata Doce',
      ingredientes: ['1 filé de salmão (150g)', '1 batata doce média', 'Aspargos ou vagem', 'Azeite, limão, alecrim', 'Sal e pimenta'],
      preparo: ['Tempere o salmão com limão, alecrim, sal e azeite', 'Corte a batata doce em rodelas e tempere', 'Disponha salmão e batata em uma assadeira', 'Asse a 200°C por 20-25 min', 'Adicione os aspargos nos últimos 10 min'],
      tempo: '35 min',
      dicas: 'Salmão é rico em ômega-3, ótimo para saúde cardiovascular',
      objetivos: ['Emagrecimento', 'Manutenção']
    },
    {
      nome: 'Carne Moída com Quinoa e Salada',
      ingredientes: ['150g de patinho moído', '1/2 xícara de quinoa', 'Alface, tomate, pepino', 'Cebola roxa', 'Azeite, sal, limão'],
      preparo: ['Cozinhe a quinoa em água fervente por 15 min', 'Refogue a carne com cebola e temperos', 'Lave e corte os vegetais para a salada', 'Monte o prato com quinoa, carne e salada'],
      tempo: '25 min',
      dicas: 'Quinoa tem todos os aminoácidos essenciais',
      objetivos: ['Ganho de massa muscular', 'Manutenção']
    }
  ],
  lanche_tarde: [
    {
      nome: 'Smoothie Proteico',
      ingredientes: ['1 banana', '1 scoop de whey protein (ou proteína vegetal)', '200ml de leite ou bebida vegetal', '1 colher (sopa) de pasta de amendoim', 'Gelo a gosto'],
      preparo: ['Coloque todos os ingredientes no liquidificador', 'Bata até ficar homogêneo', 'Sirva em seguida'],
      tempo: '5 min',
      dicas: 'Ótimo pós-treino para recuperação muscular',
      objetivos: ['Ganho de massa muscular']
    },
    {
      nome: 'Frutas com Cottage',
      ingredientes: ['1/2 xícara de queijo cottage', '1 maçã ou pera picada', '1 colher (sopa) de castanhas picadas', 'Mel a gosto'],
      preparo: ['Coloque o cottage em uma tigela', 'Adicione a fruta picada por cima', 'Finalize com castanhas e mel'],
      tempo: '4 min',
      dicas: 'Cottage é rico em caseína, proteína de absorção lenta',
      objetivos: ['Emagrecimento', 'Manutenção']
    }
  ],
  jantar: [
    {
      nome: 'Omelete Recheado com Salada',
      ingredientes: ['3 ovos', '1/2 tomate picado', '1/4 de cebola picada', 'Folhas de espinafre', 'Queijo ralado a gosto', 'Sal, pimenta e orégano'],
      preparo: ['Bata os ovos com sal, pimenta e orégano', 'Despeje em frigideira antiaderente aquecida', 'Adicione tomate, cebola, espinafre e queijo', 'Dobre a omelete ao meio e sirva', 'Acompanhe com salada verde'],
      tempo: '15 min',
      dicas: 'Adicione frango desfiado para mais proteína',
      objetivos: ['Emagrecimento', 'Manutenção', 'Ganho de massa muscular']
    },
    {
      nome: 'Wrap Integral de Frango',
      ingredientes: ['1 wrap integral', '100g de frango desfiado', 'Alface e rúcula', 'Tomate em cubos', '1 colher (sopa) de ricota ou cream cheese light'],
      preparo: ['Aqueça o wrap em uma frigideira', 'Espalhe a ricota sobre o wrap', 'Adicione o frango desfiado', 'Coloque alface, rúcula e tomate', 'Enrole e sirva'],
      tempo: '15 min',
      dicas: 'Pode substituir o frango por atum ou carne desfiada',
      objetivos: ['Emagrecimento', 'Manutenção']
    }
  ]
};

function selecionarReceitas(mealType, goal) {
  const lista = RECEITAS[mealType] || [];
  // Filtrar por objetivo, ou retornar todas se nenhum match
  const match = lista.filter(r => !r.objetivos || r.objetivos.some(o => goal && goal.includes(o)));
  return match.length > 0 ? match : lista.slice(0, 1);
}

function gerarReceitaHtml(receita) {
  if (!receita) return '';
  return `
    <div class="receita-card">
      <div class="receita-header" onclick="toggleReceita(this)">
        <span class="receita-nome">${receita.nome}</span>
        <span class="receita-tempo">${receita.tempo}</span>
        <svg class="receita-toggle" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5L7 9L11 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="receita-body" style="max-height:0;overflow:hidden;transition:max-height 0.4s;">
        <div class="receita-section">
          <strong>Ingredientes:</strong>
          <ul class="receita-ingredientes">
            ${receita.ingredientes.map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
        <div class="receita-section">
          <strong>Modo de Preparo:</strong>
          <ol class="receita-preparo">
            ${receita.preparo.map((p, idx) => `<li><span class="receita-passo-num">${idx + 1}</span><span>${p}</span></li>`).join('')}
          </ol>
        </div>
        ${receita.dicas ? `<div class="receita-dicas">💡 ${receita.dicas}</div>` : ''}
      </div>
    </div>`;
}

function gerarReceitasParaRefeicao(mealName, goal) {
  const map = {
    'Café da Manhã': 'cafe',
    'Lanche da Manhã': 'lanche_manha',
    'Almoço': 'almoco',
    'Lanche da Tarde': 'lanche_tarde',
    'Jantar': 'jantar'
  };
  const key = map[mealName];
  if (!key) return '';
  return selecionarReceitas(key, goal).map(r => gerarReceitaHtml(r)).join('');
}

// ---- Refeições ----
function gerarRefeicoes(p, isPremium = true) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

  // Plano básico: 1 opção simples por refeição, sem substituições
  if (!isPremium) {
    return [
      {
        icon: '🌅', name: 'Café da Manhã', time: '07:00 - 08:00',
        main: isLoss
          ? '🥣 2 ovos mexidos + 1 fatia pão integral + café'
          : '🥣 3 ovos + 2 fatias pão integral + 1 fruta'
      },
      {
        icon: '🍎', name: 'Lanche da Manhã', time: '10:00',
        main: isLoss
          ? '🥣 1 fruta + 5 castanhas'
          : '🥣 1 fruta + 10 castanhas'
      },
      {
        icon: '🍚', name: 'Almoço', time: '12:00 - 13:00',
        main: isLoss
          ? '🥣 4 col de arroz + 1 concha feijão + 120g proteína + salada à vontade'
          : '🥣 6 col arroz + feijão + 150g proteína + salada + azeite'
      },
      {
        icon: '🥤', name: 'Lanche da Tarde', time: '15:30',
        main: isLoss
          ? '🥣 1 fruta + café sem açúcar'
          : isGain
            ? '🥣 Vitamina de banana com whey + aveia'
            : '🥣 1 fruta + castanhas'
      },
      {
        icon: '🌙', name: 'Jantar', time: '19:00 - 20:00',
        main: isLoss
          ? '🥣 Omelete 2 ovos com espinafre + salada'
          : '🥣 150g salmão + quinoa + vegetais'
      }
    ];
  }

  // Plano premium: 3 opções detalhadas + substituições
  return [
    {
      icon: '🌅', name: 'Café da Manhã', time: '07:00 - 08:00',
      main: isLoss
        ? '🥣 Opção 1: 2 ovos mexidos + 1 fatia pão integral + café\n🥣 Opção 2: Tapioca com queijo branco + banana\n🥣 Opção 3: Iogurte natural com granola e frutas vermelhas'
        : '🥣 Opção 1: 3 ovos + 2 fatias pão integral + 1 fruta\n🥣 Opção 2: Vitamina de banana com aveia + pasta de amendoim\n🥣 Opção 3: Crepioca com queijo + café com leite',
      subs: 'Ovos → tofu mexido • Pão integral → crepioca • Iogurte → kefir'
    },
    {
      icon: '🍎', name: 'Lanche da Manhã', time: '10:00',
      main: isLoss
        ? '🥣 1 fruta + 5 castanhas\n🥣 1 iogurte natural\n🥣 1 barrinha de cereais sem açúcar'
        : '🥣 1 fruta + 10 castanhas\n🥣 Iogurte grego + mel\n🥣 Banana com pasta de amendoim',
      subs: 'Castanhas → amêndoas ou nozes • Fruta da estação → outra de preferência'
    },
    {
      icon: '🍚', name: 'Almoço', time: '12:00 - 13:00',
      main: isLoss
        ? '🥣 4 col de arroz + 1 concha feijão + 120g proteína + salada à vontade\n🥣 Peixe grelhado + legumes + 1 batata-doce média\n🥣 Salada grande com grão-de-bico + ovos + azeite'
        : '🥣 6 col arroz + feijão + 150g proteína + salada + azeite\n🥣 200g carne magra + batata-doce + brócolis\n🥣 Frango ao curry + arroz integral + legumes',
      subs: 'Arroz → quinoa ou integral • Frango → peixe, carne ou tofu • Feijão → lentilha ou grão-de-bico'
    },
    {
      icon: '🥤', name: 'Lanche da Tarde', time: '15:30',
      main: isLoss
        ? '🥣 1 fruta + café sem açúcar\n🥣 Iogurte desnatado\n🥣 Pão integral com cottage'
        : isGain
          ? '🥣 Vitamina de banana com whey + aveia\n🥣 2 fatias pão integral + pasta de amendoim + banana\n🥣 Iogurte grego + granola + mel'
          : '🥣 1 fruta + castanhas\n🥣 Iogurte + granola\n🥣 Smoothie de frutas com aveia',
      subs: 'Fruta → vegetais picados (cenoura, pepino) • Pão → torradas integrais'
    },
    {
      icon: '🌙', name: 'Jantar', time: '19:00 - 20:00',
      main: isLoss
        ? '🥣 Omelete 2 ovos com espinafre + salada\n🥣 Sopa de legumes com frango desfiado\n🥣 Salada grande com atum + ovos + azeite'
        : '🥣 150g salmão + quinoa + vegetais\n🥣 Omelete 3 ovos + arroz integral + legumes\n🥣 Frango + purê batata-doce + salada',
      subs: 'Omelete → tofu mexido • Salmão → sardinha • Sopa → adaptável com vegetais disponíveis'
    }
  ];
}

function gerarSubstituicoes() {
  return [
    { icon: '🥚', title: 'Ovos', text: 'Substitua por tofu mexido (versão vegana) ou peito de peru.' },
    { icon: '🍞', title: 'Pão integral', text: 'Troque por crepioca, tapioca, panqueca de aveia ou torrada integral.' },
    { icon: '🥩', title: 'Carne vermelha', text: 'Substitua por frango, peixe, ovos, tofu ou cogumelos.' },
    { icon: '🍚', title: 'Arroz branco', text: 'Troque por arroz integral, quinoa, couve-flor rice ou batata-doce.' },
    { icon: '🧀', title: 'Queijo', text: 'Substitua por ricota, cottage, tofu ou pasta de grão-de-bico (homus).' },
    { icon: '🥛', title: 'Leite de vaca', text: 'Troque por leite vegetal (amêndoas, aveia, coco) ou kefir.' }
  ];
}

function gerarListaCompras() {
  return [
    { icon: '🥩', name: 'Proteínas', items: ['Peito de frango', 'Ovos', 'Carne moída magra', 'Atum em lata', 'Iogurte natural', 'Grão-de-bico'] },
    { icon: '🥬', name: 'Vegetais', items: ['Brócolis', 'Espinafre', 'Tomate', 'Alface', 'Cenoura', 'Abobrinha', 'Couve'] },
    { icon: '🍚', name: 'Grãos', items: ['Arroz integral', 'Feijão', 'Quinoa', 'Aveia', 'Lentilha'] },
    { icon: '🍎', name: 'Frutas', items: ['Banana', 'Maçã', 'Mamão', 'Limão', 'Frutas vermelhas'] },
    { icon: '🥜', name: 'Castanhas', items: ['Castanha-do-pará', 'Amêndoas', 'Pasta de amendoim'] },
    { icon: '🧀', name: 'Laticínios', items: ['Queijo branco', 'Leite', 'Manteiga'] }
  ];
}

function gerarDicas(p) {
  const tips = [
    { icon: '📦', title: 'Organização semanal', text: 'Reserve 1h no domingo para planejar marmitas. É o maior segredo de quem consegue manter uma alimentação saudável.' },
    { icon: '🍽️', title: 'Coma com atenção', text: 'Sem TV ou celular. Mastigue bem cada garfada — uma refeição deve durar 15-20 minutos.' },
    { icon: '🥤', title: 'Hidratação', text: 'Tome 35ml de água por kg de peso. Deixe uma garrafa sempre à vista como lembrete.' },
    { icon: '🔄', title: 'Consistência > Perfeição', text: 'Você não precisa acertar 100%. 80% de constância já traz resultados transformadores.' }
  ];

  if (p.difficulties && p.difficulties.length) {
    if (p.difficulties.includes('Ansiedade') || p.difficulties.includes('emocionais')) {
      tips.push({ icon: '🧘', title: 'Fome emocional', text: 'Antes de comer, pare 5 segundos e pergunte: "É fome física ou emocional?"' });
    }
    if (p.difficulties.includes('Falta de tempo')) {
      tips.push({ icon: '⏰', title: 'Receitas em 15 min', text: 'Omelete, salada completa com proteína, wraps e smoothies são refeições rápidas e nutritivas.' });
    }
  }

  if (p.sleep && (p.sleep === 'Ruim' || p.sleep === 'Médio')) {
    tips.push({ icon: '😴', title: 'Higiene do sono', text: 'Desligue telas 1h antes de dormir. Um bom sono regula hormônios da fome e melhora suas escolhas.' });
  }

  if (p.activity && p.activity === 'Sedentário') {
    tips.push({ icon: '🚶', title: 'Comece leve', text: '20 min de caminhada diária já ativam o metabolismo. O importante é começar.' });
  }

  return tips;
}

// ---- TMB Calculator (Mifflin-St Jeor) ----
function calcularTMB(p) {
  const peso = parseFloat(p.weight);
  const altura = parseFloat(p.height);
  const idade = parseInt(p.age, 10) || 30; // default 30 se não informado
  if (!peso || !altura || !p.gender || isNaN(peso) || isNaN(altura)) return null;
  if (p.gender === 'Masculino') {
    return Math.round(10 * peso + 6.25 * altura - 5 * idade + 5);
  } else {
    return Math.round(10 * peso + 6.25 * altura - 5 * idade - 161);
  }
}

function calcularGET(p) {
  const tmb = calcularTMB(p);
  if (!tmb) return null;

  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

  let fator;
  if (isLoss) fator = 1.2;
  else if (isGain) fator = 1.6;
  else fator = 1.4;

  // Ajuste por atividade física
  if (p.activity === 'Sedentário') fator = Math.max(fator - 0.05, 1.1);
  else if (p.activity === 'Moderado') fator += 0.1;
  else if (p.activity === 'Intenso') fator += 0.2;

  return Math.round(tmb * fator);
}

// ---- Dados Nutricionais para Gráficos ----
function gerarDadosNutricionais(p) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');
  const peso = parseFloat(p.weight) || 70;

  const totalCal = calcularGET(p) || (isLoss ? 1500 : isGain ? 2800 : 2000);
  let proteinPct, carbPct, fatPct;
  if (isLoss) { proteinPct = 40; carbPct = 30; fatPct = 30; }
  else if (isGain) { proteinPct = 30; carbPct = 45; fatPct = 25; }
  else { proteinPct = 30; carbPct = 40; fatPct = 30; }

  // Proteína baseada no peso corporal (g/kg) — fonte primária
  const protPorKg = isLoss ? 2.0 : isGain ? 2.2 : 1.6;
  const proteinG = Math.round(peso * protPorKg);
  const proteinCal = proteinG * 4;

  // Carboidratos e gorduras dividem o restante das calorias na proporção %
  const remainingCal = Math.max(0, totalCal - proteinCal);
  const carbRatio = carbPct / (carbPct + fatPct);
  const fatRatio = fatPct / (carbPct + fatPct);
  const carbG = Math.round((remainingCal * carbRatio) / 4);
  const fatG = Math.round((remainingCal * fatRatio) / 9);

  // Recalcular % real baseado nos gramas
  const realCarbCal = carbG * 4;
  const realFatCal = fatG * 9;
  const realTotalCal = proteinCal + realCarbCal + realFatCal;
  const realProteinPct = Math.round((proteinCal / realTotalCal) * 100);
  const realCarbPct = Math.round((realCarbCal / realTotalCal) * 100);
  const realFatPct = Math.round((realFatCal / realTotalCal) * 100);
  // Ajustar carb se necessário para fechar 100% (último dígito)
  const adjustedCarbPct = Math.max(0, 100 - realProteinPct - realFatPct);

  // Distribuição de calorias por refeição
  const mealDist = isLoss
    ? [
        { name: 'Café da Manhã', calories: 300, icon: '🌅' },
        { name: 'Lanche da Manhã', calories: 120, icon: '🍎' },
        { name: 'Almoço', calories: 500, icon: '🍚' },
        { name: 'Lanche Tarde', calories: 130, icon: '🥤' },
        { name: 'Jantar', calories: 450, icon: '🌙' }
      ]
    : isGain
      ? [
          { name: 'Café da Manhã', calories: 550, icon: '🌅' },
          { name: 'Lanche Manhã', calories: 250, icon: '🍎' },
          { name: 'Almoço', calories: 850, icon: '🍚' },
          { name: 'Lanche Tarde', calories: 300, icon: '🥤' },
          { name: 'Jantar', calories: 850, icon: '🌙' }
        ]
      : [
          { name: 'Café da Manhã', calories: 400, icon: '🌅' },
          { name: 'Lanche Manhã', calories: 150, icon: '🍎' },
          { name: 'Almoço', calories: 650, icon: '🍚' },
          { name: 'Lanche Tarde', calories: 200, icon: '🥤' },
          { name: 'Jantar', calories: 600, icon: '🌙' }
        ];

  return {
    totalCal,
    tmb: calcularTMB(p),
    get: totalCal,
    proteinPct: realProteinPct,
    carbPct: adjustedCarbPct,
    fatPct: realFatPct,
    proteinG,
    carbG,
    fatG,
    protPorKg,
    mealDist
  };
}

function gerarSuplementos(p) {
  const s = [];
  if (p.restrictions && p.restrictions.includes('Sim') && p.restrictionDetail && (String(p.restrictionDetail).toLowerCase().includes('vegan') || String(p.restrictionDetail).toLowerCase().includes('vegetar'))) {
    s.push({ icon: '💊', name: 'Vitamina B12', dosage: '2,4 mcg/dia', reason: 'Essencial em dietas baseadas em vegetais — a B12 é encontrada principalmente em alimentos de origem animal.' });
  }
  if (p.sleep && p.sleep === 'Ruim') {
    s.push({ icon: '😴', name: 'Magnésio Bisglicinato', dosage: '200-400mg à noite', reason: 'Auxilia no relaxamento muscular e melhora a qualidade do sono.' });
  }
  if (p.goal && p.goal.includes('massa muscular')) {
    s.push({ icon: '🏋️', name: 'Whey Protein (ou vegetal)', dosage: '30g pós-treino', reason: 'Ajuda a atingir a meta proteica diária de forma prática.' });
  }
  if (p.activity && (p.activity === 'Sedentário' || p.activity === 'Leve')) {
    s.push({ icon: '☀️', name: 'Vitamina D3 + K2', dosage: '2.000 UI/dia', reason: 'Grande parte da população tem deficiência. Essencial para imunidade e saúde óssea.' });
  }
  if (s.length === 0 || s.length < 3) {
    s.push({ icon: '⚡', name: 'Ômega 3 (EPA/DHA)', dosage: '1-2g/dia', reason: 'Anti-inflamatório natural que auxilia na saúde cerebral, hormonal e cardiovascular.' });
  }
  return s;
}

// ---- Constants ----
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : 'https://nutricare-api-iw4j.onrender.com/api';

const ANAMNESE_TOTAL_STEPS = 6; // Perguntas básicas (gratuitas)
const ANAMNESE_EXTRA_TOTAL = 8; // Perguntas extras (premium)

// ---- Fetch com Retry e Exponential Backoff ----
const _fetchInFlight = new Map(); // Deduplicação de requisições em voo

async function fetchWithRetry(url, options = {}, retries = 2) {
  const baseDelay = 1000;

  // Deduplicação: aborta fetch anterior com a mesma URL (se ainda estiver voando)
  const prevController = _fetchInFlight.get(url);
  if (prevController) {
    prevController.abort();
  }

  const controller = new AbortController();
  _fetchInFlight.set(url, controller);

  // Merge signal do controller com signal do caller
  const originalSignal = options.signal;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Cria novo combinedSignal a cada tentativa (evita race com dedup)
    const combinedSignal = originalSignal
      ? combineAbortSignals(controller.signal, originalSignal)
      : controller.signal;

    try {
      const res = await fetch(url, { ...options, signal: combinedSignal });

      // Se for 429 (rate limit), espera mais e retry
      if (res.status === 429 && attempt < retries) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10) * 1000;
        await new Promise(r => setTimeout(r, retryAfter + Math.random() * 1000));
        continue;
      }
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        // Abortado por dedup (outra chamada para mesma URL) — não retry
        _fetchInFlight.delete(url);
        throw err;
      }
      if (attempt >= retries) {
        _fetchInFlight.delete(url);
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      devLog(`[NutriCare] Retry ${attempt + 1}/${retries} em ${Math.round(delay)}ms:`, err.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function combineAbortSignals(s1, s2) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener('abort', onAbort);
  s2.addEventListener('abort', onAbort);
  if (s1.aborted || s2.aborted) controller.abort();
  return controller.signal;
}

// ---- BroadcastChannel (sincronização entre abas) ----
const SYNC_CHANNEL = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('nutricare-sync')
  : null;

function broadcastSync(type, data) {
  if (SYNC_CHANNEL) {
    try {
      SYNC_CHANNEL.postMessage({ type, data, timestamp: Date.now() });
    } catch (_) { /* ignore */ }
  }
}

// Sincroniza estado premium entre abas
if (SYNC_CHANNEL) {
  SYNC_CHANNEL.onmessage = (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'premium_changed':
        // Recarrega status premium — isPremium() lê do localStorage
        if (isPremium()) {
          renderPremiumAtivado();
        }
        break;
      case 'historico_changed':
        // Atualiza na próxima vez que usuário abrir histórico
        _decryptedCache[STORAGE_KEY_HISTORICO] = null;
        break;
    }
  };
}

// ---- Log wrapper (desativa console.log em produção) ----
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
function devLog(...args) {
  if (IS_DEV) console.log(...args);
}

// ---- Histórico e Progresso (localStorage) ----
const STORAGE_KEY_HISTORICO = 'nutricare_historico';
const STORAGE_KEY_PROGRESSO = 'nutricare_progresso';

function salvarConsulta() {
  try {
    const historico = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORICO) || '[]');
    const entry = {
      id: Date.now(),
      data: new Date().toLocaleDateString('pt-BR'),
      timestamp: new Date().toISOString(),
      profile: { ...STATE.profile },
      diagnostico: STATE.lastDiagnostico || '',
      hasPlano: !!STATE.lastPlano
    };
    historico.unshift(entry);
    if (historico.length > 20) historico.length = 20;
    localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(historico));
    // Criptografa em background (fire-and-forget)
    _encryptStorageKey(STORAGE_KEY_HISTORICO);
    broadcastSync('historico_changed', { count: historico.length });

    const peso = parseFloat(STATE.profile.weight);
    if (peso) {
      const progresso = JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESSO) || '[]');
      const hoje = new Date().toDateString();
      const jaExiste = progresso.some(p => new Date(p.data).toDateString() === hoje);
      if (!jaExiste) {
        progresso.push({ data: entry.timestamp, peso, objetivo: STATE.profile.goal || '' });
        if (progresso.length > 100) progresso.length = 100;
        localStorage.setItem(STORAGE_KEY_PROGRESSO, JSON.stringify(progresso));
        _encryptStorageKey(STORAGE_KEY_PROGRESSO);
      }
    }
  } catch (e) {
    devLog('Erro ao salvar histórico:', e);
  }
}

async function carregarHistorico() {
  // Tenta cache síncrono primeiro (populado na inicialização ou após salvar)
  const cached = _decryptedCache[STORAGE_KEY_HISTORICO];
  if (Array.isArray(cached)) return cached;
  // Fallback: lê do localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORICO);
    if (!raw) return [];
    if (raw.startsWith('enc:')) {
      const decrypted = await _aesDecrypt(raw);
      const parsed = JSON.parse(decrypted || '[]');
      _decryptedCache[STORAGE_KEY_HISTORICO] = parsed;
      return parsed;
    }
    const parsed = JSON.parse(raw);
    _decryptedCache[STORAGE_KEY_HISTORICO] = parsed;
    return parsed;
  } catch { return []; }
}

async function removerRegistroHistorico(id) {
  let historico = await carregarHistorico();
  historico = historico.filter(h => String(h.id) !== String(id));
  localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(historico));
  _encryptStorageKey(STORAGE_KEY_HISTORICO);
  renderHistorico();
}

function carregarProgresso() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESSO);
    if (!raw) return [];
    if (raw.startsWith('enc:')) {
      // Dados encriptados — retorna cache ou array vazio (decrypt é async)
      const cached = _decryptedCache[STORAGE_KEY_PROGRESSO];
      if (Array.isArray(cached)) return cached;
      // Dispara decrypt assíncrono e retorna vazio (será populado na próxima chamada)
      _aesDecrypt(raw).then(plain => {
        if (plain) {
          const arr = JSON.parse(plain);
          _decryptedCache[STORAGE_KEY_PROGRESSO] = arr;
        }
      }).catch(() => {});
      return [];
    }
    const parsed = JSON.parse(raw);
    _decryptedCache[STORAGE_KEY_PROGRESSO] = parsed;
    return parsed;
  } catch { return []; }
}

function removerRegistroProgresso(timestamp) {
  let progresso = carregarProgresso();
  progresso = progresso.filter(p => p.data !== timestamp);
  localStorage.setItem(STORAGE_KEY_PROGRESSO, JSON.stringify(progresso));
  renderProgresso();
}

async function renderHistorico() {
  const historico = _decryptedCache[STORAGE_KEY_HISTORICO] || await carregarHistorico() || [];
  const cards = historico.length
    ? historico.map(h => `
      <div class="historico-card" onclick="dispatch('ver_consulta', '${h.id}')">
        <button onclick="event.stopPropagation();removerRegistroHistorico('${h.id}')" class="historico-delete" title="Apagar registro">&times;</button>
        <div class="historico-card-top">
          <span class="historico-data">${h.data}</span>
          <span class="historico-objetivo">${escapeHtml(h.profile.goal || '')}</span>
        </div>
        <div class="historico-card-bottom">
          <span class="historico-resumo">${h.profile.gender ? escapeHtml(h.profile.gender) + ' · ' : ''}${h.profile.age ? escapeHtml(h.profile.age) + ' anos' : ''}</span>
          ${h.diagnostico ? '<span class="historico-tag">Concluída</span>' : '<span class="historico-tag">Incompleta</span>'}
        </div>
      </div>`).join('')
    : '<div class="historico-empty">Nenhuma consulta anterior.</div>';

  const c = document.getElementById('screen-container');
  if (!c) return;
  c.innerHTML = `
    <div class="screen" style="padding:24px;overflow-y:auto;">
      <header class="screen-header">
        <button class="header-back" onclick="dispatch('voltar_menu')">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <h2>Histórico</h2>
        <div style="width:20px;"></div>
      </header>
      <div class="historico-lista">${cards}</div>
      <button class="btn-primary" style="width:100%;margin-top:12px;" onclick="dispatch('iniciar_consulta')">+ Nova consulta</button>
    </div>`;
}

function renderProgresso() {
  const progresso = carregarProgresso();

  const c2 = document.getElementById('screen-container');
  if (!c2) return;
  c2.innerHTML = `
    <div class="screen" style="padding:24px;overflow-y:auto;">
      <header class="screen-header">
        <button class="header-back" onclick="dispatch('voltar_menu')">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <h2>Meu Progresso</h2>
        <div style="width:20px;"></div>
      </header>
      ${progresso.length < 2
        ? `<div class="historico-empty" style="margin-top:40px;">
            <p style="font-size:1.1rem;margin-bottom:8px;">Precisa de pelo menos 2 registros</p>
            <p style="color:var(--text-tertiary);">Complete consultas com seu peso para ver gr&aacute;fico de evolu&ccedil;&atilde;o.</p>
          </div>`
        : `<div class="chart-card" style="height:300px;">
            <canvas id="chart-progresso"></canvas>
          </div>
          <div style="margin-top:16px;">
            <p style="font-weight:600;margin-bottom:8px;">Registros de peso:</p>
            ${progresso.slice().reverse().map(p => `
              <div class="progresso-row">
                <span>${new Date(p.data).toLocaleDateString('pt-BR')}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span><strong>${p.peso} kg</strong></span>
                  <span style="color:var(--text-tertiary);font-size:0.85rem;">${p.objetivo ? escapeHtml(p.objetivo) : ''}</span>
                  <button onclick="removerRegistroProgresso('${p.data}')" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:2px 6px;font-size:1.1rem;line-height:1;border-radius:4px;" title="Remover registro">&times;</button>
                </div>
              </div>
            `).join('')}
          </div>`
      }
      <button class="btn-primary" style="width:100%;margin-top:12px;" onclick="dispatch('iniciar_consulta')">+ Nova consulta</button>
    </div>`;

  if (progresso.length >= 2) {
    setTimeout(() => initProgressChart(progresso), 100);
  }
}

function renderDetalheConsulta(consulta) {
  if (!consulta) {
    renderHistorico();
    return;
  }
  const p = consulta.profile || {};
  const c3 = document.getElementById('screen-container');
  if (!c3) return;
  c3.innerHTML = `
    <div class="screen" style="padding:24px;overflow-y:auto;">
      <header class="screen-header">
        <button class="header-back" onclick="dispatch('ver_historico')">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <h2>Consulta — ${consulta.data}</h2>
        <div style="width:20px;"></div>
      </header>
      <div class="consulta-card">
        <div class="consulta-card-header">Resumo</div>
        <div class="consulta-card-body">
          ${p.goal ? `<p>🎯 <strong>Objetivo:</strong> ${escapeHtml(p.goal)}</p>` : ''}
          ${p.gender ? `<p>⚧️ <strong>Sexo:</strong> ${escapeHtml(p.gender)}</p>` : ''}
          ${p.age ? `<p>🎂 <strong>Idade:</strong> ${escapeHtml(p.age)} anos</p>` : ''}
          ${p.weight ? `<p>⚖️ <strong>Peso:</strong> ${escapeHtml(p.weight)} kg</p>` : ''}
          ${p.height ? `<p>📏 <strong>Altura:</strong> ${escapeHtml(p.height)} cm</p>` : ''}
          ${p.diet ? `<p>🥗 <strong>Alimentação:</strong> ${escapeHtml(p.diet)}</p>` : ''}
          ${p.sleep ? `<p>😴 <strong>Sono:</strong> ${escapeHtml(p.sleep)}</p>` : ''}
          ${p.activity ? `<p>🏃 <strong>Atividade:</strong> ${escapeHtml(p.activity)}</p>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button class="btn-primary" onclick="dispatch('iniciar_consulta')">+ Nova consulta</button>
        <button class="btn-outline" onclick="dispatch('ver_historico')">← Voltar ao histórico</button>
      </div>
    </div>`;
}

function initProgressChart(progresso) {
  const canvas = document.getElementById('chart-progresso');
  if (!canvas) return;
  if (window._chartProgresso) window._chartProgresso.destroy();

  const sorted = [...progresso].sort((a, b) => new Date(a.data) - new Date(b.data));
  const labels = sorted.map(p => new Date(p.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
  const pesos = sorted.map(p => p.peso);
  const minPeso = Math.min(...pesos) - 2;
  const maxPeso = Math.max(...pesos) + 2;

  window._chartProgresso = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Peso (kg)',
        data: pesos,
        borderColor: '#00D68F',
        backgroundColor: 'rgba(0, 214, 143, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#00B975',
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${ctx.parsed.y} kg` }
        }
      },
      scales: {
        y: {
          min: Math.floor(minPeso),
          max: Math.ceil(maxPeso),
          grid: { color: getChartColors().grid },
          ticks: { color: getChartColors().tick, font: { size: 11 }, callback: v => v + ' kg' }
        },
        x: {
          grid: { display: false },
          ticks: { color: getChartColors().tick, font: { size: 10 } }
        }
      }
    }
  });
}

// Mapa de transições de tela baseado em ações do usuário
const ACTION_ROUTES = {
  'iniciar_consulta': 'anamnese_step',
  'voltar_menu': 'onboarding',
  'ver_historico': 'historico',
  'ver_progresso': 'progresso',
  'ver_consulta': 'detalhe_consulta',
  'voltar_planos': 'planos',
  'voltar_plano': 'plano',
  'voltar_acomp': 'acompanhamento',
  'como_funciona': 'how_it_works',
  'ver_planos': 'planos',
  'falar_contato': 'contato',
  'ver_plano': 'plano',
  'ver_estrategias': 'estrategias',
  'ver_graficos': 'nutrition_charts',
  'ver_subs': 'substituicoes',
  'ver_lista': 'lista_compras',
  'ver_suplementacao': 'suplementacao',
  'ver_acompanhamento': 'acompanhamento',
  'gerar_analise': 'analise',
  'reiniciar': 'reiniciar',
  'agendar': 'agendar',
  'duvidas': 'duvidas',
  'assinar_premium': 'assinar_premium',
  'assinar_trimestral': 'assinar_trimestral',
  'liberar_cliente': 'onboarding',
  'sair_premium': 'onboarding'
};

// ---- State Reset ----
function resetState() {
  STATE.screen = 'onboarding';
  STATE.anamneseStep = 0;
  STATE.anamneseExtraStep = 0;
  STATE.chatPremiumStep = 0;
  STATE.plano = null;
  STATE.lastBotCategory = null;
  STATE.chatHistory = [];
  Object.assign(STATE.profile, {
    name: '', goal: '', routine: '', diet: '',
    restrictions: [], restrictionDetail: '',
    hasExams: false, sleep: '', activity: '',
    age: '', weight: '', height: '', gender: '',
    medications: '', difficulties: [], emotionalEating: '',
    motivation: 3, extraInfo: ''
  });
}

// ============================================================
// RENDERER — Converte JSON Response em DOM
// ============================================================

const $c = id => document.getElementById(id);

// ---- Backend Integration ----
async function sendToBackend(profile) {
  devLog('📤 [NutriCare] Enviando dados para API...', {
    goal: profile.goal,
    sleep: profile.sleep,
    activity: profile.activity,
    gender: profile.gender
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchWithRetry(`${API_URL}/consulta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
      signal: controller.signal
    }, 1); // 1 retry = 2 tentativas no total
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const result = await res.json();
    devLog('✅ [NutriCare] Resposta da API recebida', result.meta);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name !== 'AbortError') {
      console.warn('⚠️ [NutriCare] API indisponível, usando geração local:', err.message);
    }
    return null;
  }
}

// ---- Premium / Stripe Payment Link ----
// Payment Link de produção — fallback caso API offline
const PREMIUM_LINK_FALLBACK = 'https://buy.stripe.com/4gM5kEglIh1g0yg7tG2VG00';

async function iniciarCheckoutPremium(planType = 'premium') {
  try {
    const deviceId = getPremiumDeviceId();
    const res = await fetchWithRetry(`${API_URL}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, deviceId })
    }, 1);
    if (res && res.ok) {
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
    }
  } catch (e) {
    console.warn('API de checkout indisponível, usando fallback:', e.message);
  }
  // Fallback: link estático se API offline
  window.location.href = PREMIUM_LINK_FALLBACK;
}

function renderPremiumAtivado(email, durationDays = 30) {
  const container = document.getElementById('screen-container');
  const planoNome = durationDays >= 90 ? 'Trimestral' : 'Premium';
  container.innerHTML = `
    <div class="screen" style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-deep);">
      <div style="text-align:center;max-width:360px;animation:slideUp 0.5s ease;">
        <div style="font-size:4rem;margin-bottom:16px;animation:pulse 2s ease-in-out infinite;">🎉</div>
        <h1 style="font-size:1.6rem;margin-bottom:8px;">${planoNome} Ativado!</h1>
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin-bottom:20px;">
          Agora você tem acesso a todos os recursos premium do NutriCare.<br>
          <span style="color:var(--accent-500);font-weight:600;">✅ Válido por ${durationDays} dias</span>
          ${email ? `<br><span style="color:var(--text-tertiary);font-size:0.8rem;">Confirmação enviada para ${email}</span>` : ''}
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn-primary" onclick="dispatch('iniciar_consulta')">Começar Consulta</button>
          <button class="btn-secondary" onclick="dispatch('onboarding')">Ir para o Menu</button>
        </div>
      </div>
    </div>`;
}

// ---- Premium Feature Gates ----
function getPremiumCookie() {
  const match = document.cookie.match(/(?:^|;\s*)nutricare_premium=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setPremiumCookie(value, dias) {
  const expires = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `nutricare_premium=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function setEverPaidCookie(value, dias) {
  const expires = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `nutricare_ever_paid=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deletePremiumCookie() {
  document.cookie = 'nutricare_premium=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
}

function getPremiumDeviceId() {
  let id = localStorage.getItem('nutricare_device_id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('nutricare_device_id', id);
  }
  return id;
}

// Salva sessão premium ATIVA com JWT (server-side verification)
// expiresAtISO: data de expiração (30 dias após pagamento, ou 30 dias para PIN profissional)
// token: JWT opcional (presente quando verificado via Stripe)
function salvarPremiumMultiStorage(expiresAtISO, token) {
  localStorage.setItem('nutricare_premium', 'true');
  localStorage.setItem('nutricare_premium_expires', expiresAtISO);
  if (token) {
    localStorage.setItem('nutricare_premium_token', token);
  }
  const payload = JSON.stringify({ expires: expiresAtISO, t: token || '' });
  setPremiumCookie(payload, 365);
  broadcastSync('premium_changed', { status: 'activated' });
}

// Salva registro PERMANENTE de que o usuário já pagou (previne re-cobrança)
function salvarEverPaid(dataAtivacaoISO) {
  localStorage.setItem('nutricare_ever_paid', 'true');
  localStorage.setItem('nutricare_ever_paid_date', dataAtivacaoISO);
  const payload = JSON.stringify({ date: dataAtivacaoISO, device: getPremiumDeviceId() });
  broadcastSync('premium_changed', { status: 'ever_paid' });
  setEverPaidCookie(payload, 365 * 5);
}

function temEverPaid() {
  if (localStorage.getItem('nutricare_ever_paid') === 'true') return true;
  // Verifica cookie
  const match = document.cookie.match(/(?:^|;\s*)nutricare_ever_paid=([^;]*)/);
  if (match) {
    try {
      const data = JSON.parse(decodeURIComponent(match[1]));
      if (data && data.date) {
        localStorage.setItem('nutricare_ever_paid', 'true');
        localStorage.setItem('nutricare_ever_paid_date', data.date);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

function limparPremiumMultiStorage() {
  localStorage.removeItem('nutricare_premium');
  localStorage.removeItem('nutricare_premium_expires');
  localStorage.removeItem('nutricare_premium_token');
  deletePremiumCookie();
  broadcastSync('premium_changed', { status: 'removed' });
}

function recuperarPremiumCookie() {
  const raw = getPremiumCookie();
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (data && data.expires) {
      localStorage.setItem('nutricare_premium', 'true');
      localStorage.setItem('nutricare_premium_expires', data.expires);
      if (data.t) localStorage.setItem('nutricare_premium_token', data.t);
      return true;
    }
  } catch (e) {}
  return false;
}

function getPremiumDiasRestantes() {
  let expiresStr = localStorage.getItem('nutricare_premium_expires');
  if (!expiresStr) {
    if (recuperarPremiumCookie()) {
      expiresStr = localStorage.getItem('nutricare_premium_expires');
    }
  }
  if (!expiresStr) return 0;
  const expiracao = new Date(expiresStr);
  if (isNaN(expiracao.getTime())) return 0;
  const agora = new Date();
  const diffMs = expiracao - agora;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function getEverPaidDiasRestantes() {
  const dataStr = localStorage.getItem('nutricare_ever_paid_date');
  if (!dataStr) return 0;
  const dataAtivacao = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora - dataAtivacao;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  // ever_paid vale 5 anos (registro permanente)
  return Math.max(0, 1825 - diffDias);
}

function reativarPremiumDoEverPaid() {
  const dataStr = localStorage.getItem('nutricare_ever_paid_date');
  if (!dataStr) return false;
  // Reativa premium por 30 dias a partir de agora
  const expiracao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  salvarPremiumMultiStorage(expiracao);
  return true;
}

function isPremium() {
  let val = localStorage.getItem('nutricare_premium');
  if (val !== 'true') {
    if (recuperarPremiumCookie()) {
      val = 'true';
    }
  }
  if (val !== 'true') return false;

  // Verifica expiração via data salva (server-side: JWT ou PIN profissional)
  const expiresStr = localStorage.getItem('nutricare_premium_expires');
  if (!expiresStr) {
    limparPremiumMultiStorage();
    return false;
  }

  const diasRestantes = getPremiumDiasRestantes();
  if (diasRestantes <= 0) {
    limparPremiumMultiStorage(); // Só limpa sessão, ever_paid continua
    return false;
  }
  return true;
}

function upgradeRedirect() {
  const container = document.getElementById('screen-container');
  if (!container) return;
  container.innerHTML = `
    <div class="screen" style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-deep);">
      <div style="text-align:center;max-width:360px;animation:slideUp 0.5s ease;">
        <div style="font-size:4rem;margin-bottom:16px;">🔒</div>
        <h2 style="font-size:1.3rem;margin-bottom:8px;">Funcionalidade Premium</h2>
        <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.6;margin-bottom:24px;">
          Esta funcionalidade é exclusiva do plano Premium.<br>
          Assine agora e tenha acesso a todos os recursos.
        </p>
        <button class="btn-primary" onclick="dispatch('ver_planos')">💰 Ver planos</button>
      </div>
    </div>`;
}

// ---- Modal Liberar Premium (simplificado) ----
function exibirModalLiberarCliente() {
  // Se não tem PIN configurado, mostra tela de cadastro
  if (!getPinProfissional()) {
    exibirModalConfigurarPin();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'modal-liberar-cliente';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="premium-modal">
      <button class="premium-modal-close" onclick="fecharModal()">&times;</button>
      <div class="premium-modal-icon">🔐</div>
      <h2 class="premium-modal-title">Liberar Premium</h2>
      <p class="premium-modal-sub">Ative o plano Premium para seu cliente</p>
      <div class="premium-modal-body">
        <label class="premium-modal-label">Nome do Cliente</label>
        <input class="premium-modal-input" id="mc-nome" type="text" placeholder="Ex: Maria Silva" />
        <span class="premium-modal-helper">Deixe em branco para "Cliente"</span>

        <label class="premium-modal-label" style="margin-top:12px;">PIN de Segurança</label>
        <input class="premium-modal-input" id="mc-pin" type="password" placeholder="Digite seu PIN profissional" maxlength="6" inputmode="numeric" autocomplete="off" />
        <span class="premium-modal-helper" id="mc-pin-erro" style="color:#EF4444;display:none;">PIN incorreto. Tente novamente.</span>

        <hr class="premium-modal-separator" />

        <button class="premium-modal-btn" id="mc-confirmar-btn" onclick="confirmarLiberacao()">
          <span class="btn-icon">⭐</span>
          <span class="btn-text">Liberar Premium (30 dias)</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
  setTimeout(() => {
    const pinInput = document.getElementById('mc-pin');
    if (pinInput) pinInput.focus();
  }, 300);
  setTimeout(() => {
    const pinInput = document.getElementById('mc-pin');
    if (pinInput) pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmarLiberacao(); });
  }, 300);
}

function exibirModalConfigurarPin() {
  const overlay = document.createElement('div');
  overlay.id = 'modal-liberar-cliente';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="premium-modal">
      <button class="premium-modal-close" onclick="fecharModal()">&times;</button>
      <div class="premium-modal-icon">🔑</div>
      <h2 class="premium-modal-title">Configurar PIN</h2>
      <p class="premium-modal-sub">Crie um PIN de segurança para liberar o Premium dos seus clientes.</p>
      <div class="premium-modal-body">
        <label class="premium-modal-label">Crie seu PIN (4 a 6 dígitos)</label>
        <input class="premium-modal-input" id="mc-novo-pin" type="password" placeholder="Ex: 1234" maxlength="6" inputmode="numeric" autocomplete="off" />
        <span class="premium-modal-helper">Use apenas números</span>

        <label class="premium-modal-label" style="margin-top:20px;">Confirme o PIN</label>
        <input class="premium-modal-input" id="mc-confirmar-pin" type="password" placeholder="Repita o PIN" maxlength="6" inputmode="numeric" autocomplete="off" />
        <span class="premium-modal-helper" id="mc-pin-setup-erro" style="color:#EF4444;display:none;"></span>

        <hr class="premium-modal-separator" />

        <button class="premium-modal-btn" id="mc-confirmar-btn" onclick="salvarPinConfigurado()" style="margin-top:24px;">
          <span class="btn-text">Salvar PIN</span>
          <span class="spinner"></span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
  setTimeout(() => {
    const input = document.getElementById('mc-novo-pin');
    if (input) input.focus();
  }, 300);
  setTimeout(() => {
    const input = document.getElementById('mc-novo-pin');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') salvarPinConfigurado(); });
    const input2 = document.getElementById('mc-confirmar-pin');
    if (input2) input2.addEventListener('keydown', e => { if (e.key === 'Enter') salvarPinConfigurado(); });
  }, 300);
}

async function salvarPinConfigurado() {
  const btn = document.getElementById('mc-confirmar-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');

  const pin = document.getElementById('mc-novo-pin').value.trim();
  const confirmar = document.getElementById('mc-confirmar-pin').value.trim();
  const erroEl = document.getElementById('mc-pin-setup-erro');

  if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    erroEl.textContent = 'O PIN deve ter 4 a 6 dígitos numéricos.';
    erroEl.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    return;
  }
  if (pin !== confirmar) {
    erroEl.textContent = 'Os PINs não conferem. Digite igual nos dois campos.';
    erroEl.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    return;
  }

  // Armazena hash SHA-256 + salt, nunca o PIN em texto puro
  try {
    const hash = await hashPinSHA256(pin);
    localStorage.setItem('nutricare_pin_hash', hash);
  } catch (err) {
    console.error('Erro ao salvar PIN:', err);
    erroEl.textContent = 'Erro ao salvar PIN. Tente novamente.';
    erroEl.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    return;
  }
  erroEl.style.display = 'none';
  fecharModal();
  setTimeout(() => exibirModalLiberarCliente(), 350);
}

function getPinProfissional() {
  const hash = localStorage.getItem('nutricare_pin_hash');
  if (hash) return hash;
  // Fallback: PIN antigo em texto puro (migrado na inicialização)
  return localStorage.getItem('nutricare_pin') || '';
}

// Migra PIN antigo em texto puro para hash (chamado na inicialização)
async function migrarPinAntigo() {
  const oldPin = localStorage.getItem('nutricare_pin');
  if (oldPin) {
    const hash = await hashPinSHA256(oldPin);
    localStorage.setItem('nutricare_pin_hash', hash);
    localStorage.removeItem('nutricare_pin');
  }
}

function fecharModal() {
  const overlay = document.getElementById('modal-liberar-cliente');
  if (overlay) {
    overlay.classList.remove('modal-open');
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
  }
}

async function confirmarLiberacao() {
  const btn = document.getElementById('mc-confirmar-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('loading');

  // Rate limiting: 5 tentativas, lock de 30s
  window._pinAttempts = (window._pinAttempts || 0);
  if (window._pinAttempts >= 5) {
    const pinErro = document.getElementById('mc-pin-erro');
    pinErro.textContent = '🔒 Muitas tentativas. Aguarde 30 segundos.';
    pinErro.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    setTimeout(() => { window._pinAttempts = 0; }, 30000);
    return;
  }

  // Verifica PIN (hash SHA-256 ou fallback para PIN antigo)
  const pinDigitado = document.getElementById('mc-pin').value.trim();
  const pinErro = document.getElementById('mc-pin-erro');
  const pinHash = getPinProfissional();

  if (!pinHash) {
    pinErro.textContent = 'Nenhum PIN configurado. Configure primeiro.';
    pinErro.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    return;
  }

  let hashDigitado;
  try {
    hashDigitado = await hashPinSHA256(pinDigitado);
  } catch (err) {
    console.error('Erro ao verificar PIN:', err);
    pinErro.textContent = 'Erro ao verificar PIN. Tente novamente.';
    pinErro.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    return;
  }
  const pinValido = hashDigitado === pinHash ||
    (/^\d{4,6}$/.test(pinHash) && pinDigitado === pinHash);

  if (!pinValido) {
    window._pinAttempts++;
    pinErro.textContent = `PIN incorreto. Tentativa ${window._pinAttempts}/5.`;
    pinErro.style.display = 'block';
    btn.disabled = false;
    btn.classList.remove('loading');
    document.getElementById('mc-pin').focus();
    return;
  }
  pinErro.style.display = 'none';
  window._pinAttempts = 0; // Reseta contador no sucesso

  const nome = document.getElementById('mc-nome').value.trim() || 'Cliente';
  const tempo = 30;
  const dataAtivacao = new Date();
  const dataExpiracao = new Date(dataAtivacao.getTime() + tempo * 24 * 60 * 60 * 1000);

  // Ativa premium (localStorage + cookie)
  salvarPremiumMultiStorage(dataExpiracao.toISOString());
  salvarEverPaid(dataAtivacao.toISOString());

  // Salva dados do cliente
  const liberacao = {
    cliente: nome,
    id: 'CLI-' + Date.now().toString(36).toUpperCase(),
    tipo: 'premium',
    tempo: tempo,
    dataAtivacao: dataAtivacao.toISOString(),
    dataExpiracao: dataExpiracao.toISOString(),
    status: 'ativo'
  };
  localStorage.setItem('nutricare_liberacao', JSON.stringify(liberacao));

  // Fecha modal e mostra tela de sucesso
  fecharModal();
  exibirTelaPremiumAtivado(nome, dataExpiracao);
}

function exibirTelaPremiumAtivado(nome, dataExpiracao) {
  const container = document.getElementById('screen-container');
  if (!container) return;
  container.innerHTML = `
    <div class="screen" style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-deep);">
      <div class="premium-success">
        <div class="premium-success-stars">
          <span>⭐</span><span>⭐</span><span>⭐</span>
        </div>
        <div class="premium-success-icon">🏆</div>
        <h2 class="premium-success-title">Premium Ativado!</h2>
        <div class="premium-success-card">
          <div class="success-row"><span>Cliente</span> <strong>${escapeHtml(nome)}</strong></div>
          <div class="success-row"><span>Plano</span> <strong>⭐ Premium</strong></div>
          <div class="success-row"><span>Validade</span> <strong>${dataExpiracao.toLocaleDateString('pt-BR')}</strong></div>
        </div>
        <p class="premium-success-msg">✅ Acesso liberado com sucesso!</p>
        <div class="premium-success-btns">
          <button class="btn-primary" onclick="dispatch('iniciar_consulta')">▶️ Iniciar Consulta</button>
          <button class="btn-outline" onclick="dispatch(null, null)">📋 Ir para o Menu</button>
        </div>
      </div>
    </div>`;
}

function renderChatPremium(resp) {
  const history = STATE.chatHistory || [];
  const mode = STATE.chatCategoryMode;
  const selectedCat = STATE.chatSelectedCategory;
  const hasHistory = history.length > 0;
  const catData = selectedCat ? BOT_PERGUNTAS.find(c => c.key === selectedCat) : null;

  // ---- Monta burbulhas do histórico ----
  let bubblesHtml = '';
  history.forEach(msg => {
    if (msg.role === 'user') {
      bubblesHtml += `
        <div class="message user">
          <div class="message-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M8 14C8 14 10 12 12 14C14 12 16 14 16 14" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L10 11" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M14 10L14 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <div class="message-bubble" style="color:white;border-bottom-right-radius:4px;max-width:85%;margin-left:auto;"><p>${escapeHtml(msg.text)}</p></div>
        </div>`;
    } else {
      bubblesHtml += `
        <div class="message bot">
          <div class="message-avatar">
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="var(--accent-500)" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/></svg>
          </div>
          <div class="message-bubble">${msg.text}</div>
        </div>`;
    }
  });

  // ---- Welcome / botão inicial ----
  if (!hasHistory && resp.message) {
    bubblesHtml += `
      <div class="message bot">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="var(--accent-500)" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/></svg>
        </div>
        <div class="message-bubble">${resp.message}</div>
      </div>`;
  }

  // ---- Grade de categorias ----
  if (mode === 'categories') {
    if (hasHistory) {
      bubblesHtml += `<p style="font-size:0.82rem;color:var(--text-secondary);margin:8px 0 4px;font-weight:600;">📌 Escolha outro assunto:</p>`;
    }
    bubblesHtml += `<div class="category-grid">`;
    BOT_PERGUNTAS.forEach(cat => {
      bubblesHtml += `
        <div class="category-card" onclick="handleCategoryClick('${cat.key}')">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-label">${cat.label}</span>
        </div>`;
    });
    bubblesHtml += `</div>`;
  }

  // ---- Botões de perguntas da categoria (modo questions) ----
  if (mode === 'questions' && catData) {
    bubblesHtml += `<div style="margin-top:${hasHistory ? '16px' : '0'}">`;
    if (hasHistory) {
      bubblesHtml += `<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;font-weight:600;">📌 Mais perguntas sobre <strong>${catData.label}</strong>:</p>`;
    }
    bubblesHtml += `<div style="display:flex;flex-direction:column;gap:8px;">`;
    catData.perguntas.forEach((q, i) => {
      const safeQ = q.replace(/&/g, '&amp;').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      bubblesHtml += `<button class="option-btn" onclick="handleQuestionClick('${safeQ}')">${escapeHtml(q)}</button>`;
    });
    bubblesHtml += `</div></div>`;
  }

  // ---- Loading indicator ----
  if (STATE.chatLoading) {
    bubblesHtml += `
      <div class="message bot">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="var(--accent-500)" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/></svg>
        </div>
        <div class="message-bubble"><em>Digitando...</em></div>
      </div>`;
  }

  // ---- Bottom bar ----
  const showBackBtn = mode === 'questions';
  const bottomPadding = showBackBtn ? '130px' : '80px';

  let bottomBar = `<div style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px 24px;background:var(--bg-deep);border-top:1px solid var(--border-color);display:flex;flex-direction:column;gap:8px;">`;
  if (showBackBtn) {
    bottomBar += `<button class="btn-outline" onclick="handleBackToCategories()" style="width:100%;font-size:0.85rem;">← Categorias</button>`;
  }
  bottomBar += `<button class="btn-outline" onclick="dispatch('chat_finalizar')" style="width:100%;font-size:0.85rem;">🎯 Finalizar e gerar plano</button>`;
  bottomBar += `</div>`;

  return `
    <div class="screen">
      <header class="consult-header" style="background:var(--bg-card);border-bottom:1px solid var(--border-color);">
        <div class="header-top">
          <div class="header-brand">
            <button class="header-back" onclick="dispatch('voltar_menu')" aria-label="Voltar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="var(--accent-500)" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/></svg>
            <span>Bot Nutricionista</span>
          </div>
          <span style="font-size:0.75rem;color:var(--text-secondary);background:var(--accent-500);color:#fff;padding:2px 10px;border-radius:10px;">⭐ Premium</span>
        </div>
      </header>
      <main class="chat-container" id="chat-inner" style="padding-bottom:${bottomPadding};">
        ${bubblesHtml}
      </main>
      ${bottomBar}
    </div>`;
}

function dispatch(action, payload) {
  // Guard anti-clique duplicado com timeout de segurança (5s)
  if (STATE._dispatching) {
    devLog('⏳ [NutriCare] Dispatch bloqueado — já processando');
    return;
  }
  STATE._dispatching = true;
  STATE._dispatchTimeout = setTimeout(() => {
    STATE._dispatching = false;
    console.warn('⚠️ [NutriCare] Dispatch timeout — liberado automaticamente');
  }, 5000);
  try {
    devLog(`🔄 [NutriCare] Action: ${action}`, payload ? `Payload: ${String(payload).slice(0, 50)}...` : '');

    // Aplica transição de tela baseada na ação
    if (action && ACTION_ROUTES[action]) {
      STATE.screen = ACTION_ROUTES[action];
      devLog(`   → Tela: ${STATE.screen}`);
    }

    // Liberar entrada do cliente — abre modal profissional
    if (action === 'liberar_cliente') {
      if (isPremium()) {
        const dias = getPremiumDiasRestantes();
        alert(`⭐ Você já possui Premium ativo!\n⏳ ${dias} dias restantes.`);
      } else {
        exibirModalLiberarCliente();
      }
      return;
    }

    // Sair do premium — limpa e volta pro básico
    if (action === 'sair_premium') {
      limparPremiumMultiStorage();
      resetState();
      const response = engine(action, payload);
      render(response);
      return;
    }

    // Reseta estado ao iniciar nova consulta (evita pular perguntas na 2ª vez)
    if (action === 'iniciar_consulta') {
      STATE.anamneseStep = 0;
      STATE.anamneseExtraStep = 0;
      STATE.chatPremiumStep = 0;
      STATE.plano = null;
      Object.assign(STATE.profile, {
        name: '', goal: '', routine: '', diet: '',
        restrictions: [], restrictionDetail: '',
        hasExams: false, sleep: '', activity: '',
        age: '', weight: '', height: '', gender: '',
        medications: '', difficulties: [], emotionalEating: '',
        motivation: 3, extraInfo: ''
      });
    }

    // Save user text input for bubble display
    if (typeof payload === 'string' && payload.trim()) {
      STATE.lastUserInput = payload.trim();
    }
    const response = engine(action, payload);
    STATE.screen = response.screen;
    render(response);
  } finally {
    STATE._dispatching = false;
    if (STATE._dispatchTimeout) {
      clearTimeout(STATE._dispatchTimeout);
      STATE._dispatchTimeout = null;
    }
  }
}

function renderUserBubble() {
  if (!STATE.lastUserInput) return '';
  const html = `
    <div class="message user" style="padding: 12px 20px 0;">
      <div class="message-avatar" style="margin-left: auto;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M8 14C8 14 10 12 12 14C14 12 16 14 16 14" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L10 11" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M14 10L14 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="message-bubble" style="color:white;border-bottom-right-radius:4px;max-width:85%;margin-left:auto;"><p>${escapeHtml(STATE.lastUserInput)}</p></div>
    </div>`;
  STATE.lastUserInput = null;
  return html;
}

window.showMealDetail = function(idx) {
  const meals = gerarRefeicoes(STATE.profile, true);
  const meal = meals[idx];
  if (!meal) return;
  const receitas = gerarReceitasParaRefeicao(meal.name, STATE.profile.goal);
  const container = $c('screen-container');
  if (!container) return;
  container.innerHTML = renderComponent({ type: 'meal_detail', meal, idx, receitas });
  bindClicks(container);
};

function render(response) {
  if (!response) return;
  const container = $c('screen-container');
  if (!container) return;

  // Cleanup ao trocar de tela
  if (STATE._loaderInterval) { clearInterval(STATE._loaderInterval); STATE._loaderInterval = null; }

  STATE.screen = response.screen;

  // Use dedicated template for each screen type
  switch (response.screen) {
    case 'onboarding':
      container.innerHTML = renderOnboarding(response);
      bindClicks(container);
      return;
    case 'how_it_works':
      container.innerHTML = renderHowItWorks(response);
      bindClicks(container);
      return;
    case 'planos':
      container.innerHTML = renderPlans(response);
      bindClicks(container);
      return;
    case 'contato':
      container.innerHTML = renderContato(response);
      bindClicks(container);
      return;
    case 'assinar_premium':
      if (isPremium()) {
        const dias = getPremiumDiasRestantes();
        alert(`⭐ Você já possui Premium ativo!\n⏳ ${dias} dias restantes.`);
        setTimeout(() => dispatch('voltar_menu'), 0);
        return;
      }
      // Cliente já pagou antes? Reativa sem cobrar de novo
      if (temEverPaid()) {
        reativarPremiumDoEverPaid();
        const dias = getPremiumDiasRestantes();
        alert(`♻️ Premium reativado!\n⏳ ${dias} dias restantes (você já havia pago antes).`);
        setTimeout(() => dispatch('voltar_menu'), 0);
        return;
      }
      iniciarCheckoutPremium('premium');
      return;
    case 'assinar_trimestral':
      if (isPremium()) {
        const dias = getPremiumDiasRestantes();
        alert(`⭐ Você já possui Premium ativo!\n⏳ ${dias} dias restantes.`);
        setTimeout(() => dispatch('voltar_menu'), 0);
        return;
      }
      iniciarCheckoutPremium('trimestral');
      return;
    case 'analise_loading':
      container.innerHTML = renderAnaliseLoader();
      startLoaderAnimation();
      setTimeout(async () => {
        devLog('⏳ [NutriCare] Iniciando análise dos dados...');
        try {
          // 1. Ping rápido no servidor (500ms) pra não travar
          const saudavel = API_URL
            ? await fetchWithRetry(`${API_URL}/health`, {
                signal: AbortSignal.timeout(500)
              }, 0).then(r => r.ok).catch(() => false)
            : false;

          // 2. Só chama a API se o servidor estiver vivo
          let result = null;
          if (saudavel) {
            result = await Promise.race([
              sendToBackend(STATE.profile),
              new Promise(r => setTimeout(() => r(null), 5000))
            ]);
          } else {
            devLog('💻 [NutriCare] Servidor offline, gerando localmente');
          }

          if (result && result.success) {
            STATE.plano = result.data;
            STATE.lastDiagnostico = (result.data.diagnostico?.resumo || []).join(' · ') || STATE.profile.goal || '';
            STATE.lastPlano = true;
            devLog('📊 [NutriCare] Plano carregado do backend');
          } else {
            devLog('💻 [NutriCare] Usando geração local (fallback)');
          }
        } catch (err) {
          console.error('❌ [NutriCare] Erro inesperado na análise:', err);
        }
        dispatch('gerar_analise', null);
      }, 100);
      return;
    case 'premium_block':
      upgradeRedirect();
      return;
    case 'anamnese_extra':
      container.innerHTML = renderChatScreen(response);
      bindClicks(container);
      bindDynamicInteractions(container, response);
      return;
    case 'chat_premium':
      container.innerHTML = renderChatPremium(response);
      bindClicks(container);
      return;
    case 'analise':
      container.innerHTML = renderAnalise(response);
      bindClicks(container);
      return;
    case 'nutrition_charts':
      if (!isPremium()) { upgradeRedirect(); return; }
      container.innerHTML = renderNutritionCharts(response);
      bindClicks(container);
      initCharts();
      salvarConsulta();
      return;
    case 'historico':
      renderHistorico();
      bindClicks(container);
      return;
    case 'progresso':
      if (!isPremium()) { upgradeRedirect(); return; }
      renderProgresso();
      bindClicks(container);
      return;
    case 'detalhe_consulta':
      renderDetalheConsulta(response.consulta);
      bindClicks(container);
      return;
    case 'refeicao_detalhe':
      container.innerHTML = renderComponent(response.components[0]);
      bindClicks(container);
      return;
    default:
      container.innerHTML = renderChatScreen(response);
      bindClicks(container);
      bindDynamicInteractions(container, response);
  }
}

function renderChatScreen(resp) {
  const hasProgress = resp.screen === 'anamnese_step';
  const hasExtraProgress = resp.screen === 'anamnese_extra';
  const progressHtml = hasProgress ? `
    <header class="consult-header">
      <div class="header-top">
        <div class="header-brand">
          <button class="header-back" onclick="dispatch('voltar_menu')">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#00D68F" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/></svg>
          <span>NutriCare</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="theme-toggle-btn" class="header-theme-btn" onclick="toggleTheme()" title="Alternar tema">🌙</button>
          <div class="header-progress"><span id="step-num">${Math.min(STATE.anamneseStep + 1, ANAMNESE_TOTAL_STEPS)}</span>/${ANAMNESE_TOTAL_STEPS}</div>
        </div>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${Math.min((STATE.anamneseStep / ANAMNESE_TOTAL_STEPS) * 100, 100)}%"></div>
      </div>
    </header>` : hasExtraProgress ? `
    <header class="consult-header">
      <div class="header-top">
        <div class="header-brand">
          <button class="header-back" onclick="dispatch('voltar_menu')">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#00D68F" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="#00D68F" stroke-width="2.5" stroke-linecap="round"/></svg>
          <span>Premium</span>
          <span style="font-size:0.7rem;background:var(--accent-500);color:#fff;padding:2px 8px;border-radius:8px;margin-left:4px;">⭐</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.75rem;color:var(--text-secondary);">${STATE.anamneseExtraStep + 1}/${ANAMNESE_EXTRA_TOTAL}</span>
        </div>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${((STATE.anamneseExtraStep) / ANAMNESE_EXTRA_TOTAL) * 100}%"></div>
      </div>
    </header>` : '';

  let chatHtml = `<main class="chat-container" id="chat-inner">`;

  // User message bubble (from text input)
  if (STATE.lastUserInput) {
    chatHtml += `
      <div class="message user">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M8 14C8 14 10 12 12 14C14 12 16 14 16 14" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L10 11" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M14 10L14 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="message-bubble"><p>${escapeHtml(STATE.lastUserInput)}</p></div>
      </div>`;
    STATE.lastUserInput = null;
  }

  // Message from nutritionist
  if (resp.message) {
    chatHtml += `
      <div class="message bot">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="var(--accent-500)" stroke-width="3"/>
            <path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M18 20L18 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M30 20L30 22" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="message-bubble">${resp.message}</div>
      </div>`;
  }

  // Components
  resp.components.forEach(c => {
    chatHtml += renderComponent(c, resp.screen);
  });

  chatHtml += `</main>`;

  const html = `
    <div class="screen consultation-mode" id="screen-${resp.screen}">
      ${progressHtml}
      ${chatHtml}
    </div>`;

  return html;
}

function renderComponent(comp, screen) {
  switch (comp.type) {

    case 'buttons':
      return `<div style="margin:12px 0;display:flex;flex-direction:column;gap:10px;">${comp.items.map(b => `
        <button class="${b.variant === 'primary' ? 'btn-primary' : b.variant === 'secondary' ? 'btn-secondary' : 'btn-outline'}" data-action="${b.action}">
          ${b.text}
        </button>`).join('')}</div>`;

    case 'button':
      return `<button class="${comp.variant === 'primary' ? 'btn-primary' : comp.variant === 'secondary' ? 'btn-secondary' : 'btn-outline'}" data-action="${comp.action}" style="${comp.variant === 'primary' && screen !== 'onboarding' ? 'margin-top:16px;' : ''}">${comp.text}</button>`;

    case 'back':
      return `<button class="back-btn" data-action="${comp.action}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        Voltar
      </button>`;

    case 'title':
      return `<h2 class="page-title">${comp.text}</h2>${comp.subtitle ? `<p class="page-subtitle">${comp.subtitle}</p>` : ''}`;

    case 'steps':
      return `<div class="how-steps" style="margin:16px 0;">${comp.items.map(s => `
        <div class="how-step">
          <div class="how-step-num">${s.num}</div>
          <div><h4>${s.title}</h4><p>${s.desc}</p></div>
        </div>`).join('')}</div>`;

    case 'pricing':
      return `<div class="plans-grid" style="margin:16px 0;">${comp.items.map(p => `
        <div class="plan-card ${p.recommended ? 'recommended' : ''}">
          <div class="${p.recommended ? 'plan-badge recom-badge' : 'plan-badge'}">${p.badge}</div>
          <div class="plan-price"><span class="plan-value">${p.value}</span></div>
          <ul class="plan-features">
            ${p.features.map(f => `<li class="${f.included ? '' : 'plan-no'}">${f.included ? '✔' : '✘'} ${f.text}</li>`).join('')}
          </ul>
          <button class="btn-primary" data-action="${p.action}">${p.action === 'assinar_premium' ? 'Assinar Premium' : p.action === 'assinar_trimestral' ? 'Assinar Trimestral' : 'Começar grátis'}</button>
        </div>`).join('')}</div>`;

    case 'contact_card':
      return `<div class="result-card" style="margin:16px 0;">
        ${comp.items.map(i => `<p style="margin-bottom:12px;"><strong>${i.label}:</strong> ${i.value}</p>`).join('')}
      </div>`;

    case 'options':
      return `<div class="options-container" style="padding:8px 0;">
        ${comp.items.map(i => `
          <button class="option-btn" data-action="${i.action}">${i.text}</button>`).join('')}
      </div>`;

    case 'checkboxes':
      return `<div class="checkboxes-container" style="padding:8px 0;">
        ${comp.items.map(i => `
          <label class="checkbox-item" data-value="${i.value}"${i.exclusive ? ' data-exclusive="true"' : ''}>
            <span class="checkbox-box"></span>
            <span class="checkbox-label">${i.text}</span>
          </label>`).join('')}
        <button class="btn-primary" data-action="${comp.action}" style="margin-top:12px;width:100%;">Continuar</button>
      </div>`;

    case 'text_input': {
      const isNumeric = comp.action === 'ans_text_weight' || comp.action === 'ans_text_height';
      // Define maxLength por campo para prevenir abuso e payloads gigantes
      const maxLengthMap = {
        medications: 500,
        difficulties: 500,
        emotionalEating: 500,
        extraInfo: 1000,
        restrictionDetail: 500,
        diet: 2000,
        name: 100,
        weight: 10,
        height: 10,
        age: 4
      };
      const fieldKey = comp.action ? comp.action.replace('ans_text_', '') : '';
      const maxLen = maxLengthMap[fieldKey] || 500;
      return `
        <div class="input-text-wrapper" style="display:flex;gap:8px;padding:8px 0;">
          <input type="text" class="text-input" id="dynamic-text-input"
            placeholder="${comp.placeholder || 'Digite...'}"
            autocomplete="off" maxlength="${maxLen}"
            ${isNumeric ? ' inputmode="decimal" pattern="[0-9,.]*"' : ''}>
          <button class="send-btn" id="dynamic-send-btn" data-action="${comp.action}" disabled>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>`;
    }

    case 'file_upload':
      return `
        <div class="file-upload-wrapper" style="padding:8px 0;">
          <div class="file-upload-area" id="dynamic-file-area" style="cursor:pointer;">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 22V10M16 10L11 15M16 10L21 15" stroke="var(--accent-500)" stroke-width="2" stroke-linecap="round"/><path d="M4 20V24C4 26.2 5.8 28 8 28H24C26.2 28 28 26.2 28 24V20" stroke="var(--accent-500)" stroke-width="2" stroke-linecap="round"/></svg>
            <p>Clique para enviar exames <span>(opcional)</span></p>
            <input type="file" accept="image/*,application/pdf" id="dynamic-file-input" hidden>
          </div>
          <div class="file-preview hidden" id="dynamic-file-preview">
            <span id="dynamic-file-name"></span>
            <button class="file-remove" id="dynamic-file-remove">✕</button>
          </div>
          <div class="file-actions hidden" id="dynamic-file-actions" style="margin-top:8px;">
            <button class="confirm-multi-btn" data-action="${comp.action_confirm}">✅ Enviar</button>
            <button class="btn-skip" data-action="${comp.action_skip}">Pular</button>
          </div>
        </div>`;

    case 'bullet_list':
      return `
        <div class="result-section" style="margin-bottom:16px;">
          <h3 style="font-size:1rem;color:var(--accent-500);margin-bottom:12px;">${comp.title}</h3>
          <div class="result-card">
            <ul>${comp.items.map(i => `<li>${i}</li>`).join('')}</ul>
          </div>
        </div>`;

    case 'card':
      return `
        <div class="result-section" style="margin-bottom:16px;">
          <div class="result-card">
            <h3>${comp.title}</h3>
            <p>${comp.text}</p>
          </div>
        </div>`;

    case 'card_list':
      return `<div style="margin:12px 0;">${comp.items.map(i => `
        <div class="strategy-card">
          <div class="strategy-icon">${i.icon}</div>
          <div class="strategy-text"><h4>${i.title}</h4><p>${i.text}</p></div>
        </div>`).join('')}</div>`;

    case 'strategy_list':
      return `<div style="margin:12px 0;">${comp.items.map(i => `
        <div class="tip-card">
          <div class="tip-icon">${i.icon}</div>
          <div class="tip-content"><h4>${i.title}</h4><p>${i.text}</p></div>
        </div>`).join('')}</div>`;

    case 'supplement_list':
      return `<div style="margin:12px 0;">${comp.items.map(i => `
        <div class="supplement-card">
          <div class="supplement-icon">${i.icon}</div>
          <div class="supplement-info"><h4>${i.name}</h4><p>${i.reason}</p><span class="supplement-dosage">${i.dosage}</span></div>
        </div>`).join('')}</div>`;

    case 'meal_detail': {
      const m = comp.meal;
      return `
        <div class="screen" style="padding:24px;overflow-y:auto;height:100%;">
          <header class="screen-header" style="margin-bottom:20px;">
            <button class="header-back" onclick="dispatch('voltar_plano')">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;font-size:1.3rem;">${m.icon}</div>
              <div>
                <h2 style="margin:0;font-size:1.2rem;">${m.name}</h2>
                <span style="font-size:0.85rem;color:var(--text-tertiary);">${m.time}</span>
              </div>
            </div>
            <div style="width:20px;"></div>
          </header>

          <div class="meal-detail-opcoes">
            <h3 style="font-size:1rem;color:var(--accent-500);margin-bottom:12px;">🍽️ Opções</h3>
            ${m.main.split('\n').map(op => `<div class="result-card" style="margin-bottom:8px;padding:12px 16px;">${op}</div>`).join('')}
          </div>

          ${m.subs ? `
            <div class="meal-detail-subs" style="margin-top:16px;">
              <h3 style="font-size:1rem;color:var(--accent-500);margin-bottom:8px;">🔄 Substituições</h3>
              <div class="meal-substitutions" style="padding:12px 16px;background:var(--accent-glow);border-radius:var(--radius-sm);">
                <div class="meal-substitutions-text">${m.subs}</div>
              </div>
            </div>` : ''}

          ${comp.receitas ? `
            <div class="meal-detail-receitas" style="margin-top:16px;">
              <h3 style="font-size:1rem;color:var(--accent-500);margin-bottom:8px;">📖 Receitas sugeridas</h3>
              ${comp.receitas}
            </div>` : ''}

          <div style="margin-top:20px;display:flex;gap:8px;">
            <button class="btn-primary" style="flex:1;" onclick="dispatch('voltar_plano')">← Voltar ao plano</button>
          </div>
        </div>`;
    }
    case 'meal_plan':
      return `<div class="result-section" style="margin-top:12px;"><div class="meal-plan">${comp.meals.map((m, idx) => {
        const ehPremium = isPremium();
        return `
        <div class="meal-card${ehPremium ? '' : ' meal-card-basic'}">
          <div class="meal-header"${ehPremium ? ` onclick="showMealDetail(${idx})"` : ''}>
            <div class="meal-header-left">
              <div class="meal-icon">${m.icon}</div>
              <div><div class="meal-name">${m.name}</div><div class="meal-time">${m.time}</div></div>
            </div>
            ${ehPremium ? `<svg class="meal-toggle" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` : ''}
          </div>
          ${ehPremium ? `
          <div class="meal-body" style="max-height:0;overflow:hidden;transition:max-height 0.4s;">
            <div class="meal-description">${m.main.replace(/\n/g, '<br>')}</div>
            ${m.subs ? `<div class="meal-substitutions"><div class="meal-substitutions-label">🔄 Substituições</div><div class="meal-substitutions-text">${m.subs}</div></div>` : ''}
            <div class="meal-receitas">
              <div class="receitas-label">📖 Receitas sugeridas</div>
              ${gerarReceitasParaRefeicao(m.name, STATE.profile.goal)}
            </div>
          </div>` : `
          <div class="meal-body-basic">
            <div class="meal-description">${m.main.replace(/\n/g, '<br>')}</div>
          </div>`}
        </div>`}).join('')}</div></div>`;

    case 'shopping_grid':
      return `
        <div style="margin:12px 0;">
          <div class="shopping-grid">${comp.categories.map(c => `
            <div class="shopping-category" data-items="${encodeURIComponent(JSON.stringify(c.items))}" onclick="toggleShopCategory(this)">
              <span class="cat-icon">${c.icon}</span>
              <span class="cat-name">${c.name}</span>
            </div>`).join('')}
          </div>
          <div id="shopping-items"></div>
        </div>`;

    case 'followup_cards':
      return `<div class="followup-actions" style="margin-top:16px;">
        ${comp.items.map(i => `
          <button class="followup-btn" data-action="${i.action}">
            <span>${i.icon}</span> ${i.text}
          </button>`).join('')}
        <button class="followup-btn voltar-btn" data-action="voltar_menu" style="margin-top:8px;border-color:var(--border-color);color:var(--text-secondary);">
          <span>🔙</span> Voltar
        </button>
      </div>`;

    default:
      return '';
  }
}

// ---- Screen-Specific Templates ----
function renderOnboarding(resp) {
  const hero = resp.components.find(c => c.type === 'hero');
  const btns = resp.components.find(c => c.type === 'buttons');
  return `
    <div class="screen" id="screen-onboarding">
      <div class="menu-container">
        <div class="menu-top">
          <div class="menu-brand-badge">NutriCare <button class="header-theme-btn" style="position:static;margin-left:8px;" onclick="toggleTheme()" title="Alternar tema">🌙</button></div>
          ${isPremium() ? `<div class="premium-status-badge">⭐ Premium &mdash; ${getPremiumDiasRestantes()} dias restantes</div>` : ''}
          <h1>${hero ? hero.title : ''}</h1>
          ${hero && hero.subtitle ? `<p class="menu-subtitle">${hero.subtitle}</p>` : ''}
        </div>
        <div class="menu-actions">
          ${btns ? btns.items.map(b => `
            <button class="${b.variant === 'primary' ? 'btn-primary btn-arrow' : 'btn-outline'}" data-action="${b.action}">
              ${b.text}
            </button>`).join('') : ''}
        </div>
        <p class="menu-disclaimer">Ao continuar, você concorda com os Termos de Uso. Esta ferramenta oferece orientação nutricional baseada em evidências, mas não substitui acompanhamento presencial.</p>
      </div>
    </div>`;
}

function renderHowItWorks(resp) {
  const comps = resp.components.reduce((acc, c) => { acc[c.type] = c; return acc; }, {});
  return `
    <div class="screen" id="screen-how">
      <div class="how-container">
        ${comps.back ? `<button class="back-btn" data-action="${comps.back.action}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Voltar</button>` : ''}
        ${comps.title ? `<h2>${comps.title.text}</h2>` : ''}
        ${comps.steps ? `
          <div class="how-steps">
            ${comps.steps.items.map(s => `
              <div class="how-step">
                <div class="how-step-num">${s.num}</div>
                <div><h4>${s.title}</h4><p>${s.desc}</p></div>
              </div>`).join('')}
          </div>` : ''}
        ${comps.button ? `<button class="btn-primary" data-action="${comps.button.action}" style="margin-top:24px;">${comps.button.text}</button>` : ''}
      </div>
    </div>`;
}

function renderPlans(resp) {
  const comps = resp.components.reduce((acc, c) => { acc[c.type] = c; return acc; }, {});
  const pricing = comps.pricing;
  STATE.lastUserInput = null;
  const jaPremium = isPremium();
  return `
    <div class="screen" id="screen-planos">
      <div class="plans-container">
        ${comps.back ? `<button class="back-btn" data-action="${comps.back.action}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Voltar</button>` : ''}
        <div class="plans-welcome">Seja bem vindo</div>
        ${comps.title ? `<h2>${comps.title.text}</h2><p class="how-subtitle">${comps.title.subtitle}</p>` : ''}
        ${pricing ? `
          <div class="plans-grid">
            ${pricing.items.map(p => {

              if (p.action === 'assinar_trimestral' && jaPremium) {
                const dias = getPremiumDiasRestantes();
                return `
                  <div class="plan-card recommended">
                    <div class="plan-badge recom-badge">✅ Ativo</div>
                    <div class="plan-price"><span class="plan-value">${p.value}</span></div>
                    <div style="text-align:center;padding:8px 0;color:var(--accent-500);font-size:0.85rem;font-weight:500;">⏳ ${dias} dias restantes</div>
                    <ul class="plan-features">
                      ${p.features.map(f => `<li class="${f.included ? '' : 'plan-no'}">${f.included ? '✔' : '✘'} ${f.text}</li>`).join('')}
                    </ul>
                    <button class="btn-outline" style="width:100%;" disabled>⭐ Premium Ativo</button>
                  </div>`;
              }
              const btnLabel = p.action === 'assinar_trimestral' ? 'Assinar Trimestral' : 'Começar grátis';
              return `
                <div class="plan-card ${p.recommended ? 'recommended' : ''}">
                  <div class="${p.recommended ? 'plan-badge recom-badge' : 'plan-badge'}">${p.badge}</div>
                  <div class="plan-price"><span class="plan-value">${p.value}</span></div>
                  <ul class="plan-features">
                    ${p.features.map(f => `<li class="${f.included ? '' : 'plan-no'}">${f.included ? '✔' : '✘'} ${f.text}</li>`).join('')}
                  </ul>
                  <button class="btn-primary" data-action="${p.action}">${btnLabel}</button>
                </div>`;
            }).join('')}
          </div>` : ''}
      </div>
    </div>`;
}

function renderContato(resp) {
  const comps = resp.components.reduce((acc, c) => { acc[c.type] = c; return acc; }, {});
  return `
    <div class="screen" id="screen-contato">
      <div class="how-container">
        ${comps.back ? `<button class="back-btn" data-action="${comps.back.action}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Voltar</button>` : ''}
        ${comps.title ? `<h2>${comps.title.text}</h2><p class="how-subtitle">Entre em contato para saber mais sobre o plano Premium.</p>` : ''}
        ${comps.contact_card ? `
          <div class="result-card" style="margin:16px 0;">
            ${comps.contact_card.items.map(i => `<p style="margin-bottom:12px;"><strong>${i.label}:</strong> ${i.value}</p>`).join('')}
          </div>` : ''}
        ${comps.button ? `<button class="btn-secondary" data-action="${comps.button.action}" style="margin-top:16px;">${comps.button.text}</button>` : ''}
      </div>
    </div>`;
}

function renderAnaliseLoader() {
  STATE.lastUserInput = null;
  return `
    <div class="screen" id="screen-analise-loader" style="display:flex;align-items:center;justify-content:center;background:var(--bg-deep);">
      <div style="text-align:center;padding:40px;">
        <div class="loading-spinner">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
            <circle cx="24" cy="24" r="22" stroke="rgba(0,214,143,0.3)" stroke-width="3" stroke-dasharray="138" stroke-dashoffset="100" stroke-linecap="round" style="transform-origin:50% 50%;animation:spin 1.2s linear infinite;">
            </circle>
            <path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="rgba(0,214,143,0.6)" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M18 20L18 22" stroke="rgba(0,214,143,0.6)" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M30 20L30 22" stroke="rgba(0,214,143,0.6)" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 style="color:white;margin-top:24px;font-size:1.3rem;">Analisando seus dados...</h2>
        <p id="loader-status" style="color:rgba(255,255,255,0.7);margin-top:8px;font-size:0.9rem;">Montando seu plano personalizado</p>
      </div>
    </div>`;
}

function startLoaderAnimation() {
  const messages = [
    'Calculando seu metabolismo...',
    'Analisando seus hábitos...',
    'Montando refeições ideais...',
    'Ajustando macronutrientes...',
    'Quase lá...'
  ];
  const el = document.getElementById('loader-status');
  if (!el) return;
  if (STATE._loaderInterval) { clearInterval(STATE._loaderInterval); }
  let i = 0;
  STATE._loaderInterval = setInterval(function() {
    if (i < messages.length) el.textContent = messages[i];
    else {
      clearInterval(STATE._loaderInterval);
      STATE._loaderInterval = null;
    }
    i++;
  }, 700);
}

function renderAnalise(resp) {
  return `
    <div class="screen" id="screen-analise" style="padding:24px;overflow-y:auto;">
      ${renderUserBubble()}
      <div class="result-header" style="text-align:center;margin-bottom:16px;padding-top:16px;">
        <div class="welcome-badge" style="margin-bottom:12px;">Análise Completa</div>
        <p>${resp.message}</p>
      </div>
      ${resp.components.map(c => renderComponent(c, resp.screen)).join('')}
    </div>`;
}

function renderNutritionCharts(resp) {
  const nd = resp.components.find(c => c.type === 'nutrition_charts')?.data;
  if (!nd) return '<div class="screen" style="padding:24px;"><p>Erro ao carregar dados nutricionais.</p></div>';

  return `
    <div class="screen" id="screen-charts" style="padding:24px;overflow-y:auto;">
      <div class="charts-header">
        <div class="welcome-badge">Gráficos Nutricionais</div>
        <h2 style="margin-top:8px;">Análise do seu plano</h2>
        <p class="charts-subtitle">Baseado no seu perfil — ${nd.totalCal} kcal/dia${nd.tmb ? ` · TMB: ${nd.tmb} kcal` : ''}</p>
      </div>

      <!-- Card Resumo -->
      <div class="nutrition-summary">
        <div class="summary-item">
          <span class="summary-value">${nd.totalCal}</span>
          <span class="summary-label">Calorias/dia</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">${nd.proteinG}g</span>
          <span class="summary-label">Proteínas</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">${nd.carbG}g</span>
          <span class="summary-label">Carboidratos</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">${nd.fatG}g</span>
          <span class="summary-label">Gorduras</span>
        </div>
        ${nd.tmb ? `
        <div class="summary-item" style="border-left:2px solid var(--accent-glow);padding-left:12px;">
          <span class="summary-value" style="font-size:13px;">${nd.tmb}</span>
          <span class="summary-label">TMB (basal)</span>
        </div>` : ''}
      </div>

      <!-- Gráfico 1: Distribuição de Calorias por Refeição -->
      <div class="chart-card">
        <h3 class="chart-title">📊 Calorias por Refeição</h3>
        <p class="chart-desc">Distribuição das ${nd.totalCal} kcal ao longo do dia</p>
        <div class="chart-container">
          <canvas id="chart-meals"></canvas>
        </div>
        <div class="chart-legend-meals">
          ${nd.mealDist.map(m => `
            <div class="legend-item">
              <span class="legend-color" style="background:${getMealColor(nd.mealDist.indexOf(m))};"></span>
              <span class="legend-label">${m.icon} ${m.name}</span>
              <span class="legend-value">${m.calories} kcal</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Gráfico 2: Distribuição de Macronutrientes -->
      <div class="chart-card">
        <h3 class="chart-title">🥗 Distribuição de Macronutrientes</h3>
        <p class="chart-desc">Proporção ideal para seu objetivo</p>
        <div class="chart-container chart-container-doughnut">
          <canvas id="chart-macros"></canvas>
        </div>
        <div class="macro-details">
          <div class="macro-row macro-protein">
            <span class="macro-dot"></span>
            <span class="macro-name">Proteínas</span>
            <span class="macro-bar"><span style="width:${nd.proteinPct}%;background:#22C55E;"></span></span>
            <span class="macro-pct">${nd.proteinPct}%</span>
            <span class="macro-grams">${nd.proteinG}g</span>
          </div>
          <div class="macro-row macro-carbs">
            <span class="macro-dot"></span>
            <span class="macro-name">Carboidratos</span>
            <span class="macro-bar"><span style="width:${nd.carbPct}%;background:#F59E0B;"></span></span>
            <span class="macro-pct">${nd.carbPct}%</span>
            <span class="macro-grams">${nd.carbG}g</span>
          </div>
          <div class="macro-row macro-fat">
            <span class="macro-dot"></span>
            <span class="macro-name">Gorduras</span>
            <span class="macro-bar"><span style="width:${nd.fatPct}%;background:#EF4444;"></span></span>
            <span class="macro-pct">${nd.fatPct}%</span>
            <span class="macro-grams">${nd.fatG}g</span>
          </div>
        </div>
      </div>

      <!-- Gráfico 3: Resumo do Dia -->
      <div class="chart-card">
        <h3 class="chart-title">⏰ Distribuição ao Longo do Dia</h3>
        <p class="chart-desc">Como as calorias se distribuem nas refeições</p>
        <div class="day-timeline">
          ${nd.mealDist.map(m => {
            const pct = Math.round((m.calories / nd.totalCal) * 100);
            return `
              <div class="timeline-item">
                <div class="timeline-icon">${m.icon}</div>
                <div class="timeline-content">
                  <div class="timeline-name">${m.name}</div>
                  <div class="timeline-track">
                    <div class="timeline-fill" style="width:${pct}%;background:${getMealColor(nd.mealDist.indexOf(m))};"></div>
                  </div>
                  <div class="timeline-stats">
                    <span>${m.calories} kcal</span>
                    <span>${pct}% do dia</span>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <button class="btn-outline" style="width:100%;" onclick="exportarPDF()">
        📄 Exportar PDF
      </button>
      ${resp.components.filter(c => c.type !== 'nutrition_charts').map(c => renderComponent(c, resp.screen)).join('')}
    </div>`;
}

// ---- Exportar PDF ----
function exportarPDF() {
  const p = STATE.profile;
  const plano = STATE.plano || {};
  const refeicoes = gerarRefeicoes(p, true);
  const sups = gerarSuplementos(p);
  const lista = gerarListaCompras();
  const nd = calcularGET(p) ? gerarDadosNutricionais(p) : null;
  const hoje = new Date().toLocaleDateString('pt-BR');

  const refeicoesHtml = refeicoes.map(r => `
    <tr>
      <td class="print-icon">${r.icon}</td>
      <td><strong>${r.name}</strong><br><small>${r.time}</small></td>
      <td>${r.main.replace(/\n/g, '<br>')}</td>
      <td style="font-size:11px;color:#666;">${r.subs}</td>
    </tr>
  `).join('');

  const macrosHtml = nd ? `
    <div class="print-section">
      <h3>Informação Nutricional</h3>
      <table class="print-table" style="width:auto;min-width:300px;">
        <tr><td>Calorias totais</td><td><strong>${nd.totalCal} kcal</strong></td></tr>
        <tr><td>Proteínas</td><td><strong>${nd.proteinG}g</strong> (${nd.protPorKg}g/kg)</td></tr>
        <tr><td>Carboidratos</td><td><strong>${nd.carbG}g</strong></td></tr>
        <tr><td>Gorduras</td><td><strong>${nd.fatG}g</strong></td></tr>
        ${nd.tmb ? `<tr><td>TMB (basal)</td><td><strong>${nd.tmb} kcal</strong></td></tr>` : ''}
        ${nd.get ? `<tr><td>GET (total)</td><td><strong>${nd.get} kcal</strong></td></tr>` : ''}
      </table>
    </div>` : '';

  const listaHtml = `
    <div class="print-section">
      <h3>Lista de Compras</h3>
      ${lista.map(cat => `
        <h4 style="font-size:0.9rem;margin:8px 0 4px;">${cat.icon} ${cat.name}</h4>
        <ul class="print-lista">
          ${cat.items.map(item => `<li>${item}</li>`).join('')}
        </ul>
      `).join('')}
    </div>`;

  const supsHtml = sups.length ? `
    <div class="print-section">
      <h3>Suplementos Sugeridos</h3>
      <ul>
        ${sups.map(s => `<li><strong>${s.name}</strong>${s.dosage ? ' — ' + s.dosage : ''}${s.reason ? '<br><small>' + s.reason + '</small>' : ''}</li>`).join('')}
      </ul>
    </div>` : '';

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Permita pop-ups para exportar o PDF.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Plano NutriCare - ${hoje}</title>
      <style>
        @page { margin: 1.5cm; size: A4; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        .print-logo { text-align: center; margin-bottom: 24px; }
        .print-logo h1 { color: #00D68F; font-size: 1.6rem; margin: 0; }
        .print-logo p { color: #666; font-size: 0.85rem; margin: 4px 0 0; }
        .print-header { background: linear-gradient(135deg, #00B975, #009E5E); color: white; padding: 20px 24px; border-radius: 12px; margin-bottom: 20px; }
        .print-header h2 { margin: 0 0 8px; font-size: 1.2rem; }
        .print-header p { margin: 2px 0; font-size: 0.9rem; opacity: 0.9; }
        .print-section { margin-bottom: 20px; }
        .print-section h3 { color: #00D68F; border-bottom: 2px solid rgba(0,214,143,0.2); padding-bottom: 6px; margin-bottom: 12px; font-size: 1rem; }
        table.print-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        table.print-table th, table.print-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        table.print-table th { background: #f0fdf4; font-weight: 600; color: #00B975; }
        table.print-table tr:last-child td { border-bottom: none; }
        .print-icon { font-size: 1.3rem; text-align: center; width: 36px; }
        ul { margin: 0; padding-left: 20px; }
        ul li { margin-bottom: 4px; font-size: 0.9rem; }
        .print-lista { columns: 2; column-gap: 24px; }
        .print-lista li { break-inside: avoid; }
        .print-footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #94a3b8; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-logo">
        <h1>🥗 NutriCare</h1>
        <p>Plano Alimentar Personalizado</p>
      </div>

      <div class="print-header">
        <h2>Plano Alimentar — ${hoje}</h2>
        <p>🎯 Objetivo: ${escapeHtml(p.goal || 'Não informado')}</p>
        ${p.gender ? '<p>⚧️ ' + escapeHtml(p.gender) + (p.age ? ' · ' + escapeHtml(p.age) + ' anos' : '') + '</p>' : ''}
        ${p.weight ? '<p>⚖️ ' + escapeHtml(p.weight) + ' kg' + (p.height ? ' · ' + escapeHtml(p.height) + ' cm' : '') + '</p>' : ''}
      </div>

      <div class="print-section">
        <h3>🥗 Refeições</h3>
        <table class="print-table">
          <thead><tr><th></th><th>Refeição</th><th>Opções</th><th>Substituições</th></tr></thead>
          <tbody>${refeicoesHtml}</tbody>
        </table>
      </div>

      ${macrosHtml}
      ${listaHtml}
      ${supsHtml}

      <div class="print-footer">
        <p>Gerado por NutriCare em ${hoje} · Consulte um nutricionista para acompanhamento profissional.</p>
      </div>

      <button class="no-print" onclick="window.print()" style="display:block;margin:20px auto;padding:10px 24px;background:#00B975;color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;">
        🖨️ Imprimir / Salvar PDF
      </button>
      <button class="no-print" onclick="window.close()" style="display:block;margin:10px auto;padding:8px 16px;background:#e2e8f0;color:#333;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer;">
        ✕ Fechar
      </button>

      <script>
        // Auto-print after a brief delay for rendering
        setTimeout(function() {
          if (window.matchMedia('print').matches) { window.print(); }
        }, 500);
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function getMealColor(index) {
  const colors = ['#22C55E', '#F59E0B', '#3B82F6', '#A855F7', '#EF4444'];
  return colors[index % colors.length];
}

// ---- Chart Helpers (Dark Mode aware) ----
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    tick: isDark ? '#94A3B8' : '#6B7280',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
  };
}

function initCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js não carregou — pulando gráficos');
    return;
  }
  const mealsCanvas = document.getElementById('chart-meals');
  const macrosCanvas = document.getElementById('chart-macros');
  if (!mealsCanvas || !macrosCanvas) return;

  // Extrair dados do DOM
  const legendItems = document.querySelectorAll('.legend-item');
  const mealNames = [], mealCals = [], mealColors = [];
  legendItems.forEach(item => {
    const label = item.querySelector('.legend-label')?.textContent?.replace(/^[^\s]+\s/, '') || '';
    const val = parseInt(item.querySelector('.legend-value')?.textContent, 10) || 0;
    const color = item.querySelector('.legend-color')?.style?.background || '#22C55E';
    mealNames.push(label);
    mealCals.push(val);
    mealColors.push(color);
  });

  // Gráfico de Barras — Calorias por Refeição
  if (window._chartMeals) window._chartMeals.destroy();
  window._chartMeals = new Chart(mealsCanvas, {
    type: 'bar',
    data: {
      labels: mealNames,
      datasets: [{
        label: 'Calorias',
        data: mealCals,
        backgroundColor: mealColors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: getChartColors().grid },
          ticks: { color: getChartColors().tick, font: { size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: getChartColors().tick, font: { size: 10 } }
        }
      }
    }
  });

  // Gráfico de Rosca — Macronutrientes
  const macroPcts = [];
  const macroLabels = [];
  const macroColors = ['#22C55E', '#F59E0B', '#EF4444'];

  document.querySelectorAll('.macro-row').forEach(row => {
    const pctEl = row.querySelector('.macro-pct');
    const nameEl = row.querySelector('.macro-name');
    if (pctEl && nameEl) {
      macroPcts.push(parseInt(pctEl.textContent, 10));
      macroLabels.push(nameEl.textContent);
    }
  });

  if (window._chartMacros) window._chartMacros.destroy();
  window._chartMacros = new Chart(macrosCanvas, {
    type: 'doughnut',
    data: {
      labels: macroLabels,
      datasets: [{
        data: macroPcts,
        backgroundColor: macroColors,
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getChartColors().tick,
            padding: 16,
            usePointStyle: true,
            font: { size: 12, weight: '600' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ctx.label + ': ' + ctx.parsed + '%';
            }
          }
        }
      }
    }
  });
}

// ---- Bind Clicks (replacement for bindActions) ----
function bindClicks(container) {
  container.querySelectorAll('[data-action]').forEach(el => {
    if (el.id === 'dynamic-send-btn' || el.id === 'chat-send-btn') return; // handled separately
    el.addEventListener('click', (e) => {
      // Save user's option text for bubble rendering
      if (el.classList.contains('option-btn') || el.classList.contains('followup-btn')) {
        STATE.lastUserInput = el.textContent.trim();
      }
      dispatch(el.dataset.action);
    });
  });

  // Text inputs
  const textInput = container.querySelector('#dynamic-text-input');
  const sendBtn = container.querySelector('#dynamic-send-btn');
  if (textInput && sendBtn) {
    const action = sendBtn.dataset.action;
    const isNumericField = action === 'ans_text_weight' || action === 'ans_text_height';
    const isNumeroValido = (v) => /^\d+([.,]\d+)?$/.test(v);
    textInput.addEventListener('input', () => {
      let val = textInput.value.trim();
      if (isNumericField) {
        // Filtra caracteres não numéricos (mantém vírgula e ponto)
        textInput.value = val.replace(/[^0-9,.]/g, '');
        val = textInput.value.trim();
        sendBtn.disabled = !isNumeroValido(val) || val.length < 2;
        textInput.style.borderColor = isNumeroValido(val) && val.length >= 2 ? 'var(--accent-500)' : '';
      } else {
        sendBtn.disabled = val.length < 3;
        textInput.style.borderColor = val.length >= 3 ? 'var(--accent-500)' : '';
      }
    });
    const mostrarErro = (msg) => {
      textInput.style.borderColor = '#EF4444';
      textInput.style.animation = 'shake 0.3s';
      let errEl = container.querySelector('.text-input-error');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'text-input-error';
        errEl.style.cssText = 'color:#EF4444;font-size:0.8rem;margin-top:4px;';
        textInput.parentNode.appendChild(errEl);
      }
      errEl.textContent = msg;
      setTimeout(() => {
        textInput.style.animation = '';
        if (errEl) errEl.textContent = '';
      }, 2000);
    };
    const submit = () => {
      let val = textInput.value.trim();
      if (!val) { mostrarErro('⚠️ Preencha este campo antes de continuar'); return; }
      if (isNumericField) {
        if (!isNumeroValido(val)) {
          mostrarErro(action === 'ans_text_weight' ? '⚠️ Digite apenas números para o peso (ex: 70)' : '⚠️ Digite apenas números para a altura (ex: 170)');
          return;
        }
        // Normaliza vírgula para ponto
        val = val.replace(',', '.');
      } else if (val.length < 3) {
        mostrarErro('⚠️ Digite pelo menos 3 caracteres');
        return;
      }
      dispatch(action, val);
    };
    sendBtn.addEventListener('click', submit);
    textInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => textInput.focus(), 200);
  }

  // Chat text input (Bot Nutricionista)
  const chatInput = container.querySelector('#chat-text-input');
  const chatSendBtn = container.querySelector('#chat-send-btn');
  if (chatInput && chatSendBtn) {
    const validate = () => {
      const val = chatInput.value.trim();
      chatSendBtn.disabled = val.length < 2 || STATE.chatLoading;
    };
    chatInput.addEventListener('input', validate);
    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !chatSendBtn.disabled) sendChatMessage(); });
    setTimeout(() => chatInput.focus(), 200);
  }

  // Checkboxes
  const checkboxContainer = container.querySelector('.checkboxes-container');
  if (checkboxContainer) {
    const items = checkboxContainer.querySelectorAll('.checkbox-item');
    const continuarBtn = checkboxContainer.querySelector('.btn-primary');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const isExclusive = item.dataset.exclusive === 'true';
        if (isExclusive) {
          // "Nenhuma" → marca ela, desmarca todas as outras
          items.forEach(i => i.classList.remove('checked'));
          item.classList.add('checked');
        } else {
          // Outra opção → se "Nenhuma" estiver marcada, desmarca
          const noneItem = checkboxContainer.querySelector('[data-exclusive="true"]');
          if (noneItem) noneItem.classList.remove('checked');
          item.classList.toggle('checked');
        }
      });
    });
    continuarBtn.addEventListener('click', () => {
      const checked = Array.from(items).filter(i => i.classList.contains('checked'));
      const hasNone = checked.some(i => i.dataset.exclusive === 'true');
      if (hasNone || checked.length === 0) {
        dispatch(continuarBtn.dataset.action, '');
      } else {
        const values = checked.map(i => i.dataset.value).join(', ');
        STATE.lastUserInput = values;
        dispatch(continuarBtn.dataset.action, values);
      }
    });
  }

  // File upload
  const fileArea = container.querySelector('#dynamic-file-area');
  const fileInput = container.querySelector('#dynamic-file-input');
  if (fileArea && fileInput) {
    fileArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      const preview = container.querySelector('#dynamic-file-preview');
      const fname = container.querySelector('#dynamic-file-name');
      const actionsDiv = container.querySelector('#dynamic-file-actions');
      if (preview) preview.classList.remove('hidden');
      if (fname) fname.textContent = f.name;
      if (actionsDiv) actionsDiv.classList.remove('hidden');
    });
    const removeBtn = container.querySelector('#dynamic-file-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        fileInput.value = '';
        const preview = container.querySelector('#dynamic-file-preview');
        const actionsDiv = container.querySelector('#dynamic-file-actions');
        if (preview) preview.classList.add('hidden');
        if (actionsDiv) actionsDiv.classList.add('hidden');
      });
    }
  }
}

function bindDynamicInteractions(container, response) {
  // Check if this is a screen that scrolls to chat
  const chatInner = container.querySelector('#chat-inner');
  if (chatInner) {
    if (STATE._scrollTimeout) clearTimeout(STATE._scrollTimeout);
    STATE._scrollTimeout = setTimeout(() => {
      chatInner.scrollTop = chatInner.scrollHeight;
      chatInner.scrollTo(0, chatInner.scrollHeight);
    }, 50);
  }
}

// ---- Global Toggle Functions ----
window.toggleMealCard = function(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector('.meal-toggle');
  if (body) {
    const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
    if (isOpen) {
      body.style.maxHeight = '0';
      body.style.padding = '0 20px 0';
    } else {
      body.style.maxHeight = body.scrollHeight + 20 + 'px';
      body.style.padding = '0 20px 20px';
    }
    if (toggle) toggle.classList.toggle('open');
  }
};

window.toggleReceita = function(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector('.receita-toggle');
  if (body) {
    const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
    if (isOpen) {
      body.style.maxHeight = '0';
      body.style.padding = '0 16px 0';
    } else {
      body.style.maxHeight = body.scrollHeight + 20 + 'px';
      body.style.padding = '0 16px 16px';
    }
    if (toggle) toggle.classList.toggle('open');
  }
};

window.toggleShopCategory = function(el) {
  const container = el.closest('.screen') || document;
  const itemsDiv = container.querySelector('#shopping-items');
  if (!itemsDiv) return;
  const catName = el.querySelector('.cat-name')?.textContent || '';
  const catIcon = el.querySelector('.cat-icon')?.textContent || '';
  const existing = itemsDiv.querySelector(`[data-cat="${CSS.escape(catName)}"]`);
  if (existing) {
    existing.remove();
    return;
  }

  // Read items from data attribute (encoded URI → parsed JSON)
  let items = [];
  try {
    const raw = el.dataset.items;
    if (raw) items = JSON.parse(decodeURIComponent(raw));
  } catch(e) { /* fallback below */ }

  // Fallback: use hardcoded data if parsing fails
  if (!items.length) {
    const fallback = {
      'Proteínas': ['Peito de frango', 'Ovos', 'Carne moída', 'Atum', 'Iogurte', 'Grão-de-bico'],
      'Vegetais': ['Brócolis', 'Espinafre', 'Tomate', 'Alface', 'Cenoura', 'Abobrinha'],
      'Grãos': ['Arroz integral', 'Feijão', 'Quinoa', 'Aveia', 'Lentilha'],
      'Frutas': ['Banana', 'Maçã', 'Mamão', 'Limão', 'Frutas vermelhas'],
      'Castanhas': ['Castanha-do-pará', 'Amêndoas', 'Pasta de amendoim'],
      'Laticínios': ['Queijo branco', 'Leite', 'Manteiga']
    };
    items = fallback[catName] || [];
  }

  if (!items.length) return;

  const div = document.createElement('div');
  div.className = 'shopping-list-items';
  div.dataset.cat = catName;
  div.innerHTML = items.map(i =>
    `<label class="shopping-item" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;">
      <input type="checkbox" style="accent-color:#00D68F;width:18px;height:18px;cursor:pointer;" onchange="this.parentElement.classList.toggle('checked')">
      <span>${i}</span>
    </label>`
  ).join('');
  itemsDiv.appendChild(div);
};

// ---- Init ----
// ---- Dark Mode Toggle ----
function toggleTheme() {
  const html = document.documentElement;
  const hasDark = html.getAttribute('data-theme') === 'dark';
  if (hasDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('nutricare_theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('nutricare_theme', 'dark');
  }
  document.querySelectorAll('#theme-toggle-btn, .menu-brand-badge .header-theme-btn').forEach(btn => {
    btn.textContent = hasDark ? '🌙' : '☀️';
  });
  if (window._chartMeals || window._chartMacros) {
    setTimeout(initCharts, 50);
  }
}

function initTheme() {
  const saved = localStorage.getItem('nutricare_theme');
  if (saved === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // Fallback: respeita preferência do sistema
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('nutricare_theme', 'dark');
    }
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelectorAll('#theme-toggle-btn, .menu-brand-badge .header-theme-btn').forEach(btn => {
    btn.textContent = isDark ? '☀️' : '🌙';
  });
}

// ---- PWA: Service Worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      devLog('📦 [PWA] Service Worker registrado:', reg.scope);
      // Força atualização quando detectar novo SW
      reg.onupdatefound = () => {
        const installing = reg.installing;
        if (installing) {
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              devLog('🆕 [PWA] Novo SW detectado — recarregando...');
              window.location.reload();
            }
          };
        }
      };
    }).catch(err => {
      console.warn('⚠️ [PWA] Falha ao registrar SW:', err);
    });
  }
}

// ---- Inicialização ----
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  registerSW();
  initCrypto(); // AES-256-GCM: descriptografa dados sensíveis (fire-and-forget)
  migrarPinAntigo(); // Migra PIN antigo para hash (fire-and-forget)

  // Check Stripe Payment Link redirect
  const params = new URLSearchParams(window.location.search);
  const premiumStatus = params.get('premium');
  const sessionId = params.get('session_id');

  if (premiumStatus === 'clear') {
    limparPremiumMultiStorage();
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setTimeout(() => {
      const loading = $c('loading-screen');
      if (loading) loading.classList.add('hidden');
      dispatch(null, null);
    }, 500);
    return;
  }

  if (sessionId) {
    // Verifica pagamento via servidor (substitui o antigo ?premium=success bypass)
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setTimeout(async () => {
      const loading = $c('loading-screen');
      if (loading) loading.classList.add('hidden');
      try {
        const deviceId = getPremiumDeviceId();
        const res = await fetchWithRetry(`${API_URL}/claim-premium`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, sessionId })
        }, 1);
        if (res && res.ok) {
          const data = await res.json();
          if (data.success && data.premium) {
            salvarPremiumMultiStorage(data.expiresAt, data.token);
            salvarEverPaid(data.expiresAt);
            renderPremiumAtivado('', data.durationDays || 30);
            return;
          }
        }
      } catch (e) {
        console.warn('Erro ao verificar pagamento:', e.message);
      }
      // Fallback: se servidor offline, mostra tela de upgrade
      dispatch(null, null);
    }, 1400);
    return;
  }

  if (premiumStatus === 'cancel') {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setTimeout(() => {
      const loading = $c('loading-screen');
      if (loading) loading.classList.add('hidden');
      dispatch(null, null);
      setTimeout(() => {
        document.getElementById('screen-container').innerHTML = `
          <div class="screen" style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-deep);">
            <div style="text-align:center;max-width:360px;animation:slideUp 0.3s ease;">
              <p style="font-size:3rem;margin-bottom:12px;">❌</p>
              <h2 style="font-size:1.3rem;margin-bottom:8px;">Pagamento cancelado</h2>
              <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px;">Fique à vontade para tentar novamente quando quiser.</p>
              <button class="btn-primary" onclick="dispatch('ver_planos')">Ver Planos</button>
            </div>
          </div>`;
      }, 300);
    }, 1200);
    return;
  }

  setTimeout(() => {
    dispatch(null, null);
    const loading = $c('loading-screen');
    if (loading) loading.classList.add('hidden');
  }, 1200);
});

// Tornar dispatch global
window.dispatch = dispatch;
