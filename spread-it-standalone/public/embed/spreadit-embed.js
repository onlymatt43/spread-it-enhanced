// Spread It — Embed helper
(function(){
  // Configuration
  var composerBase = (window.SpreadIt && window.SpreadIt.composerBase) || 'https://spread-it-enhanced.onrender.com';
  
  console.log('🚀 Spread It Embed: Loaded. Scanning for media...');

  // Modal logic (unchanged)
  function ensureModal(){
    if(document.getElementById('spreadit-embed-modal')) return;
    var modal = document.createElement('div'); modal.id='spreadit-embed-modal';
    modal.style.cssText='display:none;position:fixed;inset:0;z-index:2147483647;align-items:center;justify-content:center;font-family:sans-serif;';
    modal.innerHTML = '\n      <div style="position:absolute;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px)"></div>\n      <div style="position:relative;width:90%;max-width:1100px;height:85%;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)">\n        <button id="spreadit-embed-close" style="position:absolute;right:12px;top:12px;z-index:10;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:background 0.2s">✕</button>\n        <iframe id="spreadit-embed-frame" src="" style="width:100%;height:100%;border:0;display:block;background:#0b0f14"></iframe>\n      </div>';
    document.documentElement.appendChild(modal);
    document.getElementById('spreadit-embed-close').addEventListener('click',hide);
    document.getElementById('spreadit-embed-close').onmouseenter = function(e){e.target.style.background='rgba(255,255,255,0.2)'};
    document.getElementById('spreadit-embed-close').onmouseleave = function(e){e.target.style.background='rgba(255,255,255,0.1)'};
  }

  function show(url){ ensureModal(); var m=document.getElementById('spreadit-embed-modal'); var f=document.getElementById('spreadit-embed-frame'); f.src=url; m.style.display='flex'; document.body.style.overflow='hidden'; }
  function hide(){ var m=document.getElementById('spreadit-embed-modal'); if(!m) return; var f=document.getElementById('spreadit-embed-frame'); f.src=''; m.style.display='none'; document.body.style.overflow=''; }

  window.SpreadIt = window.SpreadIt || {};
  window.SpreadIt.openComposer = function(q){ var qs = q||''; var url = composerBase.replace(/\/$/,'') + '/composer' + (qs?(qs[0]=='?'?qs:('?'+qs)): ''); show(url); };

  // New safer inject strategy: Attach visual overlay to parent without moving the video node (preserves React/Vue bindings)
  function attachButton(target, meta){
    var parent = target.parentElement;
    if(!parent) return;

    // Ensure parent can position absolute children
    var style = window.getComputedStyle(parent);
    if(style.position === 'static') {
        parent.style.position = 'relative';
    }

    // Check if button already exists in this parent for this target
    if(parent.querySelector('.spreadit-overlay-btn')) return;

    var btn = document.createElement('a');
    btn.className='spreadit-overlay-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Spread It`;
    
    // Modern Floating Style
    btn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: rgba(10, 10, 10, 0.6);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 20px;
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        opacity: 0;
        transform: translateY(-5px);
        transition: all 0.2s ease;
    `;

    // Show on parent hover
    parent.addEventListener('mouseenter', function(){ 
        btn.style.opacity = '1'; 
        btn.style.transform = 'translateY(0)';
    });
    parent.addEventListener('mouseleave', function(){ 
        btn.style.opacity = '0'; 
        btn.style.transform = 'translateY(-5px)';
    });

    // Handle click
    btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
         var q = 'prefill=1' + (meta.video_url?('&video_url='+encodeURIComponent(meta.video_url)):'') + (meta.title?('&title='+encodeURIComponent(meta.title)):'') + (meta.poster?('&poster='+encodeURIComponent(meta.poster)):''); 
         window.SpreadIt.openComposer(q);
    });

    parent.appendChild(btn);
  }

  function scan(){
    // Smart Query for Videos
    var videos = Array.from(document.querySelectorAll('video'));
    videos.forEach(function(v){ 
      if(v.dataset.spreaditProcessed) return; 
      v.dataset.spreaditProcessed = "true";
      
      var src = v.currentSrc || v.getAttribute('src') || (v.querySelector('source') && v.querySelector('source').src) || ''; 
      var poster = v.getAttribute('poster') || ''; 
      var title = document.title || 'Video'; 
      
      if(src) attachButton(v, {video_url:src, title:title, poster:poster}); 
    });

    // Smart Query for YouTube Iframes
    var ifr = Array.from(document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"]'));
    ifr.forEach(function(f){ 
       if(f.dataset.spreaditProcessed) return; 
       f.dataset.spreaditProcessed = "true";
       var src = f.src; 
       var title = f.title || document.title || 'YouTube Video';
       attachButton(f, {video_url:src, title:title});
    });
  }

  function init(){ 
     ensureModal(); 
     scan(); 
     // Aggressive Observer for SPA changes
     var obs = new MutationObserver(function(mutations){ 
         scan(); 
     }); 
     obs.observe(document.body, {childList:true, subtree:true});
     console.log('🚀 Spread It Embed: Observer Active');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
