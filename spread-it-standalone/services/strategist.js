const OpenAI = require('openai');
const moment = require('moment');

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
        
        // 1. Récupérer les "Trends" du moment (Temps réel)
        const trends = await this.getRealTimeTrends(targetPlatform);

        // 2. Analyser les concurrents (Simuler une recherche de posts similaires performants)
        const competition = await this.analyzeCompetition(content);

        // 3. Apprendre de l'historique (Meilleure performance passée)
        const insights = await this.getHistoryInsights(targetPlatform);

        // 4. Générer l'optimisation via GPT-4
        const prompt = `
            Tu es un expert en viralité sur les réseaux sociaux.
            
            CONTEXTE ACTUEL:
            - Plateforme cible: ${targetPlatform}
            - Type de média: ${mediaType} (ex: video, image)
            - Sujets Tendance (Real-time): ${trends.join(', ')}
            - Ce qui marche chez les concurrents: ${competition.strategy_hint}
            - Historique de succès de l'utilisateur: Style "${insights.bestStyle}" vers ${insights.bestTime}.

            CONTENU ORIGINAL:
            "${content}"

            TACHE:
            1. Vérifie si le contenu est conforme à la plateforme (ex: longueur Twitter, ton LinkedIn).
            2. Si non, réécris-le.
            3. Intègre subtilement un des sujets tendance si pertinent.
            4. Adopte le ton qui résonne le plus "humain" et "authentique".
            5. Ajoute des hashtags stratégiques pour "voler" le trafic des concurrents.

            FORMAT JSON ATTENDU:
            {
                "optimized_text": "...",
                "reasoning": "Pourquoi ces changements ?",
                "estimated_virality_score": 0-100,
                "best_time_to_post": "HH:mm" 
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
                competition_note: competition.summary
            };

        } catch (error) {
            console.error("Strategist Error:", error);
            return { optimized_text: content, error: "AI Optimization Failed" };
        }
    }

    /**
     * Simule la récupération des tendances en temps réel
     * (En prod: appel API Twitter Trends ou Google Trends API)
     */
    async getRealTimeTrends(platform) {
        // Mock data dynamique selon l'heure
        const hour = new Date().getHours();
        if (hour < 12) return ["#MorningMotivation", "#TechNews", "#AI"];
        return ["#AfterWork", "#ViralVideo", "#Innovation"];
    }

    /**
     * Recherche de contenu similaire performant pour "concurrencer"
     */
    async analyzeCompetition(topic) {
        // En prod: Recherche sémantique sur Twitter/Instagram API
        return {
            summary: "Les posts similaires utilisent des questions provocantes au début.",
            strategy_hint: "Utiliser l'humour et des emojis minimalistes."
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
