# Configuration de la Publication sur les Réseaux Sociaux

Ce guide explique comment configurer les credentials OAuth pour publier automatiquement sur chaque plateforme.

## 📋 Vue d'ensemble

**Plateformes supportées:**
- ✅ Facebook (Post, Reel)
- ✅ Instagram (Feed, Reel)
- ✅ Twitter/X (Tweet)
- ✅ LinkedIn (Post)
- ✅ TikTok (Video)
- ✅ YouTube (Video, Short)

**Formats automatiques:**
- Conversion vidéo intelligente (ratio adapté par plateforme)
- Upload et publication asynchrone
- Suivi du statut dans la DB

---

## 🔧 Configuration par Plateforme

### 1. FACEBOOK

**Documentation:** https://developers.facebook.com/docs/pages-api

**Étapes:**
1. Créer une app Facebook: https://developers.facebook.com/apps
2. Activer "Pages API" et "Instagram Graph API"
3. Générer un Page Access Token (long-lived)
4. Obtenir le Page ID de ta page

**Variables .env:**
```env
FACEBOOK_APP_ID=votre_app_id
FACEBOOK_APP_SECRET=votre_app_secret
FACEBOOK_ACCESS_TOKEN=votre_page_access_token
FACEBOOK_PAGE_ID=votre_page_id
```

**Permissions requises:**
- `pages_manage_posts`
- `pages_read_engagement`
- `pages_show_list`

**Formats supportés:**
- **Post:** Texte + vidéo/image (16:9, 1:1, 4:5)
- **Reel:** Vidéo 9:16, max 90s (OPTIMAL)

---

### 2. INSTAGRAM

**Documentation:** https://developers.facebook.com/docs/instagram-api

**Étapes:**
1. Convertir ton compte Instagram en Business Account
2. Lier à une Page Facebook
3. Utiliser le même token Facebook Graph API
4. Obtenir l'Instagram Business Account ID

**Variables .env:**
```env
INSTAGRAM_ACCESS_TOKEN=votre_facebook_token
INSTAGRAM_BUSINESS_ID=17841...
```

**Permissions requises:**
- `instagram_basic`
- `instagram_content_publish`

**Formats supportés:**
- **Feed:** Image/vidéo (1:1, 4:5), max 60s
- **Reel:** Vidéo 9:16, 3-90s (OPTIMAL)
- **Carousel:** 2-10 médias

