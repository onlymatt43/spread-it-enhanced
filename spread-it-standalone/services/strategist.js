const OpenAI = require('openai');
const moment = require('moment');
const googleTrends = require('google-trends-api');
const axios = require('axios');

// --- GOAL ACCOUNT DB ---
const INFLUENCER_DB = {
    "video_editing": [
        {"handle": "@waqasqazi", "name": "Waqas Qazi", "style": "Le maître absolu du Color Grading sur DaVinci Resolve."},
        {"handle": "@petermckinnon", "name": "Peter McKinnon", "style": "Le roi du B-Roll et de la cinématique YouTube."},
        {"handle": "@samkolder", "name": "Sam Kolder", "style": "Transitions folles, hyper-visuel, travel film."}
    ],
    "photography": [
        {"handle": "@brandonwoelfel", "name": "Brandon Woelfel", "style": "Lumières néons, bokeh, photo de nuit créative."},
        {"handle": "@7th.era", "name": "Liam Won", "style": "Cyberpunk, nuit, street photography tokyo vibes."},
        {"handle": "@northborders", "name": "Mike Gray", "style": "Street photography brute et humoristique."}
    ],
    "tech_ai": [
        {"handle": "@mkbhd", "name": "Marques Brownlee", "style": "La qualité de production tech ultime."},
        {"handle": "@levelsio", "name": "Pieter Levels", "style": "Le 'solopreneur' IA par excellence."}
    ],
    "lifestyle_hustle": [
        {"handle": "@garyvee", "name": "Gary Vaynerchuk", "style": "Motivation brute."}
    ]
};

// Ce service agit comme le "Cerveau Stratégique"
// Il combine l'analyse de marché, l'historique et les règles de plateforme.

class Strategist {
    constructor(db) {
        this.db = db; // MongoDB Connection
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.marketCache = new Map(); // Cache pour les analyses de marché
        this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    }
    
    selectGoalAccount(content) {
        let category = "tech_ai"; // Default
        const lower = content.toLowerCase();
        
        if (['davinci', 'montage', 'cut', 'video', 'premiere', 'edit'].some(k => lower.includes(k))) category = "video_editing";
        else if (['photo', 'lumiere', 'canon', 'sony', 'shot'].some(k => lower.includes(k))) category = "photography";
        else if (['business', 'argent', 'mindset', 'travail', 'hustle'].some(k => lower.includes(k))) category = "lifestyle_hustle";

        const potentials = INFLUENCER_DB[category] || INFLUENCER_DB["tech_ai"];
        return potentials[Math.floor(Math.random() * potentials.length)];
    }

