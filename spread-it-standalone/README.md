# Spread It — Standalone

**Déployé sur** : https://spread.onlymatt.ca  
**Repo** : https://github.com/onlymatt43/spread-it-enhanced  
**Branche active** : `master`  
**Dernier commit déployé** : `ed292dd`

---

## Architecture (état actuel, vérifié)

### Flow utilisateur

```
Tout le monde → https://spread.onlymatt.ca
    ↓
Upload media (fichier ou URL) → Ouvrir le composer
    ↓
showComposer() fetch /api/auth/issue-token silencieusement
    ├── Cookie de session valide (admin connecté) → si_token injecté → Publish actif
    └── Pas de session → pas de token → Publish → ouvre /join dans nouvel onglet
```

### Routes vérifiées dans `server.js`

| Route | Auth | Description |
|---|---|---|
| `GET /` | aucune | Landing page — upload panel pour tout le monde |
| `GET /composer` | aucune | Composer — contrôle d'accès via `SI_TOKEN` dans l'UI |
| `GET /join` | aucune | Page promo + formulaire waitlist |
| `POST /api/join` | aucune | Sauvegarde email dans table `waitlist` |
| `POST /api/upload-media` | aucune | Upload fichier → `public/uploads/` → retourne URL + type |
| `GET /api/auth/issue-token` | session | Retourne JWT si session Google OAuth valide, 401 sinon |
| `GET /auth/google/start` | aucune | Lance OAuth Google |
| `GET /auth/google/callback` | aucune | Callback OAuth → session → redirect `/` |
| `GET /spreads` | requireAuth | Dashboard historique (admin seulement) |

### Comportement du composer (`views/composer.ejs`)

```javascript
// SI_TOKEN lu depuis ?si_token= dans l'URL (injecté par showComposer si connecté)
const SI_TOKEN = new URLSearchParams(window.location.search).get('si_token') || null;

// Sur Publish :
if (!SI_TOKEN) {
    window.open('/join', '_blank');  // visiteur → promo
    return;
}
// sinon → publie pour vrai
```

### Base de données SQLite (`db/migrations.sql`)

Tables présentes :
- `experiments` — tests A/B
- `shares` — historique des publications
- `metrics` — analytics
- `waitlist` — emails collectés via `/join`
- `spreads` — posts créés
- `resources` — ressources media

---

## Google OAuth (état actuel)

- **App** : "Spread It" dans Google Console
- **Mode** : Testing — seul `mathieu@onlymatt.ca` peut se connecter
- **Web client utilisé** : Web client 2 (`152118116523-jqd...`) — URIs configurés pour `spread.onlymatt.ca`
- **Callback** : `https://spread.onlymatt.ca/auth/google/callback`
- **Pour ouvrir aux users** : publier l'app dans Google Console + ajouter bouton login sur le landing

---

## Déploiement

Hébergé sur **Render** (Web Service), déploiement automatique sur push `master`.

```bash
# Build
npm install

# Start
node server.js
```

### Variables d'environnement requises

```
OPENAI_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_ALLOWED_EMAIL
APP_BASE_URL=https://spread.onlymatt.ca
SESSION_SECRET
GOOGLE_SITE_VERIFICATION
FACEBOOK_ACCESS_TOKEN / FACEBOOK_PAGE_ID
INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID
TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET / TWITTER_API_KEY / TWITTER_API_SECRET
LINKEDIN_ACCESS_TOKEN
TIKTOK_ACCESS_TOKEN
YOUTUBE_REFRESH_TOKEN / YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET
```

---

## Historique des commits récents

| Commit | Description |
|---|---|
| `ed292dd` | Remove requireAuth from /composer — accès contrôlé par SI_TOKEN |
| `142feb9` | Flow unifié sur / — si_token fetché silencieusement |
| `902f922` | Fix h1 "Spread It" pour vérification Google OAuth |
| `7e5edb2` | Support google-site-verification meta tag |
| `d4cd891` | state:true sur Google OAuth |
| `214fff9` | Page /join + waitlist pour users non-auth |
| `23445a4` | Homepage upload pour users non-auth |
| `0376f39` | Silence logs session file-store |
| `6b3d3cb` | Ajout table spreads dans migrations |
| `ed12362` | Upload flow sur homepage (fichier + URL) |

---

*© 2026 Only Matt*