**⚠️ IMPORTANT:** Instagram requiert que la vidéo soit hébergée sur une URL publique (pas d'upload direct). Utilise Bunny.net ou S3.

---

### 3. TWITTER (X)

**Documentation:** https://developer.twitter.com/en/docs/twitter-api

**Étapes:**
1. Créer une app: https://developer.twitter.com/en/portal/dashboard
2. Configurer OAuth 1.0a
3. Générer Access Token + Secret

**Variables .env:**
```env
TWITTER_API_KEY=votre_api_key
TWITTER_API_SECRET=votre_api_secret
TWITTER_ACCESS_TOKEN=votre_access_token
TWITTER_ACCESS_TOKEN_SECRET=votre_token_secret
```

**Permissions requises:**
- `tweet.read`
- `tweet.write`
- `users.read`

**Formats supportés:**
- **Tweet:** Texte 280 chars + vidéo/image
- Vidéo: max 2:20 min (512MB)
- Ratios: 16:9, 1:1, 2:1, 3:4

---

### 4. LINKEDIN

**Documentation:** https://learn.microsoft.com/en-us/linkedin/marketing/

**Étapes:**
1. Créer une app: https://www.linkedin.com/developers/apps
2. Demander accès "Marketing Developer Platform"
3. Implémenter OAuth 2.0 flow
4. Obtenir `personUrn` de l'utilisateur

**Variables .env:**
```env
LINKEDIN_CLIENT_ID=votre_client_id
LINKEDIN_CLIENT_SECRET=votre_client_secret
LINKEDIN_ACCESS_TOKEN=votre_access_token
```

**Permissions requises:**
- `w_member_social`
- `r_basicprofile`

**Formats supportés:**
- **Post:** Texte (max 3000 chars) + vidéo/image
- Vidéo: 3 sec - 10 min, max 5GB
- Ratio recommandé: 1.91:1

**⚠️ TODO:** Stocker le `personUrn` par utilisateur dans la DB.

---

### 5. TIKTOK

**Documentation:** https://developers.tiktok.com/doc/content-posting-api-get-started

**Étapes:**
1. S'inscrire: https://developers.tiktok.com/
2. Créer une app
3. Activer "Content Posting API"
4. Implémenter OAuth 2.0 flow

**Variables .env:**
```env
TIKTOK_CLIENT_KEY=votre_client_key
TIKTOK_CLIENT_SECRET=votre_client_secret
TIKTOK_REDIRECT_URI=https://spread.onlymatt.ca/auth/tiktok/callback
```

**Permissions requises:**
- `video.upload`
- `video.publish`

**Formats supportés:**
- **Video:** Vertical 9:16 UNIQUEMENT
- Durée: 3 sec - 10 min
- Taille max: 287.6MB

**⚠️ NOTE:** TikTok est en Sandbox mode (limited testing). Production access requires approval.

---

### 6. YOUTUBE

**Documentation:** https://developers.google.com/youtube/v3

**Étapes:**
1. Créer un projet Google Cloud: https://console.cloud.google.com/
2. Activer YouTube Data API v3
3. Créer OAuth 2.0 credentials
4. Obtenir un Refresh Token

**Variables .env:**
```env
YOUTUBE_CLIENT_ID=votre_client_id
YOUTUBE_CLIENT_SECRET=votre_client_secret
YOUTUBE_REFRESH_TOKEN=votre_refresh_token
```

**Permissions requises:**
- `https://www.googleapis.com/auth/youtube.upload`

**Formats supportés:**
- **Video:** 16:9, max 12h, 256GB
- **Short:** 9:16, max 60s (OPTIMAL pour vidéos courtes)
- Thumbnail automatique généré

---

## 🚀 Workflow de Publication

### 1. Préparation du média

```javascript
// Télécharge depuis Bunny.net
downloadMedia(mediaUrl) 
  → /tmp/spread-it/source.mp4

// Convertit au ratio optimal
convertVideo(source, output, { ratio: '9:16' })
  → /tmp/spread-it/instagram_reel.mp4
```

### 2. Upload plateforme

```javascript
// Upload vers la plateforme
uploadToInstagram(media, credentials)
  → { mediaId, status }
```

### 3. Publication

```javascript
// Publie avec le texte généré
publishPost(mediaId, content)
  → { url, externalId }
```

### 4. Mise à jour DB

```javascript
// Sauvegarde le statut
UPDATE spreads SET metadata = {
  published: {
    instagram: {
      status: 'published',
      timestamp: '2026-02-18T...',
      url: 'https://instagram.com/p/...',
      externalId: '123456789'
    }
  }
}
```

---

## 🛠️ Outils Requis

**FFmpeg** (conversion vidéo):
```bash
# macOS
brew install ffmpeg

# Linux
apt install ffmpeg
```

**FFprobe** (métadonnées vidéo):
Inclus avec FFmpeg

**Sharp** (images):
```bash
npm install sharp
```

---

## 📝 TODO / Améliorations

### Authentification Multi-utilisateurs
- [ ] Système OAuth flow complet
- [ ] Stocker tokens par utilisateur dans DB
- [ ] Refresh automatique des access tokens
- [ ] Interface de connexion par plateforme

### Fonctionnalités Manquantes
- [ ] Scheduling (publier plus tard)
- [ ] Analytics (likes, vues, engagement)
- [ ] Republication automatique
- [ ] A/B testing de posts
- [ ] Delete/Edit support

### Optimisations
- [ ] Queue système pour uploads async
- [ ] Retry logic avec exponential backoff
- [ ] Compression vidéo optimisée (qualité vs taille)
- [ ] Cache des médias convertis

---

## ⚠️ Limitations Actuelles

1. **Instagram/TikTok:** Nécessitent URL publique (pas d'upload direct de fichier local)
   - **Solution:** Héberger temporairement sur Bunny.net ou S3

2. **LinkedIn personUrn:** Hard-codé, doit être stocké par utilisateur
   - **Solution:** Implémenter OAuth flow + DB storage

3. **YouTube OAuth:** Utilise refresh token, mais faut implémenter la rotation
   - **Solution:** Refresh automatique avant expiration

4. **TikTok Sandbox:** Accès limité en mode développement
   - **Solution:** Demander Production Access à TikTok

---

## 🧪 Testing

### Test local (sans publier réellement):
```javascript
// Dans social-publisher.js, ajouter un mode dry-run:
const DRY_RUN = process.env.DRY_RUN === 'true';

if (DRY_RUN) {
  console.log('Would publish:', { platform, content, media });
  return { success: true, dryRun: true };
}
```

### Test avec une plateforme:
```bash
# Dans .env.local
DRY_RUN=false
ENABLE_PLATFORMS=instagram,twitter

# Publier sur Instagram seulement
curl -X POST http://localhost:3000/api/publish-spread \
  -H "Content-Type: application/json" \
  -d '{"spreadId":"spread_123","platform":"instagram"}'
```

---

## 📚 Ressources

- **Facebook Graph Explorer:** https://developers.facebook.com/tools/explorer
- **Instagram Testing:** https://developers.facebook.com/tools/instagram-tester
- **Twitter API Console:** https://developer.twitter.com/en/portal/dashboard
- **LinkedIn API Playground:** https://learn.microsoft.com/en-us/linkedin/
- **TikTok Dev Portal:** https://developers.tiktok.com/
- **YouTube API Explorer:** https://developers.google.com/youtube/v3/docs

---

**Questions?** Check logs: `tail -f /tmp/spread-it-publish.log`
