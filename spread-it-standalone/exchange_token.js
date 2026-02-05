require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const axios = require('axios');

async function exchangeToken() {
    const shortToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!shortToken || !appId || !appSecret) {
        console.error("❌ Missing .env vars (Token, App ID, or App Secret)");
        return;
    }

    try {
        console.log("🔄 Exchanging Short-Lived Token for Long-Lived Token...");
        const response = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortToken
            }
        });

        const newToken = response.data.access_token;
        console.log("\n✅ SUCCESS! New Long-Lived Token generated (valid 60 days).");
        console.log("---------------------------------------------------------------");
        console.log(newToken);
        console.log("---------------------------------------------------------------");
        console.log("\nCopy/Paste this token back into your .env.local file for INSTAGRAM_ACCESS_TOKEN and FACEBOOK_ACCESS_TOKEN.");

    } catch (e) {
        console.error("❌ Token Exchange Failed:", e.response?.data?.error?.message || e.message);
    }
}

exchangeToken();