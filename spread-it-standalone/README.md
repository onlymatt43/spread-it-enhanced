# Spread It - Standalone

Une application web moderne pour créer, améliorer, analyser et partager du contenu avec l'IA sur les réseaux sociaux.

## Fonctionnalités

- **Création & Amélioration IA** : Génération et amélioration de texte avec GPT-4
- **Analyse de Vision** : Analyse intelligente d'images avec Google Cloud Vision (labels, textes, logos)
- **Tendances en temps réel** : Détection des sujets chauds sur les réseaux pour inspirer votre contenu
- **Galerie de Médias** : Gestion intégrée des images et médias
- **Système de Leads** : Capture et gestion de prospects (MongoDB)
- **Partage Multi-plateforme** : Facebook, Twitter, LinkedIn, Instagram, et support expérimental TikTok
- **Optimisation d'images** : Redimensionnement et formatage automatique avec Sharp
- **Modération Automatique** : Filtrage de contenu via Google Perspective/Vision
- **Sessions Robustes** : Gestion de session persistante (SQLite/Fichiers)
- **API pour intégration** : Points d'entrée pour CMS externes (WordPress)

## Architecture Technique

- **Backend** : Node.js + Express
- **Base de données** : MongoDB (Leads, Données) + SQLite (Sessions)
- **IA & Traitement** : OpenAI GPT-4, Google Cloud Vision
- **Traitement d'image** : Sharp, Canvas
- **Frontend** : EJS templates + Bootstrap 5 + JS Client
- **Tâches de fond** : Node-cron pour la planification

## Déploiement

### Prérequis
- Node.js >= 18.0.0
- Compte MongoDB (Atlas ou local)
- Clés API (OpenAI, Google Cloud, Réseaux Sociaux)

### Sur Vercel

1. Clonez ce repository
2. Copiez `.env.example` vers `.env` et remplissez les variables
3. Installez les dépendances : `npm install`
4. Déployez sur Vercel : `vercel --prod`

### Sur Render/Production

1. Créez un nouveau service Web
2. Mettez en place les variables d'environnement
3. Commande de build: `npm install`
4. Commande de start: `npm start`

## Configuration

### Variables d'environnement

Copiez `.env.example` vers `.env`. Voici les principales configurations :

```env
# Core & IA
OPENAI_API_KEY=votre_clé
GOOGLE_CLOUD_VISION_KEY=votre_clé_google
Note: Google Credentials peuvent nécessiter un chemin de fichier ou un JSON stringifié

# Base de Données
MONGODB_URI=mongodb+srv://... (Pour les leads et données persistantes)
SESSION_DB_NAME=sessions.sqlite

# Sécurité & Session
SESSION_SECRET=votre_secret_fort
API_KEY=clé_pour_api_externe
SESSION_COOKIE_SECURE=true (en production)

# Réseaux Sociaux (Selon besoin)
FACEBOOK_ACCESS_TOKEN=...
TWITTER_API_KEY=...
INSTAGRAM_ACCESS_TOKEN=...
```

### APIs requises

- **OpenAI API** : Génération de texte
- **Google Cloud Vision API** : Analyse d'images
- **MongoDB Atlas** : Stockage de données
- **APIs Réseaux Sociaux** : Graph API, Twitter V2, etc.

## Utilisation

### Interface Web

1. **Dashboard** : Vue d'ensemble des tendances et accès rapide
2. **Créer** : Outil de rédaction assistée et upload d'images avec analyse IA
3. **Galerie** : Visualisation des médias disponibles
4. **Partager** : Publication multi-canaux avec prévisualisation
5. **Leads** : Suivi des interactions et prospects

### API pour WordPress / Intégration

L'endpoint principal `/api/create-post` permet d'envoyer du contenu depuis un site externe.
Nouveaux endpoints :
- `GET /api/leads` : Récupération des leads
- `GET /api/gallery/:type` : Accès aux ressources média

## Développement

```bash
# Installation
npm install

# Développement (avec nodemon)
npm run dev

# Production
npm start

# Tests
npm test
```

## Sécurité

- Validation des entrées
- Protection CSRF
- Sanitisation du contenu
- Modération automatique
- Chiffrement des tokens API

## Licence

MIT