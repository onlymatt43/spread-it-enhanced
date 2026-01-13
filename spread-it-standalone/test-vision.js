#!/usr/bin/env node

// Test script pour vérifier la configuration Google Cloud Vision
require('dotenv').config();
const vision = require('@google-cloud/vision');

async function testGoogleCloudVision() {
  console.log('🧪 Test de Google Cloud Vision API...');

  try {
    // Configuration du client
    let visionClient;
    if (process.env.GOOGLE_CLOUD_VISION_KEY) {
      visionClient = new vision.ImageAnnotatorClient({
        apiKey: process.env.GOOGLE_CLOUD_VISION_KEY
      });
      console.log('✅ Utilisation de l\'API key');
    } else {
      console.log('❌ Aucune clé API configurée');
      return;
    }

    // Test avec une image simple (logo Google)
    const imageUrl = 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png';

    console.log('🔍 Analyse d\'une image de test...');

    const [result] = await visionClient.labelDetection(imageUrl);
    const labels = result.labelAnnotations;

    console.log('✅ API Google Cloud Vision fonctionne !');
    console.log('📋 Labels détectés :');
    labels.slice(0, 5).forEach((label, index) => {
      console.log(`  ${index + 1}. ${label.description} (${Math.round(label.score * 100)}%)`);
    });

  } catch (error) {
    console.error('❌ Erreur avec Google Cloud Vision :', error.message);
    if (error.message.includes('API key')) {
      console.log('💡 Vérifiez que votre clé API est valide et activée pour Google Cloud Vision');
    }
  }
}

testGoogleCloudVision();