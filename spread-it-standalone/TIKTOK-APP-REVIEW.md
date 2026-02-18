# 🎵 TikTok App Review - Production Mode

## 📋 Informations pour la soumission

### Products utilisés:
- ✅ **Login Kit** - Authentification OAuth
- ✅ **Content Posting API** - Publication de vidéos

### Scopes demandés:
- ✅ `user.info.basic` - Récupérer les infos de profil de l'utilisateur
- ✅ `video.publish` - Publier des vidéos sur TikTok
- ✅ `video.upload` - Uploader des fichiers vidéo

---

## 📝 Explication du fonctionnement de l'app

**Texte à copier-coller dans le formulaire:**

```
Spread It is an AI-powered content creation and multi-platform publishing tool for content creators.

How each product works:

1. LOGIN KIT (user.info.basic):
   - Users click "Connect TikTok" on our auth setup page (https://spread.onlymatt.ca/auth/setup)
   - OAuth popup opens to TikTok authorization page
   - User authorizes the app
   - We receive and store the access token securely
   - We fetch basic profile info (username, display name, profile picture) to display connection status

2. CONTENT POSTING API (video.publish, video.upload):
   - Users visit our content creation interface (https://spread.onlymatt.ca/spreads or inline on https://chaud-devant.onlymatt.ca)
   - They select or upload a video (mp4 format)
   - Our AI helps optimize the description and hashtags using OpenAI
   - User selects TikTok as publishing platform
   - Our server uploads the video using TikTok's Content Posting API
   - Video is published directly to the user's TikTok account

The app helps content creators save time by:
- Creating content in one place
- Using AI to optimize descriptions
- Publishing to multiple platforms (Facebook, Instagram, Twitter, LinkedIn, YouTube, TikTok) simultaneously

Website where features are integrated: https://spread.onlymatt.ca
Demo site for inline posting: https://chaud-devant.onlymatt.ca
```

---

## 🎥 Vidéo Démo - Instructions

### Format requis:
- **Formats acceptés:** mp4, mov
- **Taille max:** 50MB
- **Nombre max:** 5 fichiers

### Ce que la vidéo DOIT montrer:

1. **Interface de connexion** (Login Kit)
   - Ouvrir https://spread.onlymatt.ca/auth/setup
   - Montrer la carte TikTok avec statut "Non connecté"
   - Cliquer sur "🔗 Connecter TikTok"
   - Popup OAuth s'ouvre
   - Autoriser l'app sur TikTok
   - Retour à la page avec statut "Connecté ✅"

2. **Utilisation du Content Posting API**
   - Aller sur https://spread.onlymatt.ca/spreads
   - Cliquer "Créer un Spread"
   - Uploader une vidéo (ou utiliser inline sur chaud-devant)
   - Montrer l'interface de chat AI qui optimise la description
   - Sélectionner TikTok comme plateforme cible
   - Cliquer "Publier"
   - Montrer la notification de succès
   - *Optionnel:* Montrer la vidéo publiée sur le profil TikTok

3. **Affichage des infos utilisateur**
   - Retour à /auth/setup
   - Montrer le nom d'utilisateur TikTok affiché
   - Montrer le statut de connexion

### Conseils pour la vidéo:

- **Durée recommandée:** 2-4 minutes
- **Résolution:** 720p minimum (1080p recommandé)
- **Qualité:** Écran net, pas de flou
- **Audio:** Pas nécessaire (ou musique de fond calme)
- **Curseur visible:** Montrer clairement les clics
- **Texte explicatif:** Ajouter des titres/annotations si possible
- **Flow complet:** Du début à la fin sans coupure

### Outils de capture recommandés (macOS):

```bash
# QuickTime Player (gratuit, pré-installé)
# Fichier > Nouvel enregistrement de l'écran

# OBS Studio (gratuit, plus de contrôle)
# https://obsproject.com/

# ScreenFlow (payant, professionnel)
# https://www.telestream.net/screenflow/
```

---

## 📸 Script de capture vidéo détaillé

### Partie 1: Login Kit (0:00 - 1:00)

1. **Ouvrir le navigateur**
   - Aller à https://spread.onlymatt.ca/auth/setup
   - Laisser la page charger complètement (2 secondes)

2. **Montrer la carte TikTok**
   - Scroller jusqu'à la carte TikTok
   - Pointer le statut "Non connecté" (rouge)
   - Hover sur le bouton "Connecter"

