#!/usr/bin/env python3
import sys
import json
import logging
import random

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

INFLUENCER_DB = {
    "video_editing": [
        {"handle": "@waqasqazi", "name": "Waqas Qazi", "style": "Le maître absolu du Color Grading sur DaVinci Resolve."},
        {"handle": "@petermckinnon", "name": "Peter McKinnon", "style": "Le roi du B-Roll et de la cinématique YouTube."},
        {"handle": "@samkolder", "name": "Sam Kolder", "style": "Transitions folles, hyper-visuel, travel film."}
    ],
    "photography": [
        {"handle": "@brandonwoelfel", "name": "Brandon Woelfel", "style": "Lumières néons, bokeh, photo de nuit créative."},
        {"handle": "@7th.era", "name": "Liam Won", "style": "Cyberpunk, nuit, street photography tokyo vibes."},
        {"handle": "@northborders", "name": "Mike Gray", "style": "Street photography brute et humoristique."}
    ],
    "tech_ai": [
        {"handle": "@mkbhd", "name": "Marques Brownlee", "style": "La qualité de production tech ultime."},
        {"handle": "@levelsio", "name": "Pieter Levels", "style": "Le 'solopreneur' IA par excellence."}
    ],
    "lifestyle_hustle": [
        {"handle": "@garyvee", "name": "Gary Vaynerchuk", "style": "Motivation brute."}
    ]
}

def select_influencer(user_text):
    """Sélectionne un influencer basé sur le texte utilisateur"""
    if not user_text or not isinstance(user_text, str):
        category = "tech_ai"
    else:
        t = user_text.lower()
        category = "tech_ai"
        
        if any(kw in t for kw in ['davinci', 'montage', 'cut', 'video', 'premiere']):
            category = "video_editing"
        elif any(kw in t for kw in ['photo', 'lumiere', 'canon', 'sony']):
            category = "photography"
        elif any(kw in t for kw in ['business', 'argent', 'mindset', 'travail']):
            category = "lifestyle_hustle"
    
    profiles = INFLUENCER_DB.get(category, INFLUENCER_DB["tech_ai"])
    selected = random.choice(profiles)
    
    return {
        "success": True,
        "account": selected,
        "category": category
    }

def main():
    try:
        user_text = sys.argv[1] if len(sys.argv) > 1 else ""
        result = select_influencer(user_text)
        print(json.dumps(result))
        return 0
    except Exception as e:
        logging.exception("Error in influencer_selector")
        print(json.dumps({"error": str(e), "success": False}))
        return 2

if __name__ == "__main__":
    sys.exit(main())
