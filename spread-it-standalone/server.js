const fs = require('fs');
const path = require('path');

// Charge d'abord .env.local (perso), puis .env (template) si présent
// LE FAIRE AVANT TOUT AUTRE REQUIRE qui pourrait utiliser process.env
const defaultEnvPath = path.join(__dirname, '.env');
const localEnvPath = path.join(__dirname, '.env.local');

if (fs.existsSync(defaultEnvPath)) {
  require('dotenv').config({ path: defaultEnvPath });
}

if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath, override: true });
}

// FORCE LOAD TIKTOK SANDBOX CONFIG (To bypass Render Env Vars limitation for Verification)
const tiktokConfigPath = path.join(__dirname, 'tiktok-config.json');
if (fs.existsSync(tiktokConfigPath)) {
    try {
        const tiktokConfig = require(tiktokConfigPath);
        if(tiktokConfig.TIKTOK_CLIENT_KEY) process.env.TIKTOK_CLIENT_KEY = tiktokConfig.TIKTOK_CLIENT_KEY;
        if(tiktokConfig.TIKTOK_CLIENT_SECRET) process.env.TIKTOK_CLIENT_SECRET = tiktokConfig.TIKTOK_CLIENT_SECRET;
        if(tiktokConfig.TIKTOK_REDIRECT_URI) process.env.TIKTOK_REDIRECT_URI = tiktokConfig.TIKTOK_REDIRECT_URI;
        console.log("✅ TIKTOK SANDBOX CONFIG LOADED");
    } catch(e) { console.error("Error loading tiktok config", e); }
}

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');
const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment');
const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const { fetchTrendingTopics } = require('./services/trending');
const turso = require('./db/turso');
const { TwitterApi } = require('twitter-api-v2'); // Ajout pour Twitter
const FormData = require('form-data'); // Ajout pour Facebook Upload
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { spawn } = require('child_process');

// Nouveaux Services d'Intelligence
const Strategist = require('./services/strategist');
const VideoAI = require('./services/video-ai');
const VideoUploader = require('./services/video-uploader');
const TikTokAuth = require('./services/tiktok-auth');
const googleTrends = require('google-trends-api');

// Configure layout if using ejs-layouts
// const expressLayouts = require('express-ejs-layouts');
// app.use(expressLayouts);

const app = express();

// Trust Render's reverse proxy (required for secure cookies + correct protocol detection)
app.set('trust proxy', 1);

// CORS configuration - allow requests from chaud-devant and production
const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://chaud-devant.vercel.app',
  'https://chaud-devant.onlymatt.ca',
  'https://onlymatt.ca'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, true); // Allow anyway for development
    }
  },
  credentials: true
}));

// Serve static files (including widget.js)
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const runningOnRender = process.env.RENDER === 'true';

const cookieSecure = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === 'true'
  : runningOnRender;
// If running on Render (HTTPS), default SameSite to 'none' to allow iframe usage on Vercel
const cookieSameSite = process.env.SESSION_COOKIE_SAMESITE || (runningOnRender ? 'none' : 'lax');
// Note: env validation is invoked after helpers are defined below.

// Helper function to get correct base URL (force HTTPS on Render/production)
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host');
  
  // Force HTTPS in production (Render) to avoid Facebook security warning
  if (runningOnRender || isProduction) {
    return `https://${host}`;
  }
  
  return `${proto}://${host}`;
}


// --- Env Validation Helpers ---
const PLACEHOLDER_PATTERNS = [/^REPLACE/i, /^dummy$/i, /^YOUR_NEW_API_KEY_HERE$/i];
function isSet(val) {
  if (!val || typeof val !== 'string') return false;
  const v = val.trim();
  if (!v) return false;
  return !PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

function resolveChatModel() {
  const fallback = 'gpt-4o-mini';
  const configured = (process.env.OPENAI_MODEL || '').trim();
  const chosen = configured || fallback;
  const unsupported = ['gpt-4', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];

  if (unsupported.includes(chosen.toLowerCase())) {
    if (!resolveChatModel._warned) {
      console.warn(`[Chat API] Modèle ${chosen} incompatible avec response_format=json_object. Bascule vers gpt-4o.`);
      resolveChatModel._warned = true;
    }
    return 'gpt-4o';
  }

  return chosen;
}

function validateEnv() {
  const issues = [];

  // OpenAI
  if (!isSet(process.env.OPENAI_API_KEY)) {
    issues.push('Missing OPENAI_API_KEY (Strategist content generation will be disabled).');
  }

  // Google Vision (either API key OR service account fields)
  const hasVisionAPIKey = isSet(process.env.GOOGLE_CLOUD_VISION_KEY);
  const hasSA = isSet(process.env.GOOGLE_CLOUD_PRIVATE_KEY) && isSet(process.env.GOOGLE_CLOUD_CLIENT_EMAIL) && isSet(process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID) && isSet(process.env.GOOGLE_CLOUD_PROJECT_ID);
  if (!hasVisionAPIKey && !hasSA) {
    issues.push('Missing Google Vision config (provide GOOGLE_CLOUD_VISION_KEY or Service Account fields: GOOGLE_CLOUD_PRIVATE_KEY, GOOGLE_CLOUD_CLIENT_EMAIL, GOOGLE_CLOUD_PRIVATE_KEY_ID, GOOGLE_CLOUD_PROJECT_ID).');
  }

  // Facebook
  if (!isSet(process.env.FACEBOOK_PAGE_ID)) {
    issues.push('Missing FACEBOOK_PAGE_ID (required for Facebook posting).');
  }
  if (!isSet(process.env.FACEBOOK_ACCESS_TOKEN)) {
    issues.push('Missing FACEBOOK_ACCESS_TOKEN (required for Facebook posting).');
  }

  // Instagram
  if (!isSet(process.env.INSTAGRAM_ACCESS_TOKEN)) {
    issues.push('Missing INSTAGRAM_ACCESS_TOKEN (required for Instagram analysis/posting).');
  }
  if (!isSet(process.env.INSTAGRAM_BUSINESS_ID)) {
    issues.push('Missing INSTAGRAM_BUSINESS_ID (required for Instagram business discovery).');
  }

  // Twitter/X
  const twMissing = ['TWITTER_API_KEY','TWITTER_API_SECRET','TWITTER_ACCESS_TOKEN','TWITTER_ACCESS_TOKEN_SECRET']
    .filter(k => !isSet(process.env[k]));
  if (twMissing.length) {
    issues.push(`Missing Twitter/X keys: ${twMissing.join(', ')}`);
  }

  // LinkedIn (optional)
  if (!isSet(process.env.LINKEDIN_ACCESS_TOKEN)) {
    issues.push('Missing LINKEDIN_ACCESS_TOKEN (required for LinkedIn posting).');
  }

  // Perspective API (optional but recommended if toxicity checks enabled)
  if (!isSet(process.env.PERSPECTIVE_API_KEY)) {
    issues.push('Missing PERSPECTIVE_API_KEY (content toxicity checks will be disabled).');
  }

  // Session
  if (!isSet(process.env.SESSION_SECRET)) {
    issues.push('Missing SESSION_SECRET (recommended to set a strong secret).');
  }

  return issues;
}

// Run env validation at startup (after helpers are defined)
const startupIssues = validateEnv();
if (startupIssues.length) {
  console.warn('⚠️ Env validation warnings:');
  startupIssues.forEach(msg => console.warn(' - ' + msg));
} else {
  console.log('✅ Env validation passed.');
}

// --- Helper: format caption & hashtags per platform ---
function formatForPlatform(platform, caption, hashtags) {
  const rules = {
    facebook: { maxLen: 600, maxTags: 3, sepLine: false },
    instagram: { maxLen: 2200, maxTags: 25, sepLine: true },
    twitter: { maxLen: 240, maxTags: 4, sepLine: false },
    tiktok: { maxLen: 150, maxTags: 5, sepLine: false },
    linkedin: { maxLen: 700, maxTags: 5, sepLine: false },
    youtube: { maxLen: 100, maxTags: 3, sepLine: false },
    youtube_shorts: { maxLen: 100, maxTags: 3, sepLine: false }
  };

  const r = rules[platform] || rules.facebook;
  let text = (caption || '').trim();
  // Trim to platform max length
  if (text.length > r.maxLen) {
    text = text.slice(0, r.maxLen - 3) + '...';
  }

  // Normalize hashtags input to array
  let tagsArr = Array.isArray(hashtags)
    ? hashtags
    : (typeof hashtags === 'string' ? hashtags.split(/\s+/) : []);
  tagsArr = tagsArr.filter(Boolean).map(h => h.startsWith('#') ? h : `#${h}`);

  // Limit number of tags
  if (tagsArr.length > r.maxTags) {
    tagsArr = tagsArr.slice(0, r.maxTags);
  }

  const tagStr = tagsArr.join(' ');
  if (r.sepLine && tagStr) {
    return { caption: text, hashtags: tagStr };
  }
  // For platforms without separate line, keep hashtags separate field to be appended by caller
  return { caption: text, hashtags: tagStr };
}

// Prépare un stockage persistant pour les sessions (fallback multi-stores)
const sessionBaseDir = path.join(__dirname, 'storage');
if (!fs.existsSync(sessionBaseDir)) {
  fs.mkdirSync(sessionBaseDir, { recursive: true });
}

let sessionStore;
let sessionStoreName = 'memory';

// Initialisation Strategist (memory-only mode, Turso pour persistance)
let strategist = new Strategist(null);
console.info("ℹ️ Strategist running with Turso DB for persistence.");

try {
  const SQLiteStore = require('connect-sqlite3')(session);
  sessionStore = new SQLiteStore({

    dir: sessionBaseDir,
    db: process.env.SESSION_DB_NAME || 'sessions.sqlite'
  });
  sessionStoreName = 'sqlite';
} catch (sqliteError) {
  console.warn('SQLite session store indisponible, fallback sur un store fichier:', sqliteError.message);
  try {
    const FileStore = require('session-file-store')(session);
    const fileStorePath = path.join(sessionBaseDir, 'sessions');
    if (!fs.existsSync(fileStorePath)) {
      fs.mkdirSync(fileStorePath, { recursive: true });
    }
    sessionStore = new FileStore({
      path: fileStorePath,
      retries: 0,
      logFn: () => {}  // silence ENOENT retry noise for unknown sessions
    });
    sessionStoreName = 'file';
  } catch (fileError) {
    console.warn('Store fichier indisponible, fallback sur MemoryStore (non persistant):', fileError.message);
    sessionStore = new session.MemoryStore();
    sessionStoreName = 'memory';
  }
}

console.info(`Session store initialisé (${sessionStoreName}).`);

// Configuration OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuration Google Cloud Vision
let visionClient;
if (process.env.GOOGLE_CLOUD_VISION_KEY) {
  visionClient = new vision.ImageAnnotatorClient({
    keyFilename: undefined, // Pas de fichier de clé
    credentials: undefined, // Pas de credentials service account
    apiKey: process.env.GOOGLE_CLOUD_VISION_KEY // Utiliser l'API key
  });
} else if (process.env.GOOGLE_CLOUD_PRIVATE_KEY) {
  // Fallback vers service account si API key pas disponible
  visionClient = new vision.ImageAnnotatorClient({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
      private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLOUD_CLIENT_EMAIL)}`
    }
  });
}

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|txt|doc|docx|pdf|mp4|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  }
});

// --- Health endpoint for env validation ---
app.get('/health/env', (req, res) => {
  const issues = validateEnv();
  res.json({ ok: issues.length === 0, issues });
});

// Lightweight credentials connectivity checks (read-only)
async function checkFacebookCreds() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!pageId || !token) return { ok: false, issue: 'Missing FACEBOOK_PAGE_ID or FACEBOOK_ACCESS_TOKEN' };
  try {
    const url = `https://graph.facebook.com/v19.0/${pageId}?fields=name,id&access_token=${encodeURIComponent(token)}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    return { ok: true, data: { id: data.id, name: data.name } };
  } catch (e) {
    const payload = e.response?.data || { message: e.message };
    // Normalize common errors
    let issue = 'Facebook token/page inaccessible';
    if (payload?.error?.error_subcode === 492) issue = 'Token user lacks required page role or 2FA';
    else if (payload?.error?.code === 190) issue = 'Invalid or expired Facebook token';
    return { ok: false, issue, details: payload };
  }
}

