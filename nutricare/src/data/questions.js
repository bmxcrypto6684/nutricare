/**
 * NutriCare - Perguntas da Anamnese
 * Estrutura: cada pergunta controla o tipo de input e as opções
 */
export const QUESTIONS = [
  {
    id: 'objective',
    title: 'Qual seu objetivo principal?',
    subtitle: 'Isso vai me ajudar a personalizar seu plano',
    type: 'options',
    options: [
      { label: 'Emagrecimento', value: 'emagrecimento', icon: '🔥' },
      { label: 'Ganho de massa muscular', value: 'massa', icon: '💪' },
      { label: 'Saúde / Metabolismo', value: 'saude', icon: '🩺' },
      { label: 'Bem-estar geral', value: 'bem_estar', icon: '🌿' },
    ],
  },
  {
    id: 'routine',
    title: 'Como é sua rotina?',
    subtitle: 'Me conte sobre horários, trabalho e sono',
    type: 'text',
    placeholder: 'Ex: acordo 6h, trabalho 8h-18h, durmo 23h...',
  },
  {
    id: 'diet',
    title: 'Como está sua alimentação hoje?',
    subtitle: 'Descreva o que você costuma comer no dia a dia',
    type: 'text',
    placeholder: 'Ex: café da manhã: pão com manteiga, almoço: arroz, feijão e carne...',
  },
  {
    id: 'restrictions',
    title: 'Você possui restrições alimentares?',
    subtitle: 'Intolerâncias, alergias ou preferências',
    type: 'options',
    options: [
      { label: 'Nenhuma', value: 'nenhuma', icon: '✅' },
      { label: 'Intolerância à lactose', value: 'lactose', icon: '🥛' },
      { label: 'Glúten / Celíaco', value: 'gluten', icon: '🌾' },
      { label: 'Alergia alimentar', value: 'alergia', icon: '⚠️' },
      { label: 'Vegetariano', value: 'vegetariano', icon: '🥦' },
      { label: 'Vegano', value: 'vegano', icon: '🌱' },
    ],
  },
  {
    id: 'sleep',
    title: 'Como está seu sono?',
    subtitle: 'A qualidade do seu sono impacta diretamente seus resultados',
    type: 'options',
    options: [
      { label: 'Bom — durmo bem e acordo descansado', value: 'bom', icon: '😴' },
      { label: 'Médio — às vezes tenho dificuldade', value: 'medio', icon: '🌙' },
      { label: 'Ruim — durmo mal frequentemente', value: 'ruim', icon: '🫨' },
    ],
  },
  {
    id: 'activity',
    title: 'Qual seu nível de atividade física?',
    subtitle: 'Isso define sua necessidade calórica',
    type: 'options',
    options: [
      { label: 'Sedentário', value: 'sedentario', icon: '🪑' },
      { label: 'Leve (1-2x/semana)', value: 'leve', icon: '🚶' },
      { label: 'Moderado (3-4x/semana)', value: 'moderado', icon: '🏃' },
      { label: 'Intenso (5x+ ou atleta)', value: 'intenso', icon: '🏋️' },
    ],
  },
  {
    id: 'age',
    title: 'Qual sua idade?',
    subtitle: 'Para calcular suas necessidades nutricionais',
    type: 'text',
    placeholder: 'Ex: 28',
  },
  {
    id: 'weight',
    title: 'Qual seu peso atual?',
    subtitle: 'Em quilogramas (kg)',
    type: 'text',
    placeholder: 'Ex: 70',
  },
  {
    id: 'height',
    title: 'Qual sua altura?',
    subtitle: 'Em centímetros (cm)',
    type: 'text',
    placeholder: 'Ex: 170',
  },
  {
    id: 'gender',
    title: 'Qual seu sexo biológico?',
    subtitle: 'Para cálculos de TMB mais precisos',
    type: 'options',
    options: [
      { label: 'Feminino', value: 'feminino', icon: '👩' },
      { label: 'Masculino', value: 'masculino', icon: '👨' },
      { label: 'Prefiro não informar', value: 'outro', icon: '⚧️' },
    ],
  },
];

export const TOTAL_STEPS = QUESTIONS.length;
