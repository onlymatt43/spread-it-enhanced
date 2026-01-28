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
    async optimizeForPlatform(content, mediaType, targetPlatform) {
        
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
        // On demande à l'AI de déduire le sujet principal pour trouver des mots clés pertinents
        const competition = await this.analyzeCompetition(content);

        // 3. Apprendre de l'historique (Meilleure performance passée)
        const insights = await this.getHistoryInsights(targetPlatform);

        // 4. Générer l'optimisation via GPT-4
        const prompt = `
            TU ES UN STRATÈGE DE CONTENU VIRAL QUI PARLE "VRAI".
            
            TON OBJECTIF:
            Créer un post percutant en se basant sur le contenu fourni, mais SANS le paraphraser bêtement. Tu dois lui donner une âme.

            TON STYLE (OBLIGATOIRE):
            - Ton: Amical mais Direct, Edgy, Sexy.
            - Langue: Mélange naturel d'Anglais et de Français Québécois (Franglais cool).
            - PAS d'enthousiasme corporatif ("Wow! Regardez ça!"). C'est cringe.
            - PAS d'emojis excessifs. 1 ou 2 max (genre 🔥 ou 👀).
            - Sois concis. Punchy.

            CONTEXTE ACTUEL:
            - Plateforme cible: ${targetPlatform} (Adapte la structure pour ça)
            - Sujets Tendance à intégrer si pertinent: ${trends.join(', ')} (Source: ${trendsSource})
            - Inspiration de la concurrence: ${competition.strategy_hint}
            - Historique de succès: Style "${insights.bestStyle}" vers ${insights.bestTime}.

            CONTENU DE BASE (A NE PAS JUSTE DÉCRIRE):
            "${content}"

            TA MISSION:
            1. ANALYSE L'ESSENCE: Ignore le texte technique (ex: logos, noms de fichiers). Quel est le message émotionnel ou l'histoire derrière ?
            2. ÉCRIS LE POST:
               - Hook qui tue (en une phrase courte).
               - Corps du texte qui parle directement au lecteur ("Tu...").
               - Call to Action subtil mais arrogant.
            3. Si le contenu de base est vide ou technique (ex: juste un nom de fichier), invente une histoire cool autour du concept de "Simplifier sa vie" ou "Passer au niveau supérieur".

            FORMAT JSON ATTENDU:
            {
                "optimized_text": "Le texte final du post ici...",
                "reasoning": "J'ai choisi ce ton parce que...",
                "estimated_virality_score": 85,
                "best_time_to_post": "18:00" 
            }
        `;

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
                engagement_score: 0 // Doit être mis à jour plus tard via API webhook
            });
        } catch (e) {
            console.error(e);
        }
    }
}

module.exports = Strategist;