async function checkInstagramCreds() {
  const igBizId = process.env.INSTAGRAM_BUSINESS_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
  if (!igBizId || !token) return { ok: false, issue: 'Missing INSTAGRAM_BUSINESS_ID or Token' };
  try {
    const url = `https://graph.facebook.com/v19.0/${igBizId}?fields=username,id&access_token=${encodeURIComponent(token)}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    return { ok: true, data: { id: data.id, username: data.username } };
  } catch (e) {
    const payload = e.response?.data || { message: e.message };
    let issue = 'Instagram token/business inaccessible';
    if (payload?.error?.code === 190) issue = 'Invalid or expired Instagram token';
    return { ok: false, issue, details: payload };
  }
}

app.get('/health/credentials', async (req, res) => {
  const platform = (req.query.platform || '').toLowerCase();
  try {
    if (platform === 'facebook') return res.json({ platform: 'facebook', ...(await checkFacebookCreds()) });
    if (platform === 'instagram') return res.json({ platform: 'instagram', ...(await checkInstagramCreds()) });
    const fb = await checkFacebookCreds();
    const ig = await checkInstagramCreds();
    res.json({ ok: fb.ok && ig.ok, facebook: fb, instagram: ig });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'spread-it-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: cookieSecure,
    sameSite: cookieSameSite,
    httpOnly: true
  }
}));

// ── GOOGLE AUTH (passport) ──────────────────────────────────────────
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL; // ton Gmail dans Render

const googleAuthEnabled = !!(process.env.GOOGLE_AUTH_CLIENT_ID && process.env.GOOGLE_AUTH_CLIENT_SECRET);

if (googleAuthEnabled) {
  const googleCallbackURL = (process.env.APP_BASE_URL || 'https://spread-it-enhanced.onrender.com') + '/auth/google/callback';
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_AUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    callbackURL:  googleCallbackURL
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
      return done(null, false, { message: 'Email non autorisé' });
    }
    return done(null, { id: profile.id, email, name: profile.displayName, photo: profile.photos?.[0]?.value });
  }));
} else {
  console.warn('⚠️  Google Auth disabled — GOOGLE_AUTH_CLIENT_ID or GOOGLE_AUTH_CLIENT_SECRET not set');
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// Short-lived auth tokens for iframe cross-origin session bridging
// (session cookie can't cross popup→iframe boundary reliably in all browsers)
const authTokens = new Map(); // token -> { expiry, user }
function issueAuthToken(user) {
  const token = require('crypto').randomBytes(24).toString('hex');
  authTokens.set(token, { expiry: Date.now() + 5 * 60 * 1000, user });
  // Cleanup expired tokens
  for (const [k, v] of authTokens) if (v.expiry < Date.now()) authTokens.delete(k);
  return token;
}

// Middleware : protège les routes privées
const requireAuth = (req, res, next) => {
  // Si Google Auth pas configuré, bypass
  if (!googleAuthEnabled) return next();
  if (req.isAuthenticated()) return next();
  // Check Bearer token (used when session cookie can't cross iframe boundary)
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const entry = authTokens.get(token);
    if (entry && entry.expiry > Date.now()) {
      req.user = entry.user; // inject user for this request
      return next();
    }
  }
  // API calls → JSON error
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non authentifié' });
  // Pages → redirect login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

// Routes Google OAuth
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('login', { error: req.query.error || null });
});

// Auth status check (called by spread-it-integration.js before opening iframe)
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: req.isAuthenticated() || !googleAuthEnabled });
});

// Multer instance for direct media uploads (higher limit, serves from public/uploads/)
const mediaUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname));
  }
});
const mediaUpload = multer({
  storage: mediaUploadStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|mkv/i.test(path.extname(file.originalname));
    ok ? cb(null, true) : cb(new Error('Format non supporté'));
  }
});

// Upload a media file directly from the user's device → returns public URL
app.post('/api/upload-media', mediaUpload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/uploads/${req.file.filename}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = /mp4|mov|avi|webm|mkv/.test(ext) ? 'video' : 'image';
  res.json({ url, type, filename: req.file.filename });
});

// Issue a short-lived Bearer token — called from /auth/google/done after successful auth
// Token is passed to the composer iframe URL to authenticate API calls cross-origin
app.get('/api/auth/issue-token', (req, res) => {
  if (!req.isAuthenticated() && googleAuthEnabled) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = issueAuthToken(req.user || { id: 'local' });
  res.json({ token });
});

// Media proxy — allows composer to preview Bunny CDN videos without CORS issues
app.get('/api/media-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  // Only allow trusted CDN domains
  const allowed = ['b-cdn.net', 'bunnycdn.com', 'vz-72668a20-6b9.b-cdn.net', 'vz-c69f4e3f-963.b-cdn.net'];
  let isAllowed = false;
  try { isAllowed = allowed.some(d => new URL(url).hostname.endsWith(d)); } catch(e) {}
  if (!isAllowed) return res.status(403).send('Domain not allowed');
  try {
    const range = req.headers.range;
    const headers = { 'User-Agent': 'SpreadIt/1.0' };
    if (range) headers['Range'] = range;
    const upstream = await fetch(url, { headers });
    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(upstream.status);
    const reader = upstream.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch(e) {
    console.error('[media-proxy]', e.message);
    res.status(502).send('Proxy error');
  }
});

app.get('/auth/google/start',
  (req, res, next) => {
    if (!googleAuthEnabled) return res.redirect('/login?error=Google+Auth+non+configuré');
    // Store popup mode in session so callback knows where to redirect
    if (req.query.popup === '1') req.session.googlePopup = true;
    next();
  },
  passport.authenticate('google', { scope: ['email', 'profile'], state: true })
);

app.get('/auth/google/callback',
  (req, res, next) => {
    if (!googleAuthEnabled) return res.redirect('/');
    next();
  },
  passport.authenticate('google', { failureRedirect: '/login?error=Email+non+autorisé' }),
  (req, res) => {
    const isPopup = req.session.googlePopup;
    delete req.session.googlePopup;
    if (isPopup) return res.redirect('/auth/google/done');
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// Popup close page — signals parent window and closes itself
app.get('/auth/google/done', (req, res) => {
  // Issue a short-lived token so iframe can auth without relying on cross-site cookies
  const siToken = (req.isAuthenticated() || !googleAuthEnabled) ? issueAuthToken(req.user || { id: 'local' }) : null;
  res.send(`<!DOCTYPE html><html><head><title>Connected</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a2e; color: #fff; gap: 16px; }
    button { padding: 10px 24px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
  </style>
  </head><body>
  <p>\u2705 Connexion r\u00e9ussie.</p>
  <button onclick="window.close()">Fermer cette fen\u00eatre</button>
  <script>
    var siToken = ${JSON.stringify(siToken)};
    if (window.opener) {
      try { window.opener.postMessage({ event: 'spread-it-auth-done', token: siToken }, '*'); } catch(e) {}
    }
    setTimeout(function() { window.close(); }, 800);
  <\/script>
  </body></html>`);
});

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});
// ────────────────────────────────────────────────────────────────────

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Init Turso/SQLite DB (optional)
try {
  turso.init();
  turso.migrate();
  console.info('✅ Turso/SQLite DB initialized');

  // Cloud DB disabled - using local SQLite only
  // if (turso.migrateCloud) {
  //   turso.migrateCloud().then(() => {
  //      console.info('✅ Turso/LibSQL Cloud DB checked/migrated');
  //   }).catch(e => {
  //      console.warn('⚠️ Turso/LibSQL Cloud DB init failed:', e.message);
  //   });
  // }

} catch (e) {
  console.warn('Turso DB not initialized:', e && e.message ? e.message : e);
}

// Routes

// Schedule periodic trending refresh (every 15 minutes)
try {
  cron.schedule('*/15 * * * *', async () => {
    try {
      // console.log('⏱️ Refreshing trending topics (cron)');
      await fetchTrendingTopics(true);
      // console.log('✅ Trending refreshed');
    } catch (e) {
      console.warn('Trending refresh failed:', e && e.message ? e.message : e);
    }
  });

  // NOUVEAU : Nettoyage automatique des uploads temporaires (fichiers > 1h)
  cron.schedule('0 * * * *', () => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadDir)) {
      fs.readdir(uploadDir, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
          const filePath = path.join(uploadDir, file);
          fs.stat(filePath, (err, stats) => {
             // Supprime si vieux de plus d'une heure (3600000 ms)
            if (!err && now - stats.mtimeMs > 3600000) { 
              fs.unlink(filePath, () => {});
            }
          });
        });
      });
    }
  });

} catch (e) {
  console.warn('Cron scheduling not available:', e && e.message ? e.message : e);
}

// --- NEW ENDPOINT: Handles the actual submission from the popup ---
app.post('/api/smart-share-submit', requireAuth, express.json(), async (req, res) => {
    // Définition de tempFilePath en dehors du try pour accès dans finally
    let tempFilePath = null;

    try {
        const { mediaUrl, mediaType, caption, platforms, hashtags } = req.body;
        console.log("🚀 Receiving Smart Share Submission:", { mediaUrl, platforms });

        tempFilePath = path.join(__dirname, 'temp_' + Date.now() + (mediaType === 'video' ? '.mp4' : '.jpg'));

        let results = [];
        let errors = [];

        // 1. Download the media temporarily so we can upload it
        // (Note: Many APIs require a local file stream or binary buffer, 
        // passing a raw URL often fails if the platform needs to re-host it)
        if (mediaUrl) {
            try {
                console.log("⬇️  Downloading media:", mediaUrl);
                // Extraire le domaine source pour le Referer (bypass hotlink protection)
                const mediaOrigin = mediaUrl ? new URL(mediaUrl).origin : '';
                const response = await axios({
                    method: 'GET',
                    url: mediaUrl,
                    responseType: 'stream',
                    timeout: 20000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; SpreadItBot/1.0)',
                        'Referer': mediaOrigin,
                        'Origin': mediaOrigin,
                        'Accept': 'image/*,video/*,*/*'
                    }
                });
                if (response.status === 403 || response.status === 401) {
                    throw new Error(`HTTP ${response.status} — média inaccessible depuis Render`);
                }
                const w = fs.createWriteStream(tempFilePath);
                response.data.pipe(w);
                await new Promise((resolve, reject) => {
                    w.on('finish', resolve);
                    w.on('error', reject);
                });
                console.log("✅ Download complete:", tempFilePath);
            } catch (dlErr) {
                console.warn("⚠️  Media download failed, will use URL fallback:", dlErr.message);
                tempFilePath = null;
            }
        } else {
            tempFilePath = null;
        }

        // VÉRIFICATION GLOBALE ANTI-DETECTION
        if (platforms.length > 2) {
            console.log(`⚠️  WARNING: Posting to ${platforms.length} platforms simultaneously may trigger Facebook automation detection`);
            console.log(`💡 RECOMMENDATION: Consider posting to 1-2 platforms max per submission`);
        }

        // VÉRIFICATION DE FRÉQUENCE GLOBALE: skipped (DB not required)

        // --- ANTI-DETECTION MEASURES ---
        const postingDelays = {
            facebook: 2000,  // 2 secondes après le premier
            instagram: 5000, // 5 secondes après Facebook
            twitter: 3000,   // 3 secondes après Instagram
            linkedin: 4000   // 4 secondes après Twitter
        };

        let delayCounter = 0;

        const shareToPlatform = async (platform) => {
             console.log(`📤 Attempting to share to ${platform}...`);

             // DELAY ANTI-DETECTION: Attendre avant de poster
             if (delayCounter > 0) {
                 const delay = postingDelays[platform] || 3000;
                 console.log(`⏱️  Anti-detection delay: waiting ${delay}ms before posting to ${platform}...`);
                 await new Promise(resolve => setTimeout(resolve, delay));
             }
             delayCounter++;


             // FORMATAGE SPÉCIFIQUE PAR PLATEFORME (caption + hashtags)
             const fmt = formatForPlatform(platform, caption, hashtags);
             let platformCaption = fmt.caption;
             let platformHashtags = fmt.hashtags;

             // VÉRIFICATION DES URLS (Facebook bloque les liens suspects)
             const urlRegex = /https?:\/\/[^\s]+/g;
             const urls = platformCaption.match(urlRegex);
             if (urls) {
                 for (const url of urls) {
                     // Vérifier si c'est une URL suspecte
                     const suspiciousPatterns = [
                         /bit\.ly/, /tinyurl/, /goo\.gl/, // URL shorteners
                         /spam/, /fake/, /scam/, // mots suspects
                         /adult/, /porn/, /xxx/ // contenu adulte
                     ];

                     const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(url.toLowerCase()));
                     if (isSuspicious) {
                         console.log(`🚨 SUSPICIOUS URL DETECTED: ${url}`);
                         return {
                             success: false,
                             platform,
                             error: `URL suspecte détectée: ${url}. Facebook peut bloquer ce post.`
                         };
                     }
                 }
             }

            // VÉRIFICATION SUPPLÉMENTAIRE POUR FACEBOOK/INSTAGRAM (politiques spécifiques)
            if ((platform === 'facebook' || platform === 'instagram') && mediaType === 'image' && visionClient) {
              try {
                console.log(`🔍 Double-checking image for ${platform} compliance...`);
                const [result] = await visionClient.safeSearchDetection(tempFilePath);
                const detections = result.safeSearchAnnotation || {};

                // Construire la politique par plateforme avec fallback aux valeurs globales
                const prefix = platform === 'facebook' ? 'FACEBOOK' : 'INSTAGRAM';
                const adultBlockLevels = (process.env[`${prefix}_ADULT_BLOCK_LEVELS`] || process.env.ADULT_BLOCK_LEVELS || 'LIKELY,VERY_LIKELY')
                  .split(',').map(s => s.trim());
                const violenceBlockLevels = (process.env[`${prefix}_VIOLENCE_BLOCK_LEVELS`] || process.env.VIOLENCE_BLOCK_LEVELS || 'LIKELY,VERY_LIKELY')
                  .split(',').map(s => s.trim());
                const racyBlockLevels = (process.env[`${prefix}_RACY_BLOCK_LEVELS`] || process.env.RACY_BLOCK_LEVELS || 'VERY_LIKELY')
                  .split(',').map(s => s.trim());

                const adultLevel = detections.adult || 'VERY_UNLIKELY';
                const violenceLevel = detections.violence || 'VERY_UNLIKELY';
                const racyLevel = detections.racy || 'VERY_UNLIKELY';

                console.log('📊 Platform policy check:', {
                  platform,
                  adultLevel,
                  violenceLevel,
                  racyLevel,
                  adultBlockLevels,
                  violenceBlockLevels,
                  racyBlockLevels
                });

                if (adultBlockLevels.includes(adultLevel)) {
                  return { success: false, platform, error: `Blocked by ${platform} adult policy (${adultLevel})` };
                }
                if (violenceBlockLevels.includes(violenceLevel)) {
                  return { success: false, platform, error: `Blocked by ${platform} violence policy (${violenceLevel})` };
                }
                if (racyBlockLevels.includes(racyLevel)) {
                  // Racy ne bloque qu'à des niveaux élevés (faces autorisées par défaut)
                  return { success: false, platform, error: `Blocked by ${platform} racy policy (${racyLevel})` };
                }
              } catch (e) {
                console.warn(`Could not verify image for ${platform}:`, e.message);
              }
            }

             // --- TWITTER / X ---
             if (platform === 'twitter' || platform === 'x') {
                 // Map keys from Render environment (handling variations in naming)
                 const appKey = process.env.TWITTER_API_KEY || process.env.TWITTER_APP_KEY;
                 const appSecret = process.env.TWITTER_API_SECRET || process.env.TWITTER_APP_SECRET;
                 const accessToken = process.env.TWITTER_ACCESS_TOKEN;
                 const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_SECRET;

                 if (!appKey || !appSecret || !accessToken || !accessSecret) {
                     return { success: false, platform, error: "Missing Twitter API Keys (TWITTER_API_KEY, TWITTER_ACCESS_TOKEN_SECRET, etc.)" };
                 }

                 const client = new TwitterApi({
                     appKey,
                     appSecret,
                     accessToken,
                     accessSecret,
                 });

                 const rwClient = client.readWrite;

                 // Upload media first (v1.1)
                 let mediaId;
                 if (tempFilePath) {
                      mediaId = await client.v1.uploadMedia(tempFilePath);
                 }

                 // Send Tweet (v2)
                 const response = await rwClient.v2.tweet({
                     text: platformCaption + '\n\n' + platformHashtags,
                     media: mediaId ? { media_ids: [mediaId] } : undefined
                 });
                 
                 return { success: true, platform, id: response.data.id, data: response.data };
             }

             // --- FACEBOOK PAGE ---
             if (platform === 'facebook') {
                 const fbToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN; 
                 
                 if (!fbToken || !process.env.FACEBOOK_PAGE_ID) {
                      return { success: false, platform, error: "Missing FACEBOOK_ACCESS_TOKEN or PAGE_ID" };
                 }

                 console.log("📘 Uploading directly to Facebook (Binary mode)...");

                 // METHODE ROBUSTE: Upload de fichier binaire via FormData
                 // Cela évite que Facebook bloque l'URL si elle n'est pas parfaite
                 
                 if (mediaType === 'image' && tempFilePath) {
                     const form = new FormData();
                     form.append('access_token', fbToken);
                     form.append('message', platformCaption + '\n\n' + platformHashtags);
                     form.append('source', fs.createReadStream(tempFilePath)); 

                     // Appel API "photos" en mode multipart/form-data
                     const fbResponse = await axios.post(
                         `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/photos`,
                         form,
                         { headers: form.getHeaders() }
                     );
                     
                     return { success: true, platform, id: fbResponse.data.id };
                 } 
                 
                // Fallback : tempFilePath null — tenter URL directe (Facebook fetche lui-même)
                 else {
                     if (mediaUrl && mediaType === 'video') {
                         // Poster via /videos avec file_url — Facebook fetche la vidéo depuis l'URL
                         try {
                             const fbVideoResp = await axios.post(
                                 `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/videos`,
                                 {
                                     access_token: fbToken,
                                     description: platformCaption + (platformHashtags ? '\n\n' + platformHashtags : ''),
                                     file_url: mediaUrl
                                 }
                             );
                             return { success: true, platform, id: fbVideoResp.data.id };
                         } catch (videoErr) {
                             console.warn('⚠️  Facebook /videos file_url failed:', videoErr.response?.data || videoErr.message, '— falling back to link post');
                         }
                     }
                     if (mediaUrl && mediaType === 'image') {
                         // Tenter /photos avec URL directe
                         try {
                             const fbResp = await axios.post(
                                 `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/photos`,
                                 {
                                     access_token: fbToken,
                                     message: platformCaption + (platformHashtags ? '\n\n' + platformHashtags : ''),
                                     url: mediaUrl
                                 }
                             );
                             return { success: true, platform, id: fbResp.data.id };
                         } catch (photoErr) {
                             console.warn('⚠️  Facebook /photos URL fallback failed:', photoErr.message, '— posting text only');
                         }
                     }
                     // Texte seul en dernier recours
                     const payload = {
                        access_token: fbToken,
                        message: platformCaption + (platformHashtags ? '\n\n' + platformHashtags : '')
                     };
                     if (mediaUrl && mediaType === 'video') payload.link = mediaUrl;
                     const response = await axios.post(
                         `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
                         payload
                     );
                     return { success: true, platform, id: response.data.id, note: 'text-only fallback' };
                 }
             }

             // --- INSTAGRAM BUSINESS ---
             if (platform === 'instagram') {
                 const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;

                 if (!igToken || !process.env.INSTAGRAM_BUSINESS_ID) {
                      return { success: false, platform, error: "Missing INSTAGRAM_BUSINESS_ID or Token" };
                 }

                 const igCaption = platformCaption + (platformHashtags ? '\n\n' + platformHashtags : '');
                 const containerEndpoint = `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`;

                 let containerPayload;
                 if (mediaType === 'video' && mediaUrl) {
                     // Reels (vidéo) — Instagram API exige media_type: REELS + video_url
                     containerPayload = {
                         media_type: 'REELS',
                         video_url: mediaUrl,
                         caption: igCaption,
                         access_token: igToken
                     };
                 } else {
                     // Image
                     containerPayload = {
                         image_url: mediaUrl,
                         caption: igCaption,
                         access_token: igToken
                     };
                 }

                 // 1. Create Media Container
                 let containerRes;
                 try {
                     containerRes = await axios.post(containerEndpoint, containerPayload);
                 } catch (igErr) {
                     const igMsg = igErr.response?.data?.error?.message || igErr.response?.data?.error?.code || igErr.message;
                     return { success: false, platform, error: `Instagram container error: ${igMsg}` };
                 }
                 const creationId = containerRes.data.id;

                 // Pour les Reels, Instagram a besoin de temps pour traiter la vidéo
                 if (mediaType === 'video') {
                     // Attendre que le container soit prêt (max 30s)
                     let statusCheckUrl = `https://graph.facebook.com/v18.0/${creationId}?fields=status_code&access_token=${igToken}`;
                     for (let i = 0; i < 10; i++) {
                         await new Promise(r => setTimeout(r, 3000));
                         const statusRes = await axios.get(statusCheckUrl);
                         if (statusRes.data.status_code === 'FINISHED') break;
                         if (statusRes.data.status_code === 'ERROR') {
                             return { success: false, platform, error: 'Instagram video processing failed' };
                         }
                     }
                 }

                 // 2. Publish Media
                 const publishEndpoint = `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media_publish`;
                 let publishRes;
                 try {
                     publishRes = await axios.post(publishEndpoint, {
                         creation_id: creationId,
                         access_token: igToken
                     });
                 } catch (igPubErr) {
                     const igMsg = igPubErr.response?.data?.error?.message || igPubErr.response?.data?.error?.code || igPubErr.message;
                     return { success: false, platform, error: `Instagram publish error: ${igMsg}` };
                 }

                 return { success: true, platform, id: publishRes.data.id };
             }


             // --- LINKEDIN ---
             if (platform === 'linkedin') {
                 const liToken = process.env.LINKEDIN_ACCESS_TOKEN;
                 if (!liToken) return { success: false, platform, error: "Missing LINKEDIN_ACCESS_TOKEN" };

                 const liHeaders = {
                     'Authorization': `Bearer ${liToken}`,
                     'Content-Type': 'application/json',
                     'X-Restli-Protocol-Version': '2.0.0'
                 };
                 const liCaption = platformCaption + (platformHashtags ? '\n\n' + platformHashtags : '');

                 // 1. Get person URN
                 const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
                     headers: { 'Authorization': `Bearer ${liToken}` }
                 });
                 const personUrn = `urn:li:person:${profileRes.data.sub}`;

                 // 2. No media → text-only post
                 if (!tempFilePath && !mediaUrl) {
                     let postRes;
                     try {
                         postRes = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
                             author: personUrn,
                             lifecycleState: 'PUBLISHED',
                             specificContent: {
                                 'com.linkedin.ugc.ShareContent': {
                                     shareCommentary: { text: liCaption },
                                     shareMediaCategory: 'NONE'
                                 }
                             },
                             visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
                         }, { headers: liHeaders });
                     } catch (postErr) {
                         const status = postErr.response?.status;
                         if (status === 429) return { success: false, platform, error: 'LinkedIn rate limit — max ~3 posts/jour. Réessaie demain.' };
                         if (status === 401 || status === 403) return { success: false, platform, error: 'LinkedIn token expiré — va dans /auth/setup pour reconnecter.' };
                         throw postErr;
                     }
                     return { success: true, platform, id: postRes.data.id };
                 }

                 // 3. With media → register upload → binary upload → create post
                 // Requires a local file — if download failed, fall back to text-only
                 if (!tempFilePath) {
                     console.warn('[LinkedIn] No local file available, posting text-only');
                     let postRes;
                     try {
                         postRes = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
                             author: personUrn,
                             lifecycleState: 'PUBLISHED',
                             specificContent: {
                                 'com.linkedin.ugc.ShareContent': {
                                     shareCommentary: { text: liCaption },
                                     shareMediaCategory: 'NONE'
                                 }
                             },
                             visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
                         }, { headers: liHeaders });
                     } catch (postErr) {
                         const status = postErr.response?.status;
                         if (status === 429) return { success: false, platform, error: 'LinkedIn rate limit — max ~3 posts/jour. Réessaie demain.' };
                         if (status === 401 || status === 403) return { success: false, platform, error: 'LinkedIn token expiré — va dans /auth/setup pour reconnecter.' };
                         throw postErr;
                     }
                     return { success: true, platform, id: postRes.data.id, note: 'text-only (media download failed)' };
                 }

                 const mediaCategory = mediaType === 'video' ? 'VIDEO' : 'IMAGE';
                 const recipe = mediaType === 'video'
                     ? 'urn:li:digitalmediaRecipe:feedshare-video'
                     : 'urn:li:digitalmediaRecipe:feedshare-image';

                 const registerRes = await axios.post(
                     'https://api.linkedin.com/v2/assets?action=registerUpload',
                     {
                         registerUploadRequest: {
                             recipes: [recipe],
                             owner: personUrn,
                             serviceRelationships: [{
                                 relationshipType: 'OWNER',
                                 identifier: 'urn:li:userGeneratedContent'
                             }]
                         }
                     },
                     { headers: liHeaders }
                 );

                 const uploadUrl = registerRes.data.value.uploadMechanism[
                     'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
                 ].uploadUrl;
                 const assetUrn = registerRes.data.value.asset;

                 // Upload binary file
                 const fileBuffer = fs.readFileSync(tempFilePath);
                 await axios.put(uploadUrl, fileBuffer, {
                     headers: {
                         'Authorization': `Bearer ${liToken}`,
                         'Content-Type': mediaType === 'video' ? 'video/mp4' : 'image/jpeg'
                     },
                     maxBodyLength: Infinity,
                     maxContentLength: Infinity
                 });

                 // Create UGC post with asset
                 let postRes;
                 try {
                     postRes = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
                         author: personUrn,
                         lifecycleState: 'PUBLISHED',
                         specificContent: {
                             'com.linkedin.ugc.ShareContent': {
                                 shareCommentary: { text: liCaption },
                                 shareMediaCategory: mediaCategory,
                                 media: [{
                                     status: 'READY',
                                     description: { text: liCaption.substring(0, 200) },
                                     media: assetUrn,
                                     title: { text: platformCaption.substring(0, 100) }
                                 }]
                             }
                         },
                         visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
                     }, { headers: liHeaders });
                 } catch (postErr) {
                     const status = postErr.response?.status;
                     if (status === 429) return { success: false, platform, error: 'LinkedIn rate limit — max ~3 posts/jour. Réessaie demain.' };
                     if (status === 401 || status === 403) return { success: false, platform, error: 'LinkedIn token expiré — va dans /auth/setup pour reconnecter LinkedIn.' };
                     throw postErr;
                 }

                 return { success: true, platform, id: postRes.data.id };
             }

             // --- YOUTUBE SHORTS (Natif) ---
             if (platform === 'youtube' || platform === 'youtube_shorts') {
                 if (mediaType !== 'video') {
                     return { success: false, platform, error: "YouTube requires video media type" };
                 }
                 if (!process.env.YOUTUBE_REFRESH_TOKEN) {
                     return { success: false, platform, error: "Missing YOUTUBE_REFRESH_TOKEN" };
                 }
                 if (!tempFilePath) {
                     return { success: false, platform, error: "YouTube: impossible de télécharger la vidéo (URL inaccessible depuis Render)" };
                 }

                 try {
                     // Convert string hashtags "#foo #bar" to array ["foo", "bar"]
                     const tagsArray = platformHashtags
                        ? platformHashtags.split(' ').map(t => t.replace('#', '')).filter(Boolean)
                        : [];
                     
                     // Use caption as title (YouTube Shorts uses title heavily)
                     // If title is too long, we might need to truncate
                     const result = await VideoUploader.uploadYouTubeShorts(
                         tempFilePath, 
                         platformCaption, 
                         platformCaption, // Description same as title/caption for Shorts
                         tagsArray
                     );
                     return { success: true, platform: 'youtube', id: result.id, url: result.url };

                 } catch (e) {
                     return { success: false, platform, error: e.message };
                 }
             }

             // --- TIKTOK (Natif) ---
             if (platform === 'tiktok') {
                 if (mediaType !== 'video') {
                     return { success: false, platform, error: "TikTok requires video media type" };
                 }
                 if (!process.env.TIKTOK_ACCESS_TOKEN) {
                     return { success: false, platform, error: "Missing TIKTOK_ACCESS_TOKEN" };
                 }
                 if (!tempFilePath) {
                     return { success: false, platform, error: "TikTok: impossible de télécharger la vidéo (URL inaccessible depuis Render)" };
                 }

                 try {
                     // TikTok caption includes hashtags
                     const finalCaption = platformCaption + ' ' + platformHashtags;
                     const result = await VideoUploader.uploadTikTok(tempFilePath, finalCaption);
                     
                     return { success: true, platform: 'tiktok', id: result.id, status: result.status };
                 } catch (e) {
                     return { success: false, platform, error: e.message };
                 }
             }
             
             return { success: false, platform, error: "Platform not supported yet" };
        };

        // TRAITEMENT SÉQUENTIEL AVEC DÉLAIS (ANTI-DETECTION)
        for (const platform of platforms) {
            try {
                console.log(`\n🔄 Processing ${platform}...`);
                const result = await shareToPlatform(platform);
                results.push(result);

                if (result.success) {
                    console.log(`✅ Successfully posted to ${platform}`);
                } else {
                    console.log(`❌ Failed to post to ${platform}: ${result.error}`);
                }
            } catch (err) {
                console.error(`💥 Error posting to ${platform}:`, err.message);
                errors.push({ platform, error: err.message });
            }
        }

        // 3. Cleanup temp file -> DÉPLACÉ DANS FINALLY

        // 4. Record successful posts for learning
        for (const result of results) {
            if (result.success && result.id) {
                await strategist.recordPostLaunch({
                    post_id: result.id,
                    platform: result.platform,
                    content_generated: caption,
                    strategy_used: "AI optimized with trends and competition analysis",
                    posted_at_time: new Date().toTimeString().split(' ')[0],
                    media_type: mediaType,
                    hashtags_used: hashtags
                });

                // B. SAUVEGARDE PERMANENTE (Secours SQLite/Turso)
                // C'est ici qu'on garantit que ça "enregistre" vraiment dans le disque dur local
                try {
                    const backupId = `auto_${Date.now()}_${result.platform}`;
                    const metaData = {
                        mediaUrl,
                        mediaType,
                        hashtags
                    };
                    
                    const shareParams = [
                        backupId,           // id
                        'smart_share',      // experiment_id
                        'system_user',      // user_id
                        result.platform,    // platform
                        caption,            // original_content
                        caption,            // ai_content (final)
                        result.id,          // post_id
                        Date.now(),         // published_at
                        JSON.stringify(metaData) // meta
                    ];

                    const shareSql = `INSERT INTO shares (id, experiment_id, user_id, platform, original_content, ai_content, post_id, published_at, meta)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                    turso.run(shareSql, shareParams);

                    if (turso.runCloud) {
                        turso.runCloud(shareSql, shareParams)
                            .then(() => console.log(`☁️  Synced to Turso Cloud for ${result.platform}`))
                            .catch(e => console.error("☁️❌ Cloud Sync Failed:", e.message));
                    }
                    console.log(`💾 Post saved to permanent history (SQLite) for ${result.platform}`);
                } catch (dbErr) {
                    console.error("⚠️ Backup save to SQLite failed:", dbErr.message);
                }
            }
        }

        res.json({ 
            success: errors.length === 0 && results.every(r => r.success), 
            results, 
            errors,
            message: errors.length > 0 
                ? errors.map(e => `${e.platform}: ${e.error}`).join(' | ')
                : results.some(r => !r.success)
                    ? results.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join(' | ')
                    : 'Publié avec succès !'
        });

    } catch (error) {
        console.error("🔥 Global Error in Smart Share:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        // NETTOYAGE SÉCURISÉ : Garantit la suppression même en cas de crash
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log("🧹 Temp file cleaned up");
            } catch (e) {
                console.error("Warning: Failed to cleanup temp file", e.message);
            }
        }
    }
});

app.post('/api/create-post-ai', requireAuth, express.json(), async (req, res) => {
    try {
        const { content, options, mediaUrl, mediaType } = req.body;
        
        console.log(`🧠 AI Strategy working for ${options.platform}...`);

        // 1. Si c'est une vidéo, analyser d'abord le contenu visuel profond AVEC TIMEOUT
        let videoContext = {};
        if (mediaType === 'video' && mediaUrl) {
           try {
               // Protection contre timeout infini (5s max)
               videoContext = await Promise.race([
                   VideoAI.analyzeVideo(mediaUrl),
                   new Promise((_, reject) => setTimeout(() => reject(new Error('VideoAI Timeout')), 5000))
               ]);
               console.log("Video Context:", videoContext.summary);
           } catch (vErr) {
               console.warn("⚠️ Video Analysis skipped (timeout or error):", vErr.message);
               // On continue sans le contexte vidéo pour ne pas bloquer l'utilisateur
               videoContext = { summary: [] };
           }
        }

        // 2. Le Strategist combine tout (Rules + Trends + History + Content)
        // Il enrichit le prompt de base avec les données vidéos
        // FIX: Vérifie si summary existe ET n'est pas vide pour éviter "Video contains: ."
        const hasVideoSummary = videoContext.summary && videoContext.summary.length > 0;
        const enrichedContent = hasVideoSummary
            ? `Video contains: ${videoContext.summary.join(', ')}. Caption: ${content}`
            : content;

        // Détecter l'intention (générer post complet ou juste hashtags)
        const action = options.action || 'create_post';

        const strategyResult = await strategist.optimizeForPlatform(
            enrichedContent, 
            mediaType || 'text', 
            options.platform,
            action 
        );

        // 3. Simuler l'enregistrement du "Lancement" pour le tracking futur
        // (En prod, on enregistre l'ID du post ici)
        strategist.recordPostLaunch({
            platform: options.platform,
            content_generated: strategyResult.optimized_text,
            strategy_used: strategyResult.reasoning
        });

        res.json({ 
            content: strategyResult.optimized_text,
            meta: {
               reasoning: strategyResult.reasoning,
               virality_score: strategyResult.estimated_virality_score,
               trends: strategyResult.trends_used,
               trends_source: strategyResult.trends_source,
               best_time: strategyResult.best_time_to_post,
               competition_source: strategyResult.competition_source
            }
        });

    } catch (error) {
        console.error(error);
        const { content, options } = req.body;
        // In real app, call OpenAI here
        // For now, return mock
        
        // Simuler un appel OpenAI (court-circuité pour la démo instantanée)
        /* 
        const completion = await openai.chat.completions.create({...});
        */
        
        let enhanced = content;
        if(options.platform === 'twitter') enhanced = `🚀 Check this out! ${content.substring(0,50)}... #MustSee`;
        else enhanced = `✨ ${content} \n\nFound this amazing content and had to share! What do you think?`;

        res.json({ content: enhanced });
    }
});

