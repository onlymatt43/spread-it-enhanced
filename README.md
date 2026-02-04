# Spread It - Système Amélioré

Un système complet de création et partage de contenu assisté par IA, déployable indépendamment et intégrable dans WordPress.

## Architecture

Le système est composé de deux parties principales :

1. **Spread It Standalone** (`spread-it-standalone/`) : Application web Node.js déployable sur Vercel/Render
2. **Spread It Integration** (`spread-it-integration/`) : Plugin WordPress pour intégrer le service

> **Note** : Les anciennes versions et les projets en cours de développement (`spread-it`, `spread-it-improved`, etc.) ont été déplacés dans le dossier `_archive/`.

## Fonctionnalités Principales

### 🤖 Amélioration IA
- Correction et optimisation du contenu avec GPT-4
- Adaptation du style (professionnel, décontracté, informatif, inspirant)
- Ajustement de la longueur du contenu
- Maintien d'un ton humain et naturel

### 🛡️ Modération de Contenu
- Détection automatique du contenu adulte/inapproprié
- Intégration Google Perspective API (configurable)
- Filtrage basé sur des mots-clés et analyse de sentiment

### 📊 Analyse de Timing Optimal
- Analyse des variables de marché pour déterminer les meilleurs horaires
- Prédiction basée sur l'analyse de sentiment du contenu
- Suggestions d'horaires personnalisées

### 📱 Partage Multi-plateforme
- Intégration native Facebook, Twitter, LinkedIn, Instagram
- Contenu adapté automatiquement à chaque plateforme
- Programmation flexible (immédiat ou différé)
- APIs configurables pour chaque réseau

### 🎨 Interface Fluide
- Design moderne et intuitif
- Support mobile optimisé
- Upload de fichiers (TXT, DOC, PDF)
- Drag & drop pour l'import

## Déploiement

### Application Standalone

**Sur Vercel :**
```bash
npm install
npm run build
vercel --prod
```

**Sur Render :**
- Service Web avec repository Git
- Variables d'environnement configurées
- Build command: `npm install`
- Start command: `npm start`

### Plugin WordPress

1. Copiez `spread-it-integration/` dans `wp-content/plugins/`
2. Activez le plugin
3. Configurez l'URL API et la clé dans les réglages

## Configuration

### Variables d'Environnement (App Standalone)

```env
# OpenAI (requis)
OPENAI_API_KEY=your_openai_key

# Réseaux sociaux (optionnel)
FACEBOOK_ACCESS_TOKEN=...
TWITTER_API_KEY=...
TWITTER_ACCESS_TOKEN=...
# etc.

# Sécurité
SESSION_SECRET=your_secret
API_KEY=your_api_key_for_wp

# Modération (optionnel)
PERSPECTIVE_API_KEY=your_google_perspective_key
```

### Configuration WordPress

- URL API : `https://your-app.vercel.app`
- Clé API : celle définie dans `API_KEY`

## Utilisation

### Via l'Interface Web
1. Accédez à l'URL déployée
2. Saisissez ou importez votre contenu
3. Sélectionnez les options d'amélioration
4. Validez et partagez

### Via WordPress
1. Utilisez le menu "Spread It" dans l'admin
2. Ou la meta box dans l'éditeur de posts
3. Améliorez le contenu directement dans WordPress

## APIs et Intégrations

### OpenAI
- GPT-4 pour l'amélioration de contenu
- DALL-E pour la génération d'images (optionnel)

### Réseaux Sociaux
- Twitter API v2
- Facebook Graph API
- LinkedIn API
- Instagram Basic Display API

### Modération
- Google Perspective API (recommandé)
- Filtrage par mots-clés (fallback)

### Analytics (Futur)
- Google Analytics pour l'analyse de timing
- APIs de réseaux sociaux pour les métriques d'engagement

## Sécurité

- Validation et sanitisation des entrées
- Protection CSRF
- Authentification API par clé
- Chiffrement des tokens sensibles
- Logs d'audit

## Performance

- Architecture sans état (stateless)
- Cache des résultats d'IA (optionnel)
- Optimisation des appels API
- Compression des réponses

## Évolutivité

- Architecture modulaire
- APIs RESTful extensibles
- Support de files d'attente (Redis/Queue)
- Base de données pour l'historique (optionnel)

## Développement

### Structure des Dossiers

```
spread-it-standalone/
├── server.js              # Serveur principal
├── views/                 # Templates EJS
├── public/               # Assets statiques
├── package.json          # Dépendances
├── .env.example          # Configuration exemple
└── vercel.json           # Config déploiement Vercel

spread-it-integration/
├── spread-it-integration.php  # Plugin principal
├── js/spread-it.js           # Scripts frontend
└── README.md                 # Documentation

spread-it-improved/
└── [Structure préparée pour développement futur]
```

### Tests

```bash
# Tests unitaires
npm test

# Tests d'intégration
# [À implémenter selon les besoins]
```

## Roadmap

### Phase 1 (Actuelle)
- ✅ Application standalone basique
- ✅ Plugin WordPress d'intégration
- ✅ Amélioration IA avec OpenAI
- ✅ Interface utilisateur moderne

### Phase 2 (Prochaine)
- 🔄 Modération avancée avec Google Perspective
- 🔄 Intégrations complètes des réseaux sociaux
- 🔄 Analyse de timing basée sur les données réelles
- 🔄 Système de programmation avancé

### Phase 3 (Futur)
- 📊 Dashboard d'analytics
- 🤖 Apprentissage automatique pour l'optimisation
- 🌐 Support multi-langues
- 📱 Application mobile

