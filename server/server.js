// ============================================================
// NutriCare API — Backend de Consulta Nutricional v2
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---- DB Health Check (evita restart loop no Render) ----
const DB_READY = !db._dbUnconfigured;
if (!DB_READY) {
  logger('ERROR', 'db', 'Banco de dados não configurado. Aplicação rodando com funcionalidades limitadas.');
}

// ---- Global Error Handlers (evita crash do servidor) ----
process.on('unhandledRejection', (reason) => {
  logger('ERROR', 'process', 'Unhandled Rejection', { message: reason?.message || String(reason) });
});
process.on('uncaughtException', (err) => {
  logger('ERROR', 'process', 'Uncaught Exception', { message: err.message, stack: err.stack?.substring(0, 300) });
});

// ---- Structured Logger ----
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;
const PII_FIELDS = ['weight', 'height', 'age', 'email', 'deviceId', 'device_id'];

function maskPII(data) {
  if (!data || typeof data !== 'object') return data;
  const masked = { ...data };
  for (const key of Object.keys(masked)) {
    if (PII_FIELDS.includes(key)) {
      masked[key] = '[REDACTED]';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskPII(masked[key]);
    }
  }
  return masked;
}

function logger(level, module, message, data) {
  if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...(data ? { data: maskPII(data) } : {})
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ---- Retry com Exponential Backoff ----
async function withRetry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, label = 'operation' } = options;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Exponential backoff with jitter: delay = min(baseDelay * 2^attempt + random(0, 1000), maxDelay)
        const jitter = Math.random() * 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
        logger('WARN', 'retry', `${label}: tentativa ${attempt + 1}/${maxRetries + 1} falhou, retry em ${Math.round(delay)}ms`, {
          error: err.message,
          attempt: attempt + 1,
          maxRetries
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  logger('ERROR', 'retry', `${label}: todas as ${maxRetries + 1} tentativas falharam`, { error: lastError.message });
  throw lastError;
}

// ---- Métricas In-Memory ----
const metrics = {
  requestsTotal: 0,
  requestsByEndpoint: {},
  errorsByEndpoint: {},
  latencyMsByEndpoint: {},
  startedAt: new Date().toISOString()
};

function trackMetrics(req, res, next) {
  metrics.requestsTotal++;
  const endpoint = req.route ? req.route.path : req.path;
  if (!metrics.requestsByEndpoint[endpoint]) {
    metrics.requestsByEndpoint[endpoint] = 0;
    metrics.errorsByEndpoint[endpoint] = 0;
    metrics.latencyMsByEndpoint[endpoint] = [];
  }
  metrics.requestsByEndpoint[endpoint]++;

  const start = Date.now();
  const originalEnd = res.end;
  res.end = function (...args) {
    const latency = Date.now() - start;
    metrics.latencyMsByEndpoint[endpoint].push(latency);
    // Keep only last 100 latency samples per endpoint
    if (metrics.latencyMsByEndpoint[endpoint].length > 100) {
      metrics.latencyMsByEndpoint[endpoint].shift();
    }
    if (res.statusCode >= 500) {
      metrics.errorsByEndpoint[endpoint]++;
    }
    return originalEnd.apply(this, args);
  };
  next();
}

// ---- Request ID Middleware ----
function requestIdMiddleware(req, res, next) {
  req.id = crypto_.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}

// ---- JWT Secret ----
const crypto_ = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  // Gera secret forte de 512 bits em modo dev (não persistido entre restarts)
  const devSecret = crypto_.randomBytes(64).toString('hex');
  logger('WARN', 'jwt', 'Usando JWT_SECRET auto-gerado. Configure um secret fixo em produção!');
  return devSecret;
})();