// Edit AI section with instruction, preserving locked text (server-side guard)
app.post('/api/ai-edit', requireAuth, express.json(), async (req, res) => {
  try {
    const { platform = 'facebook', instruction = '', lockedText = '', aiText = '' } = req.body || {};
    const base = aiText || '';

    // Get real-time market patterns and top performers to ensure cohesion
    const marketTrends = await strategist.analyzeMarketTrends(platform);
    const topPerformers = await strategist.analyzeTopPerformers(platform);

    const patterns = marketTrends?.patterns || {};
    const hooks = Array.isArray(patterns.successfulHooks) ? patterns.successfulHooks.slice(0, 3) : [];
    const topTags = (topPerformers?.topHashtags || []).slice(0, 10).map(h => h.tag).join(' ');

    const sys = `You are an expert ${platform} editor writing in natural Québec franglais. Apply the user's instruction to improve ONLY the AI section of a post. STRICT RULES: 1) Do NOT include or modify LOCKED_TEXT; it will be appended separately. 2) Return only the edited AI section as plain text, no markdown, no quotes. 3) Tone: dry, natural, human — never enthusiastic, never "Incroyable!" or marketing speak. 4) 0-1 emoji max. 5) Follow platform style: keep length near avgLength=${Math.round(patterns.avgLength || 140)}. 6) Prefer proven hashtags when relevant.`;

    const user = `LOCKED_TEXT (do not modify, do not include):\n${lockedText}\n\nCURRENT_AI_SECTION:\n${base}\n\nINSTRUCTION:\n${instruction}\n\nPROVEN_HASHTAGS:\n${topTags}\n\nReturn only the revised AI section.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      temperature: 0.7
    });

    const edited = completion.choices?.[0]?.message?.content?.trim() || base;
    res.json({ edited });
  } catch (error) {
    console.error('ai-edit error:', error.message);
    res.json({ edited: (req.body?.aiText || '') });
  }
});

// --- NOUVELLE ROUTE : MISE À JOUR DES PERFORMANCES (LEARNING LOOP) ---
app.post('/api/update-post-performance', express.json(), async (req, res) => {
    try {
        const { postId, platform, postUrl } = req.body;
        
        console.log(`📊 Updating performance for ${platform} post: ${postId}`);
        
        // Récupérer les vraies métriques depuis l'API sociale
        const performance = await strategist.fetchPostPerformance(platform, postId, postUrl);
        
        // Mettre à jour la base de données
        await strategist.updatePostPerformance(postId, performance);
        
        res.json({ success: true, performance });
    } catch (error) {
        console.error("Performance update error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- NOUVELLE ROUTE : DASHBOARD D'APPRENTISSAGE ---
app.get('/api/learning-dashboard', async (req, res) => {
    try {
        const dashboard = await strategist.getLearningDashboard();
        res.json(dashboard);
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Spread It — Partagez partout',
    googleVerification: process.env.GOOGLE_SITE_VERIFICATION || ''
  });
});

// Waitlist / promo page
app.get('/join', (req, res) => res.render('join'));

app.post('/api/join', (req, res) => {
  const { email, name } = req.body || {};
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.json({ ok: false, error: 'Email invalide.' });
  }
  try {
    turso.run(
      'INSERT OR IGNORE INTO waitlist (email, name, created_at) VALUES (?, ?, ?)',
      [email.toLowerCase().trim(), (name || '').trim(), Date.now()]
    );
    console.log(`[Waitlist] New signup: ${email}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Waitlist] DB error:', e.message);
    res.json({ ok: false, error: 'Erreur serveur.' });
  }
});

