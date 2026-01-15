const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

  const payload = {
    hashtags,
    keywords,
    vocabulary: normaliseList([...keywords].map(word => word.toLowerCase()))
  };

  cacheState.data = payload;
  cacheState.expiresAt = now + DEFAULT_TTL_MS;

  return payload;
}

module.exports = {
  fetchTrendingTopics
};
