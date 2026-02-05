const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment');
const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const { MongoClient } = require('mongodb');
const { fetchTrendingTopics } = require('./services/trending');
const turso = require('./db/turso');
const { TwitterApi } = require('twitter-api-v2'); // Ajout pour Twitter
const FormData = require('form-data'); // Ajout pour Facebook Upload
const { spawn } = require('child_process');

// Nouveaux Services d'Intelligence
const Strategist = require('./services/strategist');
const VideoAI = require('./services/video-ai');
const googleTrends = require('google-trends-api');

// Configure layout if using ejs-layouts
// const expressLayouts = require('express-ejs-layouts');
// app.use(expressLayouts);

// Charge d'abord .env.local (perso), puis .env (template) si présent
const defaultEnvPath = path.join(__dirname, '.env');
const localEnvPath = path.join(__dirname, '.env.local');

if (fs.existsSync(defaultEnvPath)) {
  require('dotenv').config({ path: defaultEnvPath });
}

if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath, override: true });
}

const app = express();

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

  // MongoDB (optional)
  const useMongo = (process.env.USE_MONGO || 'false') === 'true';
  if (useMongo && !isSet(process.env.MONGODB_URI)) {
    issues.push('USE_MONGO=true but MONGODB_URI is missing.');
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
    linkedin: { maxLen: 700, maxTags: 5, sepLine: false }
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

let mongoClient = null;

// Initialisation MongoDB & Strategist (optionnel via USE_MONGO)
let db;
let strategist;
const USE_MONGO = (process.env.USE_MONGO || 'false') === 'true';

if (USE_MONGO) {
  mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
  async function connectDB() {
    try {
      await mongoClient.connect();
      db = mongoClient.db(process.env.MONGODB_DB_NAME || 'spreadit_db');
      strategist = new Strategist(db);
      console.log("✅ MongoDB & Strategist Connected");
    } catch (e) {
      console.warn("⚠️ MongoDB Connection Failed. Strategist running in memory-only mode.");
      strategist = new Strategist(null);
    }
  }
  connectDB();
} else {
  strategist = new Strategist(null);
  console.info("ℹ️ MongoDB disabled (USE_MONGO=false). Strategist running memory-only.");
}

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
      retries: 1
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

// Configuration MongoDB pour lead generation (Utilise l'instance globale déjà initialisée)
/* 
 * mongoClient est déjà initialisé plus haut.
 * On s'assure juste que la référence est disponible si nécessaire.
 */


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

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Init Turso/SQLite DB (optional)
try {
  turso.init();
  turso.migrate();
  console.info('✅ Turso/SQLite DB initialized');
} catch (e) {
  console.warn('Turso DB not initialized:', e && e.message ? e.message : e);
}

// Routes

// Schedule periodic trending refresh (every 15 minutes)
try {
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('⏱️ Refreshing trending topics (cron)');
      await fetchTrendingTopics(true);
      console.log('✅ Trending refreshed');
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
app.post('/api/smart-share-submit', express.json(), async (req, res) => {
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
        console.log("⬇️  Downloading media...");
        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream'
        });

        const w = fs.createWriteStream(tempFilePath);
        response.data.pipe(w);

        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
        });
        console.log("✅ Download complete:", tempFilePath);

        // VÉRIFICATION GLOBALE ANTI-DETECTION
        if (platforms.length > 2) {
            console.log(`⚠️  WARNING: Posting to ${platforms.length} platforms simultaneously may trigger Facebook automation detection`);
            console.log(`💡 RECOMMENDATION: Consider posting to 1-2 platforms max per submission`);
        }

        // VÉRIFICATION DE FRÉQUENCE GLOBALE: Max 5 posts par heure au total
        const allRecentPosts = await strategist.getAllRecentPosts(60 * 60 * 1000); // Dernière heure
        if (allRecentPosts.length + platforms.length > 5) {
            console.log(`🚨 RATE LIMIT WARNING: ${allRecentPosts.length} posts in last hour + ${platforms.length} new = ${allRecentPosts.length + platforms.length} total`);
            console.log(`⏳ Facebook may block automation. Consider waiting before posting more.`);
        }

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

             // VÉRIFICATION DE FRÉQUENCE: Pas plus de 3 posts par heure
             const recentPosts = await strategist.getRecentPosts(platform, 60 * 60 * 1000); // Dernière heure
             if (recentPosts.length >= 3) {
                 console.log(`⚠️  Rate limit: Too many posts to ${platform} in the last hour (${recentPosts.length})`);
                 return {
                     success: false,
                     platform,
                     error: `Rate limit exceeded: ${recentPosts.length} posts in last hour. Facebook blocks automation.`
                 };
             }

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
                 
                 // Fallback pour vidéo (plus complexe en binaire) ou si pas de fichier local
                 else {
                     let fbEndpoint = `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`;
                     let payload = {
                        access_token: fbToken,
                        message: platformCaption + '\n\n' + platformHashtags
                     };

                     if (mediaType === 'image') {
                         fbEndpoint = `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/photos`;
                         payload.url = mediaUrl; 
                     } else if (mediaType === 'video') {
                         payload.link = mediaUrl; 
                     }

                     const response = await axios.post(fbEndpoint, payload);
                     return { success: true, platform, id: response.data.id };
                 }
             }

             // --- INSTAGRAM BUSINESS ---
             if (platform === 'instagram') {
                 const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;

                 if (!igToken || !process.env.INSTAGRAM_BUSINESS_ID) {
                      return { success: false, platform, error: "Missing INSTAGRAM_BUSINESS_ID or Token" };
                 }

                 // 1. Create Media Container
                 const containerEndpoint = `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media`;
                 const containerRes = await axios.post(containerEndpoint, {
                     image_url: mediaUrl, // MUST be public
                     caption: platformCaption + '\n\n' + platformHashtags,
                     access_token: igToken
                 });
                 
                 const creationId = containerRes.data.id;

                 // 2. Publish Media
                 const publishEndpoint = `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}/media_publish`;
                 const publishRes = await axios.post(publishEndpoint, {
                     creation_id: creationId,
                     access_token: igToken
                 });

                 return { success: true, platform, id: publishRes.data.id };
             }

             // --- LINKEDIN ---
             if (platform === 'linkedin') {
                 // Requires LinkedIn API setup which is complex (URNs, Assets).
                 // Returning mock with error warning for now unless configured.
                 if(!process.env.LINKEDIN_ACCESS_TOKEN) 
                    return { success: false, platform, error: "Missing LINKEDIN_ACCESS_TOKEN" };
                
                // (Implementation omitted for brevity, would require 'author' URN and media upload flow)
                return { success: true, platform, id: 'mock_linkedin_' + Date.now(), warning: "LinkedIn implementation pending" };
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
                    
                    turso.run(
                        `INSERT INTO shares (id, experiment_id, user_id, platform, original_content, ai_content, post_id, published_at, meta)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            backupId,           // id
                            'smart_share',      // experiment_id
                            'system_user',      // user_id
                            result.platform,    // platform
                            caption,            // original_content
                            caption,            // ai_content (final)
                            result.id,          // post_id
                            Date.now(),         // published_at
                            JSON.stringify(metaData) // meta
                        ]
                    );
                    console.log(`💾 Post saved to permanent history (SQLite) for ${result.platform}`);
                } catch (dbErr) {
                    console.error("⚠️ Backup save to SQLite failed:", dbErr.message);
                }
            }
        }

        res.json({ 
            success: errors.length === 0, 
            results, 
            errors,
            message: errors.length > 0 ? "Some platforms failed due to missing keys." : "Published successfully!" 
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

app.post('/api/create-post-ai', express.json(), async (req, res) => {
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
app.post('/api/ai-edit', express.json(), async (req, res) => {
  try {
    const { platform = 'facebook', instruction = '', lockedText = '', aiText = '' } = req.body || {};
    const base = aiText || '';

    // Get real-time market patterns and top performers to ensure cohesion
    const marketTrends = await strategist.analyzeMarketTrends(platform);
    const topPerformers = await strategist.analyzeTopPerformers(platform);

    const patterns = marketTrends?.patterns || {};
    const hooks = Array.isArray(patterns.successfulHooks) ? patterns.successfulHooks.slice(0, 3) : [];
    const topTags = (topPerformers?.topHashtags || []).slice(0, 10).map(h => h.tag).join(' ');

    const sys = `You are an expert ${platform} editor. Apply the user's instruction to improve ONLY the AI section of a post while aligning with current market patterns. STRICT RULES: 1) Do NOT include or modify LOCKED_TEXT; it will be appended separately. 2) Return only the edited AI section as plain text, no markdown, no quotes. 3) Follow platform style: keep length near avgLength=${Math.round(patterns.avgLength || 140)}, emojiRatio~${patterns.emojiRatio||0}, questionRatio~${patterns.questionRatio||0}, hashtagRatio~${patterns.hashtagRatio||0}, ctaRatio~${patterns.ctaRatio||0}. 4) Prefer hooks: ${hooks.join(' | ')}. 5) Prefer proven hashtags when relevant.`;

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
    title: 'Spread It - Créateur de Contenu IA',
    user: req.session.user
  });
});