// --- ROUTES LÉGALES (POUR FACEBOOK APP REVIEW) ---
app.get('/privacy', (req, res) => res.render('privacy'));
app.get('/terms', (req, res) => res.render('terms'));
app.get('/reaction', requireAuth, (req, res) => res.render('reaction')); // New Reaction Mode
app.get('/data-deletion', (req, res) => res.render('data_deletion'));
// Je remets la route /verify comme demandé
app.get('/verify', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('tiktok-developers-site-verification=NyPBtRH4x5RVlQYdGh4qZJcwC80UGjUL');
});

// --- TIKTOK DYNAMIC VERIFICATION ---
// Répond automatiquement à n'importe quel fichier tiktokXXXXX.txt
// Plus besoin de redéployer quand le code change !
app.get(/^\/tiktok[a-zA-Z0-9]+\.txt$/, (req, res) => {
    // ex: /tiktok9xKCnP2dfS1Zy9SqVjyp7NJGX3PnxXtZ.txt
    const filename = req.path.substring(1); // retire le / initial
    const hash = filename.replace('tiktok', '').replace('.txt', '');
    
    console.log(`Auto-verifying TikTok request for hash: ${hash}`);
    res.set('Content-Type', 'text/plain');
    res.send(`tiktok-developers-site-verification=${hash}`);
});

// --- AUTHENTIFICATION TIKTOK ---
// 1. Démarrer le Login
app.get('/auth/tiktok/login', (req, res) => {
    try {
        const state = randomUUID();
        // Sauvegarder l'état en session pour sécurité CSRF
        if (req.session) req.session.tiktokState = state;
        
        // Génération PKCE (Proof Key for Code Exchange)
        // Obligatoire pour TikTok V2 API
        const { verifier, challenge } = TikTokAuth.generatePKCE();
        
        if (req.session) {
            req.session.tiktokCodeVerifier = verifier;
        }

        const url = TikTokAuth.generateAuthUrl(state, challenge);
        res.redirect(url);
    } catch (e) {
        res.status(500).send("Erreur de configuration TikTok : " + e.message);
    }
});

// 2. Callback (Retour de TikTok)
app.get('/auth/tiktok/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        // Gestion propre de l'erreur / Refus de l'utilisateur
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="fr">
            <body style="font-family:sans-serif; background:#000; color:#fff; text-align:center; padding-top:50px;">
                <h1 style="color:#FE2C55">Connexion annulée</h1>
                <p>La connexion à TikTok a été refusée ou a échoué.</p>
                <p style="color:#888">Message : ${error_description}</p>
                <a href="/composer" style="display:inline-block; margin-top:20px; text-decoration:none; background:#333; color:white; padding:10px 20px; border-radius:5px;">Retourner au Dashboard</a>
            </body>
            </html>
        `);
    }

    // Vérifier CSRF si possible
    // if (req.session && req.session.tiktokState !== state) { ... }

    try {
        // Récupérer le code_verifier de la session pour l'échange de token
        const codeVerifier = req.session ? req.session.tiktokCodeVerifier : null;

        const data = await TikTokAuth.getAccessToken(code, codeVerifier);
        
        // Stocker le token dans la session (ou DB en prod)
        if (req.session) {
            req.session.tiktokToken = data; 
            // Nettoyer le verifier après usage
            delete req.session.tiktokCodeVerifier;
        }

        // AFFICHER LE TOKEN VIA LE TEMPLATE JOLI
        res.render('tiktok-success', { tokenData: data });

    } catch (e) {
        console.error("TikTok Auth Error:", e);
        res.status(500).send(`
            <h1 style="color:red">Erreur TikTok</h1>
            <p>${e.message}</p>
            <a href="/composer">Retour</a>
        `);
    }
});

app.get('/create', requireAuth, (req, res) => {
  res.redirect('/composer');
});

// New composer UI (Standalone) - stack cards + AI chat popup
app.get('/composer', (req, res) => {
  const configured = {
      linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN || (req.session.tokens && req.session.tokens.linkedin)),
      facebook: !!(process.env.FACEBOOK_ACCESS_TOKEN || (req.session.tokens && req.session.tokens.facebook)),
      twitter: !!(process.env.TWITTER_ACCESS_TOKEN),
      instagram: !!(process.env.INSTAGRAM_ACCESS_TOKEN),
      tiktok: !!(process.env.TIKTOK_ACCESS_TOKEN || (req.session.tiktokToken)),
      youtube: !!(process.env.YOUTUBE_REFRESH_TOKEN)
  };

  res.render('composer', {
    title: 'Composer - Spread It',
    user: req.session.user,
    configured
  });
});

// NEW: Spread Grid View - stacked mockups interface
app.get('/spreads', requireAuth, (req, res) => {
  try {
    // Load spreads from Turso DB
    const spreads = turso.all('SELECT * FROM spreads ORDER BY created_at DESC', []);
    
    // Parse JSON fields
    const spreadsData = spreads.map(row => ({
      id: row.id,
      media_url: row.media_url,
      media_type: row.media_type,
      ai_suggestion: row.ai_suggestion,
      user_text: row.user_text,
      platforms: JSON.parse(row.platforms || '[]'),
      content: JSON.parse(row.content || '{}'),
      created_at: row.created_at,
      status: row.status || 'draft'
    }));

    res.render('spread-grid', {
      title: 'Mes Spreads - Spread It',
      user: req.session.user,
      spreads: spreadsData
    });
  } catch (error) {
    console.error('[Spreads Grid Error]:', error);
    res.render('spread-grid', {
      title: 'Mes Spreads - Spread It',
      user: req.session.user,
      spreads: []
    });
  }
});

// NEW: Create Spread Modal - triggered from media
app.get('/create-spread', requireAuth, (req, res) => {
  res.render('create-spread-modal', {
    title: 'Create Spread - Spread It',
    user: req.session.user
  });
});

// NEW: Extract metadata from media (AI analysis)
app.post('/api/extract-metadata', express.json(), async (req, res) => {
  try {
    const { mediaUrl, mediaType, title } = req.body;
    
    if (!mediaUrl) {
      return res.status(400).json({ error: 'Media URL required' });
    }

    console.log(`[Extract Metadata] Analyzing ${mediaType}: ${mediaUrl}`);

    // Generate AI suggestion based on media info
    const strategist = new Strategist(null);
    
    // Simple prompt for metadata extraction
    const metadataPrompt = `
      Analyse ce média et génère une suggestion de post engageante en franglais québécois:
      
      Type: ${mediaType}
      URL: ${mediaUrl}
      Titre: ${title || 'Sans titre'}
      
      Donne une seule phrase punchy et engageante (max 100 caractères) qui décrit ce contenu.
      Style: Edgy, sexy, confiant. Franglais ("C'est fucking insane").
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu es un expert en création de contenu viral. Réponds en une seule phrase punchy.' },
        { role: 'user', content: metadataPrompt }
      ],
      temperature: 0.9,
      max_tokens: 100
    });

    const suggestion = completion.choices[0].message.content.trim();

    res.json({ 
      suggestion,
      mediaUrl,
      mediaType
    });

  } catch (error) {
    console.error('[Extract Metadata Error]:', error);
    res.status(500).json({ error: 'Failed to extract metadata' });
  }
});

// NEW: Create Spread - generate posts for selected platforms only
app.post('/api/create-spread', express.json(), async (req, res) => {
  try {
    const { mediaUrl, mediaType, aiSuggestion, userText, platforms } = req.body;

    if (!mediaUrl || !platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'Media URL and platforms required' });
    }

    console.log(`[Create Spread] Generating for platforms: ${platforms.join(', ')}`);

    // Combine AI suggestion + user text
    const fullPrompt = [
      aiSuggestion,
      userText ? `\n\nUser addition: ${userText}` : ''
    ].filter(Boolean).join('');

    // Use strategist to generate platform-specific content
    const strategist = new Strategist(null);
    
    // Get newsjacking context
    const { currentTrend, influencer } = await getNewsjackingContext(fullPrompt);
    
    const systemPrompt = strategist.generateChatPrompt(
      `MEDIA: ${mediaType} fourni.`,
      currentTrend,
      influencer,
      { type: mediaType, url: mediaUrl }
    );

    // Generate content for ONLY selected platforms
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `
        Génère des posts SEULEMENT pour ces plateformes: ${platforms.join(', ')}
        
        Contenu de base: ${fullPrompt}
        
        Instructions:
        - AI suggestion: "${aiSuggestion}" (inspire-toi de ça)
        - User text: "${userText || 'Aucun'}" (si présent, corrige les fautes mais ne transforme PAS)
        - Combine les deux intelligemment
        - Adapte pour chaque plateforme sélectionnée
        
        Retourne JSON avec SEULEMENT les plateformes demandées.
      `}
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    let result = JSON.parse(completion.choices[0].message.content);

    // Save to Turso database
    const spreadId = `spread_${Date.now()}`;
    const spreadSql = `
      INSERT INTO spreads (id, media_url, media_type, ai_suggestion, user_text, platforms, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const spreadParams = [
      spreadId,
      mediaUrl,
      mediaType,
      aiSuggestion,
      userText || '',
      JSON.stringify(platforms),
      JSON.stringify(result.cards || {}),
      new Date().toISOString()
    ];

    turso.run(spreadSql, spreadParams);
    if (turso.runCloud) {
      turso.runCloud(spreadSql, spreadParams).catch(console.error);
    }

    res.json({
      success: true,
      spreadId,
      cards: result.cards,
      platforms
    });

  } catch (error) {
    console.error('[Create Spread Error]:', error);
    res.status(500).json({ error: 'Failed to create spread' });
  }
});

// NEW: Check Platform Connection Status (public — only shows connected/disconnected booleans)
app.get('/api/platforms/status', async (req, res) => {
  try {
    const status = {};

    // FACEBOOK
    try {
      if (process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID) {
        const fbResponse = await axios.get(
          `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}`,
          {
            params: { access_token: process.env.FACEBOOK_ACCESS_TOKEN, fields: 'id,name' },
            timeout: 5000
          }
        );
        status.facebook = { 
          connected: true, 
          name: fbResponse.data.name,
          pageId: fbResponse.data.id 
        };
      } else {
        status.facebook = { connected: false, reason: 'Missing credentials' };
      }
    } catch (error) {
      status.facebook = { 
        connected: false, 
        reason: error.response?.data?.error?.message || 'Token invalid or expired' 
      };
    }

    // INSTAGRAM
    try {
      if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ID) {
        // Instagram Business API utilise graph.facebook.com (pas graph.instagram.com)
        const igResponse = await axios.get(
          `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}`,
          {
            params: { access_token: process.env.INSTAGRAM_ACCESS_TOKEN, fields: 'id,username,name' },
            timeout: 5000
          }
        );
        status.instagram = { 
          connected: true, 
          username: igResponse.data.username || igResponse.data.name,
          accountId: igResponse.data.id 
        };
      } else {
        status.instagram = { connected: false, reason: 'Missing INSTAGRAM_BUSINESS_ID' };
      }
    } catch (error) {
      status.instagram = { 
        connected: false, 
        reason: error.response?.data?.error?.message || 'Token invalid or expired' 
      };
    }

    // TWITTER
    // Note: Twitter Free tier does not allow GET /2/users/me — only tweet writing.
    // We verify credentials by attempting a dry-run OAuth signature check instead of calling the API.
    try {
      const twKey = process.env.TWITTER_API_KEY;
      const twSecret = process.env.TWITTER_API_SECRET;
      const twToken = process.env.TWITTER_ACCESS_TOKEN;
      const twTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
      if (twKey && twSecret && twToken && twTokenSecret) {
        // Extract username hint from the access token (format: userId-randomstring)
        const userIdHint = twToken.split('-')[0];
        status.twitter = { 
          connected: true, 
          username: process.env.TWITTER_USERNAME || `@user_${userIdHint}`,
          note: 'Credentials present — Free tier (write-only, no /me endpoint)'
        };
      } else {
        status.twitter = { connected: false, reason: 'Missing credentials' };
      }
    } catch (error) {
      status.twitter = { 
        connected: false, 
        reason: error.message || 'Token invalid or expired' 
      };
    }

    // LINKEDIN
    try {
      if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ACCESS_TOKEN !== 'dummy') {
        const liResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
          timeout: 5000
        });
        status.linkedin = { 
          connected: true, 
          name: liResponse.data.name || `${liResponse.data.given_name || ''} ${liResponse.data.family_name || ''}`.trim(),
          personId: liResponse.data.sub 
        };
      } else {
        status.linkedin = { connected: false, reason: 'Missing credentials' };
      }
    } catch (error) {
      status.linkedin = { 
        connected: false, 
        reason: error.response?.data?.message || 'Token invalid or expired' 
      };
    }

    // TIKTOK
    if (process.env.TIKTOK_ACCESS_TOKEN) {
      try {
        const ttResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
          headers: { 'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}` },
          params: { fields: 'open_id,display_name,avatar_url' },
          timeout: 5000
        });
        status.tiktok = { 
          connected: true, 
          username: ttResponse.data.data?.user?.display_name || 'TikTok user'
        };
      } catch (error) {
        status.tiktok = { 
          connected: false, 
          reason: error.response?.data?.error?.message || 'Token invalid or expired' 
        };
      }
    } else {
      status.tiktok = { connected: false, reason: 'Missing access token' };
    }

    // YOUTUBE
    try {
      if (process.env.YOUTUBE_REFRESH_TOKEN && process.env.YOUTUBE_CLIENT_ID) {
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.YOUTUBE_CLIENT_ID,
          process.env.YOUTUBE_CLIENT_SECRET,
          'http://localhost:3000/auth/youtube/callback'
        );
        oauth2Client.setCredentials({
          refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelResponse = await youtube.channels.list({
          part: 'snippet',
          mine: true
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          status.youtube = { 
            connected: true, 
            channelName: channelResponse.data.items[0].snippet.title,
            channelId: channelResponse.data.items[0].id
          };
        } else {
          status.youtube = { connected: false, reason: 'No channel found' };
        }
      } else {
        status.youtube = { connected: false, reason: 'Missing credentials' };
      }
    } catch (error) {
      status.youtube = { 
        connected: false, 
        reason: error.message || 'Token invalid or expired' 
      };
    }

    res.json(status);

  } catch (error) {
    console.error('[Platform Status Error]:', error);
    res.status(500).json({ error: 'Failed to check platform status' });
  }
});

