(function() {
    function initSpreadIt() {
        console.log("🚀 Spread It Widget - Stable Corner Mode...");
        
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
            .spread-it-overlay-btn {
                position: absolute;
                z-index: 2147483647 !important;
                width: 60px; /* Smaller, cleaner */
                height: 60px;
                border-radius: 50%;
                cursor: pointer;
                opacity: 0;
                transform: scale(0.8);
                transition: opacity 0.2s ease, transform 0.2s ease;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                background: #000;
                border: 2px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none; /* Initially pass-through */
            }
            .spread-it-overlay-btn.visible {
                opacity: 1 !important;
                transform: scale(1) !important;
                pointer-events: auto !important;
            }
            .spread-it-overlay-btn:hover {
                transform: scale(1.1) !important;
                box-shadow: 0 0 20px rgba(102, 126, 234, 0.6);
            }
            .spread-it-video-btn {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);

        // Create the button
        const btn = document.createElement('div');
        btn.id = 'spread-it-share-btn';
        btn.className = 'spread-it-overlay-btn';
        
        const videoSrc = `${BASE_URL}/assets/logo-video-spread-it.mp4`;
        btn.innerHTML = `<video src="${videoSrc}" autoplay loop muted playsinline class="spread-it-video-btn"></video>`;
        document.body.appendChild(btn);

        let activeElement = null;
        let hideTimeout = null;

        // Position helper
        function showButtonAt(el) {
            if (!el) return;
            activeElement = el;
            
            // Clear any pending hide
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }

            const rect = el.getBoundingClientRect();
            // Scroll offsets
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            // Pin to Top-Right Corner (Stable)
            const btnSize = 60;
            // Ensure we don't go off-screen
            let top = rect.top + scrollTop + 10;
            let left = rect.right + scrollLeft - btnSize - 10;
            
            // Adjust if hidden by header or offscreen (basic)
            if (rect.top < 60) top = rect.bottom + scrollTop - 70; // Flip to bottom if top is cut off

            btn.style.top = `${top}px`;
            btn.style.left = `${left}px`;
            btn.classList.add('visible');
            btn.style.pointerEvents = 'auto'; // Active on show
        }

        function hideButton() {
            if (hideTimeout) return; // Already scheduling hide
            hideTimeout = setTimeout(() => {
                btn.classList.remove('visible');
                btn.style.pointerEvents = 'none'; 
                hideTimeout = null;
            }, 300); 
        }

        // VALIDATION
        function isValideMedia(el) {
            if (!el) return false;
            if(el.id === 'spread-it-share-btn' || el.closest('.spread-it-overlay-btn')) return false;

            const w = el.offsetWidth || el.videoWidth || 0;
            const h = el.offsetHeight || el.videoHeight || 0;
            
            if (w < 100 || h < 100) return false; // Lowered threshold

            const tag = el.tagName;
            if (tag === 'IMG' || tag === 'VIDEO') return true;
            
            if (tag === 'IFRAME') {
                try {
                     const src = (el.src || '').toLowerCase();
                     if (src.includes('youtube') || src.includes('vimeo') || src.includes('player') || 
                         src.includes('embed') || src.includes('twitch') || src.includes('dailymotion')) {
                         return true;
                     }
                     return false; 
                } catch(e) {
                     return false;
                }
            }
            return false;
        }

        document.addEventListener('mousemove', (e) => {
            if (e.target.closest('.spread-it-overlay-btn')) {
                if (hideTimeout) clearTimeout(hideTimeout);
                return;
            }

            const els = document.elementsFromPoint(e.clientX, e.clientY);
            let found = null;
            
            for (let el of els) {
                // 1. Direct check
                if (isValideMedia(el)) {
                    found = el;
                    break;
                }
                
                // 2. Deep Scan (Maximum Robustness)
                // Check if this element WRAPS a media element that is physically under the cursor
                // We check commonly used wrappers: Divs, Links, Sections, Spans, Figures, Pictures
                if (['DIV', 'A', 'SECTION', 'SPAN', 'FIGURE', 'PICTURE', 'LI'].includes(el.tagName)) {
                    // Find all potential media inside
                    const potentials = el.querySelectorAll('img, video, iframe');
                    for (let p of potentials) {
                        if (isValideMedia(p)) {
                             // Precise Geometry Check
                             // Does the cursor coordinates fall inside this child media?
                             const r = p.getBoundingClientRect();
                             if (e.clientX >= r.left && e.clientX <= r.right && 
                                 e.clientY >= r.top && e.clientY <= r.bottom) {
                                 found = p;
                                 break;
                             }
                        }
                    }
                    if (found) break;
                }
            }

            if (found) {
                if (found !== activeElement || !btn.classList.contains('visible')) {
                    showButtonAt(found);
                }
            } else {
                hideButton();
            }
        }, { passive: true });

        // Scroll listener to update position if Visible
        // This keeps it pinned during scroll
        window.addEventListener('scroll', () => {
             if (btn.classList.contains('visible') && activeElement) {
                 showButtonAt(activeElement);
             }
        }, { passive: true });

        // CLICK ACTION
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!activeElement) return;
            const el = activeElement;

            let mediaUrl = el.src;
            if (el.tagName === 'VIDEO' && !mediaUrl) {
                const source = el.querySelector('source');
                if (source) mediaUrl = source.src;
            }

            const pageUrl = window.location.href;
            const pageTitle = document.title;
            const altText = el.alt || el.getAttribute('aria-label') || el.title || '';
            const isVideo = el.tagName === 'VIDEO' || el.tagName === 'IFRAME';

            // Determine if we should query 'video' or 'image'
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
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpreadIt);
    } else {
        initSpreadIt();
    }
})();
