# 🔑 Guide de Renouvellement des Tokens

## Statut Actuel
- ✅ **Twitter** - Connecté (@OnlyMatt43)
- ❌ **Facebook** - Expiré (5 février 2026)
- ❌ **Instagram** - Token invalide
- ❌ **LinkedIn** - Expiré (tokens = 60 jours)
- ❌ **TikTok** - Manquant
- ❌ **YouTube** - Invalid grant

---

## 1️⃣ FACEBOOK & INSTAGRAM (Plus Simple)

Instagram utilise le même token que Facebook (compte Business lié).

### Étapes:

#### A. Accéder à Facebook Graph API Explorer
1. Allez sur: https://developers.facebook.com/tools/explorer/
2. Connectez-vous avec votre compte Facebook
3. Sélectionnez votre application: **"Spread It"** (App ID: 2963111530545801)

#### B. Générer un Token de Page
1. En haut à droite, cliquez sur **"Meta App"**
2. Sélectionnez votre app dans la liste
3. Cliquez sur **"Get Token"** → **"Get Page Access Token"**
4. Sélectionnez votre Page: **"OnlyMatt"** (Page ID: 621801084344846)
5. Permissions requises:
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_manage_metadata`
   - `instagram_basic`
   - `instagram_content_publish`
6. Cliquez **"Generate Access Token"**

#### C. Prolonger le Token (60 jours → Long-lived)
1. Copiez le token temporaire généré
2. Ouvrez un nouvel onglet et allez sur:
   ```
   https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=2963111530545801&client_secret=e56447dae7b5acae388cbe9c0c6e3c37&fb_exchange_token=VOTRE_TOKEN_TEMPORAIRE
   ```
3. Remplacez `VOTRE_TOKEN_TEMPORAIRE` par le token copié
4. Le résultat sera: `{"access_token":"NOUVEAU_TOKEN_LONGUE_DUREE","token_type":"bearer"}`

#### D. Mettre à jour .env.local
```bash
FACEBOOK_ACCESS_TOKEN=NOUVEAU_TOKEN_LONGUE_DUREE
INSTAGRAM_ACCESS_TOKEN=NOUVEAU_TOKEN_LONGUE_DUREE
```

#### E. Vérifier
```bash
curl "https://graph.facebook.com/v18.0/621801084344846?access_token=VOTRE_NOUVEAU_TOKEN&fields=name"
```
Devrait retourner: `{"name":"OnlyMatt","id":"621801084344846"}`

---

## 2️⃣ LINKEDIN (Moyen)

Les tokens LinkedIn expirent après **60 jours**.

### Option A: Renouvellement Manuel (Rapide)

#### Étapes:
1. Allez sur: https://www.linkedin.com/developers/apps
2. Sélectionnez votre app: **"Spread It"**
3. Onglet **"Auth"**
4. Copiez votre **Client ID** et **Client Secret** (déjà dans .env.local ✅)
5. Cliquez sur **"OAuth 2.0 tools"** → **"Generate Access Token"**
6. Scope requis: `w_member_social`, `r_basicprofile`
7. Autorisez l'app
8. Copiez le nouveau token

#### Mettre à jour .env.local:
```bash
LINKEDIN_ACCESS_TOKEN=NOUVEAU_TOKEN
```

### Option B: OAuth Flow Automatique (Recommandé)

Je peux créer un endpoint `/auth/linkedin/callback` qui:
1. Génère une URL d'autorisation
2. Vous redirige vers LinkedIn
3. Reçoit le code d'autorisation
4. Échange contre un access token
5. Sauvegarde automatiquement dans .env.local

**Voulez-vous que je crée cet endpoint?**

---

## 3️⃣ YOUTUBE (Délicat - Refresh Token)

L'erreur `invalid_grant` signifie que le refresh token a expiré ou été révoqué.

### Étapes:

#### A. Google Cloud Console
1. Allez sur: https://console.cloud.google.com/
2. Sélectionnez votre projet: **sample-app-matt**
3. Menu **"APIs & Services"** → **"Credentials"**
4. Trouvez votre OAuth 2.0 Client ID: `152118116523-ulcpje415fluleqlc4g86je17n4omjrl`

#### B. Générer un Nouveau Refresh Token

**Méthode 1: OAuth Playground (Recommandée)**
1. Allez sur: https://developers.google.com/oauthplayground/
2. En haut à droite, cliquez sur l'icône ⚙️ (Settings)
3. Cochez **"Use your own OAuth credentials"**
4. Entrez:
   - OAuth Client ID: `152118116523-ulcpje415fluleqlc4g86je17n4omjrl`
   - OAuth Client Secret: `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`
5. Dans la liste de gauche, trouvez **"YouTube Data API v3"**
6. Sélectionnez les scopes:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
7. Cliquez **"Authorize APIs"**
8. Connectez-vous avec votre compte Google/YouTube
9. Autorisez l'accès
10. Cliquez **"Exchange authorization code for tokens"**
11. Copiez le **"Refresh token"** généré

#### C. Mettre à jour .env.local:
```bash
YOUTUBE_REFRESH_TOKEN=NOUVEAU_REFRESH_TOKEN
```

**Méthode 2: Script Node.js**
Je peux créer un script `scripts/youtube-auth.js` qui ouvre votre navigateur et gère tout le flow automatiquement.

**Voulez-vous que je crée ce script?**

---

## 4️⃣ TIKTOK (Complexe - Sandbox Mode)

TikTok nécessite une app approuvée en production mode.

### Statut:
- Client Key: ✅ `sbawbgfr95mj41hen5`
- Client Secret: ✅ `ufAdSfo7kvjyRiFJIQnw7jzaydDzjmO4`
- Redirect URI: ✅ `https://spread.onlymatt.ca/auth/tiktok/callback`
- **Access Token**: ❌ Manquant