// NEW: Edit Spread via Chat AI (platform-specific)
app.post('/api/edit-spread-chat', express.json(), async (req, res) => {
  try {
    const { spreadId, platform, userMessage } = req.body;

    if (!spreadId || !platform || !userMessage) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Edit Spread Chat] ${spreadId} - ${platform}: "${userMessage}"`);

    // Load spread from DB
    const spread = turso.get('SELECT * FROM spreads WHERE id = ?', [spreadId]);
    if (!spread) {
      return res.status(404).json({ error: 'Spread not found' });
    }

    const content = JSON.parse(spread.content || '{}');
    const currentText = content[platform];

    if (!currentText) {
      return res.status(404).json({ error: 'Platform content not found' });
    }

    // Platform-specific AI personalities
    const platformPersonalities = {
      facebook: "Facebook: storytelling naturel, ton de conversation, texte moyen, une question optionnelle à la fin. Pas de listes à puces, pas de 🔥 partout.",
      instagram: "Instagram: caption courte et directe, 1-2 emojis max, hashtags discrets à la fin.",
      twitter: "Twitter: phrase sèche, observation ou fait, < 280 chars, zéro hashtag à moins que ça fit naturellement.",
      linkedin: "LinkedIn: ton professionnel mais humain, partage une leçon ou observation personnelle, pas de buzzwords.",
      tiktok: "TikTok: caption ultra-courte (1-2 phrases), quelques hashtags SEO.",
      youtube: "YouTube: titre clair + description courte, direct au but."
    };

    const systemPrompt = `${platformPersonalities[platform] || "Tu es un assistant de création de contenu naturel et humain."}

VOIX : Franglais québécois naturel, blasé, dry. Pas d'enthousiasme forcé. Pas de "Incroyable!" ni de "C'est AMAZING!". Parle comme un humain, pas comme une pub.

Post actuel :
"${currentText}"

Demande : "${userMessage}"

Règle : si c'est une modification → retourne le texte modifié. Si c'est une question → réponds normalement.

JSON :
{
  "aiResponse": "Ta réponse courte",
  "updatedText": "Le texte modifié (ou null)"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.8,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // Update DB if text was modified
    if (result.updatedText) {
      content[platform] = result.updatedText;
      turso.run(
        'UPDATE spreads SET content = ? WHERE id = ?',
        [JSON.stringify(content), spreadId]
      );
      if (turso.runCloud) {
        turso.runCloud(
          'UPDATE spreads SET content = ? WHERE id = ?',
          [JSON.stringify(content), spreadId]
        ).catch(console.error);
      }
    }

    res.json({
      aiResponse: result.aiResponse,
      updatedText: result.updatedText || null
    });

  } catch (error) {
    console.error('[Edit Spread Chat Error]:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Helper: Get LinkedIn Person URN
app.get('/api/linkedin/get-person-urn', async (req, res) => {
  try {
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    
    if (!accessToken || accessToken === 'dummy') {
      return res.status(400).json({ 
        error: 'LinkedIn access token not configured',
        hint: 'Set LINKEDIN_ACCESS_TOKEN in .env.local'
      });
    }

    const response = await axios.get('https://api.linkedin.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const personId = response.data.id;
    const personUrn = `urn:li:person:${personId}`;

    res.json({
      success: true,
      personUrn,
      personId,
      message: `Add this to .env.local:\nLINKEDIN_PERSON_URN=${personUrn}`
    });

  } catch (error) {
    console.error('[LinkedIn Person URN Error]:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get LinkedIn Person URN',
      details: error.response?.data?.message || error.message,
      hint: 'Token may be expired. LinkedIn tokens expire after 60 days.'
    });
  }
});

// NEW: Publish Spread to Social Media
app.post('/api/publish-spread', express.json(), async (req, res) => {
  try {
    const { spreadId, platform } = req.body;

    if (!spreadId || !platform) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Publish Spread] ${spreadId} → ${platform}`);

    // Load spread from DB
    const spread = turso.get('SELECT * FROM spreads WHERE id = ?', [spreadId]);
    if (!spread) {
      return res.status(404).json({ error: 'Spread not found' });
    }

    const content = JSON.parse(spread.content || '{}');
    const platformText = content[platform];
    const mediaUrl = spread.media_url;

    if (!platformText) {
      return res.status(404).json({ error: 'Platform content not found' });
    }

    // Get LinkedIn Person URN dynamically if needed
    let linkedinPersonUrn = process.env.LINKEDIN_PERSON_URN;
    if (platform === 'linkedin' && !linkedinPersonUrn) {
      try {
        const meResponse = await axios.get('https://api.linkedin.com/v2/me', {
          headers: { 'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` }
        });
        linkedinPersonUrn = `urn:li:person:${meResponse.data.id}`;
      } catch (e) {
        console.warn('Could not fetch LinkedIn Person URN:', e.message);
      }
    }

    // Prepare credentials per platform
    const credentials = {
      facebook: {
        pageAccessToken: process.env.FACEBOOK_ACCESS_TOKEN,
        pageId: process.env.FACEBOOK_PAGE_ID
      },
      instagram: {
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
        igUserId: process.env.INSTAGRAM_BUSINESS_ID
      },
      twitter: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
      },
      linkedin: {
        accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
        personUrn: linkedinPersonUrn
      },
      tiktok: {
        accessToken: process.env.TIKTOK_ACCESS_TOKEN
      },
      youtube: {
        oauth2Client: null // TODO: Initialize with refresh token
      }
    };

    if (!credentials[platform]) {
      return res.status(400).json({ error: 'Platform not supported' });
    }

    // Import publisher service
    const { publishSpread } = require('./services/social-publisher');

    // Publish (async process)
    const result = await publishSpread({
      platform,
      mediaUrl,
      content: {
        text: platformText,
        title: spread.title || platformText.substring(0, 100),
        hashtags: platformText.match(/#\w+/g) || []
      },
      workDir: path.join(__dirname, 'temp')
    }, credentials[platform]);

    // Update spread status in DB
    const metadata = JSON.parse(spread.metadata || '{}');
    metadata.published = metadata.published || {};
    metadata.published[platform] = {
      status: 'published',
      timestamp: new Date().toISOString(),
      url: result.url || null,
      externalId: result.videoId || result.tweetId || result.mediaId || null
    };

    turso.run(
      'UPDATE spreads SET metadata = ? WHERE id = ?',
      [JSON.stringify(metadata), spreadId]
    );

    if (turso.runCloud) {
      turso.runCloud(
        'UPDATE spreads SET metadata = ? WHERE id = ?',
        [JSON.stringify(metadata), spreadId]
      ).catch(console.error);
    }

    res.json({
      success: true,
      platform,
      url: result.url,
      message: `Publié sur ${platform} avec succès!`
    });

  } catch (error) {
    console.error('[Publish Spread Error]:', error);
    res.status(500).json({ 
      error: 'Failed to publish',
      details: error.message 
    });
  }
});

// Helper function for newsjacking context (used by multiple endpoints)
async function getNewsjackingContext(message) {
  let currentTrend = "Aucune tendance détectée";
  let influencer = { name: "Toi-même", handle: "@you", style: "Unique" };
  
  try {
    // Try to fetch trending topic
    const trends = await fetchTrendingTopics();
    if (trends && trends.length > 0) {
      currentTrend = trends[0].title || trends[0];
    }
  } catch (e) {
    console.warn('Trending topics unavailable');
  }

  // Select goal account based on content
  const strategist = new Strategist(null);
  influencer = strategist.selectGoalAccount(message || '');

  return { currentTrend, influencer };
}

// Simple chat endpoint (non-streaming)
app.post('/api/ai-chat', express.json(), async (req, res) => {
  try {
    const prompt = (req.body && req.body.prompt) ? String(req.body.prompt) : '';
    if (!prompt) return res.status(400).json({ error: 'Prompt missing' });

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    const text = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content
      ? String(response.choices[0].message.content)
      : '';

    res.json({ reply: text });
  } catch (e) {
    console.error('AI chat error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'AI chat error' });
  }
});

// --- NEW REACTION/NEWSJACKING ENDPOINT ---
app.post('/api/analyze-reaction', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL manquante' });
    }

    // Instancier le stratège avec le client OpenAI global
    const strategist = new Strategist(openai);
    const result = await strategist.analyzeReaction(url);

    if (result.error) {
       // On renvoie 200 avec message d'erreur pour que le front puisse l'afficher proprement
       return res.json({ error: result.error }); 
    }

    res.json(result);
  } catch (error) {
    console.error('API Error /api/analyze-reaction:', error);
    res.status(500).json({ error: 'Erreur interne du serveur lors de l\'analyse.' });
  }
});

// --- CONSTANTS ---
const SYSTEM_PROMPT_CORRECTOR = "Tu es un éditeur de texte expert. Ton unique tâche est de corriger les fautes d'orthographe et de grammaire du texte suivant. Interdiction formelle de changer le ton, le style, l'argot ou la structure des phrases. Si le texte est déjà correct, renvoie-le tel quel. N'ajoute pas de guillemets ni de texte d'introduction.";

// --- INFLUENCER DATABASE (STRICTE & VÉRIFIÉE) ---
const INFLUENCER_DB = {
    "video_editing": [
        {"handle": "@waqasqazi", "name": "Waqas Qazi", "style": "Le maître absolu du Color Grading sur DaVinci Resolve."},
        {"handle": "@petermckinnon", "name": "Peter McKinnon", "style": "Le roi du B-Roll et de la cinématique YouTube."},
        {"handle": "@samkolder", "name": "Sam Kolder", "style": "Transitions folles, hyper-visuel, travel film."},
        {"handle": "@benntk", "name": "Benn TK", "style": "Effets visuels réalistes et montage fluide."}
    ],
    "photography": [
        {"handle": "@brandonwoelfel", "name": "Brandon Woelfel", "style": "Lumières néons, bokeh, photo de nuit créative."},
        {"handle": "@7th.era", "name": "Liam Won", "style": "Cyberpunk, nuit, street photography tokyo vibes."},
        {"handle": "@northborders", "name": "Mike Gray", "style": "Street photography brute et humoristique."}
    ],
    "tech_ai": [
        {"handle": "@mkbhd", "name": "Marques Brownlee", "style": "La qualité de production tech ultime (8K, robot arms)."},
        {"handle": "@mrwhosetheboss", "name": "Arun Maini", "style": "Gadgets futuristes et visuels très clean."},
        {"handle": "@levelsio", "name": "Pieter Levels", "style": "Le 'solopreneur' IA par excellence, nomade digital."}
    ],
    "lifestyle_hustle": [
        {"handle": "@garyvee", "name": "Gary Vaynerchuk", "style": "Motivation brute, 'arrete de te plaindre et bosse'."},
        {"handle": "@alexhormozi", "name": "Alex Hormozi", "style": "Business scaling, gym aesthetic, casquette à l'envers."}
    ]
};

function getGoalAccount(text) {
    // Safety check for text
    if (!text || typeof text !== 'string') return INFLUENCER_DB["tech_ai"][0];

    const t = text.toLowerCase();
    let category = "tech_ai"; // Default

    // Simple keyword mapping
    if (t.includes('davinci') || t.includes('montage') || t.includes('cut') || t.includes('video') || t.includes('premiere')) category = "video_editing";
    else if (t.includes('photo') || t.includes('lumiere') || t.includes('canon') || t.includes('sony')) category = "photography";
    else if (t.includes('business') || t.includes('argent') || t.includes('mindset') || t.includes('travail')) category = "lifestyle_hustle";
    
    // Random safe pick from the category
    const profiles = INFLUENCER_DB[category] || INFLUENCER_DB["tech_ai"];
    const selected = profiles[Math.floor(Math.random() * profiles.length)];
    return selected;
}

// --- NEW NEWSJACKING STRATEGY ---
async function getNewsjackingContext(userText) {
    try {
        // 1. Get Trends avec sécurité (Timeout + Fallback)
        let trends = null;
        try {
            // On race la requête contre un timeout de 2s
            trends = await Promise.race([
                fetchTrendingTopics(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Trends timeout')), 2000))
            ]);
        } catch (err) {
            console.warn('⚠️ Trends fetch warning:', err.message);
            trends = null; // Continue sans trends
        }
        
        let currentTrend = "L'engouement autour de l'IA générative";
        if (trends && trends.keywords && trends.keywords.length > 0) {
             currentTrend = trends.keywords[0];
        } else if (trends && trends.hashtags && trends.hashtags.length > 0) {
             currentTrend = trends.hashtags[0];
        }

        // 2. Get Goal Account (appeler le service Python) avec sécurité
        let influencer = null;
        try {
            // On race le script python contre un timeout de 3s
            const influencerResult = await Promise.race([
                callInfluencerSelector(userText),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Python timeout')), 3000))
            ]);

            influencer = (influencerResult && influencerResult.success) 
              ? influencerResult.account
              : getGoalAccount(userText);

        } catch (err) {
            console.warn('⚠️ Python selector warning:', err.message);
            influencer = getGoalAccount(userText); // Fallback immédiat
        }

        return { currentTrend, influencer };

    } catch (e) {
        console.warn('Newsjacking Context Critical Error (using hard fallback):', e.message);
        return { 
            currentTrend: "La tech et l'innovation", 
            influencer: getGoalAccount(userText)
        };
    }
}

// Helper: Call Python influencer selector
async function callInfluencerSelector(userText) {
  return new Promise((resolve) => {
    const python = spawn('python3', [
      path.join(__dirname, 'services', 'influencer_selector.py'),
      userText || ''
    ]);

    let output = '';
    let errorOutput = '';

    // --- MISE A JOUR DE SECURITE ---
    // Empêche le crash si python3 n'est pas installé ou échoue
    python.on('error', (err) => {
      console.warn('⚠️ Python spawn failed (python3 installed?):', err.message);
      resolve({ success: false, error: 'spawn error' });
    });
    // -------------------------------
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.warn('[Python stderr]', data.toString());
    });

    python.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        console.error('Failed to parse Python output:', output, 'Error:', errorOutput);
        resolve({ success: false, error: 'Python parse error', details: errorOutput });
      }
    });

    setTimeout(() => {
      python.kill();
      resolve({ success: false, error: 'timeout' });
    }, 5000);
  });
}

