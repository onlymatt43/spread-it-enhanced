const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeArticle(url) {
    try {
        // Headers pour éviter d'être bloqué par certains sites (User-Agent basique)
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10s timeout
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Nettoyage basique (scripts, styles, nav)
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('header').remove();
        $('footer').remove();
        $('.ads').remove();
        $('.advertisement').remove();

        // Extraction Titre
        const title = $('h1').first().text().trim() || $('title').text().trim();

        // Extraction Contenu (Paragraphs)
        // On cherche les paragraphes qui ont du texte substantiel
        let text = '';
        $('p').each((i, el) => {
            const para = $(el).text().trim();
            if (para.length > 50) { // Filtrer les petits bouts de texte (menus, dates...)
                text += para + '\n\n';
            }
        });

        // Fallback si pas de <p> (ex: certains sites de news dynamiques)
        if (text.length < 100) {
            text = $('article').text().trim() || $('body').text().trim().substring(0, 2000);
        }

        return {
            title,
            content: text.substring(0, 5000), // Limite pour GPT
            url
        };

    } catch (e) {
        console.error("Scraper Error:", e.message);
        throw new Error(`Impossible de lire l'article : ${e.message}`);
    }
}

module.exports = { scrapeArticle };
