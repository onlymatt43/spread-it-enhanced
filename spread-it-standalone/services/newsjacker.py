#!/usr/bin/env python3
import sys
import json
import os
from openai import OpenAI

def newsjack_post(user_text, current_trends, top_influencer, platform='facebook'):
    """
    Apply newsjacking strategy to user's post with injected trends & influencer.
    Returns optimized post for the platform.
    """
    try:
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        system_prompt = f"""Tu es un expert en Social Media qui maîtrise l'art du 'Newsjacking'.

RÈGLES DU JEU :
1. TEXTE PRINCIPAL : Corrige seulement la grammaire du texte de l'utilisateur. Ne change pas le ton, ne le rends pas 'corporate'. Garde le côté humain et imparfait.
2. LE CLIN D'OEIL (VIBE) : À la fin, ajoute un paragraphe séparé (avec un emoji) qui fait un lien absurde ou drôle entre le texte et la TENDANCE ACTUELLE fournie.
3. GOAL ACCOUNT : Trouve une excuse pour mentionner le COMPTE INFLUENT fourni (ex: "J'essaie de channeler l'énergie de @...").
4. HASHTAGS : Mélange des tags sur le sujet du post ET des tags sur la tendance (même si c'est hors sujet, c'est pour l'algo).
5. PLATEFORME : Adapte la longueur et le style pour {platform} (max 280 chars pour Twitter, 2200 pour Instagram, etc).

Format de réponse JSON strict :
{{
  "corrected_text": "Texte corrigé...",
  "vibes_section": "Lien vers la tendance avec emoji...",
  "mention": "@influencer_handle",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "final_post": "POST COMPLET PRÊT À PUBLIER"
}}"""

        user_prompt = f"""TEXTE UTILISATEUR : {user_text}
TENDANCE ACTUELLE : {current_trends}
COMPTE INFLUENT : {top_influencer}
PLATEFORME CIBLE : {platform}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.8,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Missing arguments: user_text, trends, influencer, platform"}))
        sys.exit(1)
    
    user_text = sys.argv[1]
    trends = sys.argv[2]
    influencer = sys.argv[3]
    platform = sys.argv[4] if len(sys.argv) > 4 else 'facebook'
    
    result = newsjack_post(user_text, trends, influencer, platform)
    print(json.dumps(result))
