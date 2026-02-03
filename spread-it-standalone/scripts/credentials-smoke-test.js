/*
 Read-only credentials smoke test for Facebook & Instagram.
 Loads .env.local and tests basic Graph API calls without posting.
*/

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const axios = require('axios');

async function testFacebookPage() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!pageId || !token) return { ok: false, error: 'Missing FACEBOOK_PAGE_ID or FACEBOOK_ACCESS_TOKEN' };
  try {
    const url = `https://graph.facebook.com/v19.0/${pageId}?fields=name,id&access_token=${encodeURIComponent(token)}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.response?.data || e.message };
  }
}

async function testInstagramBusiness() {
  const igBizId = process.env.INSTAGRAM_BUSINESS_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
  if (!igBizId || !token) return { ok: false, error: 'Missing INSTAGRAM_BUSINESS_ID or token' };
  try {
    // IG Graph supports username field on IG user
    const url = `https://graph.facebook.com/v19.0/${igBizId}?fields=username,id&access_token=${encodeURIComponent(token)}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.response?.data || e.message };
  }
}

(async () => {
  const fb = await testFacebookPage();
  const ig = await testInstagramBusiness();
  const result = { facebook: fb, instagram: ig };
  console.log(JSON.stringify(result, null, 2));
})();
