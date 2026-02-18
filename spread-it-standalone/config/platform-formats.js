/**
 * Configuration complète des formats de publication par plateforme
 * Inclut TOUS les ratios et types possibles (pas seulement l'optimal)
 */

const PLATFORM_FORMATS = {
  facebook: {
    name: 'Facebook',
    types: {
      post: {
        name: 'Post Standard',
        ratios: ['16:9', '1:1', '4:5'],
        video: {
          maxDuration: 14400, // 240 min
          maxSize: 10 * 1024 * 1024 * 1024, // 10GB
          formats: ['mp4', 'mov'],
          codecs: { video: 'h264', audio: 'aac' }
        },
        image: {
          maxSize: 8 * 1024 * 1024, // 8MB
          formats: ['jpg', 'png']
        },
        text: { maxLength: 63206 }
      },
      reel: {
        name: 'Reel',
        ratios: ['9:16'],
        video: {
          maxDuration: 90, // 90 sec
          minDuration: 3,
          maxSize: 4 * 1024 * 1024 * 1024, // 4GB
          formats: ['mp4'],
          codecs: { video: 'h264', audio: 'aac' }
        },
        text: { maxLength: 2200 },
        optimal: true // Format recommandé
      },
      story: {
        name: 'Story',
        ratios: ['9:16'],
        video: {
          maxDuration: 60,
          maxSize: 4 * 1024 * 1024 * 1024,
          formats: ['mp4']
        },
        ephemeral: true // Disparaît après 24h
      }
    },
    api: {
      endpoint: 'https://graph.facebook.com/v18.0',
      permissions: ['pages_manage_posts', 'pages_read_engagement'],
      docs: 'https://developers.facebook.com/docs/graph-api'
    }
  },

  instagram: {
    name: 'Instagram',
    types: {
      feed: {
        name: 'Feed Post',
        ratios: ['1:1', '4:5'],
        video: {
          maxDuration: 60,
          minDuration: 3,
          maxSize: 100 * 1024 * 1024, // 100MB
          formats: ['mp4'],
          codecs: { video: 'h264', audio: 'aac' }
        },
        image: {
          maxSize: 8 * 1024 * 1024,
          formats: ['jpg', 'png'],
          minResolution: { width: 320, height: 320 },
          maxResolution: { width: 1440, height: 1800 }
        },
        text: { maxLength: 2200, hashtags: 30 }
      },
      reel: {
        name: 'Reel',
        ratios: ['9:16'],
        video: {
          maxDuration: 90,
          minDuration: 3,
          maxSize: 4 * 1024 * 1024 * 1024,
          formats: ['mp4'],
          codecs: { video: 'h264', audio: 'aac' },
          minResolution: { width: 540, height: 960 },
          recommendedResolution: { width: 1080, height: 1920 }
        },
        text: { maxLength: 2200, hashtags: 30 },
        optimal: true
      },
      story: {
        name: 'Story',
        ratios: ['9:16'],
        video: {
          maxDuration: 60,
          maxSize: 4 * 1024 * 1024 * 1024,
          formats: ['mp4']
        },
        ephemeral: true
      },
      carousel: {
        name: 'Carousel',
        ratios: ['1:1', '4:5'],
        minItems: 2,
        maxItems: 10,
        video: {
          maxDuration: 60,
          maxSize: 100 * 1024 * 1024,
          formats: ['mp4']
        },
        image: {
          maxSize: 8 * 1024 * 1024,
          formats: ['jpg', 'png']
        }
      }
    },
    api: {
      endpoint: 'https://graph.instagram.com/v18.0',
      permissions: ['instagram_basic', 'instagram_content_publish'],
      docs: 'https://developers.facebook.com/docs/instagram-api',
      requiresBusinessAccount: true
    }
  },

  twitter: {
    name: 'Twitter (X)',
    types: {
      tweet: {
        name: 'Tweet',
        ratios: ['16:9', '1:1', '2:1', '3:4'],
        video: {
          maxDuration: 140, // 2:20 min (free tier)
          maxSize: 512 * 1024 * 1024, // 512MB
          formats: ['mp4', 'mov'],
          codecs: { video: 'h264', audio: 'aac' },
          minResolution: { width: 32, height: 32 },
          maxResolution: { width: 1920, height: 1200 }
        },
        image: {
          maxSize: 5 * 1024 * 1024,
          formats: ['jpg', 'png', 'gif'],
          maxImages: 4
        },
        text: { 
          maxLength: 280, // 4000 for Premium
          urlLength: 23 // URLs count as 23 chars
        },
        optimal: true
      }
    },
    api: {
      endpoint: 'https://api.twitter.com/2',
      auth: 'OAuth 2.0',
      docs: 'https://developer.twitter.com/en/docs/twitter-api'
    }
  },

  linkedin: {
    name: 'LinkedIn',
    types: {
      post: {
        name: 'Post Standard',
        ratios: ['1.91:1', '1:1', '4:5'],
        video: {
          maxDuration: 600, // 10 min
          minDuration: 3,
          maxSize: 5 * 1024 * 1024 * 1024, // 5GB
          formats: ['mp4', 'mov', 'avi'],
          minResolution: { width: 256, height: 144 },
          maxResolution: { width: 4096, height: 2304 }
        },
        image: {
          minResolution: { width: 552, height: 368 },
          formats: ['jpg', 'png', 'gif']
        },
        text: { 
          maxLength: 3000,
          optimalLength: { min: 150, max: 300 }
        },
        optimal: true
      },
      article: {
        name: 'Article',
        text: { maxLength: 125000 },
        richContent: true
      },
      document: {
        name: 'Document Post',
        formats: ['pdf'],
        maxSize: 100 * 1024 * 1024,
        maxPages: 300
      }
    },
    api: {
      endpoint: 'https://api.linkedin.com/v2',
      permissions: ['w_member_social'],
      docs: 'https://learn.microsoft.com/en-us/linkedin/marketing/'
    }
  },

  tiktok: {
    name: 'TikTok',
    types: {
      video: {
        name: 'Video',
        ratios: ['9:16'], // Vertical obligatoire
        video: {
          maxDuration: 600, // 10 min
          minDuration: 3,
          maxSize: 287.6 * 1024 * 1024, // 287.6MB
          formats: ['mp4', 'mov', 'webm'],
          codecs: { video: 'h264', audio: 'aac' },
          recommendedResolution: { width: 1080, height: 1920 },
          minResolution: { width: 540, height: 960 }
        },
        text: { 
          maxLength: 150,
          hashtags: { recommended: 3, max: 10 }
        },
        optimal: true
      }
    },
    api: {
      endpoint: 'https://open.tiktokapis.com/v2',
      permissions: ['video.upload', 'video.publish'],
      docs: 'https://developers.tiktok.com/doc/content-posting-api-get-started'
    }
  },

  youtube: {
    name: 'YouTube',
    types: {
      video: {
        name: 'Video Standard',
        ratios: ['16:9', '4:3', '1:1'],
        video: {
          maxDuration: 43200, // 12h
          minDuration: 1,
          maxSize: 256 * 1024 * 1024 * 1024, // 256GB
          formats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'],
          codecs: { video: 'h264', audio: 'aac' },
          recommendedResolution: { width: 1920, height: 1080 }
        },
        text: {
          title: { maxLength: 100 },
          description: { maxLength: 5000 }
        },
        thumbnail: {
          formats: ['jpg', 'png'],
          resolution: { width: 1280, height: 720 },
          maxSize: 2 * 1024 * 1024
        }
      },
      short: {
        name: 'Short',
        ratios: ['9:16'],
        video: {
          maxDuration: 60,
          minDuration: 1,
          maxSize: 256 * 1024 * 1024 * 1024,
          formats: ['mp4'],
          recommendedResolution: { width: 1080, height: 1920 }
        },
        text: {
          title: { maxLength: 100 }
        },
        optimal: true
      },
      unlisted: {
        name: 'Unlisted Video',
        ratios: ['16:9'],
        video: {
          maxDuration: 43200,
          maxSize: 256 * 1024 * 1024 * 1024,
          formats: ['mp4']
        },
        visibility: 'unlisted'
      }
    },
    api: {
      endpoint: 'https://www.googleapis.com/youtube/v3',
      permissions: ['https://www.googleapis.com/auth/youtube.upload'],
      docs: 'https://developers.google.com/youtube/v3'
    }
  }
};

