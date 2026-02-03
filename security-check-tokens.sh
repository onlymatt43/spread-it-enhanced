#!/bin/bash

# Script de vérification de sécurité pour détecter l'exposition de tokens/identifiants

echo "🔒 SECURITY CHECK: Détection d'exposition de tokens/identifiants"
echo "================================================================"
echo ""

ISSUES_FOUND=0

# 1. Vérifier les fichiers .env dans le repo git
echo "✓ Vérification des fichiers .env dans Git..."
ENV_FILES=$(git ls-files | grep -E '\.(env|env\.local|env\.production)$' 2>/dev/null)
if [ -n "$ENV_FILES" ]; then
    echo "❌ ERREUR: Fichiers .env trackés dans Git:"
    echo "$ENV_FILES"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ Aucun fichier .env dans Git"
fi
echo ""

# 2. Vérifier les champs password avec value= dans les fichiers PHP
echo "✓ Vérification des champs password avec values exposées..."
PASSWORD_VALUES=$(grep -r 'type="password".*value="<?php echo' **/*.php 2>/dev/null | grep -v '••••••••••••••••')
if [ -n "$PASSWORD_VALUES" ]; then
    echo "❌ ERREUR: Champs password exposant des valeurs:"
    echo "$PASSWORD_VALUES"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ Aucun champ password exposant des valeurs"
fi
echo ""

# 3. Vérifier wp_localize_script avec tokens
echo "✓ Vérification de wp_localize_script..."
LOCALIZE_TOKENS=$(grep -r "wp_localize_script.*token\|wp_localize_script.*secret\|wp_localize_script.*key" **/*.php 2>/dev/null | grep -v "nonce")
if [ -n "$LOCALIZE_TOKENS" ]; then
    echo "⚠️  WARNING: wp_localize_script potentiellement avec tokens (vérification manuelle requise):"
    echo "$LOCALIZE_TOKENS"
fi
echo ""

# 4. Vérifier les fichiers JavaScript clients pour process.env
echo "✓ Vérification de process.env dans les JS clients..."
CLIENT_JS_ENV=$(grep -r "process\.env\." spread-it-standalone/public/ spread-it-standalone/views/ 2>/dev/null)
if [ -n "$CLIENT_JS_ENV" ]; then
    echo "❌ ERREUR: process.env détecté dans le code client:"
    echo "$CLIENT_JS_ENV"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ Aucun process.env dans le code client"
fi
echo ""

# 5. Rechercher des tokens en dur dans le code
echo "✓ Recherche de tokens en dur (hardcoded)..."
HARDCODED_TOKENS=$(grep -rE '(EAA[a-zA-Z0-9]{100,}|IGQV[a-zA-Z0-9]{100,}|sk-[a-zA-Z0-9]{20,})' **/*.js **/*.php 2>/dev/null | grep -v node_modules | grep -v '.env')
if [ -n "$HARDCODED_TOKENS" ]; then
    echo "❌ ERREUR: Tokens potentiellement en dur détectés:"
    echo "$HARDCODED_TOKENS"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ Aucun token en dur détecté"
fi
echo ""

# Résumé
echo "================================================================"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ AUCUN PROBLÈME DE SÉCURITÉ DÉTECTÉ"
    echo ""
    echo "Les identifiants sont correctement protégés côté serveur."
    exit 0
else
    echo "❌ $ISSUES_FOUND PROBLÈME(S) DE SÉCURITÉ DÉTECTÉ(S)"
    echo ""
    echo "Veuillez corriger les problèmes ci-dessus avant de déployer."
    exit 1
fi
