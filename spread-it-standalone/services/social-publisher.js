/**
 * Service de publication sur les réseaux sociaux
 * Gère l'upload et la publication avec conversion automatique
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { convertVideo, convertImage, generateThumbnail, getVideoMetadata } = require('./media-converter');
const { PLATFORM_FORMATS, getOptimalFormat, getTargetRatio } = require('../config/platform-formats');

/**
 * Télécharge un média depuis une URL
 */
async function downloadMedia(url, outputPath) {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(outputPath));
    writer.on('error', reject);
  });
}

/**
 * Détermine le type de publication optimal pour une plateforme
 */
function determinePublicationType(platform, mediaInfo) {
  const optimalFormat = getOptimalFormat(platform);
  
  // Logique spécifique par plateforme
  if (platform === 'youtube') {
    // Short si <60s, sinon video standard
    return mediaInfo.duration < 60 ? 'short' : 'video';
  }
  
  return optimalFormat;
}

/**
 * Prépare un média pour une plateforme spécifique
 * Download + conversion au bon ratio/format
 */
async function prepareMedia(mediaUrl, platform, type, workDir) {
  const tempDir = path.join(workDir, 'temp');
  await fs.promises.mkdir(tempDir, { recursive: true });

  // Download média source
  const sourceExt = path.extname(new URL(mediaUrl).pathname) || '.mp4';
  const sourcePath = path.join(tempDir, `source${sourceExt}`);
  await downloadMedia(mediaUrl, sourcePath);

  // Déterminer si c'est une vidéo ou image
  const isVideo = ['.mp4', '.mov', '.avi', '.webm'].includes(sourceExt.toLowerCase());

  // Obtenir métadonnées
  let metadata;
  if (isVideo) {
    metadata = await getVideoMetadata(sourcePath);
  }

  // Obtenir le ratio cible
  const targetRatio = getTargetRatio(platform, type);
  if (!targetRatio) {
    throw new Error(`Ratio not found for ${platform}/${type}`);
  }

  // Convertir au format requis
  const outputExt = isVideo ? '.mp4' : '.jpg';
  const outputPath = path.join(tempDir, `${platform}_${type}${outputExt}`);

  let convertedMedia;
  if (isVideo) {
    const platformConfig = PLATFORM_FORMATS[platform].types[type];
    convertedMedia = await convertVideo(sourcePath, outputPath, {
      ratio: targetRatio,
      maxDuration: platformConfig.video.maxDuration,
      crop: true
    });
  } else {
    convertedMedia = await convertImage(sourcePath, outputPath, {
      ratio: targetRatio
    });
  }

  // Générer thumbnail si vidéo
  let thumbnailPath = null;
  if (isVideo && platform === 'youtube') {
    thumbnailPath = path.join(tempDir, `${platform}_${type}_thumb.jpg`);
    await generateThumbnail(outputPath, thumbnailPath);
  }

  return {
    path: outputPath,
    thumbnailPath,
    isVideo,
    metadata: convertedMedia.metadata || metadata,
    ratio: targetRatio
  };
}

/**
 * FACEBOOK - Publication post/reel
 */
