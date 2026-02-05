require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' }); // Fallback
const axios = require('axios');

async function check() {
    const token = process.env.FACEBOOK_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
    const igId = process.env.INSTAGRAM_BUSINESS_ID || process.env.INSTAGRAM_USER_ID;

    console.log('--- Config Check ---');
    console.log(`Token present: ${!!token}`);
    console.log(`IG Business ID present in env: ${!!igId} ${igId ? '(' + igId + ')' : ''}`);

    if (!token) {
        console.error('❌ No token found in .env or .env.local');
        return;
    }

    try {
        console.log('\n--- API Check (User Token Mode) ---');

        // 1. Lister les Pages accessibles par ce User Token
        const accountsParams = new URLSearchParams({
            fields: 'name,id,instagram_business_account',
            access_token: token
        });
        const accountsRes = await axios.get(`https://graph.facebook.com/me/accounts?${accountsParams}`);
        
        const pages = accountsRes.data.data || [];
        console.log(`✅ Token Valid. User manages ${pages.length} pages.`);
        
        let foundIgId = null;
        let foundPageId = null; 
        
        const targetPageId = process.env.FACEBOOK_PAGE_ID;

        pages.forEach(page => {
            let isTarget = (page.id === targetPageId);
            console.log(`- Page: ${page.name} (ID: ${page.id}) ${isTarget ? '[TARGET]' : ''}`);
            
            if (page.instagram_business_account) {
                console.log(`  -> 📸 Linked IG: ${page.instagram_business_account.id}`);
                if (isTarget) {
                    foundIgId = page.instagram_business_account.id;
                    foundPageId = page.id;
                }
            } else {
                console.log(`  -> ❌ No IG linked.`);
            }
        });

        console.log('\n--- Configuration Diagnosis ---');

        // Check FB Page ID
        if (pages.some(p => p.id === targetPageId)) {
             console.log(`✅ FACEBOOK_PAGE_ID (${targetPageId}) is accessible via this token.`);
        } else {
             console.error(`❌ FACEBOOK_PAGE_ID (${targetPageId}) is NOT in the list of pages managed by this token.`);
        }

        // Check IG Business ID
        if (foundIgId) {
            if (igId === foundIgId) {
                console.log(`✅ INSTAGRAM_BUSINESS_ID matches the one linked to your target page.`);
                console.log('\n🎉 ALL SYSTEMS GO! Authentication is perfect.');
            } else if (igId) {
                console.warn(`⚠️ MISMATCH! .env has IG ID ${igId}, but the Page is linked to ${foundIgId}.`);
                console.log(`💡 Update .env: INSTAGRAM_BUSINESS_ID=${foundIgId}`);
            } else {
                console.log(`ℹ️ Found IG ID ${foundIgId}. Add it to .env.`);
            }
        } else {
            console.warn(`\n⚠️ The target page (${targetPageId}) does not have an Instagram Account linked in the API.`);
        }

    } catch (e) {
        console.error('❌ API Verification Failed:', e.response?.data?.error?.message || e.message);
    }
}

check();