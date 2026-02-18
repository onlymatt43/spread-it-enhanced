# ⚙️ Configuration des URLs de Redirection

## IMPORTANT - À faire AVANT de tester l'auth

Configurez ces URLs dans les paramètres de chaque plateforme:

---

## 1. LinkedIn

**Où:** https://www.linkedin.com/developers/apps

**Étapes:**
1. Sélectionnez votre app: **"Spread It"**
2. Onglet **"Auth"**
3. Section **"Authorized redirect URLs for your app"**
4. Supprimez l'ancienne URL: `https://spread-it-enhanced.onrender.com/privacy-policy/`
5. Ajoutez la nouvelle URL:
   ```
   https://spread.onlymatt.ca/auth/linkedin/callback
   ```
6. Cliquez **"Update"**

---

## 2. Facebook

**Où:** https://developers.facebook.com/apps

**Étapes:**
1. Sélectionnez votre app: **"Spread It"** (App ID: 2963111530545801)
2. Menu de gauche → **"Facebook Login"** → **"Settings"**

### a) Valid OAuth Redirect URIs
Dans la section **"Valid OAuth Redirect URIs"**, ajoutez:
```
https://spread.onlymatt.ca/auth/facebook/callback
```

### b) Allowed Domains for the JavaScript SDK
Dans la section **"Allowed Domains for the JavaScript SDK"**, ajoutez:
```
https://spread.onlymatt.ca
```
*(Sans le slash final)*

### c) Deauthorize Callback URL
Dans la section **"Deauthorize callback URL"**, ajoutez:
```
https://spread.onlymatt.ca/data-deletion
```

4. Cliquez **"Save Changes"** en bas de la page

---

## 3. YouTube (Google Cloud)

**Où:** https://console.cloud.google.com/apis/credentials

**Étapes:**
1. Sélectionnez le projet: **"sample-app-matt"**
2. Dans **"Credentials"**, trouvez votre **OAuth 2.0 Client ID**:
   - Client ID: `152118116523-ulcpje415fluleqlc4g86je17n4omjrl`
3. Cliquez dessus pour éditer
4. Section **"Authorized redirect URIs"**
5. Ajoutez:
   ```
   https://spread.onlymatt.ca/auth/youtube/callback
   ```
6. Cliquez **"Save"**

---

## 4. TikTok (Production Mode Required)

**Où:** https://developers.tiktok.com/apps

**Étapes:**

### Étape A: Demander Production Mode
1. Sélectionnez votre app
2. Si encore en **Sandbox Mode**, demandez l'accès **Production Mode**
3. Remplissez le formulaire de vérification
4. Attendez l'approbation (peut prendre 1-3 jours)

### Étape B: Configurer Redirect URI
1. Une fois approuvé, allez dans **Settings** → **Login Kit**
2. Section **"Redirect domain"** ou **"Redirect URI"**
3. Ajoutez:
   ```
   https://spread.onlymatt.ca/auth/tiktok/callback
   ```
4. Sauvegardez

**Note:** En Sandbox Mode, seules les fonctionnalités limitées sont disponibles.

---

## 5. Twitter (OAuth 1.0a - Manuel)

Twitter utilise OAuth 1.0a et nécessite une configuration différente.

**Tokens déjà configurés:**
- ✅ API Key
- ✅ API Secret
- ✅ Access Token
- ✅ Access Token Secret

**Pas besoin de reconfigurer** - Twitter fonctionne déjà!

---

## 📋 Checklist de Configuration

Avant d'utiliser `/auth/setup`:

- [ ] LinkedIn redirect URL configurée
- [ ] Facebook redirect URL configurée  
- [ ] YouTube redirect URL configurée
- [ ] TikTok Production Mode demandé
- [ ] TikTok redirect URL configurée (après approbation)

---

## 🚀 Test en Local

Pour tester en local (http://localhost:3000):

Ajoutez AUSSI ces URLs pour chaque plateforme:

**LinkedIn:**
```
http://localhost:3000/auth/linkedin/callback
```

**Facebook:**

*Redirect URI:*
```
http://localhost:3000/auth/facebook/callback
```

*Allowed Domain (JavaScript SDK):*
```
localhost
```

**YouTube:**
```
http://localhost:3000/auth/youtube/callback
```

**TikTok:**
```
http://localhost:3000/auth/tiktok/callback
```

---

## ✅ Une fois configuré

1. Redémarrez le serveur:
   ```bash
   pkill -9 -f "node server.js"
   cd "/Users/mathieucourchesne/onlymatt-ca/spread-it-wp copy/spread-it-standalone"
   node server.js
   ```

2. Ouvrez:
   ```
   http://localhost:3000/auth/setup
   ```

3. Cliquez sur **"🔗 Connecter"** pour chaque plateforme

4. Les tokens seront automatiquement sauvegardés dans `.env.local`!
