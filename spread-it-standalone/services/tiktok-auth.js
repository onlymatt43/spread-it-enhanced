const axios = require('axios');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

/*
 * SERVICE: TikTok Auth Helper
 * Gère le flow OAuth2 pour TikTok Login Kit for Web
 * Documentation: https://developers.tiktok.com/doc/login-kit-web/
 */

class TikTokAuth {
    constructor() {
        this.clientKey = process.env.TIKTOK_CLIENT_KEY;
        this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        // L'URL de callback DOIT être configurée dans le Developer Portal de TikTok
        // Elle doit correspondre exactement, par ex: https://ton-domaine.com/auth/tiktok/callback
        // Pour le dev local: http://localhost:3000/auth/tiktok/callback
        this.redirectUri = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/auth/tiktok/callback';
    }

    /**
     * Génère l'URL de connexion pour l'utilisateur
     */
    generateAuthUrl(state) {
        if (!this.clientKey) throw new Error("Missing TIKTOK_CLIENT_KEY");

        const csrfState = state || Math.random().toString(36).substring(7);
        
        let url = 'https://www.tiktok.com/v2/auth/authorize/';
        url += `?client_key=${this.clientKey}`;
        url += `&scope=user.info.basic,video.list,video.upload`; // Ajoute User Info et Video Upload
        url += `&response_type=code`;
        url += `&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
        url += `&state=${csrfState}`;

        return url;
    }

    /**
     * Échange le code reçu contre un Access Token
     */
    async getAccessToken(code) {
        if (!this.clientKey || !this.clientSecret) throw new Error("Missing Tikok Keys");

        const params = new URLSearchParams();
        params.append('client_key', this.clientKey);
        params.append('client_secret', this.clientSecret);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', this.redirectUri);

        try {
            const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cache-Control': 'no-cache'
                }
            });

            // Réponse attendue : { access_token, refresh_token, open_id, ... }
            if (response.data.error) {
                console.error("TikTok Auth Error (API):", response.data);
                throw new Error(response.data.error_description || "Unknown TikTok Error");
            }
            
            return response.data; // Contient access_token, expires_in, etc.
        } catch (error) {
            console.error("TikTok Auth Request Failed:", error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Rafraîchit un token expiré
     */
    async refreshAccessToken(refreshToken) {
        const params = new URLSearchParams();
        params.append('client_key', this.clientKey);
        params.append('client_secret', this.clientSecret);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);

        try {
            const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', params);
            return response.data;
        } catch (error) {
            console.error("TikTok Refresh Failed:", error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = new TikTokAuth();
