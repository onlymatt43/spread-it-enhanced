# Spread It Integration - Plugin WordPress

Plugin WordPress pour intégrer le service Spread It standalone dans votre site WordPress.

## Installation

1. Téléchargez le dossier `spread-it-integration` dans `wp-content/plugins/`
2. Activez le plugin dans l'administration WordPress
3. Configurez l'URL de l'API et la clé API dans le menu "Spread It"

## Configuration

### Configuration de l'API

1. Allez dans **Réglages > Spread It**
2. Entrez l'URL de votre instance Spread It (ex: `https://your-app.vercel.app`)
3. Entrez votre clé API

### Variables d'environnement pour l'app standalone

Assurez-vous que votre app Spread It a ces variables configurées :

```env
API_KEY=votre_cle_api_wordpress
# Autres variables pour OpenAI, réseaux sociaux, etc.
```

## Utilisation

### Depuis l'interface admin

1. Allez dans **Spread It > Créer du Contenu**
2. Saisissez votre contenu brut
3. Choisissez le style et la longueur
4. Cliquez sur "Créer avec IA"
5. Publiez sur WordPress ou partagez sur les réseaux

### Depuis l'éditeur de post

1. Ouvrez un post existant ou créez-en un nouveau
2. Dans la colonne latérale, utilisez la boîte "Spread It"
3. Cliquez sur "Améliorer avec IA" pour optimiser le contenu
4. Cliquez sur "Appliquer" pour remplacer le contenu actuel

## Fonctionnalités

- **Amélioration IA** : Corrige et améliore le contenu avec GPT-4
- **Modération automatique** : Vérifie le contenu inapproprié
- **Timing optimal** : Suggère les meilleurs horaires de publication
- **Partage multi-plateforme** : Facebook, Twitter, LinkedIn, Instagram
- **Intégration WordPress** : Crée des posts directement dans WP

## API Endpoints utilisés

- `POST /api/create-post` : Création et amélioration de contenu

## Sécurité

- Validation des nonces WordPress
- Sanitisation des données
- Vérification des permissions utilisateur
- Clé API pour l'authentification

## Développement

Pour étendre le plugin :

1. Les appels API sont dans `ajax_create_content()`
2. Les scripts JS sont dans `js/spread-it.js`
3. Les styles peuvent être ajoutés dans une feuille CSS séparée

## Dépannage

### Erreur de connexion API
- Vérifiez que l'URL de l'API est correcte
- Assurez-vous que la clé API est valide
- Vérifiez que l'app Spread It est en ligne

### Contenu non amélioré
- Vérifiez que OpenAI API key est configurée dans l'app
- Assurez-vous que le contenu n'est pas vide
- Vérifiez les logs de l'app Spread It

## Licence

MIT