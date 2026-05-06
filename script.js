// ============================================================
// NutriCare — Engine de Estado JSON
// Arquitetura: UserInput → dispatch() → Engine(state,data) → JSON Response → Renderer(DOM)
// ============================================================

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
  plano: null
};

// ---- Nutritionist Engine ----
// Retorna { screen, message, components, actions }
// Função pura — manipula apenas STATE através de dispatch()
function engine(action, payload) {
  switch (STATE.screen) {

    // ============================
    case 'onboarding':
      return {
        screen: 'onboarding',
        message: '',
        components: [
          { type: 'hero', title: 'Olá! Vou montar seu plano alimentar personalizado 🥗', subtitle: 'Atendimento humanizado com plano feito sob medida para você.' },
          { type: 'buttons', items: [
            { text: '▶️ Iniciar consulta', action: 'iniciar_consulta', variant: 'primary' },
            { text: 'ℹ️ Como funciona', action: 'como_funciona', variant: 'outline' },
            { text: '💰 Ver planos', action: 'ver_planos', variant: 'outline' }
          ]}
        ],
        actions: [
          { id: 'iniciar_consulta', next: 'anamnese_step' },
          { id: 'como_funciona', next: 'how_it_works' },
          { id: 'ver_planos', next: 'planos' }
        ]
      };

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
          { type: 'title', text: 'Nossos planos' },
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
              badge: 'Recomendado', value: 'Premium', recommended: true,
              features: [
                { text: 'Consulta completa', included: true },
                { text: 'Plano alimentar personalizado', included: true },
                { text: 'Retorno para ajustes', included: true },
                { text: 'Acompanhamento contínuo', included: true },
                { text: 'Suporte por chat', included: true }
              ],
              action: 'falar_contato'
            }
          ]}
        ],
        actions: [
          { id: 'voltar_menu', next: 'onboarding' },
          { id: 'iniciar_consulta', next: 'anamnese_step' },
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

        // Restrictions = Sim → ask detail (stay on same step)
        if (action === 'ans_restr_yes') {
          STATE.anamneseStep = step;
          return {
            screen: 'anamnese_step',
            message: '<strong>Qual(is) restrição(ões)?</strong>',
            components: [{ type: 'text_input', placeholder: 'Ex: lactose, glúten...', action: 'ans_restr_detail' }],
            actions: [{ id: 'ans_restr_detail', next: 'anamnese_step' }]
          };
        }

        // Restriction detail submitted
        if (action === 'ans_restr_detail') {
          STATE.profile.restrictionDetail = payload || '';
          STATE.anamneseStep++;
          if (STATE.anamneseStep >= 7) { return transitionToAnalise(); }
          return showAnamneseQuestion(STATE.anamneseStep);
        }

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
          if (STATE.anamneseStep >= 7) { return transitionToAnalise(); }
          return showAnamneseQuestion(STATE.anamneseStep);
        }

        // Normal answer — advance step
        STATE.anamneseStep++;
        if (STATE.anamneseStep >= 7) { return transitionToAnalise(); }
        return showAnamneseQuestion(STATE.anamneseStep);
      }

      // Initial render — show first question
      return showAnamneseQuestion(0);
    }

    // ============================
    case 'analise': {
      // Usa diagnostico do backend se disponível, senão gera local
      const diag = STATE.plano && STATE.plano.diagnostico
        ? STATE.plano.diagnostico
        : gerarDiagnostico(STATE.profile);
      STATE.plano = diag;
      return {
        screen: 'analise',
        message: 'Analisei seus dados e identifiquei pontos importantes...',
        components: [
          { type: 'bullet_list', title: '📋 Resumo da avaliação', items: diag.resumo },
          { type: 'bullet_list', title: '⚠️ Pontos de atenção', items: diag.atencao },
          { type: 'bullet_list', title: '✅ Oportunidades', items: diag.oportunidades },
          { type: 'button', text: '🥗 Ver meu plano alimentar', action: 'ver_plano', variant: 'primary' },
          { type: 'button', text: '💡 Ver estratégias', action: 'ver_estrategias', variant: 'outline' }
        ],
        actions: [
          { id: 'ver_plano', next: 'plano' },
          { id: 'ver_estrategias', next: 'estrategias' }
        ]
      };
    }

    // ============================
    case 'plano': {
      const meals = gerarRefeicoes(STATE.profile);
      return {
        screen: 'plano',
        message: 'Aqui está seu <strong>plano alimentar personalizado</strong>:',
        components: [
          { type: 'meal_plan', meals },
          { type: 'buttons', items: [
            { text: '🔄 Ver substituições', action: 'ver_subs', variant: 'secondary' },
            { text: '🛒 Gerar lista de compras', action: 'ver_lista', variant: 'secondary' },
            { text: '📊 Gráficos nutricionais', action: 'ver_graficos', variant: 'secondary' },
            { text: '💡 Estratégias', action: 'ver_estrategias', variant: 'outline' },
            { text: '💊 Suplementação', action: 'ver_suplementacao', variant: 'outline' }
          ]}
        ],
        actions: [
          { id: 'ver_subs', next: 'substituicoes' },
          { id: 'ver_lista', next: 'lista_compras' },
          { id: 'ver_graficos', next: 'nutrition_charts' },
          { id: 'ver_estrategias', next: 'estrategias' },
          { id: 'ver_suplementacao', next: 'suplementacao' },
          { id: 'voltar_analise', next: 'analise' }
        ]
      };
    }

    // ============================
    case 'nutrition_charts': {
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
    case 'acompanhamento':
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

    default:
      return engine(null, null);
  }
}

