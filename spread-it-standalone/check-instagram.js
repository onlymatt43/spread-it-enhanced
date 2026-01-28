const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkInstagramConnection() {
    const token = process.env.FACEBOOK_ACCESS_TOKEN;
    if (!token) {
        console.error("❌ No FACEBOOK_ACCESS_TOKEN in .env");
        return;
    }

    console.log("🔑 Testing Token:", token.substring(0, 10) + "...");

    try {
        // 1. Get User/Page details to find connected pages
        console.log("📡 Fetching User/Page info...");
        
        // Try to fetch as if we are a User with accounts first (failed previously, but keeping as fallback logic if I were rewriting full lib)
        // Since we know it failed, let's try assuming we are a Page directly
        
        console.log("   🤔 Token might be a Page Token. Checking specific Page fields...");
        const meRes = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name,instagram_business_account&access_token=${token}`);
        
        console.log(`✅ Identité: ${meRes.data.name} (ID: ${meRes.data.id})`);

        // Test the ID the user provided in .env notes
        const potentialId = "1598012064533399";
        console.log(`\n🕵️ Testing potential IG ID from notes: ${potentialId}`);
        try {
            const testRes = await axios.get(`https://graph.facebook.com/v18.0/${potentialId}?fields=username,name&access_token=${token}`);
            console.log(`   ✅ It is a valid Object! Name: ${testRes.data.name || 'N/A'}, Username: ${testRes.data.username || 'N/A'}`);
        } catch (e) {
            console.log(`   ❌ Not a valid Graph Object ID usable with this token: ${e.message}`);
        }

        if (meRes.data.instagram_business_account) {
             const igBusinessId = meRes.data.instagram_business_account.id;
             console.log(`\n🎉 SUCCESS! We have a valid IG Business ID: ${igBusinessId}`);
             console.log("We can now use this ID to spy on competitors (Business Discovery API).");
             
             // Save to .env if needed? 
             // Ideally we just output it for now.
        } else {
             console.log("\n⚠️ No Instagram Business Account linked to this Page Token.");
             console.log("---------------------------------------------------");
             console.log("URGENT FIX REQUIRED:");
             console.log(`1. Go to your Facebook Page: '${meRes.data.name}'`);
             console.log("2. Go to Settings > Linked Accounts > Instagram");
             console.log("3. Click 'Connect Account' and log in to your Instagram Business/Creator account.");
             console.log("4. Once connected, run this script again.");
             console.log("---------------------------------------------------");
        }

    } catch (error) {
        console.error("❌ API Error:", error.response ? error.response.data : error.message);
    }
}

checkInstagramConnection();