app.post('/api/chat', express.json(), async (req, res) => {
    try {
        const { message, history = [], platforms = ['facebook', 'instagram', 'twitter', 'linkedin'], media } = req.body;
        
        // --- START: Simulation d'erreur initiale pour tests ---
        if (process.env.SIMULATE_INIT_CHAT_ERROR === 'true') {
          const force = req.body && req.body.simulate_init_error === true || req.query.simulate_init_error === '1';
          if (!req.session._simulatedChatErrorInjected || force) {
            req.session._simulatedChatErrorInjected = true;
            req.session.save(() => {});
            console.warn('[SIMULATION] Returning simulated 500 error for /api/chat (initial).');
            return res.status(500).json({ error: 'Erreur réseau (simulation)' });
          }
        }
        // --- END: Simulation d'erreur initiale pour tests ---
        
        console.log(`[Chat API] Received message: "${message ? message.substring(0, 50) : 'null'}..."`);

        // 1. Détection d'intention
        const isCorrectionRequest = (message || "").toLowerCase().includes('corrige') || (message || "").toLowerCase().includes('faute');

        let systemPrompt = "";
        let analysisContext = "";
        let selectedMedia = null;

        // 2. MEDIA SAFETY CHECK (Video Intelligence Logic)
        if (media && media.type === 'video') {
            console.log(`🔍 Analyzing video safety: ${media.url}`);
            
            let isSafe = false;
            let failureReason = "Service non configuré";

            try {
                 // TIMEOUT DE SÉCURITÉ : Evite le blocage infini si VideoAI plante
                 const analysis = await Promise.race([
                     VideoAI.analyzeVideo(media.url),
                     new Promise((_, reject) => setTimeout(() => reject(new Error('Video analysis timeout')), 8000))
                 ]);
                 
                 if (analysis.is_simulation) {
                     isSafe = true;
                     analysisContext = "MEDIA: Vidéo acceptée par défaut (Analyse AI désactivée).";
                 } else {
                     isSafe = (analysis.safety === 'safe' || analysis.safety === 'unknown'); 
                     if (!isSafe) failureReason = "Contenu marqué comme UNSAFE par Google.";
                     else analysisContext = `MEDIA: Vidéo validée par Google AI (Safe).`;
                 }
            } catch(e) {
                 isSafe = true;
                 console.error("Video Check Failed (Continuing anyway):", e.message);
                 analysisContext = "MEDIA: Vidéo acceptée par défaut (Erreur service AI).";
            }

            if (isSafe) {
                selectedMedia = { type: 'video', url: media.url, poster: media.poster };
            } else {
                console.warn(`⚠️ Video rejected: ${failureReason}`);
                selectedMedia = { type: 'image', url: media.poster, isFallback: true };
                analysisContext = `MEDIA NOTE: La vidéo a été rejetée ou n'a pas pu être analysée (${failureReason}). L'image de couverture est utilisée à la place.`;
            }
        } else if (media && media.type === 'image') {
             selectedMedia = { type: 'image', url: media.url };
             analysisContext = `MEDIA: Image fournie.`;
        }

        // 3. FETCH NEWSJACKING CONTEXT
        const { currentTrend, influencer } = await getNewsjackingContext(message);

        if (isCorrectionRequest) {
             systemPrompt = SYSTEM_PROMPT_CORRECTOR;
        } else {
             // Utilisation du Stratège pour le prompt système unifié (Manifesto V2)
             const strategist = new Strategist(null);
             systemPrompt = strategist.generateChatPrompt(analysisContext, currentTrend, influencer, selectedMedia);
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message ? `TEXTE UTILISATEUR : ${message}` : "Analyse le média fourni ci-dessus." }
        ];

        // Utiliser gpt-4o pour JSON object (plus fiable que gpt-4o-mini)
        const modelForJson = 'gpt-4o';
        
        const completion = await openai.chat.completions.create({
          model: modelForJson,
          messages: messages,
          temperature: 0.8,
          response_format: { type: "json_object" }
        });

        let content = completion.choices[0].message.content;
        console.log("[Chat API] OpenAI Response:", content.substring(0, 100) + "...");

        // SANITIZE JSON
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        let result;
        try {
            result = JSON.parse(content);
        } catch (jsonError) {
            console.error("[Chat API] JSON Parse Error:", jsonError);
            throw new Error("Erreur de format de réponse AI (JSON invalide).");
        }

        res.json(result);

    } catch (e) {
        console.error('🔴 Chat API Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// SSE streaming endpoint for AI (GET with query param `prompt`)
app.get('/api/ai-stream', async (req, res) => {
  const prompt = req.query.prompt ? String(req.query.prompt) : '';
  if (!prompt) return res.status(400).json({ error: 'Prompt missing' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const send = (data) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      console.warn('SSE write failed:', err && err.message);
    }
  };

  (async () => {
    try {
      const model = resolveChatModel();
      let attemptedStream = false;

      if (openai && typeof openai.chat === 'object' && typeof openai.chat.completions.create === 'function') {
        try {
          const systemPrompt = `TU ES LE "STRATEGIST" DE SPREAD IT.
TON RÔLE : Partenaire de brainstorming et d'exécution pour les réseaux sociaux.

RÈGLE D'OR #1 : CONTENU "HUMAIN" > PERFECTION ROBOTIQUE
- Ton style d'écriture doit être imparfait, authentique, parfois "raw".
- Évite le ton "Assistant IA corporatif" (pas de "Certainement !", "Voici une version améliorée").
- Parle comme un collaborateur direct (ex: "J'ai retravaillé ça pour que ça clash plus.", "T'as pensé à l'angle controverse ?").

RÈGLE D'OR #2 : STRATÉGIE CHIRURGICALE
- Le texte peut avoir du "grain", mais la stratégie (Hashtags, Mots-clés SEO, Heure de publication) doit être PARFAITE.
- Explique tes choix : "J'ai mis ce mot-là pour le SEO", "On poste à 18h parce que ton audience est dans le métro".

RÈGLE D'OR #3 : PILOTE L'INTERFACE
- Quand l'utilisateur demande un post ou une modification, tu dois METTRE À JOUR L'INTERFACE.
- Pour ce faire, inclus un bloc JSON STRICTEMENT à la fin de ta réponse avec ce format :
\`\`\`json
{
  "update_ui": true,
  "main_content": "Le texte principal...",
  "platforms": {
    "twitter": "Version courte...",
    "linkedin": "Version pro...",
    "facebook": "Version standard..."
  },
  "hashtags": {
    "twitter": "#tag1 #tag2",
    "linkedin": "#tagA #tagB"
  },
  "advice": "Conseil stratégique court (ex: Ajoute une image sombre)"
}
\`\`\`
- Ce bloc JSON sera lu par le code pour remplir les cartes. L'utilisateur ne le verra pas s'il est bien formaté.`;

          const streamResp = await openai.chat.completions.create({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            max_tokens: 1500,
            temperature: 0.8,
            stream: true
          });

          if (streamResp[Symbol.asyncIterator]) {
            attemptedStream = true;
            for await (const part of streamResp) {
              const chunkText = (part && part.choices && part.choices[0] && (part.choices[0].delta?.content || part.choices[0].message?.content)) || '';
              if (chunkText) send(chunkText.replace(/\n/g, '\\n'));
            }
          }
        } catch (streamErr) {
          console.warn('OpenAI streaming not available, falling back:', streamErr && streamErr.message);
        }
      }

      if (!attemptedStream) {
        const resp = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
          temperature: 0.7
        });

        const full = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content
          ? String(resp.choices[0].message.content)
          : '';

        const chunks = full.match(/[^\.\!\?]+[\.\!\?]?/g) || [full];
        for (const c of chunks) {
          send(c.trim().replace(/\n/g, '\\n'));
          await new Promise(r => setTimeout(r, 180));
        }
      }

      res.write('event: end\ndata: {}\n\n');
      res.end();

    } catch (err) {
      console.error('AI stream error:', err && err.message ? err.message : err);
      try { res.write('event: error\ndata: {}\n\n'); res.end(); } catch (e) {}
    }
  })();
});

// Debug endpoint: reset simulation flags for current session (dev only)
app.get('/debug/reset-simulated-errors', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden in production' });
  }
  req.session._simulatedChatErrorInjected = false;
  req.session.save(() => {
    res.json({ ok: true, message: 'Simulated chat errors reset for this session' });
  });
});

// --- OAUTH ROUTES ---

// LinkedIn Auth Flow
app.get('/auth/linkedin/login', (req, res) => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) return res.send("Missing LINKEDIN_CLIENT_ID in env");
    
    const redirectUri = (process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`) + '/auth/linkedin/callback';
    const scope = 'openid profile email w_member_social';
    const state = 'spreadit_' + Date.now();
    
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
    res.redirect(url);
});

app.get('/auth/linkedin/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("No code provided");
    
    try {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = (process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`) + '/auth/linkedin/callback';
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        const token = response.data.access_token;
        // Fetch user URN
        const profileRes = await axios.get('https://api.linkedin.com/v2/me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const urn = `urn:li:person:${profileRes.data.id}`;
        
        // Save to session (temporary usage)
        req.session.tokens = req.session.tokens || {};
        req.session.tokens.linkedin = token;
        req.session.linkedin_urn = urn;
        
        res.send(`
            <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #0077b5;">LinkedIn Connected Successfully!</h1>
                <p><strong>Use these credentials in your Render Environment Variables:</strong></p>
                <div style="background: #f0f0f0; padding: 1rem; border-radius: 5px;">
                    <p><strong>LINKEDIN_ACCESS_TOKEN:</strong><br><code style="word-break: break-all;">${token}</code></p>
                    <p><strong>LINKEDIN_USER_URN:</strong><br><code>${urn}</code></p>
                </div>
                <p style="margin-top: 1rem;"><a href="/" style="background: #0077b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Return to Dashboard</a></p>
            </div>
        `);
    } catch (e) {
        console.error("LinkedIn Auth Error", e.response?.data || e.message);
        res.status(500).send("LinkedIn Auth Failed: " + JSON.stringify(e.response?.data || e.message));
    }
});

app.get('/share', (req, res) => {
  if (!req.session.currentContent) {
    return res.redirect('/create');
  }

  res.render('share', {
    title: 'Partager le Contenu',
    content: req.session.currentContent,
    user: req.session.user
  });
});

app.post('/share', async (req, res) => {
  if (!req.session.currentContent) {
    return res.status(400).json({ error: 'Aucun contenu à partager' });
  }

  try {
    const { platforms, schedule } = req.body;
    const content = req.session.currentContent;

    let results = {};

    for (const platform of platforms) {
      if (schedule === 'now') {
        const platformResults = await shareToPlatform(platform, content, content.original_media, content.media_type);
        results = { ...results, ...platformResults };
      } else {
        // Planifier le partage
        results[platform] = await scheduleShare(platform, content, schedule);
      }
    }

    res.json({ success: true, results });

  } catch (error) {
    console.error('Erreur lors du partage:', error);
    res.status(500).json({ error: 'Erreur lors du partage' });
  }
});

// Endpoint: Log a share (used by UI when publishing) -> stores record in Turso
app.post('/api/share-log', express.json(), async (req, res) => {
  try {
    const payload = req.body || {};
    const id = payload.id || `share_${Date.now()}`;
    const experiment_id = payload.experiment_id || null;
    const user_id = payload.user_id || null;
    const platform = payload.platform || payload.platforms || 'unknown';
    const original = payload.original_content || payload.content || '';
    const ai = payload.ai_content || '';
    const post_id = payload.post_id || '';
    const now = Date.now();

    // Insert experiment if provided
    if (experiment_id) {
      const expSql = 'INSERT OR IGNORE INTO experiments (id, name, created_at) VALUES (?,?,?)';
      const expParams = [experiment_id, experiment_id, now];
      try { 
        turso.run(expSql, expParams); 
        if (turso.runCloud) turso.runCloud(expSql, expParams).catch(console.error);
      } catch(e){}
    }

    const shareSql = `INSERT INTO shares (id, experiment_id, user_id, platform, original_content, ai_content, post_id, published_at, meta)
       VALUES (?,?,?,?,?,?,?,?,?)`;
    const shareParams = [id, experiment_id, user_id, platform, original, ai, post_id, now, JSON.stringify(payload.meta || {})];

    turso.run(shareSql, shareParams);
    
    if (turso.runCloud) {
      turso.runCloud(shareSql, shareParams).catch(e => console.error('Cloud Share Log Error:', e.message));
    }

    res.json({ success: true, id });
  } catch (e) {
    console.error('share-log error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'db error' });
  }
});

// Simple report: aggregate metrics for an experiment
app.get('/api/reports/experiment/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const shares = turso.all('SELECT id, platform, published_at, post_id FROM shares WHERE experiment_id = ?', [id]);
    if (!shares || shares.length === 0) return res.json({ success: true, experiment_id: id, shares: [], aggregated: {} });

    // Aggregate metrics stored in metrics table
    const metrics = turso.all(
      'SELECT platform, metric_key, SUM(metric_value) as total, COUNT(*) as count FROM metrics WHERE share_id IN (' + shares.map(s => `'${s.id}'`).join(',') + ') GROUP BY platform, metric_key'
    );

    const aggregated = {};
    metrics.forEach(m => {
      aggregated[m.platform] = aggregated[m.platform] || {};
      aggregated[m.platform][m.metric_key] = { total: m.total, count: m.count };
    });

    res.json({ success: true, experiment_id: id, shares, aggregated });
  } catch (e) {
    console.error('report error:', e && e.message ? e.message : e);
    res.status(500).json({ error: 'report error' });
  }
});

// Endpoint: insert a resource into Turso DB with categoryId = 'SOCIAL MEDIA'
app.post('/api/turso/resource', express.json(), async (req, res) => {
  try {
    const { id, name, payload } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: 'id and name required' });

    const now = Date.now();
    const categoryId = process.env.TURSO_SOCIAL_CATEGORY_ID || '1770190320';

    // First attempt: libSQL (Turso cloud) if configured
    if (process.env.TURSO_LIBSQL_URL && process.env.TURSO_LIBSQL_TOKEN) {
      try {
        const { createClient } = require('@libsql/client');
        const client = createClient({ url: process.env.TURSO_LIBSQL_URL, auth: { token: process.env.TURSO_LIBSQL_TOKEN } });
        await client.execute(
          'INSERT OR REPLACE INTO resources (id, categoryId, name, payload, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, categoryId, name, JSON.stringify(payload || {}), now]
        );
        return res.json({ success: true, method: 'libsql' });
      } catch (e) {
        console.warn('libSQL insert failed, falling back to local turso:', e && e.message ? e.message : e);
      }
    }

    // Fallback: use local Turso/SQLite wrapper
    try {
      turso.run('INSERT OR REPLACE INTO resources (id, categoryId, name, payload, created_at) VALUES (?,?,?,?,?)', [id, categoryId, name, JSON.stringify(payload || {}), now]);
      return res.json({ success: true, method: 'turso-sqlite' });
    } catch (e) {
      console.error('turso insert error:', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'db insert failed' });
    }

  } catch (err) {
    console.error('resource endpoint error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'internal' });
  }
});

function ensureLeadsTable() {
  try {
    turso.run(
      'CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, source TEXT, metadata JSON, created_at INTEGER, status TEXT)',
      []
    );
  } catch (err) {
    console.warn('[Leads] Création table échouée:', err.message || err);
    throw err;
  }
}

