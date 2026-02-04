const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Simple in-memory cache so we do not hammer upstream APIs every request
const cacheState = {
  data: null,
  expiresAt: 0
};

const DEFAULT_TTL_MS = (parseInt(process.env.TRENDING_CACHE_TTL_MINUTES || '15', 10) || 15) * 60 * 1000;
const LOCAL_FALLBACK_FILE = path.join(__dirname, '..', 'data', 'trending.json');

function normaliseList(items = []) {
  return [...new Set(
    items
      .filter(Boolean)
      .map(item => String(item).trim())
      .filter(Boolean)
  )];
}

async function fetchFromCustomEndpoint() {
  if (!process.env.TRENDING_FEED_URL) {
    return [];
  }

  try {
    const response = await axios.get(process.env.TRENDING_FEED_URL, {
      headers: process.env.TRENDING_FEED_TOKEN
        ? { Authorization: `Bearer ${process.env.TRENDING_FEED_TOKEN}` }
        : undefined,
      timeout: 5000
    });

    if (Array.isArray(response.data)) {
      return response.data;
    }

    if (response.data && Array.isArray(response.data.items)) {
      return response.data.items;
    }

    return [];
  } catch (error) {
    console.warn('Impossible de récupérer les tendances via TRENDING_FEED_URL:', error.message);
    return [];
  }
}

function fetchFromLocalFile() {
  try {
    if (!fs.existsSync(LOCAL_FALLBACK_FILE)) {
      return [];
    }

    const raw = fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }

    return [];
  } catch (error) {
    console.warn('Impossible de lire le fichier de tendances local:', error.message);
    return [];
  }
}

function buildFallback() {
  return [
    '#MarketingDigital',
    '#ContentStrategy',
    '#AIForContent',
    'storytelling',
    'engagement rate',
    'short-form video',
    'community-first tone',
    'conversion hooks'
  ];
}

function splitTopics(rawTopics) {
  const hashtags = [];
  const keywords = [];

  rawTopics.forEach(topic => {
    if (topic.startsWith('#')) {
      hashtags.push(topic);
    } else {
      keywords.push(topic);
    }
  });

  return {
    hashtags: normaliseList(hashtags),
    keywords: normaliseList(keywords)
  };
}

async function fetchTrendingTopics(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cacheState.data && cacheState.expiresAt > now) {
    return cacheState.data;
  }

  const aggregated = [
    ...(await fetchFromCustomEndpoint()),
    ...fetchFromLocalFile()
  ];

  if (aggregated.length === 0) {
    aggregated.push(...buildFallback());
  }

  const { hashtags, keywords } = splitTopics(aggregated);

  // Enrich with platform-specific data when possible
  const perPlatform = {};

  // Twitter: try to fetch recent tweets and extract hashtags
  if (process.env.TWITTER_BEARER_TOKEN) {
    try {
      const tw = await fetchTwitterHashtags(process.env.TWITTER_BEARER_TOKEN);
      perPlatform.twitter = tw;
    } catch (e) {
      console.warn('Twitter trends fetch failed:', e.message || e);
    }
  }

  // Instagram: use Graph API if token and business id present
  if ((process.env.INSTAGRAM_BUSINESS_ID || process.env.FACEBOOK_PAGE_ID) && process.env.FACEBOOK_ACCESS_TOKEN) {
    try {
      const ig = await fetchInstagramHashtags(process.env.FACEBOOK_ACCESS_TOKEN, process.env.INSTAGRAM_BUSINESS_ID || process.env.FACEBOOK_PAGE_ID);
      perPlatform.instagram = ig;
    } catch (e) {
      console.warn('Instagram trends fetch failed:', e.message || e);
    }
  }

  // Compute recommended posting times heuristically per platform
  const times = computeOptimalTimes();

  const payload = {
    hashtags,
    keywords,
    vocabulary: normaliseList([...keywords].map(word => word.toLowerCase())),
    perPlatform,
    optimalTimes: times
  };

  cacheState.data = payload;
  cacheState.expiresAt = now + DEFAULT_TTL_MS;

  return payload;
}

module.exports = {
  fetchTrendingTopics
};

// --- Platform helpers ---
async function fetchTwitterHashtags(bearer) {
  try {
    const url = 'https://api.twitter.com/2/tweets/search/recent?query=has:hashtags -is:retweet&max_results=50&tweet.fields=entities,lang';
    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${bearer}` }, timeout: 8000 });
    const tweets = (resp.data && resp.data.data) || [];
    const tags = [];
    tweets.forEach(t => {
      const ents = t.entities || {};
      (ents.hashtags || []).forEach(h => tags.push('#' + (h.tag || h.text || '').replace(/#/g, '')));
    });
    return { hashtags: normaliseList(tags).slice(0, 30) };
  } catch (e) {
    throw e;
  }
}

async function fetchInstagramHashtags(fbToken, bizId) {
  try {
    // Fetch recent media captions
    const fields = 'caption';
    const url = `https://graph.facebook.com/v16.0/${bizId}/media?fields=${fields}&access_token=${encodeURIComponent(fbToken)}&limit=25`;
    const resp = await axios.get(url, { timeout: 8000 });
    const items = (resp.data && resp.data.data) || [];
    const tags = [];
    items.forEach(it => {
      const cap = it.caption || '';
      const matches = cap.match(/#([\p{L}0-9_\-]+)/gu);
      if (matches) matches.forEach(m => tags.push(m.startsWith('#') ? m : '#' + m));
    });
    return { hashtags: normaliseList(tags).slice(0, 30) };
  } catch (e) {
    throw e;
  }
}

function computeOptimalTimes() {
  // Heuristic windows (local time); can be improved with analytics
  const windows = {
    facebook: ['08:00','12:00','18:00'],
    instagram: ['11:00','13:00','19:00'],
    twitter: ['08:00','12:30','17:30'],
    linkedin: ['07:30','12:00','18:00']
  };

  // Return formatted recommendations with reasoning
  const out = {};
  Object.entries(windows).forEach(([platform, hrs]) => {
    out[platform] = {
      recommended: hrs,
      reasoning: `Heuristique basée sur engagement typique pour ${platform}`
    };
  });

  return out;
}
