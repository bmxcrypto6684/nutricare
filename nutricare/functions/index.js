/**
 * NutriCare — Firebase Cloud Functions
 *
 * Geração de planos alimentares via IA (Gemini / OpenAI / Vertex AI).
 * Chamada segura a partir do app via firebase.functions.httpsCallable.
 */
const { onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ============================================================
//  PLANO ALIMENTAR SÍNCRONO (FALLBACK / LOCAL)
//  Usa regras de negócio para gerar o plano sem chamar API externa.
// ============================================================

function gerarEstrategias(userData) {
  const tips = [
    'Reserve 1h no domingo para planejar as marmitas da semana. Esse hábito é o maior segredo de quem consegue manter uma alimentação saudável na rotina corrida.',
    'Coma sem TV ou celular. Mastigue bem cada garfada — uma refeição deve durar entre 15 e 20 minutos para o cérebro registrar saciedade.',
    'Tome 35ml de água por kg de peso por dia. Deixe uma garrafa sempre à vista como lembrete visual.',
    'Consistência importa mais que perfeição. Você não precisa acertar 100% dos dias — 80% de constância já traz resultados transformadores.',
  ];

  if (userData?.sleep === 'ruim' || userData?.sleep === 'medio') {
    tips.push(
      'Melhore seu sono: desligue telas 1h antes de dormir, evite cafeína após as 16h e mantenha horários regulares. Um bom sono regula os hormônios da fome.'
    );
  }

  if (userData?.activity === 'sedentario') {
    tips.push(
      'Comece com 20 minutos de caminhada diária. O importante é criar o hábito — a intensidade vem com o tempo.'
    );
  }

  if (userData?.restrictions === 'vegetariano' || userData?.restrictions === 'vegano') {
    tips.push(
      'Garanta a ingestão de vitamina B12 através de suplementação. Combine fontes vegetais de proteína (leguminosas + cereais) para obter todos os aminoácidos essenciais.'
    );
  }

  return tips;
}

function gerarPlanoSincrono(userData) {
  const goal = userData?.objective || 'saude';
  const isLoss = goal === 'emagrecimento';
  const isGain = goal === 'massa';

  return {
    cafe: isLoss
      ? [
          'Opção 1: 2 ovos mexidos + 1 fatia pão integral + café preto',
          'Opção 2: Tapioca com queijo branco + banana',
          'Opção 3: Iogurte natural com granola e frutas vermelhas',
        ]
      : [
          'Opção 1: 3 ovos + 2 fatias pão integral + 1 fruta',
          'Opção 2: Vitamina de banana com aveia + pasta de amendoim',
          'Opção 3: Crepioca com queijo + café com leite',
        ],
    lanches: isLoss
      ? [
          '1 fruta + 5 castanhas',
          '1 iogurte natural desnatado',
          '1 barrinha de cereais sem açúcar',
          'Smoothie verde (couve, limão, gengibre, maçã)',
        ]
      : [
          '1 fruta + 10 castanhas',
          'Iogurte grego + mel + granola',
          'Banana com pasta de amendoim',
          'Vitamina de frutas com aveia',
        ],
    almoco: isLoss
      ? [
          '4 col arroz + 1 concha feijão + 120g frango + salada à vontade + azeite',
          'Peixe grelhado + legumes refogados + 1 batata-doce média',
          'Salada grande com grão-de-bico + 2 ovos cozidos + azeite + limão',
        ]
      : isGain
        ? [
            '6 col arroz + feijão + 200g carne magra + salada + azeite',
            '200g salmão + batata-doce + brócolis + arroz integral',
            'Frango ao curry + arroz integral + legumes salteados',
          ]
        : [
            '5 col arroz integral + feijão + 150g proteína + salada',
            'Filé de frango + quinoa + legumes no vapor',
            'Carne magra + purê de batata-doce + salada verde',
          ],
    jantar: isLoss
      ? [
          'Omelete de 2 ovos com espinafre + salada de folhas',
          'Sopa de legumes com frango desfiado',
          'Salada de atum com ovos, milho, ervilha e azeite',
        ]
      : [
          '150g salmão grelhado + quinoa + vegetais no vapor',
          'Omelete 3 ovos + arroz integral + legumes refogados',
          'Frango grelhado + purê batata-doce + salada',
        ],
    estrategias: gerarEstrategias(userData),
  };
}

// ============================================================
//  CLOUD FUNCTION: generateMealPlan
//  Chamada via: firebase.functions.httpsCallable('generateMealPlan')
// ============================================================

/**
 * Gera um plano alimentar personalizado com base nos dados da anamnese.
 *
 * Integração com IA (Gemini / OpenAI):
 * Para usar uma API externa, descomente a seção "Integração com IA" abaixo
 * e configure a chave da API como variável de ambiente:
 *   firebase functions:config:set ai.api_key="SUA_CHAVE" ai.provider="gemini"
 */
exports.generateMealPlan = onCall(async (request) => {
  const { userData } = request.data;
  const uid = request.auth?.uid;

  if (!userData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Dados da anamnese são obrigatórios.'
    );
  }

  logger.info('Gerando plano alimentar', { uid, objective: userData?.objective });

  // ---------------------------------------------------------
  // Integração com IA (descomente para usar)
  // Requer: npm install @google-ai/generativelanguage ou openai
  // ---------------------------------------------------------
  /*
  const apiKey = process.env.AI_API_KEY;
  const provider = process.env.AI_PROVIDER || 'gemini';

  if (apiKey && provider === 'gemini') {
    try {
      const { GoogleGenerativeAI } = require('@google-ai/generativelanguage');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      const prompt = `
        Você é um nutricionista especializado. Gere um plano alimentar personalizado com base nestes dados:
        - Objetivo: ${userData.objective || 'saúde geral'}
        - Rotina: ${userData.routine || 'não informada'}
        - Alimentação atual: ${userData.diet || 'não informada'}
        - Restrições: ${userData.restrictions || 'nenhuma'}
        - Sono: ${userData.sleep || 'não informado'}
        - Atividade física: ${userData.activity || 'não informado'}

        Retorne APENAS um JSON válido com o seguinte formato (sem markdown):
        {
          "cafe": ["opção 1", "opção 2", "opção 3"],
          "lanches": ["opção 1", "opção 2", "opção 3", "opção 4"],
          "almoco": ["opção 1", "opção 2", "opção 3"],
          "jantar": ["opção 1", "opção 2", "opção 3"],
          "estrategias": ["dica 1", "dica 2", "dica 3", "dica 4"]
        }
      `;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const plano = JSON.parse(text.replace(/```json|```/g, '').trim());
      logger.info('Plano gerado com Gemini');

      // Salva no Firestore
      if (uid) {
        await admin.firestore()
          .collection('users').doc(uid)
          .collection('mealPlans').doc('latest')
          .set({ ...plano, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      return plano;
    } catch (aiError) {
      logger.warn('Falha na IA, usando fallback', aiError.message);
    }
  }
  */

  // Fallback: plano baseado em regras de negócio
  const plano = gerarPlanoSincrono(userData);

  // Salva no Firestore se usuário estiver autenticado
  if (uid) {
    try {
      await admin.firestore()
        .collection('users').doc(uid)
        .collection('mealPlans').doc('latest')
        .set({ ...plano, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (dbError) {
      logger.warn('Erro ao salvar no Firestore', dbError.message);
    }
  }

  return plano;
});