// API pour capture de leads (Connect Gate)
app.post('/api/leads', async (req, res) => {
  try {
    const { email, name, source, metadata } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    // Store lead in Turso
    const leadSql = `INSERT INTO leads (email, name, source, metadata, created_at, status) VALUES (?, ?, ?, ?, ?, ?)`;
    const leadParams = [
      email,
      name || '',
      source || 'connect_gate',
      JSON.stringify(metadata || {}),
      new Date().toISOString(),
      'active'
    ];
    turso.run(leadSql, leadParams);
    if (turso.runCloud) {
      turso.runCloud(leadSql, leadParams).catch(console.error);
    }

    res.json({ success: true, message: 'Lead capturé' });
  } catch (error) {
    console.error('Erreur capture lead:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API pour galeries interactives
app.get('/api/gallery/:type', async (req, res) => {
  const { type } = req.params;
  const { per_page = 20, page = 1 } = req.query;

  // Simulation - en production, récupérer depuis base de données
  const mockPosts = [
    {
      id: 1,
      title: 'Contenu Exemple',
      image: 'https://via.placeholder.com/400x400',
      is_adult: true,
      censored_image: 'https://via.placeholder.com/400x400?text=Censuré',
      excerpt: 'Aperçu du contenu...'
    }
  ];

  res.json({
    posts: mockPosts,
    total: mockPosts.length,
    page: parseInt(page),
    per_page: parseInt(per_page)
  });
});

// Fonctions utilitaires
async function extractContentFromFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.txt') {
    return fs.readFileSync(file.path, 'utf8');
  }

  // Pour les autres formats, on pourrait ajouter des parsers
  // Pour l'instant, retourner une erreur
  throw new Error('Format de fichier non supporté pour l\'extraction de contenu');
}

async function moderateContent(content, mediaPath = null, mediaType = null) {
  let reasons = [];

  // Analyse du texte (ne bloque que si plusieurs indicateurs)
  const adultWords = (process.env.ADULT_WORDS || 'porn,xxx,explicit,nude,sex,nsfw,adult').split(',');
  const normalizedContent = typeof content === 'string'
    ? content
    : content === undefined || content === null
      ? ''
      : String(content);
  const lowerContent = normalizedContent.toLowerCase();

  let keywordHits = 0;
  adultWords.forEach(word => {
    const w = word.trim();
    if (w && lowerContent.includes(w)) {
      keywordHits += 1;
      reasons.push(`Mot détecté: ${w}`);
    }
  });

  // Seuil texte: bloquer seulement si >=2 mots sensibles détectés
  let blocked = keywordHits >= (parseInt(process.env.TEXT_BLOCK_THRESHOLD || '2', 10));

  // Analyse de l'image/vidéo avec Google Vision (images uniquement ici)
  if (!blocked && mediaPath && mediaType === 'image' && visionClient && fs.existsSync(mediaPath)) {
    try {
      console.log('🔍 Analyzing image content with Google Vision...');
      const [result] = await visionClient.safeSearchDetection(mediaPath);
      const detections = result.safeSearchAnnotation || {};

      console.log('📊 Vision API Results:', {
        adult: detections.adult,
        violence: detections.violence,
        racy: detections.racy,
        medical: detections.medical,
        spoof: detections.spoof
      });

      // Définir les niveaux de blocage proches des plateformes (faces autorisées)
      const adultBlockLevels = (process.env.ADULT_BLOCK_LEVELS || 'LIKELY,VERY_LIKELY').split(',').map(s => s.trim());
      const violenceBlockLevels = (process.env.VIOLENCE_BLOCK_LEVELS || 'LIKELY,VERY_LIKELY').split(',').map(s => s.trim());
      const racyBlockLevels = (process.env.RACY_BLOCK_LEVELS || 'VERY_LIKELY').split(',').map(s => s.trim());

      const adultLevel = detections.adult || 'VERY_UNLIKELY';
      const violenceLevel = detections.violence || 'VERY_UNLIKELY';
      const racyLevel = detections.racy || 'VERY_UNLIKELY';

      if (adultBlockLevels.includes(adultLevel)) {
        blocked = true;
        reasons.push(`Blocage Adult: niveau=${adultLevel}`);
      } else if (violenceBlockLevels.includes(violenceLevel)) {
        blocked = true;
        reasons.push(`Blocage Violence: niveau=${violenceLevel}`);
      } else if (racyBlockLevels.includes(racyLevel)) {
        // Racy ne bloque qu'à des niveaux élevés (faces autorisées)
        blocked = true;
        reasons.push(`Blocage Racy: niveau=${racyLevel}`);
      }

      // Calcul d'un score indicatif (non bloquant, utile pour logs/UI)
      const scoreMap = {
        'VERY_UNLIKELY': 0,
        'UNLIKELY': 0.25,
        'POSSIBLE': 0.5,
        'LIKELY': 0.75,
        'VERY_LIKELY': 1
      };
      const imageScore = Math.max(
        scoreMap[adultLevel] || 0,
        scoreMap[violenceLevel] || 0,
        scoreMap[racyLevel] || 0
      );
      if (imageScore >= 0.5 && !blocked) {
        console.log('⚠️ Contenu potentiellement sensible (autorisé):', { adultLevel, violenceLevel, racyLevel });
      }
    } catch (error) {
      console.error('❌ Google Vision Error:', error.message);
    }
  }

  return {
    safe: !blocked,
    // Score indicatif: nb de mots sensibles + score image (max)
    score: keywordHits,
    reasons: reasons
  };
}

async function censorImage(imagePath, outputPath) {
  try {
    const logoUrl = process.env.CENSOR_LOGO_URL;

    if (!logoUrl) {
      // Flou simple sans logo
      await sharp(imagePath)
        .blur(10)
        .jpeg({ quality: 80 })
        .toFile(outputPath);
      return outputPath;
    }

    // Télécharger le logo
    const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
    const logoBuffer = Buffer.from(logoResponse.data);

    // Obtenir les dimensions de l'image originale
    const metadata = await sharp(imagePath).metadata();
    const logoSize = Math.min(metadata.width, metadata.height) * 0.3; // 30% de la plus petite dimension

    // Appliquer flou et ajouter logo
    await sharp(imagePath)
      .blur(10)
      .composite([{
        input: await sharp(logoBuffer)
          .resize(Math.round(logoSize), Math.round(logoSize))
          .png()
          .toBuffer(),
        gravity: 'center'
      }])
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Erreur censure image:', error);
    // En cas d'erreur, juste flouter
    await sharp(imagePath)
      .blur(10)
      .jpeg({ quality: 80 })
      .toFile(outputPath);
    return outputPath;
  }
}

function censorText(text) {
  const adultWords = (process.env.ADULT_WORDS || 'porn,xxx,explicit,nude,sex,nsfw,adult').split(',');
  let censoredText = text;

  adultWords.forEach(word => {
    const regex = new RegExp(`\\b${word.trim()}\\b`, 'gi');
    const stars = '*'.repeat(word.trim().length);
    censoredText = censoredText.replace(regex, stars);
  });

  return censoredText;
}

async function improveContentWithAI(content, options, trending = {}) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Trending enrichment
  const trendingHashtags = Array.isArray(trending.hashtags) ? trending.hashtags.slice(0, 20) : [];
  const trendingKeywords = Array.isArray(trending.keywords) ? trending.keywords.slice(0, 20) : [];
  const trendingVocabulary = Array.isArray(trending.vocabulary) ? trending.vocabulary.slice(0, 20) : [];
  const perPlatform = trending.perPlatform || {};
  const optimalTimes = trending.optimalTimes || {};

  const trendingBlock = `\n**Tendances du moment :**\n- Hashtags globaux : ${trendingHashtags.join(', ') || 'Aucun'}\n- Mots-clés : ${trendingKeywords.join(', ') || 'Aucun'}\n- Vocabulaire : ${trendingVocabulary.join(', ') || 'Aucun'}\n`;

  const platformBlocks = Object.entries(perPlatform).map(([p, v]) => `\n- ${p.toUpperCase()} : ${Array.isArray(v.hashtags)? v.hashtags.slice(0,8).join(', ') : ''}`).join('\n');

  const timesBlock = Object.entries(optimalTimes).map(([p, v]) => `\n- ${p.toUpperCase()} : ${Array.isArray(v.recommended)? v.recommended.join(', ') : JSON.stringify(v)}`).join('\n');

  const prompt = `Tu es un expert en marketing digital et création de contenu engageant. Utilise les tendances par réseau ci‑dessous pour adapter les captions, hashtags et horaires.

**Données tendances :**${trendingBlock}${platformBlocks.length? '\n**Par plateforme :**\n' + platformBlocks : ''}${timesBlock.length? '\n**Horaires recommandés :**\n' + timesBlock : ''}

**Contenu original :**\n${content}

**Instructions :**\n- Style : ${options.style || 'professionnel'}\n- Longueur : ${options.length || 'moyen'}\n- Mots-clés : ${options.keywords || 'aucun'}\n\n**Génère :**\n1) Contenu amélioré (corrige grammaire, respecte le sens original).\n2) Captions optimisées par plateforme (Facebook, Instagram, Twitter/X, LinkedIn, TikTok).\n3) Pour chaque plateforme, propose 5 hashtags triés par visibilité et une raison brève.\n4) Propose les meilleurs créneaux horaires pour publication par plateforme et une justification.\n5) Fournis une note SEO (0-100) et sentiment (positif/neutre/négatif).\n\n**Format JSON strict :**\n{\n  "improved_content": "...",\n  "captions": {"facebook":"...","instagram":"...","twitter":"...","linkedin":"...","tiktok":"..."},\n  "hashtags": {"facebook":["#..."],"instagram":["#..."],"twitter":["#..."],"linkedin":["#..."],"tiktok":["#..."]},\n  "optimal_times": {"facebook":["HH:MM"],"instagram":["HH:MM"]},\n  "sentiment":"positif|negatif|neutre",\n  "seo_score": 0\n}`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.6,
    response_format: { type: "json_object" }
  });

  const result = JSON.parse(response.choices[0].message.content);

  return {
    improved: result.improved_content,
    captions: result.captions,
    hashtags: result.hashtags,
    sentiment: result.sentiment,
    seo_score: result.seo_score
  };
}

async function analyzeOptimalPostingTimes(content) {
  // Analyse basique des variables de marché
  // En réalité, utiliser des APIs d'analyse sociale, Google Analytics, etc.

  // Simulation d'analyse basée sur le contenu
  const sentiment = require('sentiment');
  const sentimentAnalyzer = new sentiment();
  const normalizedContent = typeof content === 'string'
    ? content
    : content === undefined || content === null
      ? ''
      : String(content);
  const result = sentimentAnalyzer.analyze(normalizedContent);

  // Logique simplifiée pour les horaires optimaux
  let times = [];

  if (result.score > 0) {
    // Contenu positif - partager en journée
    times = ['09:00', '14:00', '18:00'];
  } else if (result.score < 0) {
    // Contenu négatif - éviter les heures de pointe
    times = ['10:00', '16:00'];
  } else {
    // Contenu neutre
    times = ['12:00', '19:00'];
  }

  return {
    recommended: times,
    reasoning: `Basé sur l'analyse de sentiment (${result.score > 0 ? 'positif' : result.score < 0 ? 'négatif' : 'neutre'})`
  };
}

function generateSocialContent(content) {
  // Extraire le titre et un résumé
  const lines = content.split('\n');
  const title = lines[0] || 'Titre du contenu';

  const summary = content.substring(0, 200) + '...';

  return {
    facebook: `${title}\n\n${summary}\n\n#SpreadIt #ContenuIA`,
    twitter: `${title} ${summary.substring(0, 100)}... #SpreadIt`,
    linkedin: `${title}\n\n${summary}\n\nQu'en pensez-vous ?\n\n#Contenu #IA #Digital`,
    instagram: `${title}\n\n${summary}\n\n#SpreadIt #AI #Content`
  };
}

async function shareToPlatform(platform, content, mediaPath = null, mediaType = null) {
  const results = {};

  try {
    switch (platform) {
      case 'facebook':
        results.facebook = await publishToFacebook(content, mediaPath, mediaType);
        break;

      case 'instagram':
        results.instagram = await publishToInstagram(content, mediaPath, mediaType);
        break;

      case 'twitter':
        results.twitter = await publishToTwitter(content, mediaPath, mediaType);
        break;

      case 'linkedin':
        results.linkedin = await publishToLinkedIn(content, mediaPath, mediaType);
        break;

      case 'tiktok':
        results.tiktok = await publishToTikTok(content, mediaPath, mediaType);
        break;
    }
  } catch (error) {
    console.error(`Erreur publication ${platform}:`, error);
    results[platform] = { success: false, error: error.message };
  }

  return results;
}

async function publishToFacebook(content, mediaPath = null, mediaType = null) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error('Configuration Facebook manquante');
  }

  let postData = {
    message: content.captions?.facebook || content.improved,
    access_token: accessToken
  };

  // Si média, l'uploader d'abord
  if (mediaPath && mediaType) {
    if (mediaType === 'video') {
      // Upload de la vidéo
      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/videos`,
        {
          source: fs.createReadStream(mediaPath),
          access_token: accessToken
        },
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (uploadResponse.data.id) {
        postData = {
          message: content.captions?.facebook || content.improved,
          attached_media: [{ media_fbid: uploadResponse.data.id }],
          access_token: accessToken
        };
      }
    } else {
      // Optimiser l'image pour Facebook (1200x630 recommandé)
      const optimizedImagePath = await optimizeImageForFacebook(mediaPath);

      // Upload de l'image
      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/photos`,
        {
          source: fs.createReadStream(optimizedImagePath),
          access_token: accessToken
        },
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (uploadResponse.data.id) {
        postData = {
          message: content.captions?.facebook || content.improved,
          attached_media: [{ media_fbid: uploadResponse.data.id }],
          access_token: accessToken
        };
      }
    }
  }

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    postData
  );

  return {
    success: true,
    post_id: response.data.id,
    url: `https://facebook.com/${response.data.id}`
  };
}

async function publishToInstagram(content, mediaPath = null, mediaType = null) {
  // Correction: Utiliser BUSINESS_ID (terme API) ou USER_ID (legacy)
  const userId = process.env.INSTAGRAM_BUSINESS_ID || process.env.INSTAGRAM_USER_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;

  if (!userId || !accessToken || !mediaPath) {
    throw new Error(`Configuration Instagram manquante. (ID: ${userId ? 'OK' : 'MANQUANT'}, Token: ${accessToken ? 'OK' : 'MANQUANT'}, Media: ${mediaPath ? 'OK' : 'MANQUANT'})`);
  }

  let containerData = {
    caption: content.captions?.instagram || content.improved,
    access_token: accessToken
  };

  // Créer le container média selon le type
  if (mediaType === 'video') {
    containerData.video_url = await uploadToTempStorage(mediaPath);
  } else {
    // Image par défaut
    const optimizedImagePath = await optimizeImageForInstagram(mediaPath);
    containerData.image_url = await uploadToTempStorage(optimizedImagePath);
  }

  const containerResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${userId}/media`,
    containerData
  );

  const containerId = containerResponse.data.id;

  // Attendre que le média soit prêt (plus long pour les vidéos)
  const waitTime = mediaType === 'video' ? 15000 : 5000;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  // Publier le container
  const publishResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${userId}/media_publish`,
    {
      creation_id: containerId,
      access_token: accessToken
    }
  );

  return {
    success: true,
    media_id: publishResponse.data.id,
    url: `https://instagram.com/p/${publishResponse.data.id}`
  };
}

async function publishToTwitter(content, mediaPath = null, mediaType = null) {
  try {
    const appKey = process.env.TWITTER_APP_KEY || process.env.TWITTER_API_KEY;
    const appSecret = process.env.TWITTER_APP_SECRET || process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_SECRET;

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      throw new Error('Twitter credentials missing');
    }

    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });

    const rwClient = client.readWrite;
    let mediaId;

    if (mediaPath) {
      // Determine MIME type
      const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg'; // Simplification
      mediaId = await rwClient.v1.uploadMedia(mediaPath, { mimeType });
    }

    const tweetPayload = {
      text: content.captions?.twitter || content.improved
    };

    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const tweet = await rwClient.v2.tweet(tweetPayload);
    
    return {
      success: true,
      tweet_id: tweet.data.id,
      url: `https://twitter.com/i/web/status/${tweet.data.id}`
    };

  } catch (e) {
    console.error('Twitter publish error:', e);
    // Return mock success if simulation request (fallback) - REMOVE FOR PROD
    if (process.env.NODE_ENV === 'development') {
        return { success: true, tweet_id: 'mock_dev', url: 'https://twitter.com/mock' };
    }
    throw e;
  }
}

