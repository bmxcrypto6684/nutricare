/**
 * NutriCare - Constantes e Configurações
 */
export const STORAGE_KEYS = {
  USER_PROFILE: '@nutricare_user_profile',
  ANAMNESE_DATA: '@nutricare_anamnese',
  GENERATED_PLAN: '@nutricare_plan',
  ONBOARDING_DONE: '@nutricare_onboarding',
};

export const ANAMNESE_STEPS = [
  { id: 'welcome', title: 'Boas-vindas' },
  { id: 'objective', title: 'Objetivo' },
  { id: 'routine', title: 'Rotina' },
  { id: 'diet', title: 'Alimentação' },
  { id: 'restrictions', title: 'Restrições' },
  { id: 'sleep', title: 'Sono' },
  { id: 'activity', title: 'Atividade Física' },
];

export const PLAN_VALUES = {
  BASICO: 190,
  COMPLETO: 250,
};
