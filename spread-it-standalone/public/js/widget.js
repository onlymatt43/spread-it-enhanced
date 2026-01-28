(function() {
    function initSpreadIt() {
        // Hardcoded for maximum reliability across iframes/content-scripts
        const BASE_URL = 'https://spread-it-enhanced.onrender.com'; 
        
        console.log(`🚀 Spread It Widget Active at ${window.location.href}`);

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            .spread-it-overlay-btn {
                position: fixed; /* Fixed is safer for iframes/scroll containers */
                z-index: 2147483647 !important;
                width: 60px; 
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
                pointer-events: none; 
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

        // Debug Indicator 
        const debug = document.createElement('div');
        debug.className = 'spread-it-debug';
        debug.style.cssText = 'position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.8); color:white; padding:8px 12px; border-radius:4px; font-size:12px; z-index:999999; pointer-events:none;';
        debug.innerText = 'Spread It: Active';
        document.body.appendChild(debug);
        setTimeout(() => debug.remove(), 4000);

        // Create the button
        const btn = document.createElement('div');
        btn.id = 'spread-it-share-btn';
        btn.className = 'spread-it-overlay-btn';
        
        const videoSrc = `${BASE_URL}/assets/logo-video-spread-it.mp4`;
        // Fallback SVG if video fails or blocked
        const fallbackIcon = `<svg viewBox="0 0 24 24" fill="white" style="width:24px;height:24px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.66 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>`;

        btn.innerHTML = `
            <video src="${videoSrc}" autoplay loop muted playsinline class="spread-it-video-btn" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"></video>
            <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${fallbackIcon}</div>
        `;
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

            // Pin to Top-Right Corner (Fixed Positioning)
            // No need for scrollTop since it's position:fixed relative to viewport
            const btnSize = 60;
            // Get coordinates relative to VIEWPORT (viewport coordinates)
            let top = rect.top + 10;
            let left = rect.right - btnSize - 10;
            
            // Safety check: is it off-screen? 
            if (top < 0) top = 10; 
            if (left > window.innerWidth - btnSize) left = window.innerWidth - btnSize - 10;
            
            // Force z-index high
            btn.style.zIndex = "2147483647";

            btn.style.top = `${top}px`;
            btn.style.left = `${left}px`;
            btn.classList.add('visible');
            btn.style.pointerEvents = 'auto'; 
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
                // BROADENED LIST to catch almost anything acting as a wrapper
                if (['DIV', 'A', 'SECTION', 'SPAN', 'FIGURE', 'PICTURE', 'LI', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER'].includes(el.tagName)) {
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