app.get('/create', (req, res) => {
  res.redirect('/composer');
});

// New composer UI (Standalone) - stack cards + AI chat popup
app.get('/composer', (req, res) => {
  const configured = {
      linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN || (req.session.tokens && req.session.tokens.linkedin)),
      facebook: !!(process.env.FACEBOOK_ACCESS_TOKEN || (req.session.tokens && req.session.tokens.facebook)),
      twitter: !!(process.env.TWITTER_ACCESS_TOKEN),
      instagram: !!(process.env.INSTAGRAM_ACCESS_TOKEN),
      tiktok: false 
  };

  res.render('composer', {
    title: 'Composer - Spread It',
    user: req.session.user,
    configured
  });
});

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
             systemPrompt = `
      Tu es un expert en Social Media "Newsjacking" pour Spread It.
      
      CONTEXTE MEDIA : ${analysisContext}
      
      RÈGLES FONDAMENTALES :
      1. CONTENU UTILISATEUR : Le texte fourni est la base absolue. Si l'utilisateur donne beaucoup de détails ou d'explications, respecte scrupuleusement ces instructions. Ton rôle est de structurer et optimiser, pas d'inventer.
      2. TENDANCE : Lie le sujet à la tendance actuelle : ${currentTrend}.
      3. INFLUENCEUR : Mentionne obligatoirement ${influencer.name} (@${influencer.handle}) dans le style "${influencer.style}".
      4. BRANDING : N'oublie pas que le post inclura un petit logo "Spread It" en filigrane pour la publicité.
      5. GRAMMAIRE/TON : Garde un ton humain, authentique, voire imparfait. Fuis le phrasé robotique.
      
      INSTRUCTION UX (SHOWROOM) :
      - Le média (vidéo ou image) est affiché DANS LES CARTES SOCIALES "cards" (Showroom) pour prévisualisation.
      - Il NE DOIT PAS être traité comme une pièce jointe au chat.
      - Dans "reply", donne uniquement du conseil stratégique. Ne dis pas "Voici la vidéo".
      
      FORMATAGE VARIABLE (ADAPTATION STRICTE PAR CARTE) :
      - Facebook : Format "Storytelling" accepté. Texte plus long (si le contenu le justifie), paragraphes aérés, usage modéré d'emojis.
      - Instagram : Priorité au visuel. Légende engageante mais concise, bloc de hashtags séparé.
      - Twitter : Punchline immédiate. Moins de 280 caractères, hashtags intégrés au texte.
      - LinkedIn : Ton expert/pro. Structure : Accroche -> Développement -> Leçon -> Question ouverte.
      
      FORMAT JSON STRICT :
      {
         "reply": "Conseil stratégique bref (ex: Pourquoi cet angle newsjacking fonctionne avec ce visuel).",
         "cards": {
             "facebook": "Post complet FB...",
             "instagram": "Légende Insta (visuel fort)...",
             "twitter": "Tweet percutant...",
             "linkedin": "Post LinkedIn structuré...",
             "tiktok": "Script/Description TikTok..."
         },
         "mediaUsed": ${JSON.stringify(selectedMedia || null)} 
      }
      `;
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
      try { turso.run('INSERT OR IGNORE INTO experiments (id, name, created_at) VALUES (?,?,?)', [experiment_id, experiment_id, now]); } catch(e){}
    }

    turso.run(
      `INSERT INTO shares (id, experiment_id, user_id, platform, original_content, ai_content, post_id, published_at, meta)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, experiment_id, user_id, platform, original, ai, post_id, now, JSON.stringify(payload.meta || {})]
    );

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

    if (USE_MONGO && mongoClient) {
      await mongoClient.connect();
      const db = mongoClient.db(process.env.MONGODB_DB_NAME || 'spreadit_db');
      const collection = db.collection('leads');

      await collection.insertOne({
        email,
        name: name || '',
        source: source || 'connect_gate',
        metadata: metadata || {},
        createdAt: new Date(),
        status: 'active'
      });
    } else {
      ensureLeadsTable();
      turso.run(
        'INSERT INTO leads (id, email, name, source, metadata, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          randomUUID(),
          email,
          name || '',
          source || 'connect_gate',
          JSON.stringify(metadata || {}),
          Date.now(),
          'active'
        ]
      );
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
  const userId = process.env.INSTAGRAM_USER_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!userId || !accessToken || !mediaPath) {
    throw new Error('Configuration Instagram manquante ou pas de média');
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
  console.log('Vérification des partages planifiés...');
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