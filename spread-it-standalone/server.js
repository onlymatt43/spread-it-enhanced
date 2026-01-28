const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment');
const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const { MongoClient } = require('mongodb');
const { fetchTrendingTopics } = require('./services/trending');
const { TwitterApi } = require('twitter-api-v2'); // Ajout pour Twitter
const FormData = require('form-data'); // Ajout pour Facebook Upload

// Nouveaux Services d'Intelligence
const Strategist = require('./services/strategist');
const VideoAI = require('./services/video-ai');

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
const cookieSameSite = process.env.SESSION_COOKIE_SAMESITE || 'lax';

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

// Initialisation MongoDB & Strategist
let db;
let strategist;
const mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

async function connectDB() {
  try {
    await mongoClient.connect();
    db = mongoClient.db('spreadit_db');
    strategist = new Strategist(db);
    console.log("✅ MongoDB & Strategist Connected");
  } catch (e) {
    console.warn("⚠️ MongoDB Connection Failed. Strategist running in memory-only mode.");
    strategist = new Strategist(null);
  }
}
connectDB();

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

// Routes

// --- NEW ENDPOINT: Handles the actual submission from the popup ---
app.post('/api/smart-share-submit', express.json(), async (req, res) => {
    try {
        const { mediaUrl, mediaType, caption, platforms, hashtags } = req.body;
        console.log("🚀 Receiving Smart Share Submission:", { mediaUrl, platforms });

        // 1. Download the media temporarily so we can upload it
        // (Note: Many APIs require a local file stream or binary buffer, 
        // passing a raw URL often fails if the platform needs to re-host it)
        const tempFilePath = path.join(__dirname, 'temp_' + Date.now() + (mediaType === 'video' ? '.mp4' : '.jpg'));
        
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

        // 3. Cleanup temp file
        fs.unlinkSync(tempFilePath);

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
    }
});