// ---- Stripe ----
let stripe;
try {
  const StripeKey = process.env.STRIPE_SECRET_KEY;
  if (StripeKey && StripeKey !== 'sk_test_placeholder') {
    stripe = require('stripe')(StripeKey);
  } else {
    logger('WARN', 'stripe', 'STRIPE_SECRET_KEY não configurada. Pagamentos premium desabilitados.');
    stripe = null;
  }
} catch (err) {
  logger('ERROR', 'stripe', 'Erro ao inicializar Stripe', { message: err.message });
  stripe = null;
}

const app = express();
const PORT = process.env.PORT || 3001;

// ---- Gemini AI ----
let geminiModel = null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    logger('INFO', 'gemini', 'Gemini AI inicializado com modelo gemini-2.0-flash');
  } catch (err) {
    logger('ERROR', 'gemini', 'Erro ao inicializar Gemini', { message: err.message });
  }
} else {
  logger('WARN', 'gemini', 'GEMINI_API_KEY não configurada. Chat IA desabilitado.');
}

// ---- Security Headers (helmet) ----
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.render.com", "https://*.supabase.co", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://js.stripe.com"]
    }
  }
}));

// ---- Webhook: raw body parser (MUST be before express.json!) ----
app.use('/api/stripe-webhook', express.raw({ type: 'application/json', limit: '16kb' }));

// ---- Rate Limiting (webhook excluído — Stripe retenta e varia IPs) ----
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/stripe-webhook',
  keyGenerator: (req) => req.ip
});
app.use('/api/', globalLimiter);

// Rate limits específicos por endpoint (protegem recursos críticos)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Limite de mensagens no chat excedido. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

const claimPremiumLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Muitas tentativas de ativação. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

const consultaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Limite de consultas excedido. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ---- Middleware ----
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : [
      /^http:\/\/localhost(:\d+)?$/,
      'https://johnnmacedo.github.io',
      'https://nutricare-api.onrender.com'
    ];
app.use(cors({ origin: CORS_ORIGINS, methods: ['GET', 'POST', 'DELETE'] }));
app.use(express.json({ limit: '500kb' }));
app.use(requestIdMiddleware);
app.use(trackMetrics);
app.use(morgan('\x1b[36m:method\x1b[0m :url \x1b[33m:status\x1b[0m \x1b[90m:response-time ms\x1b[0m', {
  skip: (req) => req.path === '/api/health' // Não poluir logs com health check
}));

// ---- Static Files (apenas raiz, sem expor subdiretórios) ----
app.use(express.static(path.join(__dirname, '..'), {
  dotfiles: 'ignore',
  index: 'index.html'
}));
// Bloqueia acesso a arquivos sensíveis
app.use(['/server/*', '/node_modules/*', '/.claude/*', '/.git/*', '/*.sql', '/*.env*'], (req, res) => {
  res.status(403).send('Acesso negado');
});

// ---- Request Log Helper (com PII masking) ----
function logRequest(title, data, req) {
  logger('INFO', 'request', title, { ...(data || {}), requestId: req?.id || 'none' });
}

// ---- Validação de entrada ----
const MAX_LENGTHS = {
  medications: 500,
  difficulties: 500,
  emotionalEating: 500,
  extraInfo: 1000,
  restrictionDetail: 500,
  diet: 2000,
  goal: 200,
  routine: 500,
  sleep: 100,
  activity: 100,
  name: 100
};