### Options:

#### Option A: Sandbox Testing (Limité)
1. Allez sur: https://developers.tiktok.com/apps/
2. Sélectionnez votre app
3. Demandez l'accès **"Content Posting API"**
4. Une fois approuvé, utilisez le Login Kit pour obtenir un token

#### Option B: OAuth Flow
Je peux créer l'endpoint `/auth/tiktok/callback` qui:
1. Génère l'URL d'autorisation TikTok
2. Reçoit le code
3. Échange contre un access token
4. Sauvegarde dans .env.local

**Note:** TikTok en Sandbox mode limite les fonctionnalités. Pour une utilisation réelle, il faut:
- Compléter la vérification de l'app
- Passer en Production mode
- Demander accès à Content Posting API

---

## 🚀 ACTIONS RAPIDES

### Ordre Recommandé:
1. **Facebook/Instagram** (5 min) ← COMMENCEZ ICI
2. **LinkedIn** (3 min) 
3. **YouTube** (10 min)
4. **TikTok** (Attendre approbation)

### Après Renouvellement:
```bash
# Redémarrer le serveur
pkill -9 -f "node server.js"
cd "/Users/mathieucourchesne/onlymatt-ca/spread-it-wp copy/spread-it-standalone"
node server.js

# Tester les statuts
curl -s http://localhost:3000/api/platforms/status | jq .
```

---

## 📋 CHECKLIST

- [ ] Facebook Page Token renouvelé
- [ ] Instagram (même token que Facebook)
- [ ] LinkedIn Access Token régénéré
- [ ] YouTube Refresh Token obtenu
- [ ] TikTok Access Token (en attente d'approbation)
- [ ] .env.local mis à jour
- [ ] Serveur redémarré
- [ ] Statuts vérifiés (tous verts ✅)

---

## 🆘 BESOIN D'AIDE?

Je peux créer des scripts automatiques pour:
1. LinkedIn OAuth flow automatique
2. YouTube token refresh automatique
3. TikTok OAuth callback

**Dites-moi par où vous voulez commencer!**