/**
 * Retourne le format optimal pour une plateforme
 */
function getOptimalFormat(platform) {
  const platformConfig = PLATFORM_FORMATS[platform];
  if (!platformConfig) return null;

  const optimalType = Object.entries(platformConfig.types).find(
    ([_, config]) => config.optimal
  );

  return optimalType ? optimalType[0] : Object.keys(platformConfig.types)[0];
}

/**
 * Retourne le ratio cible pour un format donné
 */
function getTargetRatio(platform, type) {
  const platformConfig = PLATFORM_FORMATS[platform];
  if (!platformConfig || !platformConfig.types[type]) return null;

  return platformConfig.types[type].ratios[0]; // Premier ratio = recommandé
}

/**
 * Valide qu'un média respecte les contraintes d'un format
 */
function validateMedia(platform, type, mediaInfo) {
  const platformConfig = PLATFORM_FORMATS[platform];
  if (!platformConfig || !platformConfig.types[type]) {
    return { valid: false, errors: ['Format invalide'] };
  }

  const typeConfig = platformConfig.types[type];
  const errors = [];

  if (mediaInfo.isVideo && typeConfig.video) {
    const { duration, size, codec } = mediaInfo;
    
    if (duration > typeConfig.video.maxDuration) {
      errors.push(`Durée max: ${typeConfig.video.maxDuration}s`);
    }
    if (typeConfig.video.minDuration && duration < typeConfig.video.minDuration) {
      errors.push(`Durée min: ${typeConfig.video.minDuration}s`);
    }
    if (size > typeConfig.video.maxSize) {
      errors.push(`Taille max: ${(typeConfig.video.maxSize / 1024 / 1024).toFixed(0)}MB`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PLATFORM_FORMATS,
  getOptimalFormat,
  getTargetRatio,
  validateMedia
};