    /**
     * Point d'entrée principal : Optimise le contenu pour une plateforme donnée
     * en prenant en compte les trends actuels et l'historique de l'utilisateur.
     */
    async optimizeForPlatform(content, mediaType, targetPlatform, action = 'create_post') {
        
        // 0. Identifier le "Goal Account" pour ce post
        const goalAccount = this.selectGoalAccount(content);
        
        // 1. Récupérer les "Trends" du moment (VRAIES DONNÉES GOOGLE)
        let trends = [];
        let trendsSource = 'unknown';

        try {
            console.log("📈 Fetching Real-Time Trends from Google...");
            const trendsResult = await this.getRealTimeTrends();
            trends = trendsResult.items.slice(0, 5); // Garder le top 5
            trendsSource = trendsResult.source;
            console.log(`✅ Trends found via ${trendsSource}:`, trends);
        } catch (e) {
            console.error("⚠️ Failed to fetch trends completely.", e);
            trends = ["#Trending", "#Viral", "#ForYou"];
            trendsSource = "fallback_error";
        }

        // 2. Analyser les concurrents et le "Topic"
        const competition = await this.analyzeCompetition(content);

        // 3. Apprendre de l'historique (Meilleure performance passée)
        const insights = await this.getHistoryInsights(targetPlatform);

        // 4. Analyser les patterns de succès passés
        const successPatterns = await this.analyzeSuccessPatterns(targetPlatform);

        // 5. Étudier les posts performants pour s'en inspirer
        const topPerformers = await this.analyzeTopPerformers(targetPlatform);

        // 6. Analyser le marché en temps réel pour éviter les cercles vicieux
        const marketTrends = await this.analyzeMarketTrends(targetPlatform);

        // 7. Générer l'optimisation via GPT-4 avec apprentissage profond
        let prompt = "";

        if (action === 'generate_hashtags') {
            // Étudier les hashtags performants pour cette plateforme
            const topPerformers = await this.analyzeTopPerformers(targetPlatform);
            
            prompt = `
                TU ES UN EXPERT EN HASHTAGS QUI NE GÉNÈRE QUE DES TAGS PROUVÉS GAGNANTS.
                
                TON OBJECTIF:
                Générer UNIQUEMENT des hashtags qui ont déjà fait leurs preuves dans tes posts performants.
                
                HASHTAGS LES PLUS PERFORMANTS DE TON HISTORIQUE:
                ${topPerformers.topHashtags?.slice(0, 20).map(h => h.tag).join(' ') || '#Viral #Trending #Growth #Motivation'}
                
                TENDANCES ACTUELLES À INTÉGRER:
                ${trends.join(' ')}
                
                CONTENU À TAGGER: "${content}"
                
                RÈGLES STRICTES:
                - N'INVENTE PAS de nouveaux hashtags
                - UTILISE UNIQUEMENT ceux qui ont déjà performé dans ton historique
                - MÉLANGE avec les tendances actuelles si pertinentes
                - 25-30 hashtags maximum
                - PAS DE TEXTE, QUE DES HASHTAGS SÉPARÉS PAR ESPACES
                
                FORMAT: #tag1 #tag2 #tag3 ... (rien d'autre)
            `;
        } else {
            // MODE CRÉATION DE POST CLASSIQUE AVEC APPRENTISSAGE PROFOND (STRATÉGIE HYBRIDE 2.0)
            const stylesPossibles = [
                "Style: Rant agressif (chiale un peu)",
                "Style: Minimaliste (3 phrases max)",
                "Style: Poétique mais dark",
                "Style: 100% Franglais trash",
                "Style: Confident & Sexy"
            ];
            const styleDuJour = stylesPossibles[Math.floor(Math.random() * stylesPossibles.length)];

            prompt = `
                RÔLE : Tu es l'alter-ego digital de Mathieu. Tu es un créateur visuel (Photo/Vidéo/AI) basé au Québec.

                TONE & PERSONNALITÉ (CRUCIAL) :
                1.  **Edgy & Sexy :** Tu as confiance en toi, un peu arrogant mais toujours avec un clin d'œil. Tu sais que tu es bon, mais tu sais aussi que tout ça c'est absurde.
                2.  **Humour Noir & Autodérision :** Ris de ta propre souffrance (le froid, les bugs informatiques, le ridicule de poser en bobettes). Ne te prends JAMAIS au sérieux.
                3.  **Langue :** FRANGLAIS QUÉBÉCOIS "BROKEN". Mélange l'anglais et le français n'importe comment, comme on parle à Montréal. Fais des fautes de syntaxe volontaires si ça sonne plus naturel. Utilise des sacres légers si ça fit (genre "Criss de bug").
                4.  **Briveté :** Pas de romans. Va droit au but. Sois punchy.

                RÈGLE D'OR - BRISE LA ROUTINE :
                Ne commence pas toujours tes posts de la même façon. Parfois, commence par une insulte (gentille), parfois par une question, parfois par un seul mot. Sois imprévisible.

                POUR CE POST PRÉCIS, ADOPTE CE STYLE : ${styleDuJour}

                STRUCTURE DU POST (À RESPECTER DANS LE JSON):
                -   Reprends l'idée du texte utilisateur mais réécris-le avec ta personnalité "Dark/Sexy/Franglais".
                -   Intègre la TENDANCE DU JOUR (${trends[0] || 'Viral'}) de façon subtile ou totalement hors sujet (absurde).
                -   Fais un shoutout au GOAL ACCOUNT (${goalAccount.handle}) comme si c'était ton "rival" ou ton idole secrète.

                CONTENU UTILISATEUR (BROUILLON) :
                "${content}"

                IMPORTANT: TU DOIS RÉPONDRE EN JSON STRICTEMENT.
                {
                    "optimized_text": "Le post final...",
                    "reasoning": "J'ai choisi le style ${styleDuJour}..."
                }


                TA MISSION (OUTPUT FINAL):
                Génère un post optimisé qui respecte à la lettre la structure suivante :
                1. Le Corps du texte (Amélioré subtilement, mais garde l'âme brute).
                2. "👠 Vibe Check :" (Le lien avec la tendance ${trends[0]}).
                3. "🎯 Goal :" (La mention de ${goalAccount.handle}).
                4. Les Hashtags (Mélange sujet et trends).

                EXEMPLES DE POSTS QUI ONT MARCHÉ (À COPIER):
                ${topPerformers.templates?.slice(0, 3).map(t => `"${t.content}"`).join('\n') || 'Aucun exemple'}

                - Sujets Tendance: ${trends.join(', ')} (Source: ${trendsSource})
                - Inspiration de la concurrence: ${competition.strategy_hint}
                - Historique de succès: Style "${insights.bestStyle}" vers ${insights.bestTime}
                - Patterns de succès passés: ${successPatterns.description}
                - Score moyen d'engagement historique: ${successPatterns.avgEngagement}%

                ANALYSE DE MARCHÉ EN TEMPS RÉEL (ANTI-CERCLE VICIEUX):
                - Source: ${marketTrends.source}
                - Posts viraux analysés: ${marketTrends.topPosts?.length || 0}
                - Longueur moyenne des posts gagnants: ${marketTrends.patterns?.avgLength || 120} caractères
                - Ratio d'emojis dans le marché: ${(marketTrends.patterns?.emojiRatio || 0.3) * 100}%
                - Ratio de questions: ${(marketTrends.patterns?.questionRatio || 0.2) * 100}%
                - Ratio de hashtags: ${(marketTrends.patterns?.hashtagRatio || 0.8) * 100}%
                - Ratio de CTA: ${(marketTrends.patterns?.ctaRatio || 0.15) * 100}%
                - Engagement moyen du marché: ${marketTrends.patterns?.avgEngagement || 500}

                HOOKS RÉUSSIS DU MARCHÉ À COPIER:
                ${marketTrends.patterns?.successfulHooks?.slice(0, 3).map(h => `"${h}"`).join('\n') || 'Pas de hooks disponibles'}

                CONTENU DE BASE:
                "${content}"

                TA MISSION CRITIQUE:
                1. COPIE LA STRUCTURE DES POSTS GAGNANTS: Utilise la même formule (hook + body + CTA)
                2. IMITE LE STYLE RÉUSSI: Copie le ton et la façon d'écrire des posts performants
                3. AJOUTE LES BONS HASHTAGS: Utilise ceux qui ont déjà prouvé leur efficacité
                4. RESPECTE LES PROPORTIONS: Même ratio d'emojis, questions, CTA que les gagnants
                5. OPTIMISE LA LONGUEUR: Vise la longueur moyenne des posts réussis
                6. ÉVITE LES CERCLES VICIEUX: Intègre les patterns du marché actuel, pas seulement ton historique
                7. COPIE LES HOOKS VIRALS: Utilise les accroches qui marchent vraiment en ce moment

                FORMAT JSON ATTENDU:
                {
                    "optimized_text": "Le texte final qui copie les gagnants...",
                    "reasoning": "J'ai copié la structure X des posts à Y% d'engagement",
                    "estimated_virality_score": ${Math.min(100, Math.round(((topPerformers.avgEngagement || 0) + (marketTrends.patterns?.avgEngagement || 0) / 10) / 2 + 25))},
                    "best_time_to_post": "${insights.bestTime}",
                    "predicted_engagement": "${Math.round(((topPerformers.avgEngagement || 8) + (marketTrends.patterns?.avgEngagement || 500) / 50) / 2)}%",
                    "copied_patterns": ["structure_${Object.keys(topPerformers.commonPatterns?.topStructures || {}).sort((a,b) => (topPerformers.commonPatterns.topStructures[b] || 0) - (topPerformers.commonPatterns.topStructures[a] || 0))[0] || 'balanced'}", "style_${Object.keys(topPerformers.commonPatterns?.topStyles || {}).sort((a,b) => (topPerformers.commonPatterns.topStyles[b] || 0) - (topPerformers.commonPatterns.topStyles[a] || 0))[0] || 'direct'}", "market_hook_${marketTrends.patterns?.successfulHooks?.length > 0 ? 'viral' : 'standard'}"]
                }
            `;
        }

        try {
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "gpt-4o",
                temperature: 0.8,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            // Évaluer la qualité du post généré
            const qualityEvaluation = this.evaluatePostQuality(result.optimized_text, targetPlatform);
            
            // Générer les critères de performance pour cette plateforme
            const performanceCriteria = await this.generatePerformanceCriteria(targetPlatform);
            
            return {
                ...result,
                trends_used: trends,
                trends_source: trendsSource,
                competition_note: competition.summary,
                competition_source: competition.source,
                quality_score: qualityEvaluation.score,
                quality_grade: qualityEvaluation.grade,
                quality_reasons: qualityEvaluation.reasons,
                performance_criteria: performanceCriteria,
                top_performers_analyzed: topPerformers.templates?.length || 0
            };

        } catch (error) {
            console.error("Strategist Error:", error);
            return { optimized_text: content, error: "AI Optimization Failed" };
        }
    }

