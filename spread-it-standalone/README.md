# 🚀 Spread It - Standalone (v2.0 "Manifesto Edition")

**L'Arme Absolue pour la Domination des Réseaux Sociaux (Style OnlyMatt).**

Spread It est une application d'automatisation intelligente qui combine **Newsjacking**, **Stratégie Hybride** et **IA Provocatrice** pour gérer vos publications sur Facebook, Instagram, LinkedIn et Twitter (X).

---

## 🔥 Pourquoi c'est différent ?

Ce n'est pas juste un "scheduler". C'est un **Stratège Numérique**.
*   **Identité Forte "Manifesto"** : L'IA ne parle pas comme un robot. Elle parle franglais, elle est edgy, "dark & sexy", et utilise des *vibe checks*.
*   **Newsjacking Automatique** : Elle scanne Google Trends en temps réel pour lier votre contenu à l'actualité mondiale (même absurdement).
*   **Réseaux de "Goal Accounts"** : Elle connaît vos modèles (GaryVee, McKinnon, etc.) et s'en inspire ou les "challenge".
*   **Authentification "Infinite Token"** : Système OAuth avancé qui maintient une connexion permanente avec Meta sans reconnexion horaire.
*   **Base de Données Hybride** : Synchronisation *Dual-Write* entre SQLite local (rapide) et Turso Cloud (persistant & distribué).

---

## 🛠 Installation Rapide

### 1. Prérequis
*   Node.js 18+
*   Un compte Render ou Vercel
*   Des comptes développeurs (Meta, Twitter, LinkedIn)
*   Clé OpenAI (GPT-4)

### 2. Installation Locale
```bash
git clone <votre-repo>
cd spread-it-standalone
npm install
node server.js
```

### 3. Configuration (.env)
Copiez `.env.example` en `.env` (ou `.env.local`).
Variables critiques :
*   `OPENAI_API_KEY`: Le cerveau.
*   `FACEBOOK_ACCESS_TOKEN` / `INSTAGRAM_ACCESS_TOKEN`: Le token "User" longue durée (60 jours).
*   `FACEBOOK_PAGE_ID` / `INSTAGRAM_BUSINESS_ID`: Les IDs cibles.
*   `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`: Pour la persistance Cloud.

---

## ⚡️ Fonctionnalités Clés

### 🧠 The Strategist (Le Cerveau)
Le module `services/strategist.js` est le cœur du système.
*   **Analyse Contextuelle** : Comprend si vous postez une vidéo ou une photo.
*   **Persona Engine** : Applique le style "OnlyMatt" (Franglais, Broken Syntax, Edgy).
*   **Vibe Check** : Ajoute une interprétation culturelle à chaque post.

### 🎨 The Composer (L'UI)
*   **Mockups Réalistes** : Prévisualisation exacte (Pixel Perfect) des posts FB, IG, X et LinkedIn (Dark Mode 2025).
*   **Smart Upload** : Détection automatique des ratios (16:9 vs 9:16).
*   **Validation Légale** : Pages intégrées (`/privacy`, `/terms`) pour satisfaire les audits Meta.

---

## 🔒 Sécurité & Légal

L'application est "Compliance-Ready" pour Meta :
*   Endpoint de suppression de données : `/data-deletion`
*   Pas de stockage de mots de passe (Oauth Only).
*   IP Restreinte possible (mais désactivée pour dev dynamique).

---

## 🚀 Déploiement (Render)

1. Connectez votre GitHub à Render.
2. Créez un **Web Service**.
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Ajoutez vos Variables d'Environnement.
6. **Magie.**

---

*© 2026 Only Matt - "Spread It" Proprietary System.*

Pour la documentation technique complète, voir [SPREAD-IT-SYSTEM-BIBLE.md](SPREAD-IT-SYSTEM-BIBLE.md).