function validarProfile(p) {
  const erros = [];

  // Validação de campos numéricos
  const peso = parseFloat(p.weight);
  if (p.weight !== undefined && p.weight !== '') {
    if (isNaN(peso) || peso < 20 || peso > 500) {
      erros.push('Peso deve ser um número entre 20 e 500 kg');
    }
  }

  const altura = parseFloat(p.height);
  if (p.height !== undefined && p.height !== '') {
    if (isNaN(altura) || altura < 50 || altura > 250) {
      erros.push('Altura deve ser um número entre 50 e 250 cm');
    }
  }

  const idade = parseInt(p.age, 10);
  if (p.age !== undefined && p.age !== '') {
    if (isNaN(idade) || idade < 10 || idade > 120) {
      erros.push('Idade deve ser um número entre 10 e 120 anos');
    }
  }

  if (p.gender && !['Masculino', 'Feminino'].includes(p.gender)) {
    erros.push('Gênero deve ser Masculino ou Feminino');
  }

  if (p.goal && !p.goal.includes('Emagrecimento') && !p.goal.includes('massa muscular') && !p.goal.includes('Saúde') && !p.goal.includes('Bem-estar')) {
    erros.push('Objetivo inválido');
  }

  // Validação de comprimento máximo para campos de texto livre
  for (const [field, maxLen] of Object.entries(MAX_LENGTHS)) {
    if (p[field] && typeof p[field] === 'string' && p[field].length > maxLen) {
      erros.push(`${field} deve ter no máximo ${maxLen} caracteres`);
    }
    if (Array.isArray(p[field])) {
      const totalLen = p[field].reduce((acc, item) => acc + (typeof item === 'string' ? item.length : 0), 0);
      if (totalLen > maxLen) {
        erros.push(`${field} deve ter no máximo ${maxLen} caracteres no total`);
      }
    }
  }

  // Validação de restrictions array (whitelist de valores permitidos)
  if (Array.isArray(p.restrictions)) {
    const allowed = [
      'Diabetes', 'Hipertensão', 'Colesterol alto', 'Triglicérides altos',
      'Obesidade', 'Doença renal', 'Doença hepática', 'Hipotireoidismo',
      'Hipertireoidismo', 'Síndrome metabólica', 'Doença celíaca',
      'Intolerância à lactose', 'Refluxo', 'Gastrite', 'SII',
      'Nenhuma', 'Outros'
    ];
    for (const r of p.restrictions) {
      if (!allowed.includes(r) && r !== 'Outros') {
        erros.push(`Restrição "${r}" não reconhecida`);
      }
    }
  }

  return erros;
}

