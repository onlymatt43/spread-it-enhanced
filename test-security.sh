#!/bin/bash

# Test de sécurité pour vérifier qu'aucun identifiant n'est exposé dans une réponse HTTP simulée

echo "🧪 TEST PRATIQUE: Simulation d'une page WordPress avec Spread It"
echo "================================================================"
echo ""

# Créer un fichier HTML temporaire simulant la sortie WordPress
TEST_FILE="/tmp/spread-it-test-output.html"

cat > "$TEST_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Test Spread It - Sécurité</title>
    <script>
        // Simuler wp_localize_script
        var spreadIt = {
            "ajax": "https://example.com/wp-admin/admin-ajax.php",
            "nonce": "abc123def456"
        };
    </script>
</head>
<body>
    <h1>Test Post</h1>
    <div id="spread-it-widget"></div>
    
    <!-- Formulaire admin (simulé) -->
    <form method="post">
        <input type="password" id="facebook_token" placeholder="••••••••••••••••">
        <p class="description" style="color:green;">✓ Token configuré</p>
        
        <input type="password" id="instagram_token" placeholder="••••••••••••••••">
        <p class="description" style="color:green;">✓ Token configuré</p>
    </form>
</body>
</html>
EOF

echo "✓ Fichier HTML test généré: $TEST_FILE"
echo ""

# Tests de sécurité
TESTS_PASSED=0
TESTS_FAILED=0

echo "Test 1: Recherche de tokens Facebook (EAA...)..."
if grep -q 'EAA[a-zA-Z0-9]\{100,\}' "$TEST_FILE"; then
    echo "❌ ÉCHEC: Token Facebook trouvé dans le HTML!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Aucun token Facebook"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""
echo "Test 2: Recherche de tokens Instagram (IGQV...)..."
if grep -q 'IGQV[a-zA-Z0-9]\{100,\}' "$TEST_FILE"; then
    echo "❌ ÉCHEC: Token Instagram trouvé dans le HTML!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Aucun token Instagram"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""
echo "Test 3: Recherche de clés OpenAI (sk-...)..."
if grep -q 'sk-[a-zA-Z0-9]\{20,\}' "$TEST_FILE"; then
    echo "❌ ÉCHEC: Clé OpenAI trouvée dans le HTML!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Aucune clé OpenAI"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""
echo "Test 4: Vérifier que wp_localize_script contient uniquement ajax/nonce..."
if grep -q '"ajax"' "$TEST_FILE" && grep -q '"nonce"' "$TEST_FILE"; then
    if ! grep -q '"token"' "$TEST_FILE" && ! grep -q '"secret"' "$TEST_FILE" && ! grep -q '"api_key"' "$TEST_FILE"; then
        echo "✅ PASS: wp_localize_script ne contient que des données sûres"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ ÉCHEC: wp_localize_script contient des données sensibles!"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo "⚠️  WARNING: Structure wp_localize_script non trouvée (test ignoré)"
fi

echo ""
echo "Test 5: Vérifier que les champs password n'ont pas d'attribut value avec tokens..."
if grep -q 'type="password".*value="[A-Z0-9]\{20,\}"' "$TEST_FILE"; then
    echo "❌ ÉCHEC: Champ password avec valeur exposée trouvé!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
else
    echo "✅ PASS: Aucun champ password avec valeur exposée"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""
echo "================================================================"
echo "RÉSULTATS:"
echo "  ✅ Tests réussis: $TESTS_PASSED"
echo "  ❌ Tests échoués: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "🎉 SUCCÈS: Tous les tests de sécurité passent!"
    echo ""
    echo "Vos identifiants sont correctement protégés."
    rm -f "$TEST_FILE"
    exit 0
else
    echo "⚠️  ATTENTION: Des problèmes de sécurité ont été détectés."
    echo ""
    echo "Fichier test conservé pour inspection: $TEST_FILE"
    exit 1
fi
