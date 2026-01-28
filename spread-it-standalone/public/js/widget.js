(function() {
    function initSpreadIt() {
        console.log("🚀 Spread It Widget - Click Mode Active...");
        
        // Configuration
        const BASE_URL = (window.spreadItConfig && window.spreadItConfig.baseUrl) || 
                         (document.currentScript ? document.currentScript.src.split('/js/widget.js')[0] : '');
                         
        if (!BASE_URL) {
            console.error("Spread It: Could not determine Base URL");
            return;
        }

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            .spread-it-clickable {
                cursor: pointer !important;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .spread-it-clickable:hover {
                transform: scale(1.02);
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .spread-it-iframe-overlay {
                position: absolute;
                background: rgba(0,0,0,0);
                cursor: pointer;
                z-index: 1000;
            }
            .spread-it-iframe-overlay:hover {
                background: rgba(102, 126, 234, 0.1); /* Subtle hint */
                border: 3px solid #667eea;
            }
        `;
        document.head.appendChild(style);

        // Debug Indicator
        const debug = document.createElement('div');
        debug.className = 'spread-it-debug';
        debug.style.cssText = "position: fixed; bottom: 10px; right: 10px; background: #333; color: #fff; padding: 10px; border-radius: 5px; z-index: 999999; font-family: sans-serif; font-size: 12px; pointer-events: none; opacity: 0.8;";
        debug.innerText = 'Spread It: Click Mode';
        document.body.appendChild(debug);
        setTimeout(() => debug.remove(), 5000); 

        // Helper: Init Click Logic on Media
        function makeMediaClickable() {
            // IMAGES & VIDEOS
            const visualMedia = document.querySelectorAll('img, video');
            visualMedia.forEach(el => {
                // Ignore small icons/logos
                if (el.offsetWidth < 150 || el.offsetHeight < 150) return;
                
                if (!el.classList.contains('spread-it-clickable')) {
                    el.classList.add('spread-it-clickable');
                    el.addEventListener('click', (e) => handleMediaClick(e, el));
                }
            });

            // IFRAMES (Youtube/Vimeo Players Only)
            // We use a safe heuristic to only overlay obvious players, NOT general apps (like Vercel galleries) if possible.
            // But if the Vercel gallery is the target, we CAN overlay it if it matches criteria.
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(el => {
                // Skip if already handled
                if (el.parentElement.querySelector('.spread-it-iframe-overlay')) return;
                
                const w = el.offsetWidth;
                const h = el.offsetHeight;
                if (w < 200 || h < 150) return;

                // Check Src
                const src = (el.src || '').toLowerCase();
                const isPlayer = src.includes('youtube') || src.includes('vimeo') || src.includes('player') || 
                                 src.includes('embed') || src.includes('twitch') || src.includes('dailymotion');

                // If it looks like a player, overlay it
                if (isPlayer) {
                    const overlay = document.createElement('div');
                    overlay.className = 'spread-it-iframe-overlay';
                    
                    // Position overlay over iframe
                    // We need relative positioning context usually, simplest is to use rects but those change on scroll.
                    // Best approach: wrap the iframe? No, breaks layout.
                    // Insert sibling and position absolutely relative to parent (assuming parent is relative).
                    // Or set dimensions matches.
                    
                    // Simple approach: Set exact size and margin matching
                    const rect = el.getBoundingClientRect();
                    // This is hard to sync on scroll.
                    // Better: use a wrapper if possible? 
                    // Let's assume the iframe is in a container.
                    
                    // Actually, easiest way is to bind the click on the Iframe's PARENT if it's tight.
                    // But parents are often loose usually.
                    
                    // Let's try wrapping (safe if display block)
                    const wrapper = document.createElement('div');
                    wrapper.style.position = 'relative';
                    wrapper.style.display = 'inline-block';
                    // Move iframe into wrapper
                    el.parentNode.insertBefore(wrapper, el);
                    wrapper.appendChild(el);
                    
                    // Add overlay to wrapper
                    wrapper.appendChild(overlay);
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    
                    overlay.addEventListener('click', (e) => handleMediaClick(e, el));
                }
            });
        }

        function handleMediaClick(e, el) {
            e.preventDefault();
            e.stopPropagation();

            let mediaUrl = el.src;
            if (el.tagName === 'VIDEO' && !mediaUrl) {
                const source = el.querySelector('source');
                if (source) mediaUrl = source.src;
            }

            const pageUrl = window.location.href;
            const pageTitle = document.title;
            const altText = el.alt || el.getAttribute('aria-label') || el.title || '';
            const isVideo = el.tagName === 'VIDEO' || el.tagName === 'IFRAME';

            const params = new URLSearchParams({
                [isVideo ? 'video' : 'image']: mediaUrl,
                source: pageUrl,
                title: pageTitle,
                text: altText
            });

            const targetUrl = `${BASE_URL}/smart-share?${params.toString()}`;
            const width = 1000;
            const height = 800;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);

            window.open(
                targetUrl,
                'SpreadItShare',
                `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
            );
        }

        // Run periodically to catch lazy-loaded content
        setInterval(makeMediaClickable, 2000);
        makeMediaClickable();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpreadIt);
    } else {
        initSpreadIt();
    }
})();