// ============================================================
// Health Check (sem cache)
// ============================================================
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  res.json({
    status: 'ok',
    service: 'NutriCare API',
    version: '2.0.0',
    database_connected: DB_READY,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// GET /api/metrics — Métricas de performance in-memory
// ============================================================
app.get('/api/metrics', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  const summary = {};
  for (const [ep, count] of Object.entries(metrics.requestsByEndpoint)) {
    const latencies = metrics.latencyMsByEndpoint[ep] || [];
    const avg = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    summary[ep] = {
      total: count,
      errors: metrics.errorsByEndpoint[ep] || 0,
      avgLatencyMs: avg,
      samples: latencies.length
    };
  }
  res.json({
    success: true,
    startedAt: metrics.startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    requestsTotal: metrics.requestsTotal,
    endpoints: summary
  });
});

// ============================================================
// Stripe Webhook (confirmação de pagamento)
// ============================================================
app.post('/api/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger('ERROR', 'webhook', 'STRIPE_WEBHOOK_SECRET não configurado — webhook rejeitado');
    return res.status(500).json({ error: 'webhook_not_configured' });
  }

  if (!stripe) {
    logger('ERROR', 'webhook', 'Stripe não inicializado');
    return res.status(500).json({ error: 'stripe_not_available' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger('ERROR', 'webhook', 'Falha na verificação da assinatura do webhook', { message: err.message });
    return res.status(400).send('Webhook Error: Invalid signature');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const deviceId = session.client_reference_id;
    const email = session.customer_details?.email;
    const planType = session.metadata?.plan_type || 'premium';
    const durationDays = parseInt(session.metadata?.duration_days || '30', 10);

    if (deviceId) {
      try {
        const user = await db.findOrCreateUser(deviceId, email);
        // activatePremium agora usa upsert com ON CONFLICT(stripe_session_id)
        // Garante idempotência mesmo que Stripe entregue o mesmo evento duas vezes
        await db.activatePremium(user.id, session.id, durationDays);
        logger('INFO', 'webhook', `Premium ativado para device ${deviceId}`, {
          userId: user.id,
          requestId: req.id,
          sessionId: session.id,
          planType,
          durationDays
        });
      } catch (err) {
        logger('ERROR', 'webhook', 'Erro ao ativar premium no webhook', {
          message: err.message,
          requestId: req.id,
          sessionId: session.id
        });
      }
    }
  }

  res.json({ received: true });
});

// ============================================================
// POST /api/claim-premium — Frontend solicita token JWT
// Rate limit: 5 req/min (claimPremiumLimiter)
// ============================================================
app.post('/api/claim-premium', claimPremiumLimiter, async (req, res) => {
  const { deviceId, sessionId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId é obrigatório' });
  }
  // Valida formato do deviceId — previne payloads maliciosos
  if (typeof deviceId !== 'string' || !/^[\w-]{8,128}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: 'deviceId inválido' });
  }

  try {
    let user = await db.findOrCreateUser(deviceId);
    let durationDays = 30; // default mensal

    // Se sessionId foi fornecido, verifica no Stripe com retry
    if (sessionId && stripe) {
      try {
        const session = await withRetry(
          () => stripe.checkout.sessions.retrieve(sessionId),
          { maxRetries: 2, baseDelay: 500, label: 'stripe-retrieve-session' }
        );
        if (session.payment_status === 'paid') {
          const planType = session.metadata?.plan_type || 'premium';
          durationDays = parseInt(session.metadata?.duration_days || '30', 10);
          await db.activatePremium(user.id, sessionId, durationDays);
          const email = session.customer_details?.email;
          if (email && email !== user.email) {
            user = await db.findOrCreateUser(deviceId, email);
          }
        }
      } catch (stripeErr) {
        logger('WARN', 'claim-premium', 'Erro ao verificar sessão Stripe', {
          message: stripeErr.message,
          requestId: req.id
        });
      }
    }

    const premium = await db.isPremiumActive(user.id);
    const token = premium ? jwt.sign(
      { userId: user.id, premium: true },
      JWT_SECRET,
      { expiresIn: '1h' }
    ) : null;

    res.json({
      success: true,
      premium,
      token,
      durationDays,
      expiresAt: premium ? new Date(Date.now() + durationDays * 86400000).toISOString() : null
    });
  } catch (err) {
    logger('ERROR', 'claim-premium', 'Erro no servidor', {
      message: err.message,
      requestId: req.id
    });
    res.status(500).json({ success: false, error: 'Erro no servidor' });
  }
});

// ============================================================
// GET /api/verify-token — Valida JWT ao carregar app
// Cache-Control: private (não cachear em proxies compartilhados)
// ============================================================
app.get('/api/verify-token', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ success: true, premium: false });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const premium = await db.isPremiumActive(decoded.userId);
    res.json({ success: true, premium });
  } catch (err) {
    res.json({ success: true, premium: false });
  }
});

