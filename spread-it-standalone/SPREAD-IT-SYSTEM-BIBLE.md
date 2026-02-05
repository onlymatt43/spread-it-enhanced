# 📖 LA BIBLE DU SYSTÈME SPREAD IT (Documentation Technique Exhaustive)

**Version du Système :** 2.0 (Manifesto Edition)
**Date de mise à jour :** 5 Février 2026
**Responsable :** Only Matt Team

---

## 📑 Table des Matières

1.  [Vue d'Ensemble & Philosophie](#1-vue-densemble--philosophie)
2.  [Architecture Technique](#2-architecture-technique)
3.  [Le Cerveau : Service Strategist](#3-le-cerveau--service-strategist)
4.  [Pipeline de Publication & Séquence](#4-pipeline-de-publication--séquence)
5.  [Authentification & Tokens (Le cauchemar simplifié)](#5-authentification--tokens)
6.  [Base de Données Hybride (Turso + SQLite)](#6-base-de-données-hybride)
7.  [Interface Utilisateur (Composer)](#7-interface-utilisateur-composer)
8.  [Conformité Méta & Juridique](#8-conformité-méta--juridique)

---

## 1. Vue d'Ensemble & Philosophie

Spread It n'est pas un outil passif. C'est un agent actif qui impose un style.
Il a été conçu pour résoudre le problème du "syndrome de la page blanche" et de la "corvée de publication".

*   **Intrants :** Une idée vague, une photo brute, ou une vidéo pas finie.
*   **Magie Intermédiaire :** Injection de personnalité, liaison avec l'actu (Newsjacking), formatage spécifique par plateforme.
*   **Extrants :** Une domination multi-canal instantanée.

---

## 2. Architecture Technique

Le système est monolithique mais modulaire :

*   **Runtime :** Node.js 18+
*   **Framework Web :** Express.js (pour l'API et le rendu SSR).
*   **Moteur de Vues :** EJS (Embedded JavaScript) pour le rendu côté serveur des interfaces.
*   **Styles :** Bootstrap 5 + CSS Custom "Social Mockups 2025".
*   **Hébergement :** Render (Production) / Vercel (Backup).

### Structure des Dossiers Clés
*   `/services/` : La logique métier (IA, Uploads, Trends).
*   `/views/` : Les pages HTML/EJS.
*   `/public/` : Assets statiques (CSS, JS Client).
*   `/db/` : Connecteurs bases de données.

---

## 3. Le Cerveau : Service `Strategist`

Situé dans `services/strategist.js`, c'est ici que réside l'intelligence.

### A. Le Prompt Système "Manifesto"
Contrairement à un ChatGPT standard, le Stratège utilise un prompt système dynamique injecté à chaque requête.
*   **Tonalité :** "Edgy", "Franglais", "Broken Syntax", "Confident".
*   **Vibe Check :** Il sélectionne aléatoirement une "humeur" (Rant, Minimalist, Poétique Dark) pour éviter la répétition robotique.

### B. Newsjacking Engine
1.  Appel à `google-trends-api` (ou fallback interne).
2.  Récupération du Top 5 des sujets chauds au Canada/US.
3.  **Injection Forcée :** Le système oblige l'IA à trouver un lien (même ténu) entre votre contenu et cette tendance.

### C. Goal Accounts
Une base de données JSON interne de comptes "modèles" (ex: Peter McKinnon pour la vidéo, GaryVee pour le business). Le Stratège mentionne ou s'inspire de ces comptes pour ancrer le contenu dans une niche précise.

---

## 4. Pipeline de Publication & Séquence

Flux de données lors d'un clic sur "Envoyer" :

1.  **Réception :** `server.js` reçoit le POST avec le texte et le fichier média.
2.  **Upload Temporaire :** Le fichier est stocké temporairement (ou envoyé sur un bucket Cloud).
3.  **Optimisation Image :** `sharp` redimensionne l'image (1080x1080 pour IG, 1200x630 pour FB/LinkedIn).
4.  **Authentification :** Le serveur récupère le `User Token` dans `.env`.
5.  **Dispatch Parallèle :**
    *   **Facebook :** API Graph `/{page-id}/photos` ou `/videos`.
    *   **Instagram :** Création d'un Conteneur `/{ig-id}/media` -> Attente (Processing) -> Publication `/{ig-id}/media_publish`.
    *   **LinkedIn :** API UGC Post (Complexe : RegisterUpload -> Upload Binary -> Create Post).
    *   **Twitter :** API v2 Media Upload -> Tweet.
6.  **Confirmation :** Renvoi des IDs de posts au client.

---

## 5. Authentification & Tokens

C'est la partie la plus critique du système.

### La Hiérarchie Meta
1.  **User Access Token (Le Graal) :**
    *   C'est le token de VOTRE profil perso admin.
    *   Permissions requises : `pages_manage_posts`, `instagram_content_publish`, `business_management`.
    *   **Durée :** 60 jours (Long-Lived).
    *   **Usage :** Permet de *tout* faire sur *toutes* vos pages. C'est celui que nous utilisons.

2.  **Page Access Token (Obsolète ici) :**
    *   Lié à une seule page. Trop restrictif pour le cross-posting Instagram facile.

### Renouvellement
Un script `exchange_token.js` est inclus dans le projet pour transformer un token court (1h) en token long (60 jours) si besoin.

---

## 6. Base de Données Hybride

Spread It utilise une approche unique pour la persistance :

*   **SQLite Local (`session.sqlite`) :** Pour gérer les sessions utilisateurs rapides et le développement local.
*   **Turso (LibSQL) :** Pour le stockage des "Leads" et des "Posts History".
    *   Pourquoi ? Parce que Render/Vercel sont "éphémères" (ils effacent le disque à chaque redémarrage). Turso garde les données dans le cloud.
    *   **Dual-Write :** Le système écrit dans les deux bases simultanément pour la sécurité.

---

## 7. Interface Utilisateur (Composer)

L'interface (`/composer`) n'est pas qu'un formulaire.
*   **WYSIWYG Social :** Les cartes de prévisualisation sont codées en HTML/CSS pur pour imiter EXACTEMENT le rendu final.
*   **Chat Flottant :** Un module de chat (en bas à droite) permet de discuter avec le Stratège pour affiner le texte sans quitter l'écran. Il partage le contexte du média uploadé.

---

## 8. Conformité Méta & Juridique

Pour ne pas se faire bannir par Facebook :
*   **Pages Légales :** `/privacy`, `/terms`, `/data-deletion` sont hardcodées dans l'app.
*   **App Review :** L'app est configurée (paramètres développeurs) pour pointer vers ces URLs hébergées sur `onlymatt.ca` (qui redirigent ou copient le contenu).
*   **IP Whitelist :** Désactivée pour permettre le développement depuis des IPs dynamiques (Maison, Chalet, 4G).

---

*Document confidentiel - Usage interne Only Matt.*
