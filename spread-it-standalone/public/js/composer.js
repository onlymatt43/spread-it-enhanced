(function(){
  const editor = document.getElementById('postEditor');
  const charCount = document.getElementById('charCount');
  const toggleChat = document.getElementById('toggleChat');
  const aiChat = document.getElementById('aiChat');
  const closeChat = document.getElementById('closeChat');
  const aiForm = document.getElementById('aiForm');
  const aiInput = document.getElementById('aiInput');
  const aiMessages = document.getElementById('aiMessages');
  const aiPolish = document.getElementById('aiPolish');
  const switchToChat = document.getElementById('switchToChat');

  // Composer media shared state (prefill/embed)
  let composerMedia = { video: null, poster: null, title: null };
  function renderMediaIn(element, video, poster){
    if (!element) return;
    element.innerHTML = '';
    try{
      if (/\.(mp4|webm|ogg)(\?|$)/i.test(video) || (video && video.startsWith && video.startsWith('blob:'))){
        const v = document.createElement('video'); v.src = video; v.controls = true; v.style.maxWidth = '100%'; if (poster) v.poster = poster; element.appendChild(v);
      } else if (video){
        const iframe = document.createElement('iframe'); iframe.src = video; iframe.style.width='100%'; iframe.style.height='240px'; iframe.frameBorder=0; iframe.allow='autoplay; encrypted-media; picture-in-picture'; element.appendChild(iframe);
      }
    }catch(e){ console.warn('renderMediaIn error', e); }
  }

  function updateCount(){
    const text = editor.textContent || '';
    charCount.textContent = text.trim().length;
  }

  editor.addEventListener('input', updateCount);
  updateCount();

  function openChat(){ aiChat.classList.add('open'); }
  function closeChatFn(){ aiChat.classList.remove('open'); }

  toggleChat.addEventListener('click', openChat);
  closeChat.addEventListener('click', closeChatFn);
  switchToChat.addEventListener('click', openChat);

  // Simple append message
  function appendMsg(text, who='ai'){ const d=document.createElement('div'); d.className='msg '+(who==='user'?'user':'ai'); d.textContent=text; aiMessages.appendChild(d); aiMessages.scrollTop = aiMessages.scrollHeight; }

  // AI chat submit -> use SSE streaming from /api/ai-stream
  aiForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = aiInput.value.trim(); if(!q) return;
    appendMsg(q,'user'); aiInput.value='';

    // Show loading indicator and highlight active card
    aiChat.classList.add('open', 'loading');
    const activeCard = document.getElementById('activeCard'); if (activeCard) activeCard.classList.add('loading');
    aiInput.disabled = true;

    // Create a placeholder AI message and open EventSource
    const aiPlaceholder = document.createElement('div'); aiPlaceholder.className = 'msg ai typing'; aiPlaceholder.textContent = '';
    aiMessages.appendChild(aiPlaceholder);
    aiMessages.scrollTop = aiMessages.scrollHeight;

    const url = '/api/ai-stream?prompt=' + encodeURIComponent(q);
    const es = new EventSource(url);

    let receivedAny = false;
    let fullResponse = '';

    es.onmessage = (ev) => {
      // Append chunks to placeholder
      if (ev && ev.data) {
        receivedAny = true;
        // Remove typing hint class on first chunk
        if (aiPlaceholder.classList.contains('typing')) aiPlaceholder.classList.remove('typing');
        
        // Replace escaped newlines
        const chunk = ev.data.replace(/\\n/g, '\n');
        fullResponse += chunk;
        
        // Display strictly text parts (hide potential JSON block in progress)
        // Simple logic: if we see the start of a json block, we hide it from view
        const displaySafe = fullResponse.split('```json')[0];
        
        aiPlaceholder.textContent = displaySafe;
        aiMessages.scrollTop = aiMessages.scrollHeight;
      }
    };

    const finish = () => {
      aiChat.classList.remove('loading');
      if (activeCard) activeCard.classList.remove('loading');
      aiInput.disabled = false;
      
      // Check for JSON command block in fullResponse
      const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const cmd = JSON.parse(jsonMatch[1]);
          if (cmd.update_ui) {
            console.log('🤖 AI Update Command:', cmd);
            
            // 1. Update Main Editor
            if (cmd.main_content) {
              editor.textContent = cmd.main_content;
              updateCount();
            }

            // 2. Update Platform Cards
            if (cmd.platforms) {
              Object.keys(cmd.platforms).forEach(p => {
                const text = cmd.platforms[p];
                const ta = document.querySelector('.platform-caption[data-platform="'+p+'"]');
                if (ta) ta.value = text;
              });
            }

            // 3. Update Hashtags
            if (cmd.hashtags) {
               Object.keys(cmd.hashtags).forEach(p => {
                 const tags = cmd.hashtags[p]; // String or Array
                 const hnode = document.querySelector('.platform-hashtags[data-platform="'+p+'"]');
                 if (hnode) {
                   hnode.innerHTML = '';
                   const tagList = Array.isArray(tags) ? tags : String(tags).split(' ');
                   tagList.filter(t => t.trim()).forEach(t => {
                     const b = document.createElement('span');
                     b.className='tag';
                     b.textContent = t.startsWith('#') ? t : '#'+t;
                     hnode.appendChild(b);
                   });
                 }
               });
            }

            // 4. Show advice logic if needed
            if (cmd.advice) {
              appendMsg(`💡 Conseil Stratégie: ${cmd.advice}`, 'system');
            }
            
            appendMsg('✅ Cartes mises à jour automatiquement', 'system');
          }
        } catch (e) {
            console.warn('Failed to parse AI JSON command', e);
        }
      }
    };

    es.addEventListener('end', () => { try { es.close(); } catch(e){}; finish(); });
    es.onerror = () => {
      try { es.close(); } catch(e){}
      if (!receivedAny) {
        const last = aiPlaceholder; if (last && !last.textContent) last.textContent = 'Le service AI est indisponible.';
      }
      finish();
    };
  });

  // AI polish button: send editor content to existing /create endpoint to get improved content
  aiPolish.addEventListener('click', async ()=>{
    const content = (editor.textContent||'').trim(); if(!content) { alert('Écrivez quelque chose d\'abord'); return; }
    aiPolish.disabled = true; aiPolish.textContent = 'Amélioration...';
    try{
      const form = new FormData(); form.append('content', content); form.append('style','professionnel'); form.append('length','moyen');
      const res = await fetch('/create', {method:'POST', body: form});
      const json = await res.json();
      if(json && json.success){
        // Replace editor content
        editor.textContent = json.content || editor.textContent;
        updateCount();
        appendMsg('Contenu amélioré et appliqué au post.', 'ai');

        // Populate per-platform captions and hashtags
        const platforms = ['facebook','instagram','twitter','linkedin','tiktok'];
        platforms.forEach(p => {
          try{
            const ta = document.querySelector('.platform-caption[data-platform="'+p+'"]');
            if (ta) ta.value = (json.captions && json.captions[p]) ? json.captions[p] : (json.content || editor.textContent || '');
            const hnode = document.querySelector('.platform-hashtags[data-platform="'+p+'"]');
            if (hnode){ hnode.innerHTML = ''; const tags = (json.hashtags && json.hashtags[p]) ? json.hashtags[p] : []; tags.slice(0,20).forEach(t => { const b = document.createElement('span'); b.className='tag'; b.textContent = t; hnode.appendChild(b); }); }
            // ensure media present
            const mediaArea = document.querySelector('.platform-card-media[data-platform="'+p+'"]'); if (mediaArea && composerMedia.video) renderMediaIn(mediaArea, composerMedia.video, composerMedia.poster);
          }catch(e){/*ignore*/}
        });

      } else {
        appendMsg('Erreur amélioration: ' + (json && json.error ? json.error : 'inconnue'), 'ai');
      }
    }catch(e){
      appendMsg('Erreur réseau pendant amélioration', 'ai');
    } finally {
      aiPolish.disabled = false; aiPolish.textContent = 'Améliorer (respecter le contenu)';
    }
  });

  // Preview & Publish basic handlers
  document.getElementById('previewBtn').addEventListener('click', ()=>{
    const v = editor.innerHTML;
    const w = window.open('about:blank','_blank'); w.document.write('<body style="background:#0b0f14;color:#eaf2ff;font-family:sans-serif;padding:20px">'+v+'</body>'); w.document.title='Aperçu';
  });

  document.getElementById('publishBtn').addEventListener('click', async ()=>{
    const content = (editor.textContent||'').trim(); if(!content) { alert('Le post est vide'); return; }
    try{
      // Gather selected platforms from per-platform cards
      const selected = Array.from(document.querySelectorAll('.platform-select:checked')).map(n=>n.value);
      if (selected.length === 0) {
        if (!confirm('Aucun réseau sélectionné. Continuer et créer un draft seulement ?')) return;
      }

      // First, create the content on server (stores session.currentContent)
      const form = new FormData(); form.append('content', content);
      const res = await fetch('/create', {method:'POST', body: form});
      const json = await res.json();
      if(!(json && json.success)){
        alert('Erreur publication: ' + (json && json.error ? json.error : 'inconnue'));
        return;
      }

      // Then request immediate sharing to selected platforms
      if (selected.length > 0) {
        const shareRes = await fetch('/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platforms: selected, schedule: 'now' })
        });
        const shareJson = await shareRes.json();
        if (shareJson && shareJson.success) {
          alert('Post partagé sur: ' + selected.join(', '));
        } else {
          alert('Erreur lors du partage: ' + (shareJson && shareJson.error ? shareJson.error : 'inconnue'));
        }
      } else {
        alert('Contenu préparé. Aller à partager.'); window.location.href='/share';
      }

    }catch(e){ console.error(e); alert('Erreur réseau lors de la publication'); }
  });

    // Prefill from query params (embed usage)
    function prefillFromQuery(){
      try{
        const params = new URLSearchParams(window.location.search);
        if (!params.get('prefill')) return;
        const title = params.get('title') ? decodeURIComponent(params.get('title')) : '';
        const video = params.get('video_url') ? decodeURIComponent(params.get('video_url')) : '';
        const poster = params.get('poster') ? decodeURIComponent(params.get('poster')) : '';

        if (title && !(editor.textContent||'').trim()) {
          editor.textContent = title;
          updateCount();
          appendMsg('Pré-rempli depuis la page source', 'ai');
        }

        if (video) {
          // Insert preview into main card
          const cardBody = document.querySelector('.card-body');
          if (cardBody){
            const container = document.createElement('div'); container.className='prefill-media'; renderMediaIn(container, video, poster); cardBody.insertBefore(container, cardBody.firstChild);
          }

          // Insert into each platform card media area
          const mediaAreas = document.querySelectorAll('.platform-card-media');
          mediaAreas.forEach(function(a){ renderMediaIn(a, video, poster); });
        }
      }catch(e){ console.warn('Prefill parse error', e); }
    }

    // Run prefill on load (if any query params present)
    prefillFromQuery();

    // per-card 'Améliorer' buttons: send card caption to AI chat and replace
    document.querySelectorAll('.improve-card').forEach(btn => {
      btn.addEventListener('click', async function(e){
        // Fixed selector for new UI (Feb 2026)
        const wrapper = e.target.closest('.platform-wrapper'); if (!wrapper) return;
        const platform = wrapper.getAttribute('data-platform');
        const ta = wrapper.querySelector('.platform-caption'); if (!ta) return;
        const prompt = `Améliore et adapte cette légende pour ${platform.toUpperCase()} en respectant le style original :\n\n${ta.value}`;
        
        // Visual feedback
        const originalText = btn.textContent;
        btn.textContent = '...';
        
        try{
          const r = await fetch('/api/ai-chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({prompt})});
          const j = await r.json(); 
          if (j && j.reply){ 
              ta.value = j.reply; 
              // Flash success
              btn.textContent = '✨ Fait';
              setTimeout(()=> btn.textContent = originalText, 2000);
          }
        }catch(e){ 
            console.warn('improve-card error', e); 
            btn.textContent = 'Error';
        }
      });
    });

  })();
