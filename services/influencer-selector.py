import json
import sys
import random

# BASE DE DONNÉES DES "GOAL ACCOUNTS" (Réelle & Vérifiée)
INFLUENCER_DB = {
    "video_editing": [
        {"handle": "@waqasqazi", "name": "Waqas Qazi", "style": "Le maître absolu du Color Grading sur DaVinci Resolve."},
        {"handle": "@petermckinnon", "name": "Peter McKinnon", "style": "Le roi du B-Roll et de la cinématique YouTube."},
        {"handle": "@samkolder", "name": "Sam Kolder", "style": "Transitions folles, hyper-visuel, travel film."},
        {"handle": "@benntk", "name": "Benn TK", "style": "Effets visuels réalistes et montage fluide."}
    ],
    "photography": [
        {"handle": "@brandonwoelfel", "name": "Brandon Woelfel", "style": "Lumières néons, bokeh, photo de nuit créative."},
        {"handle": "@7th.era", "name": "Liam Won", "style": "Cyberpunk, nuit, street photography tokyo vibes."},
        {"handle": "@northborders", "name": "Mike Gray", "style": "Street photography brute et humoristique."}
    ],
    "tech_ai": [
        {"handle": "@mkbhd", "name": "Marques Brownlee", "style": "La qualité de production tech ultime (8K, robot arms)."},
        {"handle": "@mrwhosetheboss", "name": "Arun Maini", "style": "Gadgets futuristes et visuels très clean."},
        {"handle": "@levelsio", "name": "Pieter Levels", "style": "Le 'solopreneur' IA par excellence, nomade digital."}
    ],
    "lifestyle_hustle": [
        {"handle": "@garyvee", "name": "Gary Vaynerchuk", "style": "Motivation brute, 'arrete de te plaindre et bosse'."},
        {"handle": "@alexhormozi", "name": "Alex Hormozi", "style": "Business scaling, gym aesthetic, casquette à l'envers."}
    ]
}

def detect_category(text):
    """Détecte la catégorie d'influenceur basée sur le texte"""
    if not text or not isinstance(text, str):
        return "tech_ai"
    
    text_lower = text.lower()
    
    # Mots-clés pour video_editing
    if any(word in text_lower for word in ['davinci', 'montage', 'cut', 'video', 'premiere', 'édition', 'transition']):
        return "video_editing"
    
    # Mots-clés pour photography
    elif any(word in text_lower for word in ['photo', 'lumiere', 'canon', 'sony', 'nikon', 'photographie']):
        return "photography"
    
    # Mots-clés pour lifestyle_hustle
    elif any(word in text_lower for word in ['business', 'argent', 'mindset', 'travail', 'motivation', 'scaling']):
        return "lifestyle_hustle"
    
    # Default: tech_ai
    return "tech_ai"

def get_goal_account(category=None, text=None):
    """
    Retourne un compte influenceur aléatoire.
    - Si category est fournie, l'utilise directement
    - Si text est fourni, détecte la catégorie
    - Sinon, retourne un compte tech par défaut
    """
    if text and not category:
        category = detect_category(text)
    
    if not category:
        category = "tech_ai"
    
    profiles = INFLUENCER_DB.get(category, INFLUENCER_DB["tech_ai"])
    selected = random.choice(profiles)
    
    return {
        "category": category,
        "selected": selected
    }

if __name__ == '__main__':
    try:
        # Lire les arguments
        text = sys.argv[1] if len(sys.argv) > 1 else None
        category = sys.argv[2] if len(sys.argv) > 2 else None
        
        # Récupérer le compte
        result = get_goal_account(category=category, text=text)
        
        # Retourner en JSON
        print(json.dumps({
            "success": True,
            "category": result["category"],
            "account": result["selected"]
        }))
    
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "account": INFLUENCER_DB["tech_ai"][0]  # Fallback
        }))
