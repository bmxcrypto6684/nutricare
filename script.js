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
  anamneseExtraStep: 0,
  chatPremiumStep: 0,
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
              action: 'assinar_premium'
            }
          ]}
        ],
        actions: [
          { id: 'voltar_menu', next: 'onboarding' },
          { id: 'iniciar_consulta', next: 'anamnese_step' },
          { id: 'assinar_premium', next: 'assinar_premium' },
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
          if (STATE.anamneseStep >= ANAMNESE_TOTAL_STEPS) { return transitionToAnalise(); }
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

      const step = STATE.chatPremiumStep ?? 0;
      const CHAT_TOTAL = 6;

      const goal = STATE.profile.goal || '';
      const sleep = STATE.profile.sleep || '';
      const activity = STATE.profile.activity || '';
      const dietPref = STATE.profile.preferredDiet || '';
      const waterIntake = STATE.profile.waterIntake || '';
      const cookingStyle = STATE.profile.cookingStyle || '';
      const favFoods = STATE.profile.favFoods || '';

      const steps = [
        // Step 0: Intro
        () => ({
          msg: `👋 <strong>Ótimo!</strong> Agora vou te fazer algumas perguntas rápidas para<br>deixar seu plano ainda mais personalizado.`,
          btns: [{ text: 'Continuar 👍', action: 'chat_continue_0' }]
        }),
        // Step 1: Goal feedback
        () => ({
          msg: goal.includes('perder') || goal.includes('emagrec') || goal === 'Emagrecimento'
            ? `🔥 Seu objetivo é <strong>${goal}</strong>. Uma dica importante: combine déficit calórico moderado com aumento de proteínas para preservar massa magra. Vou considerar isso no seu plano!`
            : goal.includes('massa') || goal.includes('muscular')
            ? `💪 Foco em <strong>${goal}</strong>! Vou priorizar proteínas magras e carboidratos complexos nas refeições pós-treino.`
            : `🌿 <strong>${goal}</strong> é uma excelente meta! Vou montar um plano equilibrado que se encaixa no seu dia a dia.`,
          btns: [{ text: 'Entendi! ✅', action: 'chat_continue_1' }]
        }),
        // Step 2: Personal tip based on profile
        () => {
          let tip = '';
          if (activity === 'Sedentário') {
            tip = '🚶 Você está sedentário. Que tal começar com <strong>caminhadas leves de 20 min</strong> após o almoço? Já ajuda na digestão e no metabolismo.';
          } else if (activity === 'Intenso') {
            tip = `⚡ Atividade <strong>${activity}</strong>! Vou incluir carboidratos de qualidade pra te dar energia nos treinos.`;
          } else {
            tip = `🏃 Atividade <strong>${activity}</strong> é ótimo! Vou ajustar as porções pra matched seu gasto calórico.`;
          }
          return { msg: tip, btns: [{ text: 'Boa dica! 💡', action: 'chat_continue_2' }] };
        },
        // Step 3: Sleep / diet / habit check
        () => {
          let tip = '';
          if (sleep === 'Ruim') {
            tip = '😴 Seu sono está <strong>ruim</strong>. Sabia que noites mal dormidas aumentam o cortisol e dificultam a perda de peso? Vou incluir alimentos que ajudam no relaxamento (banana, aveia, chás).';
          } else if (sleep === 'Médio') {
            tip = '😴 Seu sono é <strong>médio</strong>. Que tal incluir um chá calmante à noite? Vou sugerir opções no plano.';
          } else {
            tip = '😴 Sono <strong>bom</strong> é a base! Seu plano vai potencializar essa rotina saudável.';
          }
          return { msg: tip, btns: [{ text: 'Ótimo! 🌟', action: 'chat_continue_3' }] };
        },
        // Step 4: Diet + cooking + water summary
        () => ({
          msg: `🥗 <strong>Resumo das suas preferências:</strong><br><br>
          • Dieta: <strong>${dietPref || 'Equilibrada'}</strong><br>
          • Cozinha: <strong>${cookingStyle || 'Sim'}</strong><br>
          • Água: <strong>${waterIntake || '—'}</strong><br>
          ${favFoods ? `• Ama: <strong>${favFoods}</strong>` : ''}<br><br>
          ${waterIntake === 'Menos de 1L' ? '💧 Dica: tente aumentar para pelo menos 2L de água por dia. Seu metabolismo agradece!' : '💧 Hidratação em dia! Isso faz diferença nos resultados.'}`,
          btns: [{ text: 'Perfeito! ✅', action: 'chat_continue_4' }]
        }),
        // Step 5: Final
        () => ({
          msg: `✨ <strong>Tudo pronto!</strong> Com base em todas as suas respostas, vou gerar agora um plano alimentar <strong>100% personalizado</strong> para você.<br><br>Pode levar alguns segundos...`,
          btns: [{ text: '🎯 Gerar meu plano!', action: 'chat_finalizar' }]
        })
      ];

      if (action === 'chat_finalizar') {
        STATE.chatPremiumStep = 0;
        return { screen: 'analise_loading', message: '', components: [], actions: [] };
      }

      if (step >= CHAT_TOTAL) {
        STATE.chatPremiumStep = CHAT_TOTAL - 1;
      }

      const current = steps[step]();
      STATE.chatPremiumStep = Math.min(step + 1, CHAT_TOTAL);

      return {
        screen: 'chat_premium',
        message: current.msg,
        components: [
          { type: 'buttons', items: current.btns.map(b => ({ ...b, variant: 'primary' })) }
        ],
        actions: current.btns.map(b => ({ id: b.action.replace('chat_continue_', ''), next: 'chat_premium' }))
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
      const meals = gerarRefeicoes(STATE.profile);
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
      const historico = carregarHistorico();
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

    default:
      return engine(null, null);
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
    { msg: `Possui <strong>restrições alimentares</strong>?`, type: 'options', key: 'restrictions', items: [
        { text: 'Não', action: 'ans_restr_no' },
        { text: 'Sim', action: 'ans_restr_yes' }
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
    'ans_restr_yes': ['restrictions', ['Sim']],
    'ans_exams_no': ['hasExams', false],
    'ans_exams_yes': ['hasExams', true],
    'ans_exams_done': ['hasExams', true],
    'ans_exams_skip': ['hasExams', false],
    'ans_gender_m': ['gender', 'Masculino'],
    'ans_gender_f': ['gender', 'Feminino']
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
      actions: q.items.map(i => ({ id: i.action.replace('ans_extra_', ''), next: 'anamnese_extra' }))
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

function showFirstChatPremiumStep() {
  STATE.chatPremiumStep = 1;
  return {
    screen: 'chat_premium',
    message: '👋 <strong>Ótimo!</strong> Agora vou te fazer algumas perguntas rápidas para<br>deixar seu plano ainda mais personalizado.',
    components: [{ type: 'buttons', items: [{ text: 'Continuar 👍', action: 'chat_continue_0', variant: 'primary' }] }],
    actions: [{ id: '0', next: 'chat_premium' }]
  };
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
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '';

const ANAMNESE_TOTAL_STEPS = 6; // Perguntas básicas (gratuitas)
const ANAMNESE_EXTRA_TOTAL = 8; // Perguntas extras (premium)

// ---- Sanitização HTML ----
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
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

    const peso = parseFloat(STATE.profile.weight);
    if (peso) {
      const progresso = JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESSO) || '[]');
      const hoje = new Date().toDateString();
      const jaExiste = progresso.some(p => new Date(p.data).toDateString() === hoje);
      if (!jaExiste) {
        progresso.push({ data: entry.timestamp, peso, objetivo: STATE.profile.goal || '' });
        if (progresso.length > 100) progresso.length = 100;
        localStorage.setItem(STORAGE_KEY_PROGRESSO, JSON.stringify(progresso));
      }
    }
  } catch (e) {
    console.warn('Erro ao salvar histórico:', e);
  }
}

function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORICO) || '[]'); }
  catch { return []; }
}