// ---- Anamnese Helpers ----
function transitionToAnalise() {
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
    { msg: `Como é sua <strong>rotina</strong>? (horários, trabalho, sono)`, type: 'text', key: 'routine', placeholder: 'Descreva sua rotina...' },
    { msg: `Como está sua <strong>alimentação</strong> hoje?`, type: 'text', key: 'diet', placeholder: 'O que você costuma comer?' },
    { msg: `Possui <strong>restrições alimentares</strong>?`, type: 'options', key: 'restrictions', items: [
        { text: 'Não', action: 'ans_restr_no' },
        { text: 'Sim', action: 'ans_restr_yes' }
    ]},
    { msg: `Como está seu <strong>sono</strong>?`, type: 'options', key: 'sleep', items: [
        { text: 'Bom', action: 'ans_sleep_good' },
        { text: 'Médio', action: 'ans_sleep_mid' },
        { text: 'Ruim', action: 'ans_sleep_bad' }
    ]},
    { msg: `Nível de <strong>atividade física</strong>?`, type: 'options', key: 'activity', items: [
        { text: 'Sedentário', action: 'ans_act_sed' },
        { text: 'Leve', action: 'ans_act_light' },
        { text: 'Moderado', action: 'ans_act_mod' },
        { text: 'Intenso', action: 'ans_act_int' }
    ]},
    { msg: `Possui <strong>exames recentes</strong>?`, type: 'options', key: 'exams', items: [
        { text: 'Sim, tenho exames', action: 'ans_exams_yes' },
        { text: 'Não, não tenho', action: 'ans_exams_no' }
    ]}
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
    'ans_restr_yes': ['restrictions', ['Sim']],
    'ans_exams_no': ['hasExams', false],
    'ans_exams_yes': ['hasExams', true],
    'ans_exams_done': ['hasExams', true],
    'ans_exams_skip': ['hasExams', false]
  };

  if (map[action]) {
    const [key, val] = map[action];
    STATE.profile[key] = val;
  }

  if (action && action.startsWith('ans_text_')) {
    const key = action.replace('ans_text_', '');
    STATE.profile[key] = payload || '';
  }
}

// ---- Diagnóstico ----
function gerarDiagnostico(p) {
  const resumo = [];
  const atencao = [];
  const oportunidades = [];

  if (p.goal) resumo.push(`🎯 Objetivo: <strong>${p.goal}</strong>`);
  if (p.sleep) resumo.push(`😴 Sono: <strong>${p.sleep}</strong>`);
  if (p.activity) resumo.push(`🏃 Atividade: <strong>${p.activity}</strong>`);

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
    resumo.push(`🚫 Restrições: <strong>${p.restrictionDetail}</strong>`);
  }

  oportunidades.push('Aumentar consumo de água — 35ml por kg de peso');
  oportunidades.push('Incluir proteína em todas as refeições para maior saciedade');
  oportunidades.push('Adicionar mais fibras (aveia, chia, vegetais) para saúde intestinal');
  oportunidades.push('Fazer refeições regulares a cada 3-4 horas para evitar compulsão');

  if (resumo.length === 0) resumo.push('Perfil geral — vamos construir hábitos saudáveis juntos!');
  if (atencao.length === 0) atencao.push('Perfil equilibrado — vamos potencializar ainda mais!');

  return { resumo, atencao, oportunidades };
}

