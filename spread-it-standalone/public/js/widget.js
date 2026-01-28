(function() {
    console.log("🚀 Spread It Widget Loaded");
    
    // Configuration
    const BASE_URL = document.currentScript ? document.currentScript.src.split('/js/widget.js')[0] : '';
    if (!BASE_URL) {
        console.error("Spread It: Could not determine Base URL");
        return;
    }
    console.log("Spread It Base URL:", BASE_URL);

    const MIN_IMAGE_SIZE = 150; // Lowered threshold for easier testing

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        .spread-it-overlay-btn {
            position: absolute;
            z-index: 2147483647; /* Max Z-Index */
            width: 80px;
            height: 80px;
            border-radius: 50%;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.2s ease;
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
            pointer-events: none;
            overflow: hidden;
            background: #000;
            border: 2px solid white;
        }
        .spread-it-overlay-btn.visible {
            opacity: 1;
            pointer-events: auto;
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
            pointer-events: none; /* Let clicks pass to container */
        }
    `;
    document.head.appendChild(style);

    // Create the button element once
    const btn = document.createElement('div');
    btn.className = 'spread-it-overlay-btn';
    
    const videoSrc = `${BASE_URL}/assets/logo-video-spread-it.mp4`;

    // Fallback to static text/image if video fails
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

        // Position at top-right corner of the video/image
        btn.style.top = (rect.top + scrollTop + 20) + 'px';
        btn.style.left = (rect.right + scrollLeft - 100) + 'px';
    }

    // Checking Loop (Better than just scroll event for layout shifts)
    setInterval(() => {
        if (activeElement && btn.classList.contains('visible')) {
            positionButton(activeElement);
        }
    }, 100);

    // Event Delegation for Images and Videos
    document.addEventListener('mouseover', function(e) {
        const el = e.target;
        
        // Check if it's a media element
        if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
            const width = el.tagName === 'VIDEO' ? el.videoWidth || el.offsetWidth : el.width || el.offsetWidth;
            const height = el.tagName === 'VIDEO' ? el.videoHeight || el.offsetHeight : el.height || el.offsetHeight;

            // Only show if element has reasonable size
            if (width > MIN_IMAGE_SIZE && height > MIN_IMAGE_SIZE) {
                if (hideTimeout) clearTimeout(hideTimeout);
                activeElement = el;
                btn.classList.add('visible');
                positionButton(el);
                // console.log("Showing button for", el);
            }
        } else if (el === btn || btn.contains(el)) {
            if (hideTimeout) clearTimeout(hideTimeout);
            btn.classList.add('visible');
        } else {
            // Delay hiding to allow moving mouse to button
            hideTimeout = setTimeout(() => {
                btn.classList.remove('visible');
            }, 300);
        }
    }, { capture: true }); // Capture phase to catch events early





    // Handle Window Resize / Scroll
    window.addEventListener('scroll', () => {
        if (activeElement && btn.classList.contains('visible')) {
            positionButton(activeElement);
        }
    });

    // Handle Click
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!activeElement) return;

        let mediaUrl = activeElement.src;
        // For video tags that use <source> children
        if (activeElement.tagName === 'VIDEO' && !mediaUrl) {
           const source = activeElement.querySelector('source');
           if (source) mediaUrl = source.src;
        }

        const pageUrl = window.location.href;
        const pageTitle = document.title;
        const altText = activeElement.alt || activeElement.getAttribute('aria-label') || '';
        const isVideo = activeElement.tagName === 'VIDEO';

        // Construct URL
        const params = new URLSearchParams({
            [isVideo ? 'video' : 'image']: mediaUrl,
            source: pageUrl,
            title: pageTitle,
            text: altText
        });

        const targetUrl = `${BASE_URL}/smart-share?${params.toString()}`;


        // Open Popup
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

})();
