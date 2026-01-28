(function() {
    // Configuration
    const BASE_URL = document.currentScript.src.split('/js/widget.js')[0];
    const MIN_IMAGE_SIZE = 200;

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        .spread-it-overlay-btn {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 10000;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.2s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            pointer-events: none;
            overflow: hidden;
            background: black;
            border: 2px solid white;
        }
        .spread-it-overlay-btn.visible {
            opacity: 1;
            pointer-events: auto;
        }
        .spread-it-overlay-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.6);
        }
        .spread-it-video-btn {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
        }
    `;
    document.head.appendChild(style);

    // Create the button element once
    const btn = document.createElement('div');
    btn.className = 'spread-it-overlay-btn';
    // Use the video as the button content
    btn.innerHTML = `<video src="${BASE_URL}/assets/logo-video-spread-it.mp4" autoplay loop muted playsinline class="spread-it-video-btn"></video>`;
    document.body.appendChild(btn);

    let activeElement = null;

    // Function to calculate position
    function positionButton(el) {
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        btn.style.top = (rect.top + scrollTop + 10) + 'px';
        btn.style.left = (rect.left + scrollLeft + 10) + 'px';
    }

    // Event Delegation for Images and Videos
    document.addEventListener('mouseover', function(e) {
        const el = e.target;
        
        if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
            const width = el.tagName === 'VIDEO' ? el.videoWidth : el.width;
            const height = el.tagName === 'VIDEO' ? el.videoHeight : el.height;

            // Only show if element has reasonable size (and is loaded)
            if ((width > MIN_IMAGE_SIZE && height > MIN_IMAGE_SIZE) || (el.offsetWidth > MIN_IMAGE_SIZE)) {
                activeElement = el;
                btn.classList.add('visible');
                positionButton(el);
            }
        } else if (el === btn || btn.contains(el)) {
            // Keep visible if hovering the button itself
            btn.classList.add('visible');
        } else {
            // Hide if not hovering image or button
            btn.classList.remove('visible');
        }
    });

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
