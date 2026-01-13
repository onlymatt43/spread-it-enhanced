# Spread It - Standalone

Une application web moderne pour créer, améliorer et partager du contenu avec l'IA sur les réseaux sociaux.

## Fonctionnalités

- **Création de contenu assistée par IA** : Améliorez votre contenu brut avec GPT-4
- **Modération automatique** : Détection et filtrage du contenu inapproprié
- **Analyse de timing optimal** : Publication aux meilleurs moments basée sur l'analyse de marché
- **Partage multi-plateforme** : Facebook, Twitter, LinkedIn, Instagram
- **Interface fluide** : Design moderne et intuitif
- **API pour intégration** : Intégrez facilement dans WordPress ou autres CMS

## Déploiement

### Sur Vercel

1. Clonez ce repository
2. Copiez `.env.example` vers `.env` et remplissez les variables
3. Installez les dépendances : `npm install`
4. Déployez sur Vercel : `vercel --prod`

### Sur Render

1. Créez un nouveau service Web sur Render
2. Connectez votre repository Git
3. Configurez les variables d'environnement
4. Déployez

## Configuration

### Variables d'environnement

Copiez `.env.example` vers `.env` et configurez :

```env
# OpenAI (requis)
OPENAI_API_KEY=your_openai_api_key

# Réseaux sociaux (optionnel, selon les plateformes utilisées)
FACEBOOK_ACCESS_TOKEN=...
TWITTER_API_KEY=...
# etc.

# Sécurité
SESSION_SECRET=your_secret
API_KEY=your_api_key
```

### APIs requises

- **OpenAI API** : Pour l'amélioration du contenu
- **APIs des réseaux sociaux** : Pour le partage automatique
- **Google Perspective API** : Pour la modération de contenu (optionnel)

## Utilisation

### Interface Web

1. Accédez à l'URL de votre déploiement
2. Cliquez sur "Créer" pour saisir votre contenu
3. L'IA améliore automatiquement votre texte
4. Choisissez les plateformes de partage
5. Publiez immédiatement ou programmez

### API pour WordPress

```php
// Exemple d'intégration WordPress
$response = wp_remote_post('https://your-app-url.com/api/create-post', [
    'headers' => [
        'Content-Type' => 'application/json',
        'x-api-key' => 'your_api_key'
    ],
    'body' => json_encode([
        'content' => 'Votre contenu ici',
        'options' => [
            'style' => 'professionnel',
            'length' => 'moyen'
        ]
    ])
]);
```

## Développement

```bash
# Installation
npm install

# Développement
npm run dev

# Production
npm start

# Tests
npm test
```

## Architecture

- **Frontend** : EJS templates avec Bootstrap 5
- **Backend** : Node.js + Express
- **IA** : OpenAI GPT-4
- **Stockage** : Session-based (extensible vers base de données)
- **APIs** : RESTful pour intégrations tierces

## Sécurité

- Validation des entrées
- Protection CSRF
- Sanitisation du contenu
- Modération automatique
- Chiffrement des tokens API

## Licence

MIT