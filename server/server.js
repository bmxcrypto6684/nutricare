// ============================================================
// NutriCare API — Backend de Consulta Nutricional
// ============================================================
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware ----
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('\x1b[36m:method\x1b[0m :url \x1b[33m:status\x1b[0m \x1b[90m:response-time ms\x1b[0m'));

// ---- Request Log Helper ----
function logRequest(title, data) {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  ${timestamp} — ${title}`);
  console.log(`╚══════════════════════════════════════════╝`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NutriCare API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// POST /api/consulta — Gera plano nutricional
// ============================================================
app.post('/api/consulta', (req, res) => {
  const profile = req.body;

  logRequest('Nova consulta recebida', profile);

  // Validação básica
  if (!profile || Object.keys(profile || {}).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Dados do perfil são obrigatórios'
    });
  }

  try {
    // Simula processamento de IA (estrutura preparada para OpenAI/Claude)
    const plano = gerarPlanoCompleto(profile);

    console.log(`\n✅ Plano gerado para: ${profile.goal || 'perfil genérico'}`);
    console.log(`   Refeições: ${plano.refeicoes.length}`);
    console.log(`   Estratégias: ${plano.estrategias.length}`);
    console.log(`   Suplementos: ${plano.suplementos.length}`);

    res.json({
      success: true,
      data: plano,
      meta: {
        gerado_em: new Date().toISOString(),
        versao_algoritmo: '1.0.0',
        modo_ia_simulada: true
      }
    });
  } catch (err) {
    console.error('\n❌ Erro ao gerar plano:', err.message);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao gerar plano nutricional'
    });
  }
});

// ============================================================
// Engine de Geração de Plano (simula IA)
// ============================================================

function gerarPlanoCompleto(p) {
  return {
    diagnostico: gerarDiagnostico(p),
    refeicoes: gerarRefeicoes(p),
    substituicoes: gerarSubstituicoes(),
    lista_compras: gerarListaCompras(),
    estrategias: gerarEstrategias(p),
    suplementos: gerarSuplementos(p),
    info_nutricional: gerarInfoNutricional(p)
  };
}

function gerarDiagnostico(p) {
  const resumo = [];
  const atencao = [];
  const oportunidades = [];

  if (p.goal) resumo.push(`Objetivo: ${p.goal}`);
  if (p.sleep) resumo.push(`Sono: ${p.sleep}`);
  if (p.activity) resumo.push(`Atividade: ${p.activity}`);
  if (p.restrictions && p.restrictions.length > 0 && p.restrictionDetail) {
    resumo.push(`Restrições: ${p.restrictionDetail}`);
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

  if (p.sleep === 'Ruim' || p.sleep === 'Médio') {
    atencao.push('Sono prejudicado — impacta hormônios da fome e escolhas alimentares');
  }
  if (p.activity === 'Sedentário') {
    atencao.push('Sedentarismo — movimento é parte essencial do processo');
  }

  oportunidades.push('Aumentar consumo de água — 35ml por kg de peso');
  oportunidades.push('Incluir proteína em todas as refeições');
  oportunidades.push('Adicionar mais fibras (aveia, chia, vegetais)');
  oportunidades.push('Fazer refeições regulares a cada 3-4 horas');

  if (resumo.length === 0) resumo.push('Perfil geral — vamos construir hábitos saudáveis!');
  if (atencao.length === 0) atencao.push('Perfil equilibrado — vamos potencializar ainda mais!');

  return { resumo, atencao, oportunidades };
}

function gerarRefeicoes(p) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

  return [
    {
      icon: '🌅', nome: 'Café da Manhã', horario: '07:00 - 08:00',
      opcoes: isLoss
        ? ['2 ovos mexidos + 1 fatia pão integral + café', 'Tapioca com queijo branco + banana', 'Iogurte natural com granola e frutas vermelhas']
        : ['3 ovos + 2 fatias pão integral + 1 fruta', 'Vitamina de banana com aveia + pasta de amendoim', 'Crepioca com queijo + café com leite'],
      substituicoes: 'Ovos → tofu mexido | Pão integral → crepioca | Iogurte → kefir'
    },
    {
      icon: '🍎', nome: 'Lanche da Manhã', horario: '10:00',
      opcoes: isLoss
        ? ['1 fruta + 5 castanhas', '1 iogurte natural', '1 barrinha de cereais sem açúcar']
        : ['1 fruta + 10 castanhas', 'Iogurte grego + mel', 'Banana com pasta de amendoim'],
      substituicoes: 'Castanhas → amêndoas ou nozes | Fruta da estação → outra de preferência'
    },
    {
      icon: '🍚', nome: 'Almoço', horario: '12:00 - 13:00',
      opcoes: isLoss
        ? ['4 col de arroz + 1 concha feijão + 120g proteína + salada à vontade', 'Peixe grelhado + legumes + 1 batata-doce média', 'Salada grande com grão-de-bico + ovos + azeite']
        : ['6 col arroz + feijão + 150g proteína + salada + azeite', '200g carne magra + batata-doce + brócolis', 'Frango ao curry + arroz integral + legumes'],
      substituicoes: 'Arroz → quinoa ou integral | Frango → peixe, carne ou tofu | Feijão → lentilha ou grão-de-bico'
    },
    {
      icon: '🥤', nome: 'Lanche da Tarde', horario: '15:30',
      opcoes: isLoss
        ? ['1 fruta + café sem açúcar', 'Iogurte desnatado', 'Pão integral com cottage']
        : isGain
          ? ['Vitamina de banana com whey + aveia', '2 fatias pão integral + pasta de amendoim + banana', 'Iogurte grego + granola + mel']
          : ['1 fruta + castanhas', 'Iogurte + granola', 'Smoothie de frutas com aveia'],
      substituicoes: 'Fruta → vegetais picados (cenoura, pepino) | Pão → torradas integrais'
    },
    {
      icon: '🌙', nome: 'Jantar', horario: '19:00 - 20:00',
      opcoes: isLoss
        ? ['Omelete 2 ovos com espinafre + salada', 'Sopa de legumes com frango desfiado', 'Salada grande com atum + ovos + azeite']
        : ['150g salmão + quinoa + vegetais', 'Omelete 3 ovos + arroz integral + legumes', 'Frango + purê batata-doce + salada'],
      substituicoes: 'Omelete → tofu mexido | Salmão → sardinha | Sopa → adaptável com vegetais disponíveis'
    }
  ];
}

function gerarSubstituicoes() {
  return [
    { icone: '🥚', titulo: 'Ovos', texto: 'Substitua por tofu mexido (versão vegana) ou peito de peru.' },
    { icone: '🍞', titulo: 'Pão integral', texto: 'Troque por crepioca, tapioca, panqueca de aveia ou torrada integral.' },
    { icone: '🥩', titulo: 'Carne vermelha', texto: 'Substitua por frango, peixe, ovos, tofu ou cogumelos.' },
    { icone: '🍚', titulo: 'Arroz branco', texto: 'Troque por arroz integral, quinoa, couve-flor rice ou batata-doce.' },
    { icone: '🧀', titulo: 'Queijo', texto: 'Substitua por ricota, cottage, tofu ou pasta de grão-de-bico (homus).' },
    { icone: '🥛', titulo: 'Leite de vaca', texto: 'Troque por leite vegetal (amêndoas, aveia, coco) ou kefir.' }
  ];
}

function gerarListaCompras() {
  return [
    { icone: '🥩', nome: 'Proteínas', itens: ['Peito de frango', 'Ovos', 'Carne moída magra', 'Atum em lata', 'Iogurte natural', 'Grão-de-bico'] },
    { icone: '🥬', nome: 'Vegetais', itens: ['Brócolis', 'Espinafre', 'Tomate', 'Alface', 'Cenoura', 'Abobrinha', 'Couve'] },
    { icone: '🍚', nome: 'Grãos', itens: ['Arroz integral', 'Feijão', 'Quinoa', 'Aveia', 'Lentilha'] },
    { icone: '🍎', nome: 'Frutas', itens: ['Banana', 'Maçã', 'Mamão', 'Limão', 'Frutas vermelhas'] },
    { icone: '🥜', nome: 'Castanhas', itens: ['Castanha-do-pará', 'Amêndoas', 'Pasta de amendoim'] },
    { icone: '🧀', nome: 'Laticínios', itens: ['Queijo branco', 'Leite', 'Manteiga'] }
  ];
}

function gerarEstrategias(p) {
  const tips = [
    { icone: '📦', titulo: 'Organização semanal', texto: 'Reserve 1h no domingo para planejar marmitas. É o maior segredo de quem consegue manter uma alimentação saudável.' },
    { icone: '🍽️', titulo: 'Coma com atenção', texto: 'Sem TV ou celular. Mastigue bem cada garfada — uma refeição deve durar 15-20 minutos.' },
    { icone: '🥤', titulo: 'Hidratação', texto: 'Tome 35ml de água por kg de peso. Deixe uma garrafa sempre à vista como lembrete.' },
    { icone: '🔄', titulo: 'Consistência > Perfeição', texto: 'Você não precisa acertar 100%. 80% de constância já traz resultados transformadores.' }
  ];

  if (p.sleep === 'Ruim' || p.sleep === 'Médio') {
    tips.push({ icone: '😴', titulo: 'Higiene do sono', texto: 'Desligue telas 1h antes de dormir. Um bom sono regula hormônios da fome.' });
  }
  if (p.activity === 'Sedentário') {
    tips.push({ icone: '🚶', titulo: 'Comece leve', texto: '20 min de caminhada diária já ativam o metabolismo. O importante é começar.' });
  }

  return tips;
}

function gerarSuplementos(p) {
  const sups = [];

  if (p.restrictionDetail && (p.restrictionDetail.toLowerCase().includes('vegan') || p.restrictionDetail.toLowerCase().includes('vegetar'))) {
    sups.push({ nome: 'Vitamina B12', dosagem: '2,4 mcg/dia', motivo: 'Essencial em dietas baseadas em vegetais.' });
  }
  if (p.sleep === 'Ruim') {
    sups.push({ nome: 'Magnésio Bisglicinato', dosagem: '200-400mg à noite', motivo: 'Auxilia no relaxamento e melhora a qualidade do sono.' });
  }
  if (p.goal && p.goal.includes('massa muscular')) {
    sups.push({ nome: 'Whey Protein (ou vegetal)', dosagem: '30g pós-treino', motivo: 'Ajuda a atingir a meta proteica diária.' });
  }
  if (p.activity === 'Sedentário' || p.activity === 'Leve') {
    sups.push({ nome: 'Vitamina D3 + K2', dosagem: '2.000 UI/dia', motivo: 'Essencial para imunidade e saúde óssea.' });
  }
  if (sups.length < 2) {
    sups.push({ nome: 'Ômega 3 (EPA/DHA)', dosagem: '1-2g/dia', motivo: 'Anti-inflamatório natural para saúde cerebral e cardiovascular.' });
  }

  return sups;
}

function gerarInfoNutricional(p) {
  const isLoss = p.goal && p.goal.includes('Emagrecimento');
  const isGain = p.goal && p.goal.includes('massa muscular');

  let calorias = 2000;
  let proteinas = 1.6;
  let observacao = '';

  if (isLoss) { calorias = 1500; proteinas = 2.0; observacao = 'Déficit calórico moderado para perda de peso saudável (0.5-1kg/semana).'; }
  else if (isGain) { calorias = 2800; proteinas = 2.2; observacao = 'Superávit calórico controlado para ganho de massa magra.'; }
  else { observacao = 'Plano de manutenção com foco em qualidade nutricional e bem-estar.'; }

  return { calorias_estimadas: calorias, proteinas_g_por_kg: proteinas, observacao };
}

// ============================================================
// Iniciar Servidor
// ============================================================
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(48));
  console.log('  🌿 NutriCare API — Servidor rodando');
  console.log('='.repeat(48));
  console.log(`  URL:    http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  API:    POST http://localhost:${PORT}/api/consulta`);
  console.log('='.repeat(48) + '\n');
});
