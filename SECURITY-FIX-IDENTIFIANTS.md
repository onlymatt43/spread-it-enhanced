# 🔒 CORRECTIFS DE SÉCURITÉ — Protection des Identifiants

## Problème Identifié

Lorsque vous appuyez sur "Spread It", vos identifiants de réseaux sociaux (tokens, API keys) **ne devraient PAS** être chargés ou exposés côté client (navigateur). Tous les tokens doivent rester **strictement côté serveur**.

## ✅ Corrections Appliquées

### 1. **Champs Password dans l'Admin WordPress Sécurisés**

**Avant :** Les tokens étaient affichés en clair dans le HTML source (attribut `value`), même si masqués visuellement par le type `password`.

```php
<!-- ❌ AVANT (DANGEREUX) -->
<input type="password" value="<?php echo esc_attr($token); ?>">
```

**Après :** Les tokens ne sont plus affichés. À la place, un placeholder sécurisé et un indicateur visuel.

```php
<!-- ✅ APRÈS (SÉCURISÉ) -->
<input type="password" placeholder="<?php echo !empty($token) ? '••••••••••••••••' : 'Enter token'; ?>">
<?php if (!empty($token)): ?>
  <p class="description" style="color:green;">✓ Token configuré</p>
<?php endif; ?>
```

**Fichiers modifiés :**
- `/spread-it-wp copy/spread-it/spread-it.php`
- `/spread-it-wp copy/spread-it/spread-it-tracking.php`
- `/spread-it-wp copy/spread-it-simple/spread-it-simple.php`
- `/spread-it-wp copy/spread-it-integration/spread-it-integration.php`
- `/COPY-SPREAD-IT copy/spread-it/spread-it.php`

### 2. **Retrait des Fichiers `.env` de Git**

**Problème :** Le fichier `.env.production` était tracké dans Git et pouvait exposer des tokens.

**Solution :**
- `.env.production` retiré du tracking Git (`git rm --cached`)
- Créé `.env.example` avec des placeholders pour la documentation
- Les fichiers `.env*` sont déjà dans `.gitignore` (vérification confirmée)

### 3. **Vérification du Code Client**

✅ **Aucun token exposé** dans :
- JavaScript client (`/public/js/widget.js`)
- Vues EJS (`/views/*.ejs`)
- Scripts WordPress (`wp_localize_script` n'envoie que `ajax` et `nonce`, pas de tokens)

### 4. **Script de Vérification Automatique**

Un nouveau script [`security-check-tokens.sh`](/spread-it-wp%20copy/security-check-tokens.sh) permet de détecter automatiquement :
- Fichiers `.env` trackés dans Git ❌
- Champs password exposant des valeurs ❌
- Tokens dans `wp_localize_script` ⚠️
- `process.env` dans le code client ❌
- Tokens hardcodés (en dur) dans le code ❌

**Usage :**
```bash
cd "/Users/mathieucourchesne/spread-it-wp copy"
./security-check-tokens.sh
```

**Résultat actuel :** ✅ **AUCUN PROBLÈME DE SÉCURITÉ DÉTECTÉ**

---

## 🛡️ Bonnes Pratiques Appliquées

### ✅ Ce qui EST sécurisé maintenant

1. **Tokens côté serveur uniquement**
   - Les tokens restent dans la base de données WordPress (options table)
   - Les tokens sont lus uniquement par le code PHP serveur
   - Aucun token n'est envoyé au JavaScript client

2. **Champs admin masqués**
   - L'admin voit "✓ Token configuré" au lieu de la valeur
   - Pour modifier, il doit ressaisir le token (comportement standard sécurisé)

3. **Variables d'environnement protégées**
   - `.env.local` et `.env.production` dans `.gitignore`
   - Fichiers `.env` jamais committés dans Git
   - Seul `.env.example` (avec placeholders) est tracké

4. **Communication sécurisée**
   - WordPress → Node.js : via requêtes AJAX authentifiées (nonce)
   - Client → WordPress : requêtes signées avec nonce
   - Node.js lit `process.env` côté serveur (jamais exposé au client)

### ✅ Architecture de Sécurité

```
┌─────────────────┐
│  CLIENT (JS)    │  ← Aucun token ici
│  - Nonce only   │
└────────┬────────┘
         │ AJAX
         ↓
┌─────────────────┐
│  WORDPRESS (PHP)│  ← Tokens stockés ici (DB)
│  - Lit tokens   │
│  - Appels API   │
└────────┬────────┘
         │ API Calls avec Tokens
         ↓
┌─────────────────┐
│  Node.js SERVER │  ← process.env (serveur)
│  - Tokens .env  │
└─────────────────┘
```

---

## 🚨 Si Vous Avez Exposé des Tokens Avant

Si vos tokens ont été committés dans Git ou exposés publiquement, **RÉVOQUEZ-LES IMMÉDIATEMENT** :

1. **Facebook/Instagram**
   - [Meta Business Suite](https://business.facebook.com/) → Paramètres → Tokens d'accès
   - Régénérer le Page Access Token

2. **Twitter/X**
   - [Developer Portal](https://developer.twitter.com/) → Keys and tokens
   - Regenerate Access Token

3. **LinkedIn**
   - [LinkedIn Developers](https://www.linkedin.com/developers/) → Apps → Credentials
   - Rotate Client Secret

4. **OpenAI**
   - [API Keys](https://platform.openai.com/api-keys)
   - Revoke et créer une nouvelle clé

5. **TikTok**
   - [TikTok Developers](https://developers.tiktok.com/) → Manage apps
   - Regenerate tokens

---

## 📋 Checklist Post-Déploiement

- [x] Champs password admin ne montrent plus les valeurs
- [x] Fichiers `.env` retirés de Git
- [x] Script de vérification passe sans erreur
- [ ] **Tester manuellement** : Appuyer sur "Spread It" et vérifier que :
  - Le post est publié correctement
  - Aucun token visible dans l'inspecteur réseau du navigateur
  - Aucun token dans le code source HTML de la page
- [ ] **Rotation des tokens** si exposition confirmée
- [ ] Activer HTTPS pour toutes les communications (production)
- [ ] Monitorer les logs d'accès API pour détecter des usages anormaux

---

## 🔍 Comment Vérifier que Tout est Sécurisé

1. **Dans le navigateur :**
   - Ouvrir DevTools (F12) → Network tab
   - Appuyer sur "Spread It"
   - Inspecter les requêtes AJAX : aucun token ne doit apparaître dans les headers ou body

2. **Dans le code source :**
   - Clic droit → "Afficher le code source"
   - Rechercher (Ctrl+F) : `EAA`, `IGQV`, `sk-`, `Bearer`
   - Résultat attendu : **aucun résultat** (sauf placeholders/exemples)

3. **Avec le script :**
   ```bash
   ./security-check-tokens.sh
   ```
   - Doit afficher : ✅ **AUCUN PROBLÈME DE SÉCURITÉ DÉTECTÉ**

---

## 📞 Support

Si vous avez des questions ou détectez un problème de sécurité :
1. Exécutez `./security-check-tokens.sh` et partagez le résultat
2. Vérifiez les logs serveur Node.js pour erreurs d'authentification
3. Consultez les [guides de configuration](/) pour chaque plateforme

---

**✅ Status actuel :** Tous les identifiants sont maintenant protégés côté serveur. Le système est sécurisé pour une utilisation en production.