3. **Connexion OAuth**
   - Cliquer "🔗 Connecter TikTok"
   - Popup s'ouvre (600x700px)
   - Page TikTok authorization apparaît
   - Cliquer "Autoriser"
   - Popup se ferme automatiquement (2s)

4. **Confirmation**
   - Page refresh automatiquement
   - Badge passe au vert "Connecté ✅"
   - Nom d'utilisateur TikTok s'affiche sous la carte

### Partie 2: Content Posting API (1:00 - 3:00)

#### Option A: Interface principale

1. **Créer un Spread**
   - Aller à https://spread.onlymatt.ca/spreads
   - Cliquer "Créer un Spread +"
   - Upload une vidéo (glisser-déposer ou sélectionner)
   - Preview de la vidéo apparaît

2. **Chat AI**
   - Taper dans le chat: "Optimise pour TikTok avec hashtags viraux"
   - L'IA génère une description optimisée
   - Montrer le texte généré

3. **Sélection plateforme**
   - Scroller vers les badges de plateformes
   - Cliquer sur le badge TikTok (🎵)
   - Badge devient actif (highlight)

4. **Publication**
   - Cliquer "Publier sur les plateformes sélectionnées"
   - Notification de succès apparaît
   - Message: "Publié sur TikTok ✅"

#### Option B: Inline posting (chaud-devant)

1. **Interface inline**
   - Aller à https://chaud-devant.onlymatt.ca
   - Scroller sur une vidéo de la galerie
   - Bouton 🚀 "Spread It" apparaît en hover

2. **Platform picker**
   - Cliquer sur 🚀
   - Popup de sélection apparaît avec 6 plateformes
   - TikTok badge montré avec statut connecté (vert)
   - Cliquer sur TikTok

3. **Modal inline**
   - Modal s'ouvre avec preview de la vidéo
   - Interface de chat AI intégrée
   - Taper description ou demander optimisation
   - Cliquer "Publier"

### Partie 3: Vérification (3:00 - 3:30)

1. **Retour à auth/setup**
   - Naviguer vers /auth/setup
   - Carte TikTok montre "Connecté ✅"
   - Username affiché

2. **Vérification sur TikTok** (optionnel)
   - Ouvrir TikTok dans nouvel onglet
   - Aller sur profil
   - Montrer la vidéo publiée

---

## ✅ Checklist avant soumission

- [ ] Explication claire du fonctionnement (copier texte ci-dessus)
- [ ] Vidéo démo enregistrée (2-4 min)
- [ ] Vidéo montre Login Kit complet
- [ ] Vidéo montre Content Posting API complet
- [ ] Vidéo montre le site web/domain exact (spread.onlymatt.ca)
- [ ] Qualité vidéo suffisante (720p+)
- [ ] Taille fichier < 50MB
- [ ] Format mp4 ou mov
- [ ] Interface utilisateur claire
- [ ] Flow complet de bout en bout

---

## 🚀 Après soumission

**Délai d'approbation:** 1-3 jours ouvrables

**Si approuvé:**
1. TikTok vous enverra un email de confirmation
2. Votre app passera en Production Mode
3. Ajoutez le redirect URL de production dans les settings
4. Testez le flow OAuth complet
5. Tous les utilisateurs pourront se connecter (pas seulement les testers)

**Si refusé:**
1. TikTok expliquera les raisons
2. Corrigez les points mentionnés
3. Re-soumettez avec une nouvelle vidéo si nécessaire

---

## 📞 Support

**TikTok Developer Support:**
- Forum: https://developers.tiktok.com/community
- Email: developer@tiktok.com

**Documentation:**
- App Review Guidelines: https://developers.tiktok.com/doc/app-review-guidelines
- Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started
- Login Kit: https://developers.tiktok.com/doc/login-kit-web

---

## 💡 Tips pour réussir la review

1. **Vidéo de qualité:** Écran net, pas de glitches, démonstration fluide
2. **Explication claire:** Expliquer exactement ce que chaque API fait
3. **Site web réel:** Montrer le vrai site (spread.onlymatt.ca) pas localhost
4. **Use case légitime:** Content creation pour créateurs (excellent use case)
5. **Privacy/Terms:** Assurer que les pages /privacy et /terms sont accessibles
6. **Data deletion:** Page /data-deletion conforme RGPD

Notre app a tous ces éléments ✅ - bonne chance pour la review! 🎯
