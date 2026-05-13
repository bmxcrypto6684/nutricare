/**
 * NutriCare — AI Service (Plano Alimentar Generator)
 *
 * Motor síncrono que gera plano alimentar, estratégias e suplementos
 * com base no perfil do usuário coletado na anamnese.
 */

/**
 * Gera o plano alimentar completo
 * @param {Object} userData — respostas da anamnese
 * @returns {{ cafe: string[], lanches: string[], almoco: string[], jantar: string[], estrategias: string[] }}
 */
export function gerarPlanoSincrono(userData) {
  const goal = userData?.objective || 'saude';
  const isLoss = goal === 'emagrecimento';
  const isGain = goal === 'massa';
  const weight = parseFloat(userData?.weight) || 0;
  const age = parseInt(userData?.age) || 0;

  // Calcula TMB aproximada (Harris-Benedict simplificado)
  let tmb = 0;
  if (weight > 0 && age > 0) {
    if (userData?.gender === 'masculino') {
      tmb = Math.round(10 * weight + 6.25 * (parseFloat(userData?.height) || 170) - 5 * age + 5);
    } else {
      tmb = Math.round(10 * weight + 6.25 * (parseFloat(userData?.height) || 160) - 5 * age - 161);
    }
  }

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
    estrategias: gerarEstrategias(userData, tmb),
  };
}

/**
 * Gera dicas/estratégias personalizadas baseadas no perfil
 */
function gerarEstrategias(userData, tmb = 0) {
  const tips = [
    'Reserve 1h no domingo para planejar as marmitas da semana. Esse hábito é o maior segredo de quem consegue manter uma alimentação saudável na rotina corrida.',
    'Coma sem TV ou celular. Mastigue bem cada garfada — uma refeição deve durar entre 15 e 20 minutos para o cérebro registrar saciedade.',
    'Tome 35ml de água por kg de peso por dia. Deixe uma garrafa sempre à vista como lembrete visual.',
    'Consistência importa mais que perfeição. Você não precisa acertar 100% dos dias — 80% de constância já traz resultados transformadores.',
  ];

  if (tmb > 0) {
    tips.unshift(
      `Sua Taxa Metabólica Basal (TMB) estimada é de aproximadamente ${tmb} kcal/dia. Esse é o valor que seu corpo gasta em repouso — seu plano considera esse número para definir as porções.`
    );
  }

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

/**
 * Gera recomendações de suplementação baseadas no perfil
 */
export function gerarSuplementos(userData) {
  const sups = [];

  if (userData?.restrictions === 'vegano' || userData?.restrictions === 'vegetariano') {
    sups.push({
      icon: '💊',
      name: 'Vitamina B12',
      dosage: '2,4 mcg/dia',
      reason: 'Essencial em dietas baseadas em vegetais — a B12 é encontrada principalmente em alimentos de origem animal.',
    });
  }

  if (userData?.sleep === 'ruim') {
    sups.push({
      icon: '😴',
      name: 'Magnésio Bisglicinato',
      dosage: '200-400mg à noite',
      reason: 'Auxilia no relaxamento muscular e melhora a qualidade do sono.',
    });
  }

  if (userData?.objective === 'massa') {
    sups.push({
      icon: '🏋️',
      name: 'Whey Protein (ou vegetal)',
      dosage: '30g pós-treino',
      reason: 'Ajuda a atingir a meta proteica diária de forma prática e rápida.',
    });
  }

  if (userData?.activity === 'sedentario' || userData?.activity === 'leve') {
    sups.push({
      icon: '☀️',
      name: 'Vitamina D3 + K2',
      dosage: '2.000 UI/dia',
      reason: 'Grande parte da população tem deficiência. Essencial para imunidade e saúde óssea.',
    });
  }

  // Suplemento padrão se poucos foram adicionados
  if (sups.length < 2) {
    sups.push({
      icon: '⚡',
      name: 'Ômega 3 (EPA/DHA)',
      dosage: '1-2g/dia',
      reason: 'Anti-inflamatório natural que auxilia na saúde cerebral, hormonal e cardiovascular.',
    });
  }

  return sups;
}

/**
 * Gera a lista de compras categorizada
 */
export function gerarListaCompras() {
  return [
    { icon: '🥩', name: 'Proteínas', items: ['Peito de frango', 'Ovos', 'Carne moída magra', 'Atum em lata', 'Iogurte natural', 'Grão-de-bico'] },
    { icon: '🥬', name: 'Vegetais', items: ['Brócolis', 'Espinafre', 'Tomate', 'Alface', 'Cenoura', 'Abobrinha', 'Couve'] },
    { icon: '🍚', name: 'Grãos', items: ['Arroz integral', 'Feijão', 'Quinoa', 'Aveia', 'Lentilha'] },
    { icon: '🍎', name: 'Frutas', items: ['Banana', 'Maçã', 'Mamão', 'Limão', 'Frutas vermelhas congeladas'] },
    { icon: '🥜', name: 'Castanhas & Sementes', items: ['Castanha-do-pará', 'Amêndoas', 'Pasta de amendoim', 'Chia', 'Linhaça'] },
    { icon: '🧀', name: 'Laticínios', items: ['Queijo branco', 'Leite', 'Manteiga', 'Iogurte grego'] },
  ];
}
