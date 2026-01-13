# Guide de Déploiement - Render

## 🚀 Déploiement sur Render

### 1. Préparation du Repository
Votre code est déjà sur GitHub : https://github.com/onlymatt43/spread-it-enhanced

### 2. Créer un Service Web sur Render

1. **Connectez-vous** à [Render](https://render.com)
2. **Cliquez** sur "New" → "Web Service"
3. **Connectez** votre repository GitHub
4. **Sélectionnez** la branche `master`

### 3. Configuration du Service

**Settings :**
- **Name** : `spread-it-enhanced`
- **Environment** : `Node`
- **Build Command** : `npm install`
- **Start Command** : `npm start`

### 4. Variables d'Environnement

Ajoutez ces variables dans "Environment" :

```
OPENAI_API_KEY=votre_clé_openai
GOOGLE_CLOUD_PROJECT_ID=sample-app-matt
GOOGLE_CLOUD_PRIVATE_KEY_ID=7137918fd5e66b7a51e6ddc622a8ed83049fafff
GOOGLE_CLOUD_PRIVATE_KEY=votre_clé_privée_complète
GOOGLE_CLOUD_CLIENT_EMAIL=spread-it-vision-sa@sample-app-matt.iam.gserviceaccount.com
MONGODB_URI=votre_uri_mongodb_atlas
SESSION_SECRET=votre_secret_session_unique
API_KEY=votre_clé_api_wordpress
NODE_ENV=production
```

### 5. Configuration Avancée

**Instance Type** : `Starter` (gratuit) ou `Standard` (payant)
**Region** : `Frankfurt` (EU) pour la conformité RGPD

### 6. Déploiement Automatique

Render déploie automatiquement à chaque push sur GitHub.

### 7. Domaines Personnalisés (Optionnel)

- Allez dans "Settings" → "Custom Domains"
- Ajoutez votre domaine personnalisé

### 8. Monitoring

- **Logs** : Disponibles en temps réel
- **Metrics** : CPU, mémoire, requêtes
- **Health Checks** : Configurez `/health` si nécessaire

## 🔧 Commandes Utiles

```bash
# Déploiement manuel
render deploy

# Voir les logs
render logs

# Redémarrer le service
render restart
```

## 💡 Avantages de Render pour votre App

- ✅ **Uploads de fichiers** : Support complet
- ✅ **Sessions persistantes** : Pas de cold starts
- ✅ **Base de données** : Compatible MongoDB Atlas
- ✅ **Traitement d'images** : Operations longues supportées
- ✅ **Stockage temporaire** : Pour les fichiers uploadés

## 🚨 Points d'Attention

- **Limite gratuite** : 750 heures/mois
- **Timeout** : Pas de limite (contrairement à Vercel)
- **Stockage** : Les fichiers uploadés sont temporaires (utilisez cloud storage pour persister)

Votre application Spread-It Enhanced est parfaitement adaptée à Render ! 🎉