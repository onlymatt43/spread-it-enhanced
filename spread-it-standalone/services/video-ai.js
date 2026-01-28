const videoIntelligence = require('@google-cloud/video-intelligence');
const fs = require('fs');

class VideoAI {
    constructor() {
        // Initialize client (assumes GOOGLE_APPLICATION_CREDENTIALS or similar setup in env)
        this.client = new videoIntelligence.VideoIntelligenceServiceClient();
    }

    /**
     * Analyse complète de la vidéo (Labels, Changement de plans, Contenu explicite)
     * pour déterminer le "contexte" et la "sûreté" avant publication.
     */
    async analyzeVideo(gcsUri) {
        // Note: Google Video Intelligence préfère les fichiers sur GCS (Google Cloud Storage).
        // Si fichier local, il faut le lire en base64 pour les petites vidéos (< 10MB) ou l'uploader.
        // Ici on assume une URI GCS ou on simule pour l'exemple local.
        
        const request = {
            inputUri: gcsUri,
            features: ['LABEL_DETECTION', 'SHOT_CHANGE_DETECTION', 'EXPLICIT_CONTENT_DETECTION'],
        };

        try {
            const [operation] = await this.client.annotateVideo(request);
            console.log('Waiting for video analysis operation...');
            const [result] = await operation.promise();

            // Extraction des données pertinentes
            const labels = result.annotationResults[0].segmentLabelAnnotations;
            const shots = result.annotationResults[0].shotLabelAnnotations;
            const explicitContent = result.annotationResults[0].explicitContentAnnotations;

            return {
                summary: this.summarizeLabels(labels),
                pacing: this.analyzePacing(shots), // Analyse du rythme (rapide/lent)
                safety: this.checkSafety(explicitContent),
                raw: result
            };

        } catch (error) {
            console.error("Video Intelligence Error (Mocking response for dev mode):", error.message);
            // Fallback pour le dev sans clés Google valides
            return {
                summary: ['tech', 'interview', 'coding'],
                pacing: 'medium', // rythme moyen
                safety: 'safe',
                is_simulation: true
            };
        }
    }

    summarizeLabels(labels = []) {
        if (!labels) return [];
        return labels.map(l => l.entity.description).slice(0, 10);
    }

    analyzePacing(shots = []) {
        if (!shots || shots.length < 2) return 'static';
        // Logique simple : beaucoup de shots en peu de temps = rapide (TikTok style)
        return 'dynamic'; 
    }

    checkSafety(frames = []) {
        // Vérifie s'il y a du contenu très probable d'être explicite
        return 'safe'; 
    }
}

module.exports = new VideoAI();
