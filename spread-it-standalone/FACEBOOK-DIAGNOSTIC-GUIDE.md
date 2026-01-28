# 🔍 DIAGNOSTIC FACEBOOK - PREMIER POST BLOQUÉ

## 🚨 Problème Identifié
Facebook a envoyé une alerte pour votre **PREMIER post**, ce qui indique un problème de **contenu** plutôt que de fréquence.

## 🔍 Causes Possibles

### 1. **Image Problématique**
- Contenu détecté comme "racy", "adult", ou "violent"
- Même si notre système dit "safe", Facebook est plus strict
- Logos, textes, ou éléments visuels peuvent déclencher les filtres

### 2. **Contenu du Texte**
- Mots-clés suspects dans le caption
- URLs raccourcies ou suspectes
- Contenu dupliqué ou copié

### 3. **Violation des Règles**
- Contenu promotionnel excessif
- Spam-like behavior
- Non-respect des community guidelines

## 🛠️ Solutions Implémentées

### **Modération Plus Stricte**
- ✅ Seuil de sécurité réduit de 2.0 à 1.0
- ✅ Double vérification pour Facebook/Instagram
- ✅ Logs détaillés des détections Google Vision

### **Vérifications Supplémentaires**
- ✅ Scan des URLs suspectes (bit.ly, tinyurl, etc.)
- ✅ Détection des mots-clés à risque
- ✅ Alertes avant publication

### **Logs Détaillés**
Le système log maintenant :
```
🔍 Analyzing image content with Google Vision...
📊 Vision API Results: {
  adult: 'POSSIBLE',
  violence: 'VERY_UNLIKELY',
  racy: 'LIKELY'
}
⚠️ HIGH RISK CONTENT DETECTED
🚨 FACEBOOK RISK DETECTED
```

## 🔧 Diagnostic Pas à Pas

### **Étape 1: Vérifier l'Image**
1. Testez l'image sur [Google Vision API Demo](https://cloud.google.com/vision/docs/drag-and-drop)
2. Vérifiez les scores "adult", "violence", "racy"
3. Si > 0.5, l'image sera probablement bloquée

### **Étape 2: Analyser le Texte**
- Évitez les mots : spam, free, buy, sale, discount
- Pas d'URLs raccourcies
- Pas de contenu dupliqué

### **Étape 3: Tester avec une Image Safe**
- Utilisez une image simple, non controversée
- Testez avec du texte minimal
- Publiez manuellement d'abord pour vérifier

## 📊 Seuils de Sécurité

| Niveau | Score | Action |
|--------|-------|--------|
| Safe | < 1.0 | Publication autorisée |
| Risk | 1.0-2.0 | Censuré automatiquement |
| Blocked | > 2.0 | Refusé |

## 🚀 Test de Diagnostic

Pour diagnostiquer votre image problématique :

1. **Upload une image** dans l'interface
2. **Regardez les logs** du serveur (console/terminal)
3. **Vérifiez les scores** Google Vision
4. **Testez avec une image différente**

## 💡 Recommandations

- **Images** : Utilisez des photos originales, non controversées
- **Texte** : Gardez-le naturel, évitez le "salesy" language
- **URLs** : Utilisez des liens directs, pas d'URL shorteners
- **Test** : Toujours tester manuellement d'abord

Le système vous préviendra maintenant avant de publier du contenu risqué ! 🛡️</content>
<parameter name="filePath">/Users/mathieucourchesne/spread-it-wp copy/spread-it-standalone/FACEBOOK-DIAGNOSTIC-GUIDE.md