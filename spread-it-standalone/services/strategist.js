const OpenAI = require('openai');
const moment = require('moment');
const googleTrends = require('google-trends-api');

// Ce service agit comme le "Cerveau Stratégique"
// Il combine l'analyse de marché, l'historique et les règles de plateforme.

class Strategist {
    constructor(db) {
        this.db = db; // MongoDB Connection
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    /**
     * Point d'entrée principal : Optimise le contenu pour une plateforme donnée
     * en prenant en compte les trends actuels et l'historique de l'utilisateur.
     */
    async optimizeForPlatform(content, mediaType, targetPlatform, action = 'create_post') {
        
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

        // 5. Générer l'optimisation via GPT-4 avec apprentissage
        let prompt = "";

        if (action === 'generate_hashtags') {
            prompt = `
                TU ES UN EXPERT EN SEO SOCIAL ET HASHTAGS INSTAGRAM.
                
                TON OBJECTIF:
                Générer une liste de 30 hashtags ultra-optimisés pour Instagram, basés sur l'image ou le sujet fourni.
                
                RÈGLES STRICTES:
                - NE GÉNÈRE PAS DE PHRASES. PAS DE TEXTE. UNIQUEMENT DES HASHTAGS SÉPARÉS PAR DES ESPACES.
                - IGNORE tout texte qui ressemble à un nom de fichier, un titre technique ou du bruit (ex: "blowONLYMATT", "IMG_1234"). Concentre-toi sur le contexte sémantique implicite.
                - Mélange des hashtags très populaires (${trends.join(' ')}) avec des hashtags de niche (Long-tail).
                - Le but est la VIRALITÉ maximale.

                CONTENU ANALYSÉ: "${content}" (Si ça ressemble à un nom de fichier, ignore-le et devine le sujet: Lifestyle, Business, AI, Tech...)

                FORMAT JSON ATTENDU:
                {
                    "optimized_text": "#Hashtag1 #Hashtag2 #Hashtag3 ...",
                    "reasoning": "Focus sur niche X et Y",
                    "estimated_virality_score": 90
                }
            `;
        } else {
            // MODE CRÉATION DE POST CLASSIQUE AVEC APPRENTISSAGE
            prompt = `
                TU ES UN STRATÈGE DE CONTENU VIRAL QUI APPREND DE SES ERREURS.
                
                TON OBJECTIF:
                Créer un post percutant qui s'améliore constamment grâce aux données de performance passées.
                
                TON STYLE (OBLIGATOIRE):
                - Ton: Amical mais Direct, Edgy, Sexy.
                - Langue: Mélange naturel d'Anglais et de Français Québécois (Franglais cool).
                - PAS d'enthousiasme corporatif ("Wow! Regardez ça!"). C'est cringe.
                - PAS d'emojis excessifs. 1 ou 2 max (genre 🔥 ou 👀).
                - Sois concis. Punchy.

                CONTEXTE ACTUEL:
                - Plateforme cible: ${targetPlatform} (Adapte la structure pour ça)
                - Sujets Tendance: ${trends.join(', ')} (Source: ${trendsSource})
                - Inspiration de la concurrence: ${competition.strategy_hint}
                - Historique de succès: Style "${insights.bestStyle}" vers ${insights.bestTime}
                - Patterns de succès passés: ${successPatterns.description}
                - Score moyen d'engagement historique: ${successPatterns.avgEngagement}%

                CONTENU DE BASE:
                "${content}"

                TA MISSION:
                1. ANALYSE L'ESSENCE: IGNORE TOTALEMENT le texte technique. Si vide, invente une histoire sur "Growth/Lifestyle".
                2. APPRENDS DU PASSÉ: Intègre les éléments qui ont fonctionné avant (${successPatterns.winningElements.join(', ')}).
                3. ÉCRIS LE POST:
                   - Hook qui tue (inspiré des succès passés).
                   - Corps qui parle directement au lecteur.
                   - Call to Action subtil.
                4. OPTIMISE POUR L'ENGAGEMENT: Utilise les patterns gagnants pour maximiser le score.

                FORMAT JSON ATTENDU:
                {
                    "optimized_text": "Le texte final du post ici...",
                    "reasoning": "Pourquoi ce post va performer basé sur l'historique",
                    "estimated_virality_score": ${Math.min(100, (successPatterns.avgEngagement || 0) + 20)},
                    "best_time_to_post": "${insights.bestTime}",
                    "predicted_engagement": "${successPatterns.avgEngagement || 5}%"
                }
            `;
        }

        try {
            const completion = await this.openai.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "gpt-4",
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            return {
                ...result,
                trends_used: trends,
                trends_source: trendsSource,
                competition_note: competition.summary,
                competition_source: competition.source
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
     * Génère plusieurs variantes et choisit la meilleure basée sur l'historique
     */
    async generateMultipleVariants(content, mediaType, targetPlatform, count = 3) {
        const variants = [];
        
        for (let i = 0; i < count; i++) {
            const variant = await this.optimizeForPlatform(content, mediaType, targetPlatform, 'create_post');
            variants.push(variant);
        }
        
        // Trier par score de viralité estimé + historique
        const insights = await this.getHistoryInsights(targetPlatform);
        
        variants.sort((a, b) => {
            // Prioriser les styles qui ont marché avant
            const aStyleBonus = a.optimized_text.toLowerCase().includes(insights.bestStyle.toLowerCase()) ? 10 : 0;
            const bStyleBonus = b.optimized_text.toLowerCase().includes(insights.bestStyle.toLowerCase()) ? 10 : 0;
            
            return (b.estimated_virality_score + bStyleBonus) - (a.estimated_virality_score + aStyleBonus);
        });
        
        return variants[0]; // Retourner le meilleur
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
                learningEfficiency: avgEngagement > 5 ? "Improving" : "Needs more data"
            };
        } catch (e) {
            console.error("Dashboard error:", e);
            return { error: e.message };
        }
    }
}

module.exports = Strategist;
