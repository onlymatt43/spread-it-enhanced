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
    es.onmessage = (ev) => {
      // Append chunks to placeholder
      if (ev && ev.data) {
        receivedAny = true;
        // Remove typing hint class on first chunk
        if (aiPlaceholder.classList.contains('typing')) aiPlaceholder.classList.remove('typing');
        // Replace escaped newlines
        const chunk = ev.data.replace(/\\n/g, '\n');
        aiPlaceholder.textContent = (aiPlaceholder.textContent || '') + chunk;
        aiMessages.scrollTop = aiMessages.scrollHeight;
      }
    };

    const finish = () => {
      aiChat.classList.remove('loading');
      if (activeCard) activeCard.classList.remove('loading');
      aiInput.disabled = false;
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
      if(json && json.success && json.content){
        // Replace editor content but preserve intent
        editor.textContent = json.content;
        updateCount();
        appendMsg('Contenu amélioré et appliqué au post.', 'ai');
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
      const form = new FormData(); form.append('content', content);
      const res = await fetch('/create', {method:'POST', body: form});
      const json = await res.json();
      if(json && json.success){ alert('Contenu préparé. Aller à partager.'); window.location.href='/share'; }
      else alert('Erreur publication: ' + (json && json.error ? json.error : 'inconnue'));
    }catch(e){ alert('Erreur réseau lors de la publication'); }
  });

})();
