(function(){
	// Wait for DOM
	function ready(fn){ if(document.readyState!='loading') return fn(); document.addEventListener('DOMContentLoaded',fn); }

	ready(function(){
		// Use configured base or default to the Render URL
		var composerBase = (window.SpreadIt && window.SpreadIt.composerBase) || 'https://spread-it-enhanced.onrender.com';

		function createStatusPanel(){
			// Optional: Status panel removed for production to be cleaner
			// Can be re-enabled for debugging
			return null;
		}

		function addButtonTo(el, info){
			try{
				var wr = el.parentElement;
				if(!wr) return;
				
				// Ensure wrapper is relative so absolute button is positioned correctly
				var cs = window.getComputedStyle(wr);
				if (cs.position === 'static') wr.style.position = 'relative';

				// Avoid duplicate
				if (wr.querySelector('.spreadit-video-btn')) return;

				var btn = document.createElement('button');
				btn.className = 'spreadit-video-btn';
				btn.title = 'Spread It';
				btn.innerText = 'Spread It';
				
				// Classic Style - "The one that worked well"
				btn.style.position = 'absolute';
				btn.style.right = '10px';
				btn.style.bottom = '10px';
				btn.style.zIndex = 9999;
				btn.style.padding = '8px 14px';
				btn.style.borderRadius = '20px';
				btn.style.background = 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'; // Indigo to Purple
				btn.style.color = '#ffffff';
				btn.style.border = 'none';
				btn.style.cursor = 'pointer';
				btn.style.fontSize = '13px';
				btn.style.fontWeight = '600';
				btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
				btn.style.transition = 'transform 0.2s, box-shadow 0.2s';
                btn.style.opacity = '0'; // Hidden by default
                
                // Show on hover of parent
                wr.addEventListener('mouseenter', function() {
                    btn.style.opacity = '1';
                    btn.style.transform = 'translateY(0)';
                });
                wr.addEventListener('mouseleave', function() {
                    btn.style.opacity = '0';
                    btn.style.transform = 'translateY(5px)';
                });

				btn.addEventListener('click', function(e){
					e.preventDefault(); 
                    e.stopPropagation();
					openComposer(info);
				});

                btn.addEventListener('mouseenter', function() {
                    btn.style.transform = 'scale(1.05)';
                });
                btn.addEventListener('mouseleave', function() {
                    btn.style.transform = 'scale(1)';
                });

				wr.appendChild(btn);
			}catch(e){console.warn('SpreadIt overlay error:',e);}
		}

		function openComposer(info){
            // Point to the new /composer route (The Chat UI)
			var base = composerBase;
            // Remove trailing slash if present
            if(base.endsWith('/')) base = base.slice(0, -1);

			var url = base + '/composer?prefill=1';
			var params = [];
			if (info.videoUrl) params.push('video_url='+encodeURIComponent(info.videoUrl));
			if (info.poster) params.push('poster='+encodeURIComponent(info.poster));
			if (info.width) params.push('width='+encodeURIComponent(info.width));
			if (info.height) params.push('height='+encodeURIComponent(info.height));
			if (info.title) params.push('title='+encodeURIComponent(info.title));
			if (params.length) url += '&' + params.join('&');

			var w = 500; // Mobile-like generic width for Chat UI
            var h = 800;
			var left = (screen.width/2)-(w/2); 
            var top = (screen.height/2)-(h/2);
			window.open(url, 'spreadit_composer', 'toolbar=0,location=0,menubar=0,width='+w+',height='+h+',top='+top+',left='+left+',scrollbars=1,resizable=1');
		}

		function extractFromVideo(v){
			var src = v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
			var poster = v.getAttribute('poster') || '';
			var rect = v.getBoundingClientRect();
			// Try to find title
            var title = document.title;
            // Try looking for h1/h2 near the video? For now global title is fine.
			var info = { videoUrl: src, poster: poster, width: Math.round(rect.width), height: Math.round(rect.height), title: title };
			return info;
		}

		// Main execution
        function init() {
            var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
            var iframes = Array.prototype.slice.call(document.querySelectorAll('iframe')).filter(function(f){ 
                return /youtube\.com|youtu\.be|vimeo\.com/.test(f.src||''); 
            });

            videos.forEach(function(v){ try{ addButtonTo(v, extractFromVideo(v)); }catch(e){} });
            iframes.forEach(function(f){ try{ addButtonTo(f, { videoUrl: f.src||'', poster:'', width: f.width||f.clientWidth, height: f.height||f.clientHeight, title: document.title }); }catch(e){} });
        }
        
        init();
        
        // Re-run periodically for dynamic content (Single Page Apps)
        setInterval(init, 2000);

	});
})();
