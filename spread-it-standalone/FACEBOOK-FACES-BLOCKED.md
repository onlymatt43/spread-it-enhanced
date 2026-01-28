# 📋 POLITIQUE DE RESTRICTIONS PAR PLATEFORME

## 🎯 Objectif
Se rapprocher du fonctionnement des plateformes (Facebook, Instagram, TikTok) en **bloquant uniquement** selon leurs catégories de restrictions (adult, violence, racy) sans logique spécifique « visage autorisé/interdit ».

## 🔍 Catégories de Restriction (SafeSearch)
- **adult**: Nudité claire, contenu sexuel
- **violence**: Violence explicite, sang, armes en action
- **racy**: Suggestif (peau, poses), plus ambigu

## ⚙️ Seuils de Blocage (Configurables via `.env`)
| Catégorie | Blocage par défaut |
|----------|--------------------|
| adult | LIKELY / VERY_LIKELY |
| violence | LIKELY / VERY_LIKELY |
| racy | VERY_LIKELY seulement |

> Note: Aucune logique spéciale « visage » n’est utilisée. Les décisions reposent **uniquement** sur ces catégories.

## 🧩 Implémentation
Les seuils sont appliqués globalement et peuvent être **spécifiés par plateforme**.

### Exemples `.env`
```
# Global defaults
ADULT_BLOCK_LEVELS=LIKELY,VERY_LIKELY
VIOLENCE_BLOCK_LEVELS=LIKELY,VERY_LIKELY
RACY_BLOCK_LEVELS=VERY_LIKELY
TEXT_BLOCK_THRESHOLD=2

# Facebook policy overrides
FACEBOOK_ADULT_BLOCK_LEVELS=LIKELY,VERY_LIKELY
FACEBOOK_VIOLENCE_BLOCK_LEVELS=LIKELY,VERY_LIKELY
FACEBOOK_RACY_BLOCK_LEVELS=VERY_LIKELY

# Instagram policy overrides
INSTAGRAM_ADULT_BLOCK_LEVELS=LIKELY,VERY_LIKELY
INSTAGRAM_VIOLENCE_BLOCK_LEVELS=LIKELY,VERY_LIKELY
INSTAGRAM_RACY_BLOCK_LEVELS=VERY_LIKELY
```

## ✅ Comportement Résumé
- Bloque uniquement les contenus qui dépassent les seuils ci-dessus.
- Ne fait **aucune** distinction spécifique aux visages.
- Aligne la modération sur des catégories proches des plateformes.