    /**
     * Récupère les vraies tendances via Google Trends API
     */
    async getRealTimeTrends(platform) {
        try {
            // Recupération des tendances quotidiennes (US/FR selon besoin, ici US pour global)
            const results = await googleTrends.dailyTrends({ geo: 'US' });
            const parsed = JSON.parse(results);
            
            // Extraction des titres des "Trending Searches"
            const trendList = parsed.default.trendingSearchesDays[0].trendingSearches.map(t => t.title.query);
            
            // Ajouter des hashtags
            const formattedTrends = trendList.map(t => '#' + t.replace(/\s+/g, ''));

            return {
                items: formattedTrends,
                source: 'live_google_trends'
            };

        } catch (e) {
            console.error("Google Trends API Error:", e.message);
            // Fallback si l'API échoue
            const hour = new Date().getHours();
            let fallbackList = [];
            if (hour < 12) fallbackList = ["#MorningMotivation", "#TechNews", "#AI"];
            else fallbackList = ["#AfterWork", "#ViralVideo", "#Innovation"];

            return {
                items: fallbackList,
                source: 'fallback_time_based_mock'
            };
        }
    }

    /**
     * Recherche de contenu similaire performant pour "concurrencer"
     */
    async analyzeCompetition(topic) {
        // Chargement liste concurrents
        let competitors = [];
        try {
            const dataPath = require('path').join(__dirname, '../data/competitors.json');
            const data = require(dataPath);
            competitors = data.instagram || [];
        } catch (e) {
            console.log("⚠️ No competitor list found.");
        }

        // Essai d'appel API Instagram Business Discovery
        const igToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
        
        if (igToken && process.env.INSTAGRAM_BUSINESS_ID && competitors.length > 0) {
            try {
                const axios = require('axios');
                const target = competitors[0]; // On analyse le premier pour l'instant
                console.log(`🕵️ Spying on competitor: ${target}...`);
                
                const url = `https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ID}?fields=business_discovery.username(${target}){media{caption,like_count,comments_count}}&access_token=${igToken}`;
                
                const res = await axios.get(url);
                const posts = res.data.business_discovery.media.data.slice(0, 3);
                
                // Analyse approfondie via IA des 3 derniers posts
                const captions = posts.map(p => p.caption).filter(Boolean);

                if (captions.length > 0) {
                    console.log(`🧠 Analyzing competitor logic for @${target}...`);
                    const analysisPrompt = `
                        Analyse ces 3 posts performants du concurrent @${target}.
                        Détecte leur "recette secrète" pour la viralité :
                        1. Structure narrative (ex: Hook -> Story -> Leçon -> Offre)
                        2. Trigger Émotionnel (ex: Peur de rater, Colère, Inspiration)
                        3. Technique de Hook spécifique (ex: "Stop doing this", "X vs Y", Chiffre précis)

                        Posts récents:
                        ${captions.map((c, i) => `[Post ${i+1}]: ${c.substring(0, 500)}...`).join('\n---\n')}

                        Réponds uniquement en JSON:
                        {
                            "structure": "Description courte de la structure",
                            "hook_technique": "La technique d'accroche à copier",
                            "psychological_trigger": "Le levier psychologique utilisé",
                            "topics": "Mots clés principaux"
                        }
                    `;

                    const completion = await this.openai.chat.completions.create({
                        messages: [{ role: "system", content: analysisPrompt }],
                        model: "gpt-4",
                        response_format: { type: "json_object" }
                    });

                    const analysis = JSON.parse(completion.choices[0].message.content);

                    return {
                        summary: `Analyse @${target}: Structure "${analysis.structure}" sur ton "${analysis.psychological_trigger}".`,
                        strategy_hint: `COPIE LEUR LOGIQUE: Utilise l'accroche de type "${analysis.hook_technique}".`,
                        source: 'live_instagram_api_analyzed_by_ai',
                        details: analysis
                    };
                }
                
                // Fallback si pas de captions
                return {
                    summary: `Le concurrent @${target} est actif mais les captions sont illisibles.`,
                    strategy_hint: "Concentre-toi sur une image forte avec peu de texte.",
                    source: 'live_instagram_api_empty'
                };

            } catch (error) {
                console.error("IG Graph API Error:", error.response ? error.response.data : error.message);
                // Fallback catch below
            }
        }

        // Fallback Mock (Si pas d'ID ou Erreur API)
        return {
            summary: "Analyse simulée: Les posts viraux actuels n'éduquent pas, ils divertissent ou polarisent.",
            strategy_hint: "REVERSE PSYCHOLOGY: Dis aux gens de NE PAS faire ce qu'ils font d'habitude.",
            source: 'fallback_generic_rules'
        };
    }