async function publishToFacebook(pageAccessToken, pageId, content, media, type = 'reel') {
  const endpoint = `https://graph.facebook.com/v18.0/${pageId}`;

  if (type === 'reel') {
    // 1. Initialize upload session
    const initResponse = await axios.post(`${endpoint}/video_reels`, {
      access_token: pageAccessToken,
      upload_phase: 'start'
    });

    const videoId = initResponse.data.video_id;

    // 2. Upload vidéo
    const formData = new FormData();
    formData.append('access_token', pageAccessToken);
    formData.append('upload_phase', 'transfer');
    formData.append('video_file_chunk', fs.createReadStream(media.path));

    await axios.post(`${endpoint}/video_reels`, formData, {
      headers: formData.getHeaders()
    });

    // 3. Finalize avec description
    const publishResponse = await axios.post(`${endpoint}/video_reels`, {
      access_token: pageAccessToken,
      upload_phase: 'finish',
      video_id: videoId,
      description: content.text
    });

    return {
      success: true,
      platform: 'facebook',
      type: 'reel',
      url: `https://www.facebook.com/${pageId}/videos/${videoId}`,
      data: publishResponse.data
    };
  }

  // POST standard
  const formData = new FormData();
  formData.append('message', content.text);
  if (media.isVideo) {
    formData.append('file', fs.createReadStream(media.path));
    const response = await axios.post(`${endpoint}/videos`, formData, {
      params: { access_token: pageAccessToken },
      headers: formData.getHeaders()
    });
    return { success: true, platform: 'facebook', type: 'post', data: response.data };
  } else {
    formData.append('source', fs.createReadStream(media.path));
    const response = await axios.post(`${endpoint}/photos`, formData, {
      params: { access_token: pageAccessToken },
      headers: formData.getHeaders()
    });
    return { success: true, platform: 'facebook', type: 'post', data: response.data };
  }
}

/**
 * INSTAGRAM - Publication feed/reel
 */
async function publishToInstagram(accessToken, igUserId, content, media, type = 'reel') {
  const endpoint = `https://graph.instagram.com/v18.0/${igUserId}`;

  if (type === 'reel') {
    // 1. Create media container
    const containerResponse = await axios.post(`${endpoint}/media`, {
      access_token: accessToken,
      media_type: 'REELS',
      video_url: media.publicUrl, // Nécessite URL publique
      caption: content.text,
      share_to_feed: true
    });

    const creationId = containerResponse.data.id;

    // 2. Publish container
    const publishResponse = await axios.post(`${endpoint}/media_publish`, {
      access_token: accessToken,
      creation_id: creationId
    });

    return {
      success: true,
      platform: 'instagram',
      type: 'reel',
      mediaId: publishResponse.data.id,
      data: publishResponse.data
    };
  }

  // Feed post
  const containerResponse = await axios.post(`${endpoint}/media`, {
    access_token: accessToken,
    image_url: media.publicUrl,
    caption: content.text
  });

  const publishResponse = await axios.post(`${endpoint}/media_publish`, {
    access_token: accessToken,
    creation_id: containerResponse.data.id
  });

  return { success: true, platform: 'instagram', type: 'feed', data: publishResponse.data };
}

/**
 * TWITTER - Publication tweet
 */
async function publishToTwitter(credentials, content, media) {
  const { TwitterApi } = require('twitter-api-v2');
  
  const client = new TwitterApi({
    appKey: credentials.apiKey,
    appSecret: credentials.apiSecret,
    accessToken: credentials.accessToken,
    accessSecret: credentials.accessSecret
  });

  let mediaId;
  if (media) {
    // Upload média
    mediaId = await client.v1.uploadMedia(media.path);
  }

  // Publier tweet
  const tweet = await client.v2.tweet({
    text: content.text,
    ...(mediaId && { media: { media_ids: [mediaId] } })
  });

  return {
    success: true,
    platform: 'twitter',
    type: 'tweet',
    tweetId: tweet.data.id,
    url: `https://twitter.com/i/web/status/${tweet.data.id}`,
    data: tweet.data
  };
}

/**
 * LINKEDIN - Publication post
 */
async function publishToLinkedIn(accessToken, personUrn, content, media) {
  const endpoint = 'https://api.linkedin.com/v2/ugcPosts';

  let uploadedMedia = null;

  if (media) {
    // 1. Register upload
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          owner: personUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent'
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerResponse.data.value.asset;

    // 2. Upload file
    const fileBuffer = await fs.promises.readFile(media.path);
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    uploadedMedia = asset;
  }

  // 3. Create post
  const postData = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: content.text
        },
        shareMediaCategory: uploadedMedia ? 'VIDEO' : 'NONE',
        ...(uploadedMedia && {
          media: [{
            status: 'READY',
            media: uploadedMedia
          }]
        })
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };

  const response = await axios.post(endpoint, postData, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  return {
    success: true,
    platform: 'linkedin',
    type: 'post',
    data: response.data
  };
}

