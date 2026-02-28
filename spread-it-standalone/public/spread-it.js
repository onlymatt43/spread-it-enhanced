/**
 * Spread It — Universal embed script
 * Install on any site: <script src="https://spread-it-enhanced.onrender.com/spread-it.js"></script>
 * The script auto-detects its own origin so no manual URL config is needed.
 */

(function () {
  'use strict';

  // Auto-detect base URL from the script's own src attribute
  // This means any site that loads this script automatically talks to the right Render instance
  const SPREAD_BASE_URL = (function() {
    var scripts = document.querySelectorAll('script[src*="spread-it"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var u = new URL(scripts[i].src);
        if (u.pathname.includes('spread-it')) return u.origin;
      } catch(e) {}
    }
    // Fallback
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://spread-it-enhanced.onrender.com';
  })();

  let anyConnected = false;

  /* --- CSS --- */
  const style = document.createElement('style');
  style.textContent = `
    .spread-it-btn {
      position: absolute;
      top: 0;
      right: 0;
      background: none;
      border: none;
      border-bottom-left-radius: 8px;
      width: 60px;
      height: 60px;
      cursor: pointer;
      z-index: 100;
      display: block;
      padding: 0;
      overflow: hidden;
      transition: opacity 0.25s ease-out;
      opacity: 1;
    }
    .spread-it-btn video {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .spread-it-btn:hover {
      opacity: 0.85;
    }
    @media (max-width: 768px) {
      .spread-it-btn { opacity: 1 !important; }
    }
    .video-card[data-locked="true"] .spread-it-btn { display: none !important; }

    .si-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 11, 14, 0.92);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .si-overlay.show { display: flex; }
    .si-modal {
      position: relative;
      width: 92%;
      max-width: 1120px;
      height: 88vh;
      background: #0b0f14;
      border-radius: 16px;
      border: 1px solid rgba(99, 102, 241, 0.25);
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
      animation: siSlideUp 0.25s ease-out;
    }
    @keyframes siSlideUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .si-close {
      position: absolute;
      top: 12px; right: 12px;
      z-index: 10;
      background: rgba(255,255,255,0.1);
      border: none; color: #fff;
      width: 34px; height: 34px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      line-height: 34px;
      text-align: center;
      transition: background 0.2s;
    }
    .si-close:hover { background: rgba(255,255,255,0.22); }
    .si-modal iframe { width: 100%; height: 100%; border: 0; display: block; }
  `;
  document.head.appendChild(style);

  /* --- Check connected platforms --- */
  async function checkPlatformStatuses() {
    try {
      const res      = await fetch(`${SPREAD_BASE_URL}/api/platforms/status`);
      const statuses = await res.json();
      anyConnected   = Object.values(statuses).some(s => s && s.connected);
      console.log('Spread It: platform statuses', statuses);
    } catch (e) {
      console.warn('Spread It: could not reach platform status endpoint', e);
    }
  }

  /* --- Auth check + Open iframe modal --- */
  var SPREAD_IT_SESSION_TOKEN = null; // set after Google auth

  function openComposer(mediaData) {
    // 1. Check if user is authenticated first
    fetch(SPREAD_BASE_URL + '/api/auth/check', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          // Already authenticated — get a short-lived token for iframe API calls
          fetch(SPREAD_BASE_URL + '/api/auth/issue-token', { credentials: 'include' })
            .then(function(r) { return r.ok ? r.json() : {}; })
            .then(function(t) { _openComposerIframe(mediaData, t.token || null); })
            .catch(function() { _openComposerIframe(mediaData, null); });
        } else {
          // Open Google login in a popup (Google blocks OAuth in iframes)
          const popup = window.open(
            SPREAD_BASE_URL + '/auth/google/start?popup=1',
            'spread-it-login',
            'width=500,height=620,left=' + Math.round((screen.width - 500) / 2) + ',top=' + Math.round((screen.height - 620) / 2)
          );
          // Listen for auth completion
          const onMessage = function(e) {
            if (e.data === 'spread-it-auth-done' || (e.data && e.data.event === 'spread-it-auth-done')) {
              window.removeEventListener('message', onMessage);
              if (e.data && e.data.token) SPREAD_IT_SESSION_TOKEN = e.data.token;
              if (popup && !popup.closed) popup.close();
              _openComposerIframe(mediaData, SPREAD_IT_SESSION_TOKEN);
            }
          };
          window.addEventListener('message', onMessage);
          // Fallback: polling if popup was closed manually
          const poll = setInterval(function() {
            if (popup && popup.closed) {
              clearInterval(poll);
              window.removeEventListener('message', onMessage);
              // Try opening composer anyway (user may have logged in)
              _openComposerIframe(mediaData, SPREAD_IT_SESSION_TOKEN);
            }
          }, 500);
        }
      })
      .catch(function() {
        // If check fails, just open composer directly
        _openComposerIframe(mediaData);
      });
  }

  function _openComposerIframe(mediaData, siToken) {
    const params = new URLSearchParams({ prefill: '1' });
    if (mediaData.url) {
      params.set(mediaData.type === 'video' ? 'video_url' : 'image_url', mediaData.url);
    }
    if (mediaData.poster) params.set('poster', mediaData.poster);
    if (mediaData.title)  params.set('title',  mediaData.title);
    if (siToken)          params.set('si_token', siToken);

    const composerUrl = `${SPREAD_BASE_URL}/composer?` + params.toString();

    let overlay = document.getElementById('si-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id        = 'si-overlay';
      overlay.className = 'si-overlay';
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeComposer();
      });
      document.body.appendChild(overlay);
    }

    overlay.innerHTML =
      '<div class="si-modal">' +
        '<button class="si-close" onclick="window._siClose()" title="Fermer">&#x2715;</button>' +
        '<iframe src="' + composerUrl + '" allow="microphone; camera"></iframe>' +
      '</div>';

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeComposer() {
    const overlay = document.getElementById('si-overlay');
    if (!overlay) return;
    const iframe = overlay.querySelector('iframe');
    if (iframe) iframe.src = '';
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 280);
    document.body.style.overflow = '';
  }

  window._siClose = closeComposer;
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeComposer(); });

  /* --- Add button to a card --- */
  function addButton(card) {
    if (card.dataset.locked === 'true') return;

    const video     = card.querySelector('video');
    const image     = card.querySelector('img:not(.spread-it-btn img)');
    let   container = card.querySelector('.video-container') || (image ? card : null);

    if (!container || (!video && !image)) return;
    if (container.querySelector('.spread-it-btn')) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    var srcEl = video ? (video.querySelector('source') || null) : null;
    function bestVideoUrl(vid, src) {
      // Priority 0: data-video-url on the card (most reliable, set at render time)
      var candidates = [
        card.dataset.videoUrl,
        vid && vid.currentSrc,
        src && src.getAttribute('src'),
        src && src.src,
        vid && vid.getAttribute('src'),
        vid && vid.src
      ];
      for (var i = 0; i < candidates.length; i++) {
        var u = candidates[i];
        if (u && !u.startsWith('blob:') && u !== 'undefined' && u !== '') return u.split('#')[0]; // strip #t=0.001
      }
      return '';
    }
    const mediaData = {
      url:    video
                ? bestVideoUrl(video, srcEl)
                : (image ? image.src : ''),
      type:   video ? 'video' : 'image',
      title:  card.dataset.title || document.title || '',
      poster: card.dataset.posterUrl || (video ? (video.getAttribute('poster') || '') : (image ? image.src : ''))
    };

    const btn = document.createElement('button');
    btn.className = 'spread-it-btn';
    btn.title = 'Spread It';
    btn.setAttribute('aria-label', 'Spread It');
    const logoVid = document.createElement('video');
    // Lazy-load: do NOT set src at creation — only on first hover to avoid
    // hammering Render with 20+ simultaneous requests on page load
    logoVid.loop = true;
    logoVid.muted = true;
    logoVid.setAttribute('playsinline', '');
    logoVid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-bottom-left-radius:8px;';
    btn.appendChild(logoVid);
    var logoLoaded = false;
    btn.addEventListener('mouseenter', function() {
      if (!logoLoaded) {
        logoLoaded = true;
        logoVid.src = SPREAD_BASE_URL + '/assets/logo-video-spread-it.mp4';
      }
      logoVid.play().catch(function(){});
    });
    btn.addEventListener('mouseleave', function() { logoVid.pause(); logoVid.currentTime = 0; });

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (video) {
        var s = video.querySelector('source');
        mediaData.url    = bestVideoUrl(video, s) || mediaData.url;
        mediaData.poster = card.dataset.posterUrl || video.getAttribute('poster') || mediaData.poster;
      }
      openComposer(mediaData);
    });

    container.appendChild(btn);
  }

  /* --- Init --- */
  async function init() {
    await checkPlatformStatuses();
    document.querySelectorAll('.video-card').forEach(addButton);

    const feed = document.getElementById('feed');
    if (feed) {
      new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
          m.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
              if (node.classList && node.classList.contains('video-card')) addButton(node);
              else if (node.querySelectorAll) node.querySelectorAll('.video-card').forEach(addButton);
            }
          });
        });
      }).observe(feed, { childList: true, subtree: true });
    }

    console.log('Spread It initialized -', anyConnected ? 'connected' : 'no platform connected');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
