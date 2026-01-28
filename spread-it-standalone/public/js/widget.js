(function() {
    function initSpreadIt() {
        console.log("🚀 Spread It Widget Initializing...");
        
        // Configuration
        const BASE_URL = (window.spreadItConfig && window.spreadItConfig.baseUrl) || 
                         (document.currentScript ? document.currentScript.src.split('/js/widget.js')[0] : '');
                         
        if (!BASE_URL) {
            console.error("Spread It: Could not determine Base URL");
            return;
        }
        console.log("Spread It Base URL:", BASE_URL);

        const MIN_IMAGE_SIZE = 150; 

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            .spread-it-overlay-btn {
                position: absolute;
                z-index: 2147483647 !important;
                width: 80px;
                height: 80px;
                border-radius: 50%;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.3s ease, transform 0.2s ease;
                box-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
                background: #000;
                border: 2px solid white;
                display: block !important;
            }
            .spread-it-overlay-btn.visible {
                opacity: 1 !important;
                pointer-events: auto !important;
            }
            .spread-it-overlay-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 0 30px rgba(102, 126, 234, 0.8);
            }
            .spread-it-video-btn {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%;
                pointer-events: none;
            }
            .spread-it-debug {
                position: fixed;
                bottom: 10px;
                right: 10px;
                background: #333;
                color: #fff;
                padding: 10px;
                border-radius: 5px;
                z-index: 2147483647;
                font-family: sans-serif;
                font-size: 12px;
                pointer-events: none;
                opacity: 0.8;
            }
        `;
        document.head.appendChild(style);

        // Debug Indicator
        const debug = document.createElement('div');
        debug.className = 'spread-it-debug';
        debug.innerText = 'Spread It: Active';
        document.body.appendChild(debug);
        setTimeout(() => debug.remove(), 5000); // Hide after 5s

        // Create the button element once
        const btn = document.createElement('div');
        btn.id = 'spread-it-share-btn';
        btn.className = 'spread-it-overlay-btn';
        btn.style.opacity = '0'; // Default hidden
        btn.style.pointerEvents = 'none'; // Default no pointer events
        
        const videoSrc = `${BASE_URL}/assets/logo-video-spread-it.mp4`;
        
        btn.innerHTML = `
            <video src="${videoSrc}" autoplay loop muted playsinline class="spread-it-video-btn" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"></video>
            <div style="display:none; width:100%; height:100%; background: linear-gradient(45deg, #667eea, #764ba2); color:white; align-items:center; justify-content:center; font-weight:bold; font-size:12px; text-align:center;">Spread<br>It</div>
        `;
        
        document.body.appendChild(btn);

        let activeElement = null;
        let hideTimeout = null;

        // Function to calculate position
        function positionButton(el) {
            const rect = el.getBoundingClientRect();
            
            // Don't show if off screen
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;

            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            // Compute position
            const topPos = rect.top + scrollTop + 20;
            const leftPos = rect.right + scrollLeft - 100;

            btn.style.top = topPos + 'px';
            btn.style.left = leftPos + 'px';
        }

        // Checking Loop
        setInterval(() => {
            if (activeElement && btn.classList.contains('visible')) {
                positionButton(activeElement);
            }
        }, 100);

        // Event Delegation
        document.addEventListener('mouseover', function(e) {
            const el = e.target;
            
            // Handle Images & Videos
            if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
                const width = el.tagName === 'VIDEO' ? el.videoWidth : el.width;
                const height = el.tagName === 'VIDEO' ? el.videoHeight : el.height;
                const offsetW = el.offsetWidth;

                // Check size
                if ((width > MIN_IMAGE_SIZE && height > MIN_IMAGE_SIZE) || (offsetW > MIN_IMAGE_SIZE)) {
                    if (hideTimeout) clearTimeout(hideTimeout);
                    
                    activeElement = el;
                    positionButton(el);
                    
                    btn.classList.add('visible');
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                }
            } 
            // Handle hovering the button itself
            else if (el === btn || btn.contains(el)) {
                if (hideTimeout) clearTimeout(hideTimeout);
                
                btn.classList.add('visible');
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            } 
            // Handle hovering off
            else {
                // If we moved off the image AND the button, hide after delay
                hideTimeout = setTimeout(() => {
                    btn.classList.remove('visible');
                    btn.style.opacity = '0';
                    btn.style.pointerEvents = 'none';
                }, 300);
            }
        }, true); // Use capture to ensure we see events

        // Handle Scroll
        window.addEventListener('scroll', () => {
             if (activeElement && btn.classList.contains('visible')) {
                positionButton(activeElement);
            }
        }, { passive: true });

        // Handle Click
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (!activeElement) return;

            let mediaUrl = activeElement.src;
            if (activeElement.tagName === 'VIDEO' && !mediaUrl) {
               const source = activeElement.querySelector('source');
               if (source) mediaUrl = source.src;
            }

            const pageUrl = window.location.href;
            const pageTitle = document.title;
            const altText = activeElement.alt || activeElement.getAttribute('aria-label') || '';
            const isVideo = activeElement.tagName === 'VIDEO';

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

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSpreadIt);
    } else {
        initSpreadIt();
    }

})();