// ---- Refeições ----
function gerarRefeicoes(p) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

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

// ---- Dados Nutricionais para Gráficos ----
function gerarDadosNutricionais(p) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

  let totalCal, proteinPct, carbPct, fatPct;
  if (isLoss) {
    totalCal = 1500; proteinPct = 40; carbPct = 30; fatPct = 30;
  } else if (isGain) {
    totalCal = 2800; proteinPct = 30; carbPct = 45; fatPct = 25;
  } else {
    totalCal = 2000; proteinPct = 30; carbPct = 40; fatPct = 30;
  }

  const proteinG = Math.round((totalCal * proteinPct / 100) / 4);
  const carbG = Math.round((totalCal * carbPct / 100) / 4);
  const fatG = Math.round((totalCal * fatPct / 100) / 9);

  // Distribuição de calorias por refeição
  const mealDist = isLoss
    ? [
        { name: 'Café da Manhã', calories: 300, icon: '🌅' },
        { name: 'Lanche Manhã', calories: 120, icon: '🍎' },
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
    proteinPct,
    carbPct,
    fatPct,
    proteinG,
    carbG,
    fatG,
    mealDist
  };
}

function gerarSuplementos(p) {
  const s = [];
  if (p.restrictions && p.restrictions.includes('Sim') && p.restrictionDetail && (p.restrictionDetail.toLowerCase().includes('vegan') || p.restrictionDetail.toLowerCase().includes('vegetar'))) {
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
const API_URL = `${window.location.protocol}//${window.location.hostname}:3001/api`;

// Mapa de transições de tela baseado em ações do usuário
const ACTION_ROUTES = {
  'iniciar_consulta': 'anamnese_step',
  'voltar_menu': 'onboarding',
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
  'duvidas': 'duvidas'
};

// ---- State Reset ----
function resetState() {
  STATE.screen = 'onboarding';
  STATE.anamneseStep = 0;
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

// ============================================================
// RENDERER — Converte JSON Response em DOM
// ============================================================

const $c = id => document.getElementById(id);

// ---- Backend Integration ----
async function sendToBackend(profile) {
  console.log('📤 [NutriCare] Enviando dados para API...', {
    goal: profile.goal,
    sleep: profile.sleep,
    activity: profile.activity
  });
  try {
    const res = await fetch(`${API_URL}/consulta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const result = await res.json();
    console.log('✅ [NutriCare] Resposta da API recebida', result.meta);
    return result;
  } catch (err) {
    console.warn('⚠️ [NutriCare] API indisponível, usando geração local:', err.message);
    return null;
  }
}

function dispatch(action, payload) {
  console.log(`🔄 [NutriCare] Action: ${action}`, payload ? `Payload: ${payload.slice(0, 50)}...` : '');

  // Aplica transição de tela baseada na ação
  if (action && ACTION_ROUTES[action]) {
    STATE.screen = ACTION_ROUTES[action];
    console.log(`   → Tela: ${STATE.screen}`);
  }

  // Save user text input for bubble display
  if (typeof payload === 'string' && payload.trim()) {
    STATE.lastUserInput = payload.trim();
  }
  const response = engine(action, payload);
  render(response);
}

function renderUserBubble() {
  if (!STATE.lastUserInput) return '';
  const html = `
    <div class="message user" style="padding: 12px 20px 0;">
      <div class="message-avatar" style="margin-left: auto;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M8 14C8 14 10 12 12 14C14 12 16 14 16 14" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L10 11" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M14 10L14 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <div class="message-bubble" style="background:var(--green-800);color:white;border-bottom-right-radius:4px;max-width:85%;margin-left:auto;"><p>${STATE.lastUserInput}</p></div>
    </div>`;
  STATE.lastUserInput = null;
  return html;
}

function render(response) {
  if (!response) return;
  const container = $c('screen-container');
  if (!container) return;

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
    case 'analise_loading':
      container.innerHTML = renderAnaliseLoader();
      setTimeout(async () => {
        console.log('⏳ [NutriCare] Iniciando análise dos dados...');
        const result = await sendToBackend(STATE.profile);
        if (result && result.success) {
          STATE.plano = result.data;
          console.log('📊 [NutriCare] Plano carregado do backend');
        } else {
          console.log('💻 [NutriCare] Usando geração local (fallback)');
        }
        dispatch('gerar_analise', null);
      }, 2000);
      return;
    case 'analise':
      container.innerHTML = renderAnalise(response);
      bindClicks(container);
      return;
    case 'nutrition_charts':
      container.innerHTML = renderNutritionCharts(response);
      bindClicks(container);
      initCharts();
      return;
    default:
      container.innerHTML = renderChatScreen(response);
      bindClicks(container);
      bindDynamicInteractions(container, response);
  }
}

function renderChatScreen(resp) {
  const hasProgress = resp.screen === 'anamnese_step';
  const progressHtml = hasProgress ? `
    <header class="consult-header">
      <div class="header-top">
        <div class="header-brand">
          <button class="header-back" onclick="dispatch('voltar_menu')">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#2D6A4F" stroke-width="3"/><path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/><path d="M18 20L18 22" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/><path d="M30 20L30 22" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/></svg>
          <span>NutriCare</span>
        </div>
        <div class="header-progress"><span id="step-num">${STATE.anamneseStep + 1}</span>/7</div>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${((STATE.anamneseStep) / 7) * 100}%"></div>
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
        <div class="message-bubble"><p>${STATE.lastUserInput}</p></div>
      </div>`;
    STATE.lastUserInput = null;
  }

  // Message from nutritionist
  if (resp.message) {
    chatHtml += `
      <div class="message bot">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#2D6A4F" stroke-width="3"/>
            <path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M18 20L18 22" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M30 20L30 22" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round"/>
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
          <button class="btn-primary" data-action="${p.action}">${p.recommended ? 'Falar com nutricionista' : 'Começar grátis'}</button>
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

    case 'text_input':
      return `
        <div class="input-text-wrapper" style="display:flex;gap:8px;padding:8px 0;">
          <input type="text" class="text-input" id="dynamic-text-input"
            placeholder="${comp.placeholder || 'Digite...'}"
            data-action="${comp.action}" autocomplete="off">
          <button class="send-btn" id="dynamic-send-btn" disabled>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>`;

    case 'file_upload':
      return `
        <div class="file-upload-wrapper" style="padding:8px 0;">
          <div class="file-upload-area" id="dynamic-file-area" style="cursor:pointer;">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 22V10M16 10L11 15M16 10L21 15" stroke="#2D6A4F" stroke-width="2" stroke-linecap="round"/><path d="M4 20V24C4 26.2 5.8 28 8 28H24C26.2 28 28 26.2 28 24V20" stroke="#2D6A4F" stroke-width="2" stroke-linecap="round"/></svg>
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
          <h3 style="font-size:1rem;color:var(--green-800);margin-bottom:12px;">${comp.title}</h3>
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

    case 'meal_plan':
      return `<div class="result-section" style="margin-top:12px;"><div class="meal-plan">${comp.meals.map((m, idx) => `
        <div class="meal-card">
          <div class="meal-header" onclick="toggleMealCard(this)">
            <div class="meal-header-left">
              <div class="meal-icon">${m.icon}</div>
              <div><div class="meal-name">${m.name}</div><div class="meal-time">${m.time}</div></div>
            </div>
            <svg class="meal-toggle" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <div class="meal-body" style="max-height:0;overflow:hidden;transition:max-height 0.4s;">
            <div class="meal-description">${m.main.replace(/\n/g, '<br>')}</div>
            ${m.subs ? `<div class="meal-substitutions"><div class="meal-substitutions-label">🔄 Substituições</div><div class="meal-substitutions-text">${m.subs}</div></div>` : ''}
          </div>
        </div>`).join('')}</div></div>`;

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
          <div class="menu-brand-badge">NutriCare</div>
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
  return `
    <div class="screen" id="screen-planos">
      <div class="plans-container">
        ${renderUserBubble()}
        ${comps.back ? `<button class="back-btn" data-action="${comps.back.action}"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 16L6 10L12 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Voltar</button>` : ''}
        ${comps.title ? `<h2>${comps.title.text}</h2><p class="how-subtitle">Escolha a opção ideal para sua jornada nutricional.</p>` : ''}
        ${pricing ? `
          <div class="plans-grid">
            ${pricing.items.map(p => `
              <div class="plan-card ${p.recommended ? 'recommended' : ''}">
                <div class="${p.recommended ? 'plan-badge recom-badge' : 'plan-badge'}">${p.badge}</div>
                <div class="plan-price"><span class="plan-value">${p.value}</span></div>
                <ul class="plan-features">
                  ${p.features.map(f => `<li class="${f.included ? '' : 'plan-no'}">${f.included ? '✔' : '✘'} ${f.text}</li>`).join('')}
                </ul>
                <button class="btn-primary" data-action="${p.action}">${p.recommended ? 'Falar com nutricionista' : 'Começar grátis'}</button>
              </div>`).join('')}
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
    <div class="screen" id="screen-analise-loader" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, var(--green-800) 0%, var(--green-900) 100%);">
      <div style="text-align:center;padding:40px;">
        <div class="loading-spinner">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
            <circle cx="24" cy="24" r="22" stroke="#B7E4C7" stroke-width="3" stroke-dasharray="138" stroke-dashoffset="100" stroke-linecap="round" style="transform-origin:50% 50%;animation:spin 1.2s linear infinite;">
            </circle>
            <path d="M16 28C16 28 20 24 24 28C28 24 32 28 32 28" stroke="#B7E4C7" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M18 20L18 22" stroke="#B7E4C7" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M30 20L30 22" stroke="#B7E4C7" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 style="color:white;margin-top:24px;font-size:1.3rem;">Analisando seus dados...</h2>
        <p style="color:rgba(255,255,255,0.7);margin-top:8px;font-size:0.9rem;">Montando seu plano personalizado</p>
      </div>
    </div>`;
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
        <p class="charts-subtitle">Baseado no seu perfil — ${nd.totalCal} kcal/dia</p>
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

      ${resp.components.filter(c => c.type !== 'nutrition_charts').map(c => renderComponent(c, resp.screen)).join('')}
    </div>`;
}

function getMealColor(index) {
  const colors = ['#22C55E', '#F59E0B', '#3B82F6', '#A855F7', '#EF4444'];
  return colors[index % colors.length];
}

function initCharts() {
  const mealsCanvas = document.getElementById('chart-meals');
  const macrosCanvas = document.getElementById('chart-macros');
  if (!mealsCanvas || !macrosCanvas) return;

  // Extrair dados do DOM
  const legendItems = document.querySelectorAll('.legend-item');
  const mealNames = [], mealCals = [], mealColors = [];
  legendItems.forEach(item => {
    const label = item.querySelector('.legend-label')?.textContent?.replace(/^[^\s]+\s/, '') || '';
    const val = parseInt(item.querySelector('.legend-value')?.textContent) || 0;
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
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
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
      macroPcts.push(parseInt(pctEl.textContent));
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
    el.addEventListener('click', () => {
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
    const action = textInput.dataset.action;
    textInput.addEventListener('input', () => { sendBtn.disabled = !textInput.value.trim(); });
    const submit = () => {
      const val = textInput.value.trim();
      if (!val) return;
      dispatch(action, val);
    };
    sendBtn.addEventListener('click', submit);
    textInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => textInput.focus(), 200);
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
    setTimeout(() => {
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
    body.style.maxHeight = isOpen ? '0' : '500px';
    body.style.padding = isOpen ? '0 20px 0' : '0 20px 20px';
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
      <input type="checkbox" style="accent-color:#52B788;width:18px;height:18px;cursor:pointer;" onchange="this.parentElement.classList.toggle('checked')">
      <span>${i}</span>
    </label>`
  ).join('');
  itemsDiv.appendChild(div);
};

// ---- Init ----
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    dispatch(null, null);
    const loading = $c('loading-screen');
    if (loading) loading.classList.add('hidden');
  }, 1200);
});

// Tornar dispatch global
window.dispatch = dispatch;