app.post('/api/create-post-ai', express.json(), async (req, res) => {
    try {
        const { content, options, mediaUrl, mediaType } = req.body;
        
        console.log(`🧠 AI Strategy working for ${options.platform}...`);

        // 1. Si c'est une vidéo, analyser d'abord le contenu visuel profond
        let videoContext = {};
        if (mediaType === 'video' && mediaUrl) {
           videoContext = await VideoAI.analyzeVideo(mediaUrl);
           console.log("Video Context:", videoContext.summary);
        }

        // 2. Le Strategist combine tout (Rules + Trends + History + Content)
        // Il enrichit le prompt de base avec les données vidéos
        const enrichedContent = videoContext.summary 
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
  res.render('create', {
    title: 'Créer du Contenu',
    user: req.session.user
  });
});

app.get('/smart-share', (req, res) => {
    const { image, video, title, text, source } = req.query;
    res.render('smart-share', {
        title: 'Smart Share',
        data: {
            image,
            video,
            title,
            text,
            source
        }
    });
});

app.post('/create', upload.single('content_file'), async (req, res) => {
  try {
    let content = req.body.content || '';
    let mediaPath = null;
    let mediaType = null;

    // Si un fichier est uploadé, extraire le contenu
    if (req.file) {
      if (req.file.mimetype.startsWith('image/')) {
        mediaPath = req.file.path;
        mediaType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        mediaPath = req.file.path;
        mediaType = 'video';
      } else {
        content = await extractContentFromFile(req.file);
        mediaType = 'document';
      }
    }

    if (!content.trim() && !mediaPath) {
      return res.status(400).json({ error: 'Contenu, image ou vidéo requis' });
    }

    // Modération du contenu
    const moderationResult = await moderateContent(content, mediaPath, mediaType);
    if (!moderationResult.safe) {
      return res.status(400).json({
        error: 'Contenu inapproprié détecté',
        score: moderationResult.score,
        reasons: moderationResult.reasons
      });
    }

    // Tendance du moment pour enrichir le prompt
    const trendingContext = await fetchTrendingTopics();

    // Amélioration du contenu avec IA
    const aiResult = await improveContentWithAI(content, req.body, trendingContext);

    // Générer les versions censurées si nécessaire
    let censoredContent = null;
    let censoredMediaPath = null;

    if (moderationResult.score > 0) {
      censoredContent = censorText(aiResult.improved);

      if (mediaPath && mediaType === 'image') {
        censoredMediaPath = mediaPath.replace('.jpg', '_censored.jpg').replace('.png', '_censored.png').replace('.gif', '_censored.gif');
        await censorImage(mediaPath, censoredMediaPath);
      }
    }

    // Analyse du timing optimal
    const optimalTimes = await analyzeOptimalPostingTimes(aiResult);

    // Sauvegarder dans la session
    req.session.currentContent = {
      original: content,
      improved: aiResult.improved,
      captions: aiResult.captions,
      hashtags: aiResult.hashtags,
      sentiment: aiResult.sentiment,
      seo_score: aiResult.seo_score,
      optimalTimes: optimalTimes,
      trending: trendingContext,
      is_adult: moderationResult.score > 0,
      censored_content: censoredContent,
      censored_media: censoredMediaPath,
      original_media: mediaPath,
      media_type: mediaType,
      createdAt: new Date()
    };

    return req.session.save((sessionError) => {
      if (sessionError) {
        console.error('Erreur sauvegarde session:', sessionError);
        return res.status(500).json({ error: 'Impossible de sauvegarder la session' });
      }

      res.json({
        success: true,
        content: aiResult.improved,
        captions: aiResult.captions,
        hashtags: aiResult.hashtags,
        optimalTimes: optimalTimes,
        trending: trendingContext,
        moderation: moderationResult,
        censored: censoredContent ? {
          content: censoredContent,
          image: censoredMediaPath
        } : null
      });
    });

  } catch (error) {
    console.error('Erreur lors de la création:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
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

// API pour capture de leads (Connect Gate)
app.post('/api/leads', async (req, res) => {
  try {
    const { email, name, source, metadata } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    if (mongoClient) {
      await mongoClient.connect();
      const db = mongoClient.db('spread_it_leads');
      const collection = db.collection('leads');

      await collection.insertOne({
        email: email,
        name: name || '',
        source: source || 'connect_gate',
        metadata: metadata || {},
        createdAt: new Date(),
        status: 'active'
      });
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
        // Racy ne bloque que aux niveaux très élevés (faces autorisées)
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

  const trendingHashtags = Array.isArray(trending.hashtags) ? trending.hashtags.slice(0, 10) : [];
  const trendingKeywords = Array.isArray(trending.keywords) ? trending.keywords.slice(0, 10) : [];
  const trendingVocabulary = Array.isArray(trending.vocabulary) ? trending.vocabulary.slice(0, 10) : [];

  const trendingBlock = (trendingHashtags.length || trendingKeywords.length || trendingVocabulary.length)
    ? `\n**Tendances du moment :**\n- Hashtags populaires : ${trendingHashtags.join(', ') || 'Aucun'}\n- Thèmes dominants : ${trendingKeywords.join(', ') || 'Aucun'}\n- Vocabulaire à privilégier : ${trendingVocabulary.join(', ') || 'Aucun'}\n`
    : '';

  const prompt = `Tu es un expert en marketing digital et création de contenu engageant.

Analyse ce contenu et génère des optimisations pour les réseaux sociaux :

**Contenu original :**
${content}

**Instructions :**
- Style : ${options.style || 'sexy-bold-confident'}
- Longueur : ${options.length || 'moyen'}
- Mots-clés : ${options.keywords || 'aucun'}
${trendingBlock}

**Génère :**
1. **Contenu amélioré** : Version corrigée et optimisée (garde le ton humain)
2. **Captions par plateforme** : Adaptées à chaque réseau
3. **Hashtags** : 6 hashtags trending Facebook
4. **Analyse sentiment** : positif/négatif/neutre

**Format JSON :**
{
  "improved_content": "contenu amélioré",
  "captions": {
    "facebook": "caption optimisée Facebook",
    "instagram": "caption optimisée Instagram",
    "twitter": "caption optimisée Twitter (max 280 chars)",
    "linkedin": "caption optimisée LinkedIn",
    "tiktok": "caption optimisée TikTok"
  },
  "hashtags": ["#hashtag1", "#hashtag2", ...],
  "sentiment": "positif|negatif|neutre",
  "seo_score": 85
}`;

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
  // Simulation - utiliser twitter-api-v2 en production
  return {
    success: true,
    tweet_id: 'simulated_' + Date.now(),
    url: 'https://twitter.com/status/simulated'
  };
}

async function publishToLinkedIn(content, mediaPath = null, mediaType = null) {
  // Simulation - utiliser LinkedIn API en production
  return {
    success: true,
    post_id: 'simulated_' + Date.now(),
    url: 'https://linkedin.com/post/simulated'
  };
}

async function publishToTikTok(content, mediaPath = null, mediaType = null) {
  // Simulation - utiliser TikTok API en production
  return {
    success: true,
    video_id: 'simulated_' + Date.now(),
    url: 'https://tiktok.com/@user/video/simulated'
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
  // Simulation - en production, uploader vers un service de stockage temporaire
  return `https://temp-storage.example.com/${path.basename(localPath)}`;
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


// Démarrage du serveur si on n'est pas en mode test
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Spread It server running on port ${PORT}`);
  });
}

// --- ROUTE POUR LE DASHBOARD D'APPRENTISSAGE ---
app.get('/learning-dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Learning Dashboard - Spread It</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container mt-5">
        <h1 class="mb-4">🤖 AI Learning Dashboard</h1>
        
        <div class="row">
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Total Posts</h5>
                        <h2 id="totalPosts">-</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Avg Engagement</h5>
                        <h2 id="avgEngagement">-%</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Learning Status</h5>
                        <h2 id="learningStatus">-</h2>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">Platform Performance</div>
                    <div class="card-body">
                        <canvas id="platformChart"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">Best Performing Posts</div>
                    <div class="card-body">
                        <div id="bestPosts" class="list-group"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">Performance Criteria</div>
                    <div class="card-body">
                        <div id="performanceCriteria" class="text-center">
                            <div class="spinner-border" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">Learned Patterns</div>
                    <div class="card-body">
                        <div id="learnedPatterns" class="text-center">
                            <div class="spinner-border" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function loadDashboard() {
            try {
                const response = await fetch('/api/learning-dashboard');
                const data = await response.json();
                
                document.getElementById('totalPosts').textContent = data.totalPosts || 0;
                document.getElementById('avgEngagement').textContent = data.averageEngagement + '%';
                document.getElementById('learningStatus').textContent = data.learningEfficiency || 'Unknown';
                
                // Platform Chart
                const ctx = document.getElementById('platformChart').getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.platformStats?.map(p => p._id) || [],
                        datasets: [{
                            label: 'Average Engagement %',
                            data: data.platformStats?.map(p => Math.round(p.avgEngagement * 100) / 100) || [],
                            backgroundColor: 'rgba(54, 162, 235, 0.5)'
                        }]
                    }
                });
                
                // Best Posts
                const bestPostsDiv = document.getElementById('bestPosts');
                bestPostsDiv.innerHTML = '<h6>Posts Performants (>10% engagement)</h6>';
                if (data.bestPerforming) {
                    data.bestPerforming.forEach(post => {
                        const item = document.createElement('div');
                        item.className = 'list-group-item d-flex justify-content-between align-items-center';
                        item.innerHTML = \`
                            <div>
                                <strong>\${post.platform}</strong> - \${post.engagement}% engagement<br>
                                <small class="text-muted">\${post.content}</small>
                            </div>
                            <span class="badge bg-success">\${post.engagement}%</span>
                        \`;
                        bestPostsDiv.appendChild(item);
                    });
                }
                
                // Recent Posts Table
                const tbody = document.getElementById('recentTableBody');
                tbody.innerHTML = '';
                if (data.recentPosts) {
                    data.recentPosts.forEach(post => {
                        const row = document.createElement('tr');
                        const engagementBadge = post.engagement === 'pending' ? 
                            '<span class="badge bg-warning">Pending</span>' : 
                            \`<span class="badge bg-\${parseFloat(post.engagement) > 10 ? 'success' : 'secondary'}">\${post.engagement}</span>\`;
                        row.innerHTML = \`
                            <td><strong>\${post.platform}</strong></td>
                            <td>\${post.content}</td>
                            <td>\${engagementBadge}</td>
                            <td>\${new Date(post.posted).toLocaleDateString()}</td>
                        \`;
                        tbody.appendChild(row);
                    });
                }
                
                // Performance Criteria
                const criteriaDiv = document.getElementById('performanceCriteria');
                if (data.performanceCriteria) {
                    criteriaDiv.innerHTML = \`
                        <h5>Auto-Generated Targets</h5>
                        <div class="row text-center">
                            <div class="col-4">
                                <div class="p-2 bg-light rounded">
                                    <div class="h4 text-warning">\${data.performanceCriteria.minEngagement}%</div>
                                    <small>Minimum Target</small>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="p-2 bg-light rounded">
                                    <div class="h4 text-primary">\${Math.round(data.performanceCriteria.targetEngagement)}%</div>
                                    <small>Good Target</small>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="p-2 bg-light rounded">
                                    <div class="h4 text-success">\${Math.round(data.performanceCriteria.excellentThreshold)}%</div>
                                    <small>Excellent</small>
                                </div>
                            </div>
                        </div>
                        <small class="text-muted">Based on \${data.performanceCriteria.basedOnPosts} posts</small>
                    \`;
                }
                
                // Learned Patterns
                const patternsDiv = document.getElementById('learnedPatterns');
                if (data.learnedPatterns) {
                    patternsDiv.innerHTML = \`
                        <h5>Winning Formulas</h5>
                        <div class="list-group list-group-flush">
                            <div class="list-group-item">
                                <strong>Best Structure:</strong> \${data.learnedPatterns.bestStructure || 'Learning...'}
                            </div>
                            <div class="list-group-item">
                                <strong>Top Style:</strong> \${data.learnedPatterns.topStyle || 'Learning...'}
                            </div>
                            <div class="list-group-item">
                                <strong>Success Rate:</strong> \${data.learnedPatterns.successRate || '0'}% of posts hit targets
                            </div>
                            <div class="list-group-item">
                                <strong>Optimal Length:</strong> \${data.learnedPatterns.optimalLength || '150'} characters
                            </div>
                        </div>
                    \`;
                }
                
            } catch (error) {
                console.error('Error loading dashboard:', error);
            }
        }
        
        loadDashboard();
    </script>
</body>
</html>
    `);
});

module.exports = app;