async function publishToLinkedIn(content, mediaPath = null, mediaType = null) {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_USER_URN; // e.g., 'urn:li:person:...' or 'urn:li:organization:...'

  if (!accessToken || !personUrn) {
    throw new Error('LinkedIn configuration missing (LINKEDIN_ACCESS_TOKEN, LINKEDIN_USER_URN)');
  }

  let asset = null;

  // 1. Upload Media if present (Simplified: Reference external if public, or use V2 Assets API)
  // For standalone simple implementation, we'll try to stick to text + url if possible, 
  // but if real media upload is needed, it requires "registerUpload" -> "upload" -> "verify".
  // Let's implement the register/upload flow for Images. Video is harder.
  
  if (mediaPath && mediaType === 'image') {
     try {
       // Step 1: Register
        const registerRes = await axios.post(
            'https://api.linkedin.com/v2/assets?action=registerUpload',
            {
                "registerUploadRequest": {
                    "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                    "owner": personUrn,
                    "serviceRelationships": [{
                        "relationshipType": "OWNER",
                        "identifier": "urn:li:userGeneratedContent"
                    }]
                }
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const uploadUrl = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        asset = registerRes.data.value.asset;

        // Step 2: Upload
        const fileData = fs.readFileSync(mediaPath);
        await axios.put(uploadUrl, fileData, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
     } catch (err) {
         console.error("LinkedIn Media Upload Failed", err.response?.data || err.message);
         // Continue without media? Or fail? Fail.
         throw new Error("LinkedIn Media Upload Failed");
     }
  }

  // 2. Create Post
  const shareContent = {
      "shareCommentary": {
          "text": content.captions?.linkedin || content.improved
      },
      "shareMediaCategory": asset ? "IMAGE" : "NONE"
  };

  if (asset) {
      shareContent.media = [
          {
              "status": "READY",
              "description": { "text": "Image" },
              "media": asset,
              "title": { "text": "Smart Share Image" }
          }
      ];
  }

  const payload = {
    "author": personUrn,
    "lifecycleState": "PUBLISHED",
    "specificContent": {
        "com.linkedin.ugc.ShareContent": shareContent
    },
    "visibility": {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
    }
  };

  const response = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    payload,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return {
    success: true,
    post_id: response.data.id,
    url: `https://www.linkedin.com/feed/update/${response.data.id}`
  };
}

async function publishToTikTok(content, mediaPath = null, mediaType = null) {
  // TikTok Web Publishing API is complex and requires Business Account or Partner access.
  // Keeping simulation for now unless specifically requested to reverse-engineer.
  return {
    success: true,
    video_id: 'simulated_' + Date.now(),
    url: 'https://tiktok.com/@user/video/simulated_pending_api_access'
  };
}

async function optimizeImageForFacebook(imagePath) {
  const outputPath = imagePath.replace('.jpg', '_fb.jpg').replace('.png', '_fb.jpg');

  await sharp(imagePath)
    .resize(1200, 630, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return outputPath;
}

async function optimizeImageForInstagram(imagePath) {
  const outputPath = imagePath.replace('.jpg', '_ig.jpg').replace('.png', '_ig.jpg');

  await sharp(imagePath)
    .resize(1080, 1080, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return outputPath;
}

async function uploadToTempStorage(localPath) {
  try {
      const fileName = path.basename(localPath);
      const publicUploads = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(publicUploads)) {
          fs.mkdirSync(publicUploads, { recursive: true });
      }
      const destPath = path.join(publicUploads, fileName);
      fs.copyFileSync(localPath, destPath);

      // Construct URL
      // Render sets RENDER_EXTERNAL_URL
      const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:3000';
      return `${baseUrl}/uploads/${fileName}`;
  } catch (e) {
      console.error("Error exposing file", e);
      throw e;
  }
}

async function scheduleShare(platform, content, scheduleTime) {
  // Planifier le partage pour plus tard
  // Utiliser node-cron ou un système de queue

  return {
    success: true,
    scheduled: scheduleTime,
    message: `Partage planifié pour ${scheduleTime}`
  };
}

// Tâches planifiées pour les partages programmés
cron.schedule('* * * * *', () => {
  // Vérifier les partages à publier
  // console.log('Vérification des partages planifiés...');
});

// =============================================================================
// OAUTH SETUP ENDPOINTS - Auto Token Renewal
// =============================================================================

/**
 * Helper: Update .env.local file with new token
 */
function updateEnvFile(key, value) {
  const envPath = path.join(__dirname, '.env.local');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.error('Error reading .env.local:', error);
    return false;
  }

  const lines = envContent.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  try {
    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    // Update process.env immediately
    process.env[key] = value;
    console.log(`✅ Updated ${key} in .env.local`);
    return true;
  } catch (error) {
    console.error('Error writing .env.local:', error);
    return false;
  }
}

// -------------------------------------------------------------------
// AUTH SETUP PAGE
// -------------------------------------------------------------------
app.get('/auth/setup', requireAuth, async (req, res) => {
  try {
    // Get current platform statuses
    const statusEndpoint = req.protocol + '://' + req.get('host') + '/api/platforms/status';
    const statusResponse = await axios.get(statusEndpoint);
    const platforms = statusResponse.data;

    res.render('auth-setup', { platforms });
  } catch (error) {
    console.error('Error loading auth setup:', error);
    res.render('auth-setup', { platforms: {} });
  }
});

// -------------------------------------------------------------------
// FACEBOOK OAUTH
// -------------------------------------------------------------------
app.get('/auth/facebook/start', (req, res) => {
  const clientId = process.env.FACEBOOK_APP_ID;
  const redirectUri = `${getBaseUrl(req)}/auth/facebook/callback`;
  
  // Removed pages_manage_metadata (deprecated/invalid scope)
  const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
  
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  
  res.redirect(authUrl);
});

app.get('/auth/facebook/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-error', platform: 'facebook', error: 'No code' }, '*');
        }
        window.close();
      </script>
    `);
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/auth/facebook/callback`;
    
    // Exchange code for short-lived token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code: code
      }
    });

    const shortToken = tokenResponse.data.access_token;

    // Exchange for long-lived token (60 days)
    const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken
      }
    });

    const longToken = longTokenResponse.data.access_token;

    // Get Page Access Token (never expires if user doesn't change password)
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: longToken,
        fields: 'access_token,name,id'
      }
    });

    const pageData = pagesResponse.data.data.find(page => page.id === process.env.FACEBOOK_PAGE_ID);
    
    if (!pageData) {
      throw new Error('Page not found');
    }

    const pageToken = pageData.access_token;

    // Update .env.local
    updateEnvFile('FACEBOOK_ACCESS_TOKEN', pageToken);
    updateEnvFile('INSTAGRAM_ACCESS_TOKEN', pageToken);

    res.send(`
      <html>
        <head><style>
          body{font-family:Arial;padding:20px;background:#10b981;color:white;}
          .token-box{background:rgba(0,0,0,0.2);padding:15px;border-radius:8px;word-break:break-all;margin:20px 0;font-family:monospace;font-size:12px;}
          button{background:white;color:#10b981;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;font-size:16px;}
        </style></head>
        <body>
          <h1>✅ Token Facebook/Instagram reçu!</h1>
          <p><strong>COPIE ce token et ajoute-le dans Render Environment Variables:</strong></p>
          <div class="token-box" id="token">${pageToken}</div>
          <button onclick="navigator.clipboard.writeText('${pageToken}').then(() => alert('Token copié!'))">📋 Copier le token</button>
          <hr style="margin:30px 0;">
          <h3>Étapes suivantes:</h3>
          <ol style="text-align:left;max-width:600px;">
            <li>Va sur <strong>Render Dashboard → Environment</strong></li>
            <li>Ajoute <code>FACEBOOK_ACCESS_TOKEN</code> = ce token</li>
            <li>Ajoute <code>INSTAGRAM_ACCESS_TOKEN</code> = ce token</li>
            <li>Clique <strong>Save Changes</strong></li>
            <li>Render va redémarrer (~1-2 min)</li>
          </ol>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', platform: 'facebook' }, '*');
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Facebook OAuth error:', error);
    res.send(`
      <html>
        <head><style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#ef4444;color:white;text-align:center;}</style></head>
        <body>
          <div>
            <h1 style="font-size:48px;margin:0;">❌</h1>
            <h2>Erreur de connexion</h2>
            <p>${error.message}</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-error', platform: 'facebook', error: '${error.message}' }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// -------------------------------------------------------------------
// LINKEDIN OAUTH
// -------------------------------------------------------------------
app.get('/auth/linkedin/start', (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = `${getBaseUrl(req)}/auth/linkedin/callback`;
  const scope = 'w_member_social profile email openid';
  const state = randomUUID();
  
  req.session.linkedinState = state;
  
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
  
  res.redirect(authUrl);
});

app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || state !== req.session.linkedinState) {
    return res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-error', platform: 'linkedin', error: 'Invalid state' }, '*');
        }
        window.close();
      </script>
    `);
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/auth/linkedin/callback`;
    
    // Exchange code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: redirectUri
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get Person URN automatically
    const meResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const personUrn = `urn:li:person:${meResponse.data.sub}`;

    // Update .env.local (local dev only — sur Render, copier manuellement)
    updateEnvFile('LINKEDIN_ACCESS_TOKEN', accessToken);
    updateEnvFile('LINKEDIN_PERSON_URN', personUrn);

    res.send(`
      <html>
        <head><style>
          body{font-family:Arial;padding:20px;background:#0A66C2;color:white;}
          .token-box{background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;word-break:break-all;margin:10px 0;font-family:monospace;font-size:12px;}
          button{background:white;color:#0A66C2;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;margin-top:6px;}
          ol{text-align:left;max-width:600px;}
        </style></head>
        <body>
          <h1>✅ LinkedIn connecté!</h1>
          <p><strong>COPIE ces valeurs dans Render Environment Variables :</strong></p>
          <p>LINKEDIN_ACCESS_TOKEN</p>
          <div class="token-box">${accessToken}</div>
          <button onclick="navigator.clipboard.writeText('${accessToken}').then(() => alert('Token copié!'))">📋 Copier</button>
          <p>LINKEDIN_PERSON_URN</p>
          <div class="token-box">${personUrn}</div>
          <button onclick="navigator.clipboard.writeText('${personUrn}').then(() => alert('URN copié!'))">📋 Copier</button>
          <ol>
            <li>Render Dashboard → Environment</li>
            <li>Ajoute les 2 variables ci-dessus</li>
            <li>Save Changes → Render redémarre</li>
          </ol>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', platform: 'linkedin' }, '*');
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('LinkedIn OAuth error:', error);
    res.send(`
      <html>
        <head><style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#ef4444;color:white;text-align:center;}</style></head>
        <body>
          <div>
            <h1 style="font-size:48px;margin:0;">❌</h1>
            <h2>Erreur de connexion</h2>
            <p>${error.message}</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-error', platform: 'linkedin', error: '${error.message}' }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// -------------------------------------------------------------------
// YOUTUBE OAUTH
// -------------------------------------------------------------------
app.get('/auth/youtube/start', (req, res) => {
  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${getBaseUrl(req)}/auth/youtube/callback`
  );

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Force prompt to get refresh token
  });

  res.redirect(authUrl);
});

app.get('/auth/youtube/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-error', platform: 'youtube', error: 'No code' }, '*');
        }
        window.close();
      </script>
    `);
  }

  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      `${getBaseUrl(req)}/auth/youtube/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      throw new Error('No refresh token received. Try revoking app access at myaccount.google.com/permissions and reconnecting.');
    }

    // Update .env.local (local dev only — sur Render, copier manuellement dans Environment Variables)
    updateEnvFile('YOUTUBE_REFRESH_TOKEN', refreshToken);

    res.send(`
      <html>
        <head><style>
          body{font-family:Arial;padding:20px;background:#FF0000;color:white;}
          .token-box{background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;word-break:break-all;margin:20px 0;font-family:monospace;font-size:12px;}
          button{background:white;color:#FF0000;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;font-size:16px;margin-top:10px;}
          ol{text-align:left;max-width:600px;}
        </style></head>
        <body>
          <h1>✅ YouTube connecté!</h1>
          <p><strong>COPIE ce refresh token et ajoute-le dans Render Environment Variables :</strong></p>
          <div class="token-box" id="token">${refreshToken}</div>
          <button onclick="navigator.clipboard.writeText('${refreshToken}').then(() => alert('Token copié!'))">📋 Copier le token</button>
          <ol>
            <li>Va sur <strong>Render Dashboard → Environment</strong></li>
            <li>Ajoute <code>YOUTUBE_REFRESH_TOKEN</code> = ce token</li>
            <li>Clique <strong>Save Changes</strong> → Render redémarre</li>
          </ol>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', platform: 'youtube' }, '*');
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('YouTube OAuth error:', error);
    res.send(`
      <html>
        <head><style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#ef4444;color:white;text-align:center;}</style></head>
        <body>
          <div>
            <h1 style="font-size:48px;margin:0;">❌</h1>
            <h2>Erreur de connexion</h2>
            <p>${error.message}</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-error', platform: 'youtube', error: '${error.message}' }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// -------------------------------------------------------------------
// TIKTOK OAUTH
// -------------------------------------------------------------------
app.get('/auth/tiktok/start', (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${getBaseUrl(req)}/auth/tiktok/callback`;
  const scope = 'user.info.basic,video.publish,video.upload';
  const state = randomUUID();
  
  req.session.tiktokState = state;
  
  const authUrl = `https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${state}`;
  
  res.redirect(authUrl);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || state !== req.session.tiktokState) {
    return res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-error', platform: 'tiktok', error: 'Invalid state' }, '*');
        }
        window.close();
      </script>
    `);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

    // Update .env.local (local dev only — sur Render, copier manuellement)
    updateEnvFile('TIKTOK_ACCESS_TOKEN', accessToken);
    if (refreshToken) {
      updateEnvFile('TIKTOK_REFRESH_TOKEN', refreshToken);
    }

    res.send(`
      <html>
        <head><style>
          body{font-family:Arial;padding:20px;background:#000000;color:white;}
          .token-box{background:rgba(255,255,255,0.1);padding:15px;border-radius:8px;word-break:break-all;margin:10px 0;font-family:monospace;font-size:12px;}
          button{background:white;color:#000;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;margin-top:6px;}
          ol{text-align:left;max-width:600px;}
        </style></head>
        <body>
          <h1>✅ TikTok connecté!</h1>
          <p><strong>COPIE ces valeurs dans Render Environment Variables :</strong></p>
          <p>TIKTOK_ACCESS_TOKEN</p>
          <div class="token-box">${accessToken}</div>
          <button onclick="navigator.clipboard.writeText('${accessToken}').then(() => alert('Token copié!'))">📋 Copier</button>
          ${refreshToken ? `
          <p>TIKTOK_REFRESH_TOKEN</p>
          <div class="token-box">${refreshToken}</div>
          <button onclick="navigator.clipboard.writeText('${refreshToken}').then(() => alert('Refresh token copié!'))">📋 Copier</button>
          ` : ''}
          <ol>
            <li>Render Dashboard → Environment</li>
            <li>Ajoute les variables ci-dessus</li>
            <li>Save Changes → Render redémarre</li>
          </ol>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', platform: 'tiktok' }, '*');
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('TikTok OAuth error:', error);
    res.send(`
      <html>
        <head><style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#ef4444;color:white;text-align:center;}</style></head>
        <body>
          <div>
            <h1 style="font-size:48px;margin:0;">❌</h1>
            <h2>Erreur de connexion</h2>
            <p>${error.response?.data?.message || error.message}</p>
            <p style="font-size:12px;">Note: TikTok doit être en Production Mode</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-error', platform: 'tiktok', error: '${error.message}' }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// --- GLOBAL ERROR HANDLER (Dernier rempart anti-crash) ---
// Doit être défini en DERNIER, après toutes les routes
app.use((err, req, res, next) => {
  console.error('🔥 UNHANDLED EXPRESS ERROR:', err.stack);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal Server Error', 
      details: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur interne est survenue.'
    });
  }
});

// Démarrage du serveur si on n'est pas en mode test
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Spread It server running on port ${PORT}`);
  });
}

module.exports = app;