    /**
     * Interroge la base de données MongoDB pour savoir ce qui a marché AVANT.
     */
    async getHistoryInsights(platform) {
        if (!this.db) return { bestStyle: "neutral", bestTime: "12:00" };

        try {
            const collection = this.db.collection('post_history');
            // Trouver les posts avec le meilleur engagement sur cette plateforme
            const topPost = await collection.find({ platform: platform })
                .sort({ engagement_score: -1 })
                .limit(1)
                .toArray();

            if (topPost.length > 0) {
                return {
                    bestStyle: topPost[0].style_used || "professional",
                    bestTime: topPost[0].posted_at_time || "09:00"
                };
            }
        } catch (e) {
            console.log("DB Insight error", e);
        }
        
        return { bestStyle: "authentic", bestTime: "18:00" }; // Default
    }

    /**
     * Analyse les patterns de succès passés pour améliorer les futures générations
     */
    async analyzeSuccessPatterns(platform) {
        if (!this.db) return { 
            description: "Aucun historique disponible", 
            winningElements: ["direct", "provocative"], 
            avgEngagement: 5 
        };

        try {
            const collection = this.db.collection('post_history');
            
            // Trouver les posts avec engagement > 5%
            const successfulPosts = await collection.find({ 
                platform: platform,
                engagement_score: { $gt: 5 }
            }).sort({ engagement_score: -1 }).limit(10).toArray();
            
            if (successfulPosts.length === 0) {
                return { 
                    description: "Pas assez de données de succès", 
                    winningElements: ["question", "storytelling"], 
                    avgEngagement: 5 
                };
            }
            
            // Analyser les éléments communs
            const winningElements = [];
            const hooks = successfulPosts.map(p => p.content_generated?.substring(0, 50) || "").filter(Boolean);
            
            // Détecter patterns (simplifié)
            if (hooks.some(h => h.includes("?"))) winningElements.push("questions");
            if (hooks.some(h => h.includes("Tu"))) winningElements.push("direct_address");
            if (hooks.some(h => h.includes("🔥") || h.includes("👀"))) winningElements.push("emoji_hooks");
            if (hooks.some(h => h.length < 30)) winningElements.push("short_hooks");
            
            const avgEngagement = successfulPosts.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / successfulPosts.length;
            
            return {
                description: `Posts réussis utilisent: ${winningElements.join(', ')}`,
                winningElements: winningElements.length > 0 ? winningElements : ["storytelling", "authenticity"],
                avgEngagement: Math.round(avgEngagement)
            };
        } catch (e) {
            console.error("Success pattern analysis error:", e);
            return { 
                description: "Erreur d'analyse", 
                winningElements: ["engagement", "relevance"], 
                avgEngagement: 5 
            };
        }
    }