## Contribution

1. Fork le repository
2. Créez une branche pour votre fonctionnalité
3. Commitez vos changements
4. Pushez vers la branche
5. Créez une Pull Request

## Licence

MIT - Voir les fichiers LICENSE individuels

## Support

- Documentation complète dans chaque dossier
- Issues GitHub pour les bugs
- Discussions pour les questions générales

---

**Développé avec ❤️ pour les créateurs de contenu**
- Génération de contenu basé sur sujet, style et longueur
- Génération optionnelle d'images avec DALL-E
- Stockage des posts générés dans une table personnalisée
- Génération automatique de texte optimisé pour les réseaux sociaux
- Historique des posts créés

**Cas d'usage :** Outil pour les administrateurs souhaitant créer rapidement du contenu original avec l'IA.

### spread-it-improved/ (Version Améliorée - En Développement)
**Structure prévue :**
- Architecture modulaire avec classes séparées (admin, cache, frontend, etc.)
- Assets organisés (CSS/JS)
- Fonctionnalités étendues par rapport à la version de base

**État :** Actuellement un squelette vide, nécessite implémentation.

## Analyse des Permissions des Dossiers

Tous les dossiers principaux ont les permissions suivantes : `drwxr-xr-x` (755).

Cela signifie :
- **Propriétaire** : lecture, écriture, exécution
- **Groupe** : lecture, exécution
- **Autres** : lecture, exécution

Ces permissions sont standard pour les dossiers dans un environnement de développement WordPress. Elles permettent au propriétaire de modifier les fichiers, tout en permettant aux autres utilisateurs (comme le serveur web) de lire et exécuter le contenu.

### Détails des Permissions

- `spread-it/` : drwxr-xr-x (755)
- `spread-it-improved/` : drwxr-xr-x (755) avec attributs étendus (@)
- `spread-it-simple/` : drwxr-xr-x (755)

Les attributs étendus sur `spread-it-improved/` sont probablement liés aux métadonnées macOS et n'affectent pas les permissions de base.

## Complémentarité des Versions

Les trois versions ne se dupliquent pas complètement :

- **spread-it** et **spread-it-simple** sont complémentaires : la première améliore du contenu soumis par les utilisateurs, la seconde crée du contenu original
- **spread-it-improved** pourrait servir de base pour une version unifiée et modulaire combinant les fonctionnalités des deux autres
- Elles utilisent toutes OpenAI mais pour des purposes différents (optimisation vs génération)

## Installation

Pour installer le plugin, copiez le contenu d'un des dossiers (selon la version souhaitée) dans le répertoire `wp-content/plugins/` de votre installation WordPress, puis activez-le depuis l'interface d'administration.

## Utilisation

Consultez la documentation spécifique à chaque version pour les détails d'utilisation.

## Unification Possible des Versions

Il serait possible d'unifier les trois versions en un seul plugin complet utilisant la structure modulaire de `spread-it-improved/` comme base. Voici comment :

### Architecture Unifiée Proposée

**Structure de fichiers (basée sur spread-it-improved/) :**
```
spread-it-unified/
├── spread-it.php (fichier principal)
├── includes/
│   ├── class-spread-it.php (classe principale)
│   ├── class-spread-it-admin.php (interface admin + générateur IA)
│   ├── class-spread-it-frontend.php (formulaire frontend)
│   ├── class-spread-it-social.php (partage social + tracking)
│   ├── class-spread-it-ai.php (intégration OpenAI)
│   ├── class-spread-it-cache.php (cache des résultats IA)
│   ├── class-spread-it-logger.php (logging)
│   ├── class-spread-it-security.php (sécurisation)
│   └── class-spread-it-meta.php (gestion métadonnées)
├── assets/
│   ├── css/
│   │   ├── admin.css
│   │   ├── frontend.css
│   │   └── social.css
│   └── js/
│       ├── admin.js
│       ├── frontend.js
│       └── social.js
├── test-plugin.php (tests)
├── README.md
└── INSTALLATION.md
```

### Fonctionnalités Unifiées

1. **Mode Soumission Frontend** (de spread-it/)
   - Formulaire public pour soumission de posts
   - Upload d'images/vidéos
   - Publication immédiate + optimisation IA différée

2. **Mode Génération Admin** (de spread-it-simple/)
   - Interface admin pour créer des posts avec IA
   - Génération de contenu, images, textes sociaux
   - Table personnalisée pour l'historique

3. **Partage Social Avancé** (combiné)
   - Boutons de partage pour tous réseaux
   - Suivi des clics et analytics
   - Légendes IA optimisées par réseau

4. **Configuration Centralisée**
   - Paramètres OpenAI (clé, modèle, politiques)
   - Options pour chaque mode (frontend/admin)
   - Gestion des permissions

### Avantages de l'Unification

- **Maintenance simplifiée** : un seul plugin à gérer
- **Cohérence** : interface et code unifiés
- **Flexibilité** : activation/désactivation des modes selon les besoins
- **Performance** : partage des ressources (cache, API calls)
- **Évolutivité** : architecture modulaire pour ajouts futurs

### Migration

- Les données de `spread-it-simple/` (table `wp_spread_it_posts`) pourraient être migrées
- Les métadonnées de `spread-it/` (`_spread_it_ai_json`) préservées
- Configuration fusionnée avec priorisation des settings existants

Cette unification créerait un plugin WordPress complet pour la gestion de contenu assisté par IA, de la soumission utilisateur à la génération automatique.