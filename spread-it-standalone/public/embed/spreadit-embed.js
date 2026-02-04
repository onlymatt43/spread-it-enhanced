// Spread It — Embed helper
// Usage: include this script on any page. Optionally set window.SpreadIt={composerBase:'https://...'} before loading.
(function(){
  var composerBase = (window.SpreadIt && window.SpreadIt.composerBase) || 'https://spread-it-enhanced.onrender.com';

  function ensureModal(){
    if(document.getElementById('spreadit-embed-modal')) return;
    var modal = document.createElement('div'); modal.id='spreadit-embed-modal';
    modal.style.cssText='display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;';
    modal.innerHTML = '\n      <div style="position:absolute;inset:0;background:rgba(0,0,0,.6);"></div>\n      <div style="position:relative;width:94%;max-width:1100px;height:84%;background:transparent;border-radius:8px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)">\n        <button id="spreadit-embed-close" style="position:absolute;right:8px;top:8px;z-index:10;background:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">✕</button>\n        <iframe id="spreadit-embed-frame" src="" style="width:100%;height:100%;border:0;display:block;background:transparent"></iframe>\n      </div>';
    document.documentElement.appendChild(modal);
    document.getElementById('spreadit-embed-close').addEventListener('click',hide);
  }

  function show(url){ ensureModal(); var m=document.getElementById('spreadit-embed-modal'); var f=document.getElementById('spreadit-embed-frame'); f.src=url; m.style.display='flex'; document.body.style.overflow='hidden'; }
  function hide(){ var m=document.getElementById('spreadit-embed-modal'); if(!m) return; var f=document.getElementById('spreadit-embed-frame'); f.src=''; m.style.display='none'; document.body.style.overflow=''; }

  window.SpreadIt = window.SpreadIt || {};
  window.SpreadIt.openComposer = function(q){ var qs = q||''; var url = composerBase.replace(/\/$/,'') + '/composer' + (qs?(qs[0]=='?'?qs:('?'+qs)): ''); show(url); };

  // Create overlay button for <video> and known iframes
  function createButton(target, meta){
    var btn = document.createElement('button');
    btn.className='spreadit-embed-btn';
    btn.style.cssText='position:absolute;right:8px;top:8px;z-index:9999;border-radius:999px;border:none;padding:10px 12px;background:linear-gradient(45deg,#667eea,#764ba2);color:#fff;cursor:pointer;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,.2)';
    btn.textContent='Spread It';
    btn.addEventListener('click',function(e){ e.stopPropagation(); e.preventDefault(); var q = 'prefill=1' + (meta.video_url?('&video_url='+encodeURIComponent(meta.video_url)):'') + (meta.title?('&title='+encodeURIComponent(meta.title)):'') + (meta.poster?('&poster='+encodeURIComponent(meta.poster)):''); window.SpreadIt.openComposer(q); });
    // position the btn inside a positioned wrapper
    var wrap = document.createElement('div'); wrap.style.position='relative'; wrap.style.display='inline-block';
    // replace target with wrapper containing target and button overlay
    var parent = target.parentNode; if(!parent) return;
    parent.replaceChild(wrap,target); wrap.appendChild(target); wrap.appendChild(btn);
  }

  function scan(){
    var videos = Array.from(document.querySelectorAll('video'));
    videos.forEach(function(v){ if(v.closest('.spreadit-embed-processed')) return; v.classList.add('spreadit-embed-processed'); var src = v.currentSrc || v.getAttribute('src') || (v.querySelector('source') && v.querySelector('source').src) || ''; var poster = v.getAttribute('poster') || ''; var title = document.title || ''; createButton(v,{video_url:src,title:title,poster:poster}); });
    // iframes (YouTube) - wrap iframe
    var ifr = Array.from(document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"]'));
    ifr.forEach(function(f){ if(f.closest('.spreadit-embed-processed')) return; f.classList.add('spreadit-embed-processed'); var src = f.src; var title = f.title || document.title || ''; createButton(f,{video_url:src,title:title}); });
  }

  // init
  function init(){ ensureModal(); scan(); // observe dynamically added videos
    var obs = new MutationObserver(function(){ scan(); }); obs.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