    /**
     * Enregistre le résultat APRES la publication pour le futur (Feedback Loop)
     */
    async recordPostLaunch(postData) {
        if (!this.db) return;
        try {
            const collection = this.db.collection('post_history');
            await collection.insertOne({
                ...postData,
                timestamp: new Date(),
                initial_trajectory: 'pending', // Sera mis à jour par le tracking
                engagement_score: 0, // Doit être mis à jour plus tard via API webhook
                likes: 0,
                shares: 0,
                comments: 0,
                impressions: 0
            });
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Récupère les vraies métriques de performance depuis les APIs sociales
     */
    async fetchPostPerformance(platform, postId, postUrl) {
        const axios = require('axios');
        
        try {
            if (platform === 'facebook') {
                const token = process.env.FACEBOOK_ACCESS_TOKEN;
                const pageId = process.env.FACEBOOK_PAGE_ID;
                
                const response = await axios.get(
                    `https://graph.facebook.com/v18.0/${postId}/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total&access_token=${token}`
                );
                
                const data = response.data.data;
                return {
                    impressions: data.find(m => m.name === 'post_impressions')?.values[0]?.value || 0,
                    engagements: data.find(m => m.name === 'post_engaged_users')?.values[0]?.value || 0,
                    reactions: data.find(m => m.name === 'post_reactions_by_type_total')?.values[0]?.value || {},
                    engagement_score: (data.find(m => m.name === 'post_engaged_users')?.values[0]?.value || 0) / (data.find(m => m.name === 'post_impressions')?.values[0]?.value || 1) * 100
                };
            }
            
            if (platform === 'instagram') {
                const token = process.env.INSTAGRAM_ACCESS_TOKEN;
                
                const response = await axios.get(
                    `https://graph.facebook.com/v18.0/${postId}?fields=like_count,comments_count,impressions,reach&access_token=${token}`
                );
                
                const data = response.data;
                return {
                    likes: data.like_count || 0,
                    comments: data.comments_count || 0,
                    impressions: data.impressions || 0,
                    reach: data.reach || 0,
                    engagement_score: ((data.like_count || 0) + (data.comments_count || 0)) / (data.impressions || 1) * 100
                };
            }
            
            if (platform === 'twitter') {
                // Twitter API v2 pour métriques
                const { TwitterApi } = require('twitter-api-v2');
                const client = new TwitterApi({
                    appKey: process.env.TWITTER_API_KEY,
                    appSecret: process.env.TWITTER_API_SECRET,
                    accessToken: process.env.TWITTER_ACCESS_TOKEN,
                    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
                });
                
                const tweet = await client.v2.singleTweet(postId, {
                    'tweet.fields': 'public_metrics'
                });
                
                const metrics = tweet.data.public_metrics;
                return {
                    likes: metrics.like_count,
                    retweets: metrics.retweet_count,
                    replies: metrics.reply_count,
                    impressions: metrics.impression_count || 0,
                    engagement_score: (metrics.like_count + metrics.retweet_count + metrics.reply_count) / (metrics.impression_count || 1) * 100
                };
            }
            
            return { engagement_score: 0 };
        } catch (e) {
            console.error(`Error fetching ${platform} performance:`, e);
            return { engagement_score: 0 };
        }
    }

    /**
     * Met à jour les performances d'un post dans la DB
     */
    async updatePostPerformance(postId, performance) {
        if (!this.db) return;
        try {
            const collection = this.db.collection('post_history');
            await collection.updateOne(
                { post_id: postId },
                { 
                    $set: { 
                        ...performance,
                        last_updated: new Date()
                    }
                }
            );
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Analyse approfondie des posts à haut engagement pour créer des templates
     */
    async analyzeTopPerformers(platform) {
        if (!this.db) return { templates: [], hashtags: [] };

        try {
            const collection = this.db.collection('post_history');
            
            // Récupérer les posts avec > 10% d'engagement
            const topPosts = await collection.find({ 
                platform: platform,
                engagement_score: { $gt: 10 }
            }).sort({ engagement_score: -1 }).limit(20).toArray();
            
            if (topPosts.length === 0) return { templates: [], hashtags: [] };
            
            const templates = [];
            const hashtagPerformance = {};
            
            for (const post of topPosts) {
                // Analyser la structure du post
                const content = post.content_generated || '';
                
                // Détecter les patterns structurels
                const structure = this.analyzePostStructure(content);
                
                // Extraire et compter les hashtags
                const hashtags = content.match(/#\w+/g) || [];
                hashtags.forEach(tag => {
                    hashtagPerformance[tag] = (hashtagPerformance[tag] || 0) + post.engagement_score;
                });
                
                templates.push({
                    structure: structure,
                    engagement: post.engagement_score,
                    content: content,
                    hashtags: hashtags,
                    style: this.detectStyle(content),
                    length: content.length,
                    hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(content),
                    hasQuestion: content.includes('?'),
                    hasCallToAction: /\b(dm|message|comment|share|like|follow)\b/i.test(content)
                });
            }
            
            // Trier les hashtags par performance
            const topHashtags = Object.entries(hashtagPerformance)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 30)
                .map(([tag, score]) => ({ tag, score }));
            
            return {
                templates: templates,
                topHashtags: topHashtags,
                avgEngagement: topPosts.reduce((sum, p) => sum + p.engagement_score, 0) / topPosts.length,
                commonPatterns: this.extractCommonPatterns(templates)
            };
        } catch (e) {
            console.error("Top performer analysis error:", e);
            return { templates: [], hashtags: [] };
        }
    }

    /**
     * Analyse la structure d'un post
     */
    analyzePostStructure(content) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        if (sentences.length === 1) return 'single_sentence';
        if (sentences.length === 2) return 'hook_body';
        if (sentences.length === 3) return 'hook_body_cta';
        
        // Analyser la longueur des phrases
        const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
        
        if (avgSentenceLength < 20) return 'short_punchy';
        if (avgSentenceLength > 50) return 'long_story';
        
        return 'balanced';
    }

    /**
     * Détecte le style d'écriture
     */
    detectStyle(content) {
        const lower = content.toLowerCase();
        
        if (lower.includes('tu ') || lower.includes('vous ')) return 'direct_address';
        if (lower.includes('je ') || lower.includes('j\'ai')) return 'personal_story';
        if (lower.includes('?')) return 'question_based';
        if (/🔥|💥|🚀|✨/.test(content)) return 'high_energy';
        if (content.length < 100) return 'concise';
        
        return 'narrative';
    }

    /**
     * Extrait les patterns communs des posts performants
     */
    extractCommonPatterns(templates) {
        const patterns = {
            avgLength: templates.reduce((sum, t) => sum + t.length, 0) / templates.length,
            emojiRatio: templates.filter(t => t.hasEmoji).length / templates.length,
            questionRatio: templates.filter(t => t.hasQuestion).length / templates.length,
            ctaRatio: templates.filter(t => t.hasCallToAction).length / templates.length,
            topStructures: {},
            topStyles: {}
        };
        
        // Compter les structures et styles populaires
        templates.forEach(t => {
            patterns.topStructures[t.structure] = (patterns.topStructures[t.structure] || 0) + 1;
            patterns.topStyles[t.style] = (patterns.topStyles[t.style] || 0) + 1;
        });
        
        return patterns;
    }

    /**
     * Génère un dashboard d'apprentissage avec statistiques de performance
     */
    async getLearningDashboard() {
        if (!this.db) return { message: "No database connection" };

        try {
            const collection = this.db.collection('post_history');
            
            const totalPosts = await collection.countDocuments();
            const postsWithEngagement = await collection.find({ engagement_score: { $exists: true } }).toArray();
            
            const avgEngagement = postsWithEngagement.length > 0 
                ? postsWithEngagement.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / postsWithEngagement.length 
                : 0;
            
            const bestPerforming = await collection.find()
                .sort({ engagement_score: -1 })
                .limit(5)
                .toArray();
            
            const platformStats = await collection.aggregate([
                { $group: { 
                    _id: "$platform", 
                    count: { $sum: 1 }, 
                    avgEngagement: { $avg: "$engagement_score" },
                    totalEngagement: { $sum: "$engagement_score" }
                }}
            ]).toArray();
            
            const recentPosts = await collection.find()
                .sort({ timestamp: -1 })
                .limit(10)
                .toArray();

            // Générer les critères de performance pour Instagram (plateforme principale)
            const performanceCriteria = await this.generatePerformanceCriteria('instagram');
            
            // Analyser les patterns appris
            const learnedPatterns = await this.analyzeLearnedPatterns();

            return {
                totalPosts,
                postsWithData: postsWithEngagement.length,
                averageEngagement: Math.round(avgEngagement * 100) / 100,
                bestPerforming: bestPerforming.map(p => ({
                    platform: p.platform,
                    engagement: p.engagement_score,
                    content: p.content_generated?.substring(0, 100) + "...",
                    posted: p.timestamp
                })),
                platformStats,
                recentPosts: recentPosts.map(p => ({
                    platform: p.platform,
                    engagement: p.engagement_score || 'pending',
                    content: p.content_generated?.substring(0, 50) + "...",
                    posted: p.timestamp
                })),
                learningEfficiency: avgEngagement > 5 ? "Improving" : "Needs more data",
                performanceCriteria,
                learnedPatterns
            };
        } catch (e) {
            console.error("Dashboard error:", e);
            return { error: e.message };
        }
    }

    /**
     * Évalue automatiquement la qualité d'un post selon des critères objectifs
     */
    evaluatePostQuality(content, platform) {
        let score = 50; // Score de base
        const reasons = [];
        
        // Critère 1: Longueur optimale
        const length = content.length;
        if (platform === 'twitter' && length <= 280) {
            score += 10;
            reasons.push("Longueur parfaite pour Twitter");
        } else if (platform === 'instagram' && length >= 50 && length <= 150) {
            score += 15;
            reasons.push("Longueur optimale pour Instagram");
        } else if (length > 200) {
            score -= 5;
            reasons.push("Trop long, risque de perte d'attention");
        }
        
        // Critère 2: Présence d'emoji (mais pas trop)
        const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
        if (emojiCount >= 1 && emojiCount <= 2) {
            score += 10;
            reasons.push("Bon usage des emojis");
        } else if (emojiCount > 3) {
            score -= 5;
            reasons.push("Trop d'emojis, peut sembler immature");
        }
        
        // Critère 3: Question rhétorique
        if (content.includes('?')) {
            score += 8;
            reasons.push("Question engageante détectée");
        }
        
        // Critère 4: Appel à l'action
        if (/\b(dm|message|comment|share|like|follow|tag)\b/i.test(content)) {
            score += 12;
            reasons.push("CTA présent pour encourager l'engagement");
        }
        
        // Critère 5: Adresse directe au lecteur
        if (/\b(tu|vous|toi)\b/i.test(content)) {
            score += 10;
            reasons.push("Adresse directe au lecteur");
        }
        
        // Critère 6: Hashtags (pour Instagram)
        if (platform === 'instagram') {
            const hashtagCount = (content.match(/#\w+/g) || []).length;
            if (hashtagCount >= 5 && hashtagCount <= 15) {
                score += 10;
                reasons.push("Bon nombre de hashtags");
            } else if (hashtagCount > 20) {
                score -= 5;
                reasons.push("Trop de hashtags, peut sembler spam");
            }
        }
        
        // Critère 7: Énergie et ponctuation
        if (/[.!?]{2,}/.test(content)) {
            score += 5;
            reasons.push("Ponctuation énergique");
        }
        
        // Critère 8: Éviter les mots faibles
        const weakWords = ['très', 'beaucoup', 'vraiment', 'super', 'génial'];
        const weakCount = weakWords.filter(word => content.toLowerCase().includes(word)).length;
        if (weakCount > 2) {
            score -= 5;
            reasons.push("Trop de mots faibles, manque d'impact");
        }
        
        return {
            score: Math.max(0, Math.min(100, score)),
            reasons: reasons,
            grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'
        };
    }

    /**
     * Génère des critères de performance automatiques basés sur l'historique
     */
    async generatePerformanceCriteria(platform) {
        if (!this.db) return { minEngagement: 5, targetScore: 70 };
        
        try {
            const collection = this.db.collection('post_history');
            
            const posts = await collection.find({ platform }).toArray();
            if (posts.length === 0) return { minEngagement: 5, targetScore: 70 };
            
            const engagements = posts.map(p => p.engagement_score || 0).filter(e => e > 0);
            const avgEngagement = engagements.reduce((a, b) => a + b, 0) / engagements.length;
            
            // Le critère minimum est la médiane des engagements
            const sorted = engagements.sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            
            return {
                minEngagement: Math.max(3, median),
                targetEngagement: Math.max(8, avgEngagement * 1.2),
                excellentThreshold: Math.max(15, avgEngagement * 2),
                platform: platform,
                basedOnPosts: posts.length
            };
        } catch (e) {
            console.error("Performance criteria error:", e);
            return { minEngagement: 5, targetScore: 70 };
        }
    }

    /**
     * Analyse les patterns que l'IA a appris de l'historique
     */
    async analyzeLearnedPatterns() {
        if (!this.db) return { bestStructure: 'unknown', topStyle: 'unknown' };
        
        try {
            const topPerformers = await this.analyzeTopPerformers('instagram'); // On analyse Instagram par défaut
            
            return {
                bestStructure: Object.keys(topPerformers.commonPatterns?.topStructures || {}).sort((a,b) => (topPerformers.commonPatterns.topStructures[b] || 0) - (topPerformers.commonPatterns.topStructures[a] || 0))[0] || 'balanced',
                topStyle: Object.keys(topPerformers.commonPatterns?.topStyles || {}).sort((a,b) => (topPerformers.commonPatterns.topStyles[b] || 0) - (topPerformers.commonPatterns.topStyles[a] || 0))[0] || 'direct_address',
                successRate: Math.round((topPerformers.templates?.length || 0) / Math.max(1, await this.db.collection('post_history').countDocuments()) * 100),
                optimalLength: Math.round(topPerformers.commonPatterns?.avgLength || 150),
                emojiRatio: Math.round((topPerformers.commonPatterns?.emojiRatio || 0.6) * 100),
                questionRatio: Math.round((topPerformers.commonPatterns?.questionRatio || 0.4) * 100),
                ctaRatio: Math.round((topPerformers.commonPatterns?.ctaRatio || 0.3) * 100)
            };
        } catch (e) {
            console.error("Learned patterns analysis error:", e);
            return { bestStructure: 'learning', topStyle: 'learning' };
        }
    }

    /**
     * Analyse les posts viraux du marché en temps réel
     */
    async analyzeMarketTrends(platform = 'instagram') {
        const cacheKey = `market_${platform}`;
        const cached = this.marketCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }

        try {
            console.log(`🔍 Analyzing real-time market trends on ${platform}...`);
            
            let marketData;
            if (platform === 'instagram') {
                marketData = await this.analyzeInstagramMarket();
            } else if (platform === 'twitter') {
                marketData = await this.analyzeTwitterMarket();
            } else if (platform === 'facebook') {
                marketData = await this.analyzeFacebookMarket();
            } else if (platform === 'tiktok') {
                marketData = await this.analyzeTikTokMarket();
            }

            this.marketCache.set(cacheKey, { data: marketData, timestamp: Date.now() });
            return marketData;
        } catch (e) {
            console.error(`Market analysis error for ${platform}:`, e);
            return this.getFallbackMarketData(platform);
        }
    }

    /**
     * Analyse du marché Instagram en temps réel
     */
    async analyzeInstagramMarket() {
        const competitors = await this.getCompetitorList();
        const viralPosts = [];
        
        for (const competitor of competitors.slice(0, 5)) { // Analyser top 5 concurrents
            try {
                const posts = await this.fetchInstagramTopPosts(competitor);
                viralPosts.push(...posts);
            } catch (e) {
                console.warn(`Failed to analyze ${competitor}:`, e.message);
            }
        }

        // Trier par engagement et prendre les top 20
        const topPosts = viralPosts
            .sort((a, b) => b.engagement - a.engagement)
            .slice(0, 20);

        // Analyser les patterns
        const patterns = this.analyzeViralPatterns(topPosts);
        
        return {
            platform: 'instagram',
            topPosts: topPosts,
            patterns: patterns,
            competitorsAnalyzed: competitors.length,
            timestamp: new Date(),
            source: 'real_market_data'
        };
    }

    /**
     * Récupère les posts populaires d'un compte Instagram
     */
    async fetchInstagramTopPosts(username) {
        const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
        const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
        
        if (!igToken || !igBusinessId) {
            throw new Error('Instagram API credentials missing');
        }

        try {
            // Utiliser Business Discovery API pour analyser un concurrent
            const url = `https://graph.facebook.com/v18.0/${igBusinessId}?fields=business_discovery.username(${username}){media{caption,like_count,comments_count,media_type,timestamp,permalink}}&access_token=${igToken}`;
            
            const response = await axios.get(url);
            const media = response.data.business_discovery.media.data;
            
            return media.slice(0, 10).map(post => ({
                caption: post.caption || '',
                likes: post.like_count || 0,
                comments: post.comments_count || 0,
                engagement: (post.like_count || 0) + (post.comments_count || 0),
                mediaType: post.media_type,
                timestamp: post.timestamp,
                permalink: post.permalink,
                username: username
            }));
        } catch (e) {
            console.error(`Instagram API error for ${username}:`, e);
            return [];
        }
    }

    /**
     * Analyse du marché Twitter
     */
    async analyzeTwitterMarket() {
        // Pour Twitter, on analyse les tweets populaires sur des hashtags tendances
        const trends = await this.getRealTimeTrends();
        const topTrends = trends.items.slice(0, 3);
        
        const viralTweets = [];
        
        // Note: Twitter API v2 ne permet pas facilement de récupérer les tweets populaires
        // On simule avec des données basées sur les trends
        for (const trend of topTrends) {
            viralTweets.push({
                text: `People are talking about ${trend} right now! 🔥`,
                engagement: Math.floor(Math.random() * 1000) + 500,
                trend: trend
            });
        }

        return {
            platform: 'twitter',
            trends: topTrends,
            viralTweets: viralTweets,
            patterns: {
                trendingTopics: topTrends,
                avgEngagement: viralTweets.reduce((sum, t) => sum + t.engagement, 0) / viralTweets.length
            },
            timestamp: new Date(),
            source: 'trends_based'
        };
    }

    /**
     * Analyse du marché Facebook
     */
    async analyzeFacebookMarket() {
        // Analyser les posts populaires de pages similaires
        const similarPages = ['cnn', 'bbcnews', 'natgeo']; // Pages populaires
        
        const viralPosts = [];
        
        for (const page of similarPages) {
            try {
                const posts = await this.fetchFacebookTopPosts(page);
                viralPosts.push(...posts);
            } catch (e) {
                console.warn(`Failed to analyze Facebook page ${page}`);
            }
        }

        return {
            platform: 'facebook',
            viralPosts: viralPosts.sort((a, b) => b.engagement - a.engagement).slice(0, 10),
            patterns: this.analyzeViralPatterns(viralPosts),
            timestamp: new Date(),
            source: 'popular_pages'
        };
    }

    /**
     * Analyse du marché TikTok (approche proxy)
     * TikTok n'offre pas une API simple publique pour les tendances.
     * On utilise une approche basée sur des patterns génériques et des signaux externes.
     */
    async analyzeTikTokMarket() {
        // Simuler des données de marché avec des patterns typiques de TikTok
        const trendingHooks = [
            "POV:",
            "Nobody's talking about this",
            "3 things I wish I knew",
            "Stop scrolling",
            "You need to try this"
        ];

        const patterns = {
            avgLength: 80,
            emojiRatio: 0.3,
            questionRatio: 0.25,
            hashtagRatio: 0.6,
            ctaRatio: 0.2,
            successfulHooks: trendingHooks,
            avgEngagement: 1200
        };

        return {
            platform: 'tiktok',
            topPosts: [], // Sans API officielle, non disponible
            patterns,
            competitorsAnalyzed: 0,
            timestamp: new Date(),
            source: 'proxy_patterns'
        };
    }

    /**
     * Récupère les posts populaires d'une page Facebook
     */
    async fetchFacebookTopPosts(pageId) {
        const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
        
        if (!fbToken) {
            throw new Error('Facebook API credentials missing');
        }

        try {
            const url = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=message,likes.summary(true),comments.summary(true),shares,created_time,permalink_url&limit=10&access_token=${fbToken}`;
            const response = await axios.get(url);
            
            return response.data.data.map(post => ({
                message: post.message || '',
                likes: post.likes?.summary?.total_count || 0,
                comments: post.comments?.summary?.total_count || 0,
                shares: post.shares?.count || 0,
                engagement: (post.likes?.summary?.total_count || 0) + (post.comments?.summary?.total_count || 0) + (post.shares?.count || 0),
                timestamp: post.created_time,
                permalink: post.permalink_url
            }));
        } catch (e) {
            console.error(`Facebook API error for ${pageId}:`, e);
            return [];
        }
    }

    /**
     * Analyse les patterns des posts viraux
     */
    analyzeViralPatterns(posts) {
        if (!posts || posts.length === 0) return {};

        const patterns = {
            avgLength: 0,
            emojiRatio: 0,
            questionRatio: 0,
            hashtagRatio: 0,
            ctaRatio: 0,
            commonWords: {},
            commonPhrases: {},
            successfulHooks: [],
            avgEngagement: 0
        };

        let totalLength = 0;
        let emojiCount = 0;
        let questionCount = 0;
        let hashtagCount = 0;
        let ctaCount = 0;
        let totalEngagement = 0;

        posts.forEach(post => {
            const text = post.caption || post.message || post.text || '';
            if (!text) return;

            totalLength += text.length;
            totalEngagement += post.engagement || 0;

            // Analyser emojis
            const emojis = text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu);
            if (emojis) emojiCount += emojis.length;

            // Analyser questions
            if (text.includes('?')) questionCount++;

            // Analyser hashtags
            const hashtags = text.match(/#\w+/g);
            if (hashtags) hashtagCount += hashtags.length;

            // Analyser CTA
            if (/\b(follow|like|comment|share|dm|message|tag|save)\b/i.test(text)) ctaCount++;

            // Extraire hooks réussis (premières phrases)
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            if (sentences.length > 0) {
                patterns.successfulHooks.push(sentences[0].trim());
            }
        });

        patterns.avgLength = Math.round(totalLength / posts.length);
        patterns.emojiRatio = emojiCount / posts.length;
        patterns.questionRatio = questionCount / posts.length;
        patterns.hashtagRatio = hashtagCount / posts.length;
        patterns.ctaRatio = ctaCount / posts.length;
        patterns.avgEngagement = Math.round(totalEngagement / posts.length);

        return patterns;
    }

    /**
     * Liste des concurrents à analyser (peut être configurée dynamiquement)
     */
    async getCompetitorList() {
        // Pour l'instant, liste statique de comptes populaires
        // À l'avenir, pourrait être dynamique basé sur le secteur
        return [
            'instagram',
            'cristiano',
            'leomessi',
            'selenagomez',
            'arianagrande',
            'natgeo',
            'nasa',
            'natgeowild'
        ];
    }

    /**
     * Obtient les heures optimales de posting pour une plateforme
     */
    async getOptimalPostingHours(platform) {
        if (!this.db) return [9, 12, 15, 18, 21]; // Heures par défaut

        try {
            const pipeline = [
                { $match: { platform: platform, engagement: { $gt: 0 } } },
                {
                    $group: {
                        _id: { $hour: "$posted_at" },
                        avgEngagement: { $avg: "$engagement" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { avgEngagement: -1 } },
                { $limit: 5 }
            ];

            const results = await this.db.collection('post_history').aggregate(pipeline).toArray();
            const optimalHours = results.map(r => r._id).filter(h => h !== null);

            return optimalHours.length > 0 ? optimalHours : [9, 12, 15, 18, 21];
        } catch (e) {
            console.error("Error getting optimal hours:", e);
            return [9, 12, 15, 18, 21]; // Fallback
        }
    }

    /**
     * Obtient tous les posts récents (toutes plateformes) pour vérifier la fréquence globale
     */
    async getAllRecentPosts(timeWindowMs = 60 * 60 * 1000) { // 1 heure par défaut
        if (!this.db) return [];

        try {
            const since = new Date(Date.now() - timeWindowMs);
            const posts = await this.db.collection('post_history')
                .find({
                    posted_at: { $gte: since }
                })
                .sort({ posted_at: -1 })
                .toArray();

            return posts;
        } catch (e) {
            console.error("Error getting all recent posts:", e);
            return [];
        }
    }
}

module.exports = Strategist;
