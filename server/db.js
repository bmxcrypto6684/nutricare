// ============================================================
// NutriCare Database — Supabase (PostgreSQL)
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\n❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.');
  console.error('   Crie um projeto em https://supabase.com/dashboard');
  console.error('   E configure as variáveis no Render Dashboard.\n');
  module.exports = { _dbUnconfigured: true };
  return;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws }
});

// ---- User ----
async function findOrCreateUser(deviceId, email) {
  // UPSERT atômico — previne TOCTOU race condition em chamadas concorrentes
  // Mapeia para INSERT ... ON CONFLICT (device_id) DO UPDATE no PostgreSQL
  const payload = {
    device_id: deviceId,
    email: email || null,
    last_seen_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'device_id', ignoreDuplicates: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---- Premium ----
async function activatePremium(userId, stripeSessionId, durationDays = 30) {
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

  // Usa upsert quando stripeSessionId está disponível (Stripe webhook)
  // Previne tokens duplicados se Stripe entregar o mesmo evento duas vezes
  // Requer UNIQUE constraint em premium_tokens(stripe_session_id) — ver schema.sql
  if (stripeSessionId) {
    const { error } = await supabase
      .from('premium_tokens')
      .upsert({
        user_id: userId,
        stripe_session_id: stripeSessionId,
        expires_at: expiresAt,
        is_active: true
      }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });

    if (error && !error.message?.includes('violates unique constraint')) {
      throw error;
    }
  } else {
    // Fallback para fluxo admin (PIN profissional) sem stripeSessionId
    const { error } = await supabase
      .from('premium_tokens')
      .insert({
        user_id: userId,
        stripe_session_id: null,
        expires_at: expiresAt,
        is_active: true
      });

    if (error) throw error;
  }
}

async function isPremiumActive(userId) {
  const { count, error } = await supabase
    .from('premium_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString());

  if (error) return false;
  return count > 0;
}

// ---- Consultations ----
async function saveConsultation(userId, profile, planJson) {
  await supabase
    .from('consultations')
    .insert({
      user_id: userId,
      profile_json: JSON.stringify(profile),
      plan_json: planJson ? JSON.stringify(planJson) : null
    });
}

async function getConsultations(userId, limit = 50, offset = 0) {
  const { data } = await supabase
    .from('consultations')
    .select('id, profile_json, plan_json, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return data || [];
}

async function getConsultationCount(userId) {
  const { count, error } = await supabase
    .from('consultations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count;
}

async function deleteConsultation(id, userId) {
  await supabase
    .from('consultations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
}

async function deleteUserData(userId) {
  // DELETE único — ON DELETE CASCADE no schema remove consultations e premium_tokens automaticamente
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) throw error;
}

async function findUserByEmail(email) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  return data || null;
}

module.exports = {
  findOrCreateUser,
  activatePremium,
  isPremiumActive,
  saveConsultation,
  getConsultations,
  getConsultationCount,
  deleteConsultation,
  deleteUserData,
  findUserByEmail
};
