const { google } = require('googleapis');
const readline = require('readline');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/*
 * UTILITY SCRIPT: GET YOUTUBE REFRESH TOKEN
 * -----------------------------------------
 * Usage: node scripts/get-youtube-token.js
 * 
 * Pre-requisites:
 * 1. Create Google Cloud Project
 * 2. Enable YouTube Data API v3
 * 3. Create OAuth 2.0 Credentials (Web Application)
 * 4. Set Redirect URI to: https://developers.google.com/oauthplayground
 * 5. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env
 */

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
];

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ ERREUR: Il manque YOUTUBE_CLIENT_ID ou YOUTUBE_CLIENT_SECRET dans le fichier .env");
    console.log("👉 Va créer tes identifiants sur https://console.cloud.google.com/apis/credentials");
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n🎥 TICKET D'ENTRÉE YOUTUBE GENERATOR 🎥");
console.log("---------------------------------------");

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // CRUCIAL pour avoir le Refresh Token
    scope: SCOPES,
    prompt: 'consent' // Force à redemander l'accès pour garantir le refresh token
});

console.log("\n1. Ouvre ce lien dans ton navigateur (connecte-toi avec le compte YouTube cible) :");
console.log(`\n👉 ${authUrl}\n`);
console.log("2. Google va te demander d'autoriser l'app (clique sur 'Advanced' > 'Go to App (unsafe)' si besoin car ton app est en test).");
console.log("3. Une fois autorisé, tu seras redirigé vers une page blanche (OAuth Playground).");
console.log("4. Regarde l'URL de cette page blanche et copie la valeur de 'code=' (tout ce qui est après code= et avant &scope...).");
console.log("   C'est un code très long qui commence souvent par '4/'.");

rl.question('\n📋 Colle le code ici : ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code.trim());
        
        console.log("\n✅ SUCCÈS ! Voici tes tokens :\n");
        
        if (tokens.refresh_token) {
            console.log("✨ AJOUTE ÇA DANS TON .ENV :");
            console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
        } else {
            console.log("⚠️  Pas de Refresh Token reçu. As-tu bien utilisé un nouveau 'code' ?");
            console.log("Google n'envoie le refresh token que la PREMIÈRE fois que tu autorises l'app.");
            console.log("Solution : Va dans tes paramètres de compte Google -> Sécurité -> Apps tierces, supprime l'accès à ton app, et recommence.");
        }

    } catch (error) {
        console.error("\n❌ Erreur lors de l'échange du token :", error.message);
    } finally {
        rl.close();
    }
});