/**
 * TIKTOK - Publication vidéo
 */
async function publishToTikTok(accessToken, content, media) {
  // Note: TikTok API requires video to be hosted publicly
  // This is a simplified version

  const endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';

  const response = await axios.post(
    endpoint,
    {
      post_info: {
        title: content.text.substring(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: media.metadata.size,
        chunk_size: media.metadata.size,
        total_chunk_count: 1
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    success: true,
    platform: 'tiktok',
    type: 'video',
    publishId: response.data.data.publish_id,
    data: response.data
  };
}

/**
 * YOUTUBE - Upload vidéo
 */
async function publishToYouTube(oauth2Client, content, media, type = 'short') {
  const { google } = require('googleapis');
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const requestBody = {
    snippet: {
      title: content.title || content.text.substring(0, 100),
      description: content.text,
      tags: content.hashtags || [],
      categoryId: '22' // People & Blogs
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false
    }
  };

  // Si Short, ajouter #shorts dans titre/description
  if (type === 'short') {
    requestBody.snippet.title = `${requestBody.snippet.title} #shorts`;
  }

  const response = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody,
    media: {
      body: fs.createReadStream(media.path)
    }
  });

  // Upload thumbnail si disponible
  if (media.thumbnailPath) {
    await youtube.thumbnails.set({
      videoId: response.data.id,
      media: {
        body: fs.createReadStream(media.thumbnailPath)
      }
    });
  }

  return {
    success: true,
    platform: 'youtube',
    type,
    videoId: response.data.id,
    url: `https://youtube.com/watch?v=${response.data.id}`,
    data: response.data
  };
}

/**
 * Fonction principale de publication orchestrée
 */
async function publishSpread(spreadData, credentials) {
  const {
    platform,
    type, // optionnel, sinon auto-déterminé
    mediaUrl,
    content,
    workDir = '/tmp/spread-it'
  } = spreadData;

  try {
    // Préparer le média (download + conversion)
    const publishType = type || getOptimalFormat(platform);
    const preparedMedia = await prepareMedia(mediaUrl, platform, publishType, workDir);

    // Publier selon la plateforme
    let result;
    switch (platform) {
      case 'facebook':
        result = await publishToFacebook(
          credentials.pageAccessToken,
          credentials.pageId,
          content,
          preparedMedia,
          publishType
        );
        break;

      case 'instagram':
        result = await publishToInstagram(
          credentials.accessToken,
          credentials.igUserId,
          content,
          preparedMedia,
          publishType
        );
        break;

      case 'twitter':
        result = await publishToTwitter(credentials, content, preparedMedia);
        break;

      case 'linkedin':
        result = await publishToLinkedIn(
          credentials.accessToken,
          credentials.personUrn,
          content,
          preparedMedia
        );
        break;

      case 'tiktok':
        result = await publishToTikTok(credentials.accessToken, content, preparedMedia);
        break;

      case 'youtube':
        result = await publishToYouTube(credentials.oauth2Client, content, preparedMedia, publishType);
        break;

      default:
        throw new Error(`Platform not supported: ${platform}`);
    }

    // Cleanup temp files
    await fs.promises.rm(path.join(workDir, 'temp'), { recursive: true, force: true });

    return result;

  } catch (error) {
    console.error(`Publish to ${platform} failed:`, error);
    throw error;
  }
}

module.exports = {
  publishSpread,
  prepareMedia,
  determinePublicationType,
  // Export individual publishers for testing
  publishToFacebook,
  publishToInstagram,
  publishToTwitter,
  publishToLinkedIn,
  publishToTikTok,
  publishToYouTube
};