// ============================================================
// POST /api/create-checkout-session — Inicia pagamento Stripe
// ============================================================
app.post('/api/create-checkout-session', claimPremiumLimiter, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ success: false, error: 'Pagamento indisponível no momento' });
    }

    const { planType, deviceId } = req.body;

    let priceData;
    if (planType === 'premium') {
      priceData = {
        price_data: {
          currency: 'brl',
          product_data: { name: 'NutriCare Premium' },
          unit_amount: 4990, // R$ 49,90 — mensal
        },
      };
    } else if (planType === 'trimestral') {
      priceData = {
        price_data: {
          currency: 'brl',
          product_data: { name: 'NutriCare Premium Trimestral' },
          unit_amount: 4900, // R$ 49,00 — trimestral
        },
      };
    } else {
      return res.status(400).json({ success: false, error: 'Tipo de plano inválido' });
    }

    const durationDays = planType === 'trimestral' ? 90 : 30;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: deviceId || 'unknown',
      line_items: [{ ...priceData, quantity: 1 }],
      metadata: { plan_type: planType, duration_days: String(durationDays) },
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/?premium=cancel`,
    });

    logger('INFO', 'checkout', `Sessão Stripe criada: ${session.id}`, { deviceId });
    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    logger('ERROR', 'checkout', 'Erro ao criar checkout', { message: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Erro ao iniciar pagamento' });
    }
  }
});

// ============================================================
// GET /api/verify-payment — Verifica status do pagamento (fallback pós-redirect Stripe)
// Nota: Stripe força redirect GET, então mantemos GET. A ativação real ocorre via webhook.
// NÃO faz mutação — apenas consulta. A ativação primária é no webhook.
// ============================================================
app.get('/api/verify-payment', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  try {
    if (!stripe) {
      return res.json({ success: true, paid: false, status: 'stripe_indisponivel' });
    }

    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id é obrigatório' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === 'paid';

    res.json({
      success: true,
      paid,
      status: session.payment_status
    });
  } catch (err) {
    logger('ERROR', 'verify-payment', 'Erro ao verificar pagamento', { message: err.message });
    if (!res.headersSent) {
      res.json({ success: true, paid: false, status: 'erro_verificacao' });
    }
  }
});

// ---- Middleware de Autenticação JWT ----
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de autenticação não fornecido' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
  }
}

// ============================================================
// POST /api/consultations/save — Salva consulta no servidor
// ============================================================
app.post('/api/consultations/save', authMiddleware, async (req, res) => {
  const { profile, plan } = req.body;
  const userId = req.user.userId;
  if (!userId || !profile) {
    return res.status(400).json({ success: false, error: 'userId e profile são obrigatórios' });
  }
  try {
    await db.saveConsultation(userId, profile, plan || null);
    res.json({ success: true });
  } catch (err) {
    logger('ERROR', 'save-consultation', 'Erro ao salvar consulta', { message: err.message });
    res.status(500).json({ success: false, error: 'Erro ao salvar consulta' });
  }
});

// ============================================================
// GET /api/consultations — Lista consultas
// Cache-Control: private (cache apenas no navegador do usuário, 30s)
// ============================================================
app.get('/api/consultations', authMiddleware, async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=30');
  res.setHeader('Vary', 'Authorization');
  const userId = req.user.userId;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId não encontrado no token' });
  }
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const data = await db.getConsultations(userId, limit, offset);
    const total = await db.getConsultationCount(userId);
    res.json({ success: true, data, total, limit, offset });
  } catch (err) {
    logger('ERROR', 'list-consultations', 'Erro ao listar consultas', { message: err.message });
    res.status(500).json({ success: false, error: 'Erro ao listar consultas' });
  }
});

// ============================================================
// DELETE /api/consultations/:id — Remove consulta
// ============================================================
app.delete('/api/consultations/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId não encontrado no token' });
  }
  try {
    await db.deleteConsultation(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    logger('ERROR', 'delete-consultation', 'Erro ao remover consulta', { message: err.message });
    res.status(500).json({ success: false, error: 'Erro ao remover consulta' });
  }
});

// ============================================================
// POST /api/account/delete — Exclui todos os dados do usuário (LGPD)
// ============================================================
app.post('/api/account/delete', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId não encontrado no token' });
  }
  try {
    await db.deleteUserData(userId);
    logger('INFO', 'account-delete', `Dados excluídos para userId ${userId}`);
    res.json({ success: true, message: 'Todos os dados foram excluídos' });
  } catch (err) {
    logger('ERROR', 'account-delete', 'Erro ao excluir dados', { message: err.message });
    res.status(500).json({ success: false, error: 'Erro ao excluir dados' });
  }
});

// ============================================================
// POST /api/chat — Bot Nutricionista (Gemini AI)
// Rate limit: 10 req/min (chatLimiter) — protege cota da API Gemini
// ============================================================
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Mensagem inválida' });
  }
  // Limita tamanho da mensagem para evitar abuso e custos excessivos na API Gemini
  if (message.length > 500) {
    return res.status(400).json({ success: false, error: 'Mensagem muito longa (máx 500 caracteres)' });
  }

  if (!geminiModel) {
    return res.status(503).json({ success: false, error: 'IA não disponível no momento' });
  }

  try {
    // Monta histórico da conversa (últimas 20 mensagens)
    const chatHistory = (history || []).slice(-20).map(msg => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Sistema prompt para o nutricionista
    const systemPrompt =
      'Você é o Bot Nutricionista do app NutriCare, um assistente de nutrição especializado. ' +
      'Responda SEMPRE em português brasileiro, com informações baseadas em ciência. ' +
      'Seja objetivo e direto — vá direto ao ponto sem rodeios. ' +
      'REGRAS DE OURO:\n' +
      '1. RESPONDA EXATAMENTE O QUE FOI PERGUNTADO. Se perguntarem "quais nutrientes", ' +
      'LISTE os nutrientes específicos (ex: vitamina C, zinco, selênio) e suas fontes. ' +
      'Só sugira cardápios/refeições se a pergunta for especificamente sobre "o que comer" ou "cardápio".\n' +
      '2. Máximo 3 parágrafos. Use tópicos (•) para listas — facilita a leitura no chat.\n' +
      '3. Se perguntarem algo fora de nutrição/alimentação, diga que você é especializado em nutrição.\n' +
      '4. NUNCA dê diagnósticos médicos, receitas complexas, nem prometa resultados milagrosos.\n' +
      '5. Incentive hábitos saudáveis e sustentáveis.';

    const chat = geminiModel.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido! Sou o Bot Nutricionista do NutriCare.' }] },
        ...chatHistory
      ]
    });

    // Chamada Gemini com retry automático (3 tentativas, exponential backoff)
    const result = await withRetry(
      () => chat.sendMessage(message),
      { maxRetries: 2, baseDelay: 1000, label: 'gemini-chat' }
    );
    const response = result.response.text();

    res.json({ success: true, response });
  } catch (err) {
    logger('ERROR', 'gemini', 'Erro no chat', {
      message: err.message,
      requestId: req.id
    });
    res.status(500).json({ success: false, error: 'Erro ao processar mensagem' });
  }
});

// ============================================================
// Error Middleware
// ============================================================
app.use((err, req, res, next) => {
  logger('ERROR', 'express', err.message, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    requestId: req.id || 'none',
    stack: err.stack?.substring(0, 500)
  });
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ============================================================
// POST /api/consulta — Gera plano nutricional
// ============================================================
app.post('/api/consulta', consultaLimiter, (req, res) => {
  const profile = req.body;

  logRequest('Nova consulta recebida', { goal: profile?.goal, gender: profile?.gender }, req);

  if (!profile || Object.keys(profile || {}).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Dados do perfil são obrigatórios'
    });
  }

  const erros = validarProfile(profile);
  if (erros.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Dados inválidos',
      detalhes: erros
    });
  }

  try {
    const plano = gerarPlanoCompleto(profile);

    logger('INFO', 'consulta', `Plano gerado para: ${profile.goal || 'perfil genérico'}`, {
      refeicoes: plano.refeicoes.length,
      estrategias: plano.estrategias.length,
      suplementos: plano.suplementos.length
    });

    res.json({
      success: true,
      data: plano,
      meta: {
        gerado_em: new Date().toISOString(),
        versao_algoritmo: '2.0.0',
        modo_ia_simulada: true
      }
    });
  } catch (err) {
    logger('ERROR', 'consulta', 'Erro ao gerar plano', { message: err.message });
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
    info_nutricional: gerarInfoNutricional(p),
    antropometrico: gerarDadosAntropometricos(p)
  };
}

// ============================================================
// Cálculos Antropométricos (TMB, IMC)
// ============================================================
function calcularTMB(p) {
  const peso = parseFloat(p.weight);
  const altura = parseFloat(p.height);
  const idade = parseInt(p.age, 10);
  if (!peso || !altura || !idade || isNaN(peso) || isNaN(altura) || isNaN(idade) || !p.gender) return null;
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
  let fator = isLoss ? 1.2 : isGain ? 1.6 : 1.4;
  if (p.activity === 'Sedentário') fator = Math.max(fator - 0.05, 1.1);
  else if (p.activity === 'Moderado') fator += 0.1;
  else if (p.activity === 'Intenso') fator += 0.2;
  return Math.round(tmb * fator);
}

function calcularIMC(p) {
  const peso = parseFloat(p.weight);
  const altura = parseFloat(p.height);
  if (!peso || !altura || isNaN(peso) || isNaN(altura)) return null;
  const imc = peso / Math.pow(altura / 100, 2);
  let categoria = '';
  if (imc < 18.5) categoria = 'Abaixo do peso';
  else if (imc < 25) categoria = 'Peso adequado';
  else if (imc < 30) categoria = 'Sobrepeso';
  else if (imc < 35) categoria = 'Obesidade grau I';
  else if (imc < 40) categoria = 'Obesidade grau II';
  else categoria = 'Obesidade grau III';
  return { valor: Math.round(imc * 10) / 10, categoria };
}

function gerarDadosAntropometricos(p) {
  return {
    peso: p.weight || null,
    altura: p.height || null,
    idade: p.age || null,
    sexo: p.gender || null,
    imc: calcularIMC(p),
    tmb: calcularTMB(p),
    get: calcularGET(p)
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

  const imcData = calcularIMC(p);
  const tmb = calcularTMB(p);
  const get = calcularGET(p);
  if (imcData) resumo.push(`IMC: ${imcData.valor} — ${imcData.categoria}`);
  if (tmb) resumo.push(`TMB: ${tmb} kcal/dia`);
  if (get) resumo.push(`GET: ${get} kcal/dia`);

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
  const peso = parseFloat(p.weight) || 70;

  const tmb = calcularTMB(p);
  const get = calcularGET(p);

  let calorias = get || (isLoss ? 1500 : isGain ? 2800 : 2000);
  let proteinas = isLoss ? 2.0 : isGain ? 2.2 : 1.6;
  let observacao = '';
  let macroSplit = { proteinasPct: 30, carboidratosPct: 40, gordurasPct: 30 };
  let distribuicaoRefeicoes = [];

  if (isLoss) {
    if (get) {
      observacao = `Déficit calórico de ${Math.round(calorias * 0.17)} kcal para perda de peso saudável (0.5-1kg/semana). TMB calculada: ${tmb} kcal/dia.`;
    } else {
      observacao = 'Déficit calórico moderado para perda de peso saudável (0.5-1kg/semana).';
    }
    macroSplit = { proteinasPct: 40, carboidratosPct: 30, gordurasPct: 30 };
    distribuicaoRefeicoes = [
      { refeicao: 'Café da Manhã', calorias: Math.round(calorias * 0.22), icon: '🌅' },
      { refeicao: 'Lanche da Manhã', calorias: Math.round(calorias * 0.08), icon: '🍎' },
      { refeicao: 'Almoço', calorias: Math.round(calorias * 0.33), icon: '🍚' },
      { refeicao: 'Lanche da Tarde', calorias: Math.round(calorias * 0.09), icon: '🥤' },
      { refeicao: 'Jantar', calorias: Math.round(calorias * 0.28), icon: '🌙' },
    ];
  } else if (isGain) {
    if (get) {
      observacao = `Superávit calórico de ${Math.round(calorias * 0.17)} kcal para ganho de massa magra. TMB calculada: ${tmb} kcal/dia.`;
    } else {
      observacao = 'Superávit calórico controlado para ganho de massa magra.';
    }
    macroSplit = { proteinasPct: 30, carboidratosPct: 45, gordurasPct: 25 };
    distribuicaoRefeicoes = [
      { refeicao: 'Café da Manhã', calorias: Math.round(calorias * 0.20), icon: '🌅' },
      { refeicao: 'Lanche da Manhã', calorias: Math.round(calorias * 0.09), icon: '🍎' },
      { refeicao: 'Almoço', calorias: Math.round(calorias * 0.30), icon: '🍚' },
      { refeicao: 'Lanche da Tarde', calorias: Math.round(calorias * 0.11), icon: '🥤' },
      { refeicao: 'Jantar', calorias: Math.round(calorias * 0.30), icon: '🌙' },
    ];
  } else {
    if (get) {
      observacao = `Plano de manutenção baseado no seu gasto energético total de ${get} kcal/dia.`;
    } else {
      observacao = 'Plano de manutenção com foco em qualidade nutricional e bem-estar.';
    }
    distribuicaoRefeicoes = [
      { refeicao: 'Café da Manhã', calorias: Math.round(calorias * 0.22), icon: '🌅' },
      { refeicao: 'Lanche da Manhã', calorias: Math.round(calorias * 0.08), icon: '🍎' },
      { refeicao: 'Almoço', calorias: Math.round(calorias * 0.32), icon: '🍚' },
      { refeicao: 'Lanche da Tarde', calorias: Math.round(calorias * 0.10), icon: '🥤' },
      { refeicao: 'Jantar', calorias: Math.round(calorias * 0.28), icon: '🌙' },
    ];
  }

  const proteinasG = Math.round(peso * proteinas);
  const proteinCal = proteinasG * 4;

  const remainingCal = Math.max(0, calorias - proteinCal);
  const carbRatio = macroSplit.carboidratosPct / (macroSplit.carboidratosPct + macroSplit.gordurasPct);
  const fatRatio = macroSplit.gordurasPct / (macroSplit.carboidratosPct + macroSplit.gordurasPct);
  const carboidratosG = Math.round((remainingCal * carbRatio) / 4);
  const gordurasG = Math.round((remainingCal * fatRatio) / 9);

  const realCarbCal = carboidratosG * 4;
  const realFatCal = gordurasG * 9;
  const realTotal = proteinCal + realCarbCal + realFatCal;
  const realProtPct = Math.round((proteinCal / realTotal) * 100);
  const realCarbPct = Math.round((realCarbCal / realTotal) * 100);
  const realFatPct = Math.round((realFatCal / realTotal) * 100);

  return {
    calorias_estimadas: calorias,
    proteinas_g_por_kg: proteinas,
    observacao,
    graficos: {
      totalCalorias: calorias,
      macronutrientes: {
        proteinas: { gramas: proteinasG, percentual: realProtPct },
        carboidratos: { gramas: carboidratosG, percentual: realCarbPct },
        gorduras: { gramas: gordurasG, percentual: realFatPct },
      },
      distribuicaoRefeicoes,
    }
  };
}

// ============================================================
// Iniciar Servidor
// ============================================================
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(48));
  console.log('  🌿 NutriCare API v2 — Servidor rodando');
  console.log('='.repeat(48));
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/api/health`);
  console.log(`  Metrics:  http://localhost:${PORT}/api/metrics`);
  console.log(`  Database: ${DB_READY ? '✅ Supabase' : '❌ Não configurado'}`);
  console.log(`  Stripe:   ${stripe ? '✅ Configurado' : '⏳ Aguardando chave'}`);
  console.log(`  JWT:      ${process.env.JWT_SECRET ? '✅ Configurado' : '⚠️  Modo dev'}`);
  console.log(`  Gemini:   ${geminiModel ? '✅ Pronto' : '⏳ Aguardando chave'}`);
  console.log(`  Rate limits:`);
  console.log(`    Global:   100 req/min`);
  console.log(`    Consulta:  30 req/min`);
  console.log(`    Chat:      10 req/min`);
  console.log(`    Premium:    5 req/min`);
  console.log('='.repeat(48) + '\n');
});
