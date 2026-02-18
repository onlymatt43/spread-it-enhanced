import sys
import json
import re

# Influencer database (Python version)
INFLUENCER_DB = {
    "video_editing": [
        {"handle": "@waqasqazi", "name": "Waqas Qazi", "style": "Color Grading master on DaVinci Resolve"},
        {"handle": "@petermckinnon", "name": "Peter McKinnon", "style": "B-Roll & cinematic YouTube king"},
        {"handle": "@samkolder", "name": "Sam Kolder", "style": "Crazy transitions, hyper-visual, travel film"},
    ],
    "photography": [
        {"handle": "@brandonwoelfel", "name": "Brandon Woelfel", "style": "Neon lights, bokeh, creative night photography"},
        {"handle": "@7th.era", "name": "Liam Won", "style": "Cyberpunk, night, Tokyo street vibes"},
    ],
    "tech_ai": [
        {"handle": "@mkbhd", "name": "Marques Brownlee", "style": "Ultimate tech production quality (8K)"},
        {"handle": "@mrwhosetheboss", "name": "Arun Maini", "style": "Futuristic gadgets & clean visuals"},
        {"handle": "@levelsio", "name": "Pieter Levels", "style": "AI solopreneur par excellence"},
    ],
    "lifestyle_hustle": [
        {"handle": "@garyvee", "name": "Gary Vaynerchuk", "style": "Raw motivation, 'stop complaining & work'"},
        {"handle": "@alexhormozi", "name": "Alex Hormozi", "style": "Business scaling, gym aesthetic"},
    ]
}

def select_influencer(text):
    """Select best influencer based on text content"""
    if not text or not isinstance(text, str):
        return INFLUENCER_DB["tech_ai"][0]
    
    t = text.lower()
    category = "tech_ai"  # default
    
    # Keyword mapping
    video_keywords = ['davinci', 'montage', 'cut', 'video', 'premiere', 'reel', 'edit']
    photo_keywords = ['photo', 'lumiere', 'canon', 'sony', 'lens', 'bokeh', 'light']
    hustle_keywords = ['business', 'argent', 'mindset', 'travail', 'money', 'startup', 'hustle']
    
    if any(k in t for k in video_keywords):
        category = "video_editing"
    elif any(k in t for k in photo_keywords):
        category = "photography"
    elif any(k in t for k in hustle_keywords):
        category = "lifestyle_hustle"
    
    profiles = INFLUENCER_DB.get(category, INFLUENCER_DB["tech_ai"])
    selected = profiles[hash(text) % len(profiles)]  # deterministic but pseudo-random
    
    return selected

if __name__ == '__main__':
    user_text = sys.argv[1] if len(sys.argv) > 1 else ""
    result = select_influencer(user_text)
    print(json.dumps({"success": True, "account": result}))
