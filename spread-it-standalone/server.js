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

        // 2. Share to each selected platform
        const results = [];
        const errors = [];

        // --- REAL IMPLEMENTATION OF SOCIAL POSTING ---
        const shareToPlatform = async (platform) => {
             console.log(`📤 Attempting to share to ${platform}...`);
             
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
                     text: caption + '\n\n' + hashtags,
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
                     form.append('message', caption + '\n\n' + hashtags);
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
                        message: caption + '\n\n' + hashtags
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
                     caption: caption + '\n\n' + hashtags,
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

        for (const platform of platforms) {
            try {
                const result = await shareToPlatform(platform);
                results.push(result);
            } catch (err) {
                console.error(`❌ Failed to share to ${platform}:`, err.message);
                errors.push({ platform, error: err.message });
            }
        }

        // 3. Cleanup temp file
        fs.unlinkSync(tempFilePath);

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
  let adultScore = 0;
  let reasons = [];

  // Analyse du texte
  const adultWords = (process.env.ADULT_WORDS || 'porn,xxx,explicit,nude,sex,nsfw,adult').split(',');
  const normalizedContent = typeof content === 'string'
    ? content
    : content === undefined || content === null
      ? ''
      : String(content);
  const lowerContent = normalizedContent.toLowerCase();

  adultWords.forEach(word => {
    if (lowerContent.includes(word.trim())) {
      adultScore += 1;
      reasons.push(`Mot détecté: ${word.trim()}`);
    }
  });

  // Analyse de l'image avec Google Vision (uniquement pour les images)
  if (mediaPath && mediaType === 'image' && visionClient && fs.existsSync(mediaPath)) {
    try {
      const [result] = await visionClient.safeSearchDetection(mediaPath);
      const detections = result.safeSearchAnnotation;

      if (detections) {
        // Calculer un score basé sur les détections
        const scores = {
          adult: detections.adult || 'VERY_UNLIKELY',
          violence: detections.violence || 'VERY_UNLIKELY',
          racy: detections.racy || 'VERY_UNLIKELY'
        };

        const scoreMap = {
          'VERY_UNLIKELY': 0,
          'UNLIKELY': 0.25,
          'POSSIBLE': 0.5,
          'LIKELY': 0.75,
          'VERY_LIKELY': 1
        };

        const imageScore = Math.max(
          scoreMap[scores.adult] || 0,
          scoreMap[scores.violence] || 0,
          scoreMap[scores.racy] || 0
        );

        adultScore += imageScore * 2; // Pondération plus forte pour l'image

        if (imageScore > 0.5) {
          reasons.push(`Contenu image détecté: ${scores.adult}/${scores.violence}/${scores.racy}`);
        }
      }
    } catch (error) {
      console.error('Erreur Google Vision:', error);
    }
  }

  return {
    safe: adultScore < 2,
    score: adultScore,
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

module.exports = app;