function carregarProgresso() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESSO) || '[]'); }
  catch { return []; }
}

function renderHistorico() {
  const historico = carregarHistorico();
  const cards = historico.length
    ? historico.map(h => `
      <div class="historico-card" onclick="dispatch('ver_consulta', '${h.id}')">
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
                <span><strong>${p.peso} kg</strong></span>
                <span style="color:var(--text-tertiary);font-size:0.85rem;">${p.objetivo ? escapeHtml(p.objetivo) : ''}</span>
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
  'assinar_premium': 'assinar_premium'
};

// ---- State Reset ----
function resetState() {
  STATE.screen = 'onboarding';
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

// ============================================================
// RENDERER — Converte JSON Response em DOM
// ============================================================

const $c = id => document.getElementById(id);

// ---- Backend Integration ----
async function sendToBackend(profile) {
  console.log('📤 [NutriCare] Enviando dados para API...', {
    goal: profile.goal,
    sleep: profile.sleep,
    activity: profile.activity,
    gender: profile.gender,
    age: profile.age,
    weight: profile.weight,
    height: profile.height
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_URL}/consulta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const result = await res.json();
    console.log('✅ [NutriCare] Resposta da API recebida', result.meta);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    console.warn('⚠️ [NutriCare] API indisponível, usando geração local:', err.message);
    return null;
  }
}

// ---- Premium / Stripe Payment Link ----
const PREMIUM_LINK = 'https://buy.stripe.com/test_eVqbIU4PL0uD6Nf8MY8EM00';

function iniciarCheckoutPremium() {
  window.location.href = PREMIUM_LINK;
}

function verificarPremiumSucesso() {
  const jaEraPremium = localStorage.getItem('nutricare_premium') === 'true';
  if (!jaEraPremium) {
    localStorage.setItem('nutricare_premium', 'true');
    localStorage.setItem('nutricare_premium_date', new Date().toISOString());
  }
  return true;
}

function renderPremiumAtivado(email) {
  const container = document.getElementById('screen-container');
  container.innerHTML = `
    <div class="screen" style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-deep);">
      <div style="text-align:center;max-width:360px;animation:slideUp 0.5s ease;">
        <div style="font-size:4rem;margin-bottom:16px;animation:pulse 2s ease-in-out infinite;">🎉</div>
        <h1 style="font-size:1.6rem;margin-bottom:8px;">Premium Ativado!</h1>
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin-bottom:20px;">
          Agora você tem acesso a todos os recursos premium do NutriCare.
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
function isPremium() {
  return localStorage.getItem('nutricare_premium') === 'true';
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

function renderChatPremium(resp) {
  const step = STATE.chatPremiumStep ?? 1;
  const total = 6;
  const progressPct = Math.min((step / total) * 100, 100);

  // Get first button action for the text input to use on submit
  const firstAction = resp.components?.[0]?.items?.[0]?.action || '';

  // User message bubble (from text input)
  let userBubbleHtml = '';
  if (STATE.lastUserInput) {
    userBubbleHtml = `
      <div class="message user">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M8 14C8 14 10 12 12 14C14 12 16 14 16 14" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M10 10L10 11" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M14 10L14 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="message-bubble" style="color:white;border-bottom-right-radius:4px;max-width:85%;margin-left:auto;"><p>${escapeHtml(STATE.lastUserInput)}</p></div>
      </div>`;
    STATE.lastUserInput = null;
  }

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
        <div class="progress-bar-track" style="margin-top:8px;">
          <div class="progress-bar-fill" style="width:${progressPct}%;background:var(--accent-500);"></div>
        </div>
      </header>
      <main class="chat-container" id="chat-inner" style="padding-bottom:120px;">
        ${userBubbleHtml}
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
        </div>
      </main>
      <div style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px 24px;background:var(--bg-deep);border-top:1px solid var(--border-color);display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;gap:8px;width:100%;">
          <input id="dynamic-text-input" type="text" placeholder="Digite sua resposta..."
            style="flex:1;padding:12px 16px;border-radius:12px;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-primary);font-size:0.9rem;outline:none;" />
          <button id="dynamic-send-btn" class="btn-primary" data-action="${firstAction}" style="padding:12px 20px;white-space:nowrap;" disabled>
            Enviar
          </button>
        </div>
        ${resp.components.map(c => {
          if (c.type === 'buttons') {
            return c.items.map(b => `<button class="btn-primary" data-action="${b.action}" style="width:100%;">${b.text}</button>`).join('');
          }
          return '';
        }).join('')}
      </div>
    </div>`;
}

function dispatch(action, payload) {
  console.log(`🔄 [NutriCare] Action: ${action}`, payload ? `Payload: ${payload.slice(0, 50)}...` : '');

  // Aplica transição de tela baseada na ação
  if (action && ACTION_ROUTES[action]) {
    STATE.screen = ACTION_ROUTES[action];
    console.log(`   → Tela: ${STATE.screen}`);
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
  // Atualiza STATE.screen com a tela retornada pelo engine (essencial para transições internas)
  STATE.screen = response.screen;
  render(response);
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
  const meals = gerarRefeicoes(STATE.profile);
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
      if (!isPremium()) { upgradeRedirect(); return; }
      container.innerHTML = renderContato(response);
      bindClicks(container);
      return;
    case 'assinar_premium':
      iniciarCheckoutPremium();
      return;
    case 'analise_loading':
      container.innerHTML = renderAnaliseLoader();
      startLoaderAnimation();
      setTimeout(async () => {
        console.log('⏳ [NutriCare] Iniciando análise dos dados...');
        try {
          // 1. Ping rápido no servidor (500ms) pra não travar
          const saudavel = API_URL
            ? await fetch(`${API_URL}/health`, {
                signal: AbortSignal.timeout(500)
              }).then(r => r.ok).catch(() => false)
            : false;

          // 2. Só chama a API se o servidor estiver vivo
          let result = null;
          if (saudavel) {
            result = await Promise.race([
              sendToBackend(STATE.profile),
              new Promise(r => setTimeout(() => r(null), 5000))
            ]);
          } else {
            console.log('💻 [NutriCare] Servidor offline, gerando localmente');
          }

          if (result && result.success) {
            STATE.plano = result.data;
            STATE.lastDiagnostico = (result.data.diagnostico?.resumo || []).join(' · ') || STATE.profile.goal || '';
            STATE.lastPlano = true;
            console.log('📊 [NutriCare] Plano carregado do backend');
          } else {
            console.log('💻 [NutriCare] Usando geração local (fallback)');
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
          <button class="btn-primary" data-action="${p.action}">${p.recommended ? 'Assinar Premium' : 'Começar grátis'}</button>
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
            autocomplete="off">
          <button class="send-btn" id="dynamic-send-btn" data-action="${comp.action}" disabled>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>`;

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
                <button class="btn-primary" data-action="${p.action}">${p.recommended ? 'Assinar Premium' : 'Começar grátis'}</button>
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
  let i = 0;
  el._interval = setInterval(function() {
    if (i < messages.length) el.textContent = messages[i];
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
  const refeicoes = gerarRefeicoes(p);
  const sups = gerarSuplementos(p);
  const lista = gerarListaCompras(p);
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
    if (el.id === 'dynamic-send-btn') return; // handled separately with validation
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
    textInput.addEventListener('input', () => {
      sendBtn.disabled = textInput.value.trim().length < 3;
      textInput.style.borderColor = textInput.value.trim().length >= 3 ? 'var(--accent-500)' : '';
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
      const val = textInput.value.trim();
      if (!val) { mostrarErro('⚠️ Preencha este campo antes de continuar'); return; }
      if (val.length < 3) { mostrarErro('⚠️ Digite pelo menos 3 caracteres'); return; }
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
    localStorage.setItem('nutricare_theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('nutricare_theme', 'light');
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
  // Só ativa tema claro se salvou 'light' explicitamente
  const isLight = saved === 'light';
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  document.querySelectorAll('#theme-toggle-btn, .menu-brand-badge .header-theme-btn').forEach(btn => {
    btn.textContent = isLight ? '☀️' : '🌙';
  });
}

// ---- PWA: Service Worker ----
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('📦 [PWA] Service Worker registrado:', reg.scope);
    }).catch(err => {
      console.warn('⚠️ [PWA] Falha ao registrar SW:', err);
    });
  }
}

// ---- Inicialização ----
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  registerSW();

  // Check Stripe Payment Link redirect
  const params = new URLSearchParams(window.location.search);
  const premiumStatus = params.get('premium');

  if (premiumStatus === 'clear') {
    localStorage.removeItem('nutricare_premium');
    localStorage.removeItem('nutricare_premium_date');
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setTimeout(() => {
      const loading = $c('loading-screen');
      if (loading) loading.classList.add('hidden');
      dispatch(null, null);
    }, 500);
    return;
  }

  if (premiumStatus === 'success') {
    // Limpa URL sem recarregar
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    // Aguarda loading + ativa premium
    setTimeout(async () => {
      const loading = $c('loading-screen');
      if (loading) loading.classList.add('hidden');
      dispatch(null, null);
      verificarPremiumSucesso();
      renderPremiumAtivado('');
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
