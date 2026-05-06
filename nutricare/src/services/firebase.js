/**
 * NutriCare — Firebase Configuration
 *
 * Inicializa o Firebase com as credenciais do seu projeto.
 * ATENÇÃO: Substitua os valores abaixo pelas configurações do seu projeto Firebase.
 *
 * Para obter essas configurações:
 * 1. Acesse https://console.firebase.google.com
 * 2. Crie ou selecione seu projeto
 * 3. Vá em Configurações do Projeto > Geral > Seus apps > Web
 * 4. Copie o objeto firebaseConfig
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from 'firebase/functions';

// ⚠️  SUBSTITUA PELAS CREDENCIAIS DO SEU PROJETO FIREBASE
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Inicializa o Firebase (apenas uma vez)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Serviços
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// ==================== AUTH ====================

/**
 * Observa mudanças no estado de autenticação
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {() => void} Função para cancelar a inscrição
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Login anônimo (entrada rápida sem cadastro)
 */
export async function loginAnonymously() {
  try {
    const result = await signInAnonymously(auth);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Criar conta com email e senha
 */
export async function registerWithEmail(email, password) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Login com email e senha
 */
export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Logout
 */
export async function logout() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== FIRESTORE ====================

/**
 * Salva os dados da anamnese no Firestore
 * @param {string} userId
 * @param {Object} anamneseData
 */
export async function saveAnamnese(userId, anamneseData) {
  try {
    await setDoc(doc(db, 'users', userId, 'anamneses', 'latest'), {
      ...anamneseData,
      createdAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Salva o plano alimentar gerado no Firestore
 * @param {string} userId
 * @param {Object} planData
 */
export async function saveMealPlan(userId, planData) {
  try {
    await setDoc(doc(db, 'users', userId, 'mealPlans', 'latest'), {
      ...planData,
      createdAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Busca o último plano alimentar do usuário
 * @param {string} userId
 */
export async function getLatestMealPlan(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'mealPlans', 'latest'));
    if (snap.exists()) {
      return { success: true, data: snap.data() };
    }
    return { success: false, error: 'Nenhum plano encontrado' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Salva o progresso do usuário (peso, fotos, etc.)
 * @param {string} userId
 * @param {Object} progressData
 */
export async function saveProgress(userId, progressData) {
  try {
    await addDoc(collection(db, 'users', userId, 'progress'), {
      ...progressData,
      createdAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Busca o histórico de progresso do usuário
 * @param {string} userId
 */
export async function getProgressHistory(userId) {
  try {
    const q = query(
      collection(db, 'users', userId, 'progress'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== FUNCTIONS (AI) ====================

/**
 * Chama a Cloud Function para gerar o plano alimentar com IA
 * @param {Object} userData — respostas da anamnese
 */
export async function generatePlanWithAI(userData) {
  try {
    const generatePlan = httpsCallable(functions, 'generateMealPlan');
    const result = await generatePlan({ userData });
    return { success: true, data: result.data };
  } catch (error) {
    // Fallback: se a Cloud Function não estiver disponível, usa a IA local
    const { gerarPlanoSincrono } = await import('./aiService');
    const plano = gerarPlanoSincrono(userData);
    return { success: true, data: plano, fallback: true };
  }
}

export {
  Timestamp,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
};
