(function(){
	// Wait for DOM
	function ready(fn){ if(document.readyState!='loading') return fn(); document.addEventListener('DOMContentLoaded',fn); }

	ready(function(){
		var composerBase = (window.spreadIt && window.spreadIt.composerBase) || (window.SpreadIt && window.SpreadIt.composerBase) || '';

		function createStatusPanel(){
			var panel = document.createElement('div');
			panel.id = 'spreadit-status-panel';
			panel.style.position = 'fixed';
			panel.style.left = '12px';
			panel.style.bottom = '12px';
			panel.style.zIndex = 10001;
			panel.style.background = 'rgba(0,0,0,0.6)';
			panel.style.color = '#fff';
			panel.style.padding = '8px 10px';
			panel.style.borderRadius = '8px';
			panel.style.fontSize = '13px';
			panel.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
			panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Spread It status</div><div id="spreadit-status-list"></div>';
			document.body.appendChild(panel);
			return panel;
		}

		function setStatus(key, ok, text){
			var list = document.getElementById('spreadit-status-list') || (createStatusPanel() && document.getElementById('spreadit-status-list'));
			var el = document.getElementById('spreadit-status-'+key);
			if (!el){ el = document.createElement('div'); el.id = 'spreadit-status-'+key; list.appendChild(el); }
			el.innerHTML = (ok? '<span style="color:#6ee7b7">✓</span>' : '<span style="color:#ff7b7b">✕</span>') + ' ' + text;
		}

		function addButtonTo(el, info){
			try{
				var wr = el.parentElement;
				if(!wr) return;
				// ensure wrapper is positioned
				var cs = window.getComputedStyle(wr);
				if (cs.position === 'static') wr.style.position = 'relative';

				// avoid duplicate
				if (wr.querySelector('.spreadit-video-btn')) return;

				var btn = document.createElement('button');
				btn.className = 'spreadit-video-btn';
				btn.title = 'Spread It';
				btn.innerHTML = 'Spread It';
				btn.style.position = 'absolute';
				btn.style.right = '8px';
				btn.style.bottom = '8px';
				btn.style.zIndex = 9999;
				btn.style.padding = '6px 10px';
				btn.style.borderRadius = '999px';
				btn.style.background = 'linear-gradient(90deg,#7b61ff,#00d4ff)';
				btn.style.color = '#021';
				btn.style.border = 'none';
				btn.style.cursor = 'pointer';
				btn.style.fontSize = '12px';
				btn.style.boxShadow = '0 6px 18px rgba(2,6,23,0.2)';

				btn.addEventListener('click', function(e){
					e.preventDefault(); e.stopPropagation();
					openComposer(info);
				});

				wr.appendChild(btn);
			}catch(e){console.warn('spreadit overlay error',e);}
		}

		function openComposer(info){
			var base = (window.SpreadIt && window.SpreadIt.composerBase) || (window.spreadIt && window.spreadIt.composerBase) || '';
			var url = base ? (base + '/?prefill=1') : '/?prefill=1';
			var params = [];
			if (info.videoUrl) params.push('video_url='+encodeURIComponent(info.videoUrl));
			if (info.poster) params.push('poster='+encodeURIComponent(info.poster));
			if (info.width) params.push('width='+encodeURIComponent(info.width));
			if (info.height) params.push('height='+encodeURIComponent(info.height));
			if (info.title) params.push('title='+encodeURIComponent(info.title));
			if (params.length) url += '&' + params.join('&');

			var w = 960, h = 720;
			var left = (screen.width/2)-(w/2); var top = (screen.height/2)-(h/2);
			window.open(url, 'spreadit_composer', 'toolbar=0,location=0,menubar=0,width='+w+',height='+h+',top='+top+',left='+left+',scrollbars=1');
		}

		function extractFromVideo(v){
			var src = v.currentSrc || v.src || (v.querySelector && (v.querySelector('source')? v.querySelector('source').src : ''));
			var poster = v.getAttribute('poster') || '';
			var rect = v.getBoundingClientRect();
			var info = { videoUrl: src, poster: poster, width: Math.round(rect.width), height: Math.round(rect.height), title: document.title };
			return info;
		}

		// find and mark videos/iframes
		var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
		var iframes = Array.prototype.slice.call(document.querySelectorAll('iframe')).filter(function(f){ return /youtube\.com|youtu\.be|vimeo\.com/.test(f.src||''); });

		videos.forEach(function(v){ try{ addButtonTo(v, extractFromVideo(v)); }catch(e){} });
		iframes.forEach(function(f){ try{ addButtonTo(f, { videoUrl: f.src||'', poster:'', width: f.width||f.clientWidth, height: f.height||f.clientHeight, title: document.title }); }catch(e){} });

		// Status checks
		createStatusPanel();
		// Show composer base
		setStatus('host', !!composerBase, composerBase ? ('Composer host: ' + composerBase) : 'Composer host: (local inline)');

		// Check CSS availability (try fetch -> fallback to link presence)
		(function(){
			if (!composerBase) { setStatus('css', true, 'CSS: using inline fallback'); return; }
			var cssUrl = composerBase.replace(/\/$/, '') + '/css/composer.css';
			fetch(cssUrl, {method:'HEAD', mode:'cors'}).then(function(res){
				if (res && res.ok) setStatus('css', true, 'CSS reachable');
				else {
					var link = document.querySelector('link[href^="'+composerBase+'"]');
					setStatus('css', !!link, 'CSS reachable (link present)');
				}
			}).catch(function(){
				var link = document.querySelector('link[href^="'+composerBase+'"]');
				setStatus('css', !!link, link ? 'CSS reachable (link present)' : 'CSS unreachable');
			});
		})();

		// Check JS availability
		(function(){
			if (!composerBase) { setStatus('js', true, 'JS: using inline fallback'); return; }
			var jsUrl = composerBase.replace(/\/$/, '') + '/js/composer.js';
			fetch(jsUrl, {method:'HEAD', mode:'cors'}).then(function(res){
				if (res && res.ok) setStatus('js', true, 'JS reachable');
				else {
					var script = document.querySelector('script[src^="'+composerBase+'"]');
					setStatus('js', !!script, 'JS reachable (script present)');
				}
			}).catch(function(){
				var script = document.querySelector('script[src^="'+composerBase+'"]');
				setStatus('js', !!script, script ? 'JS reachable (script present)' : 'JS unreachable');
			});
		})();

		// Check overlay presence
		setTimeout(function(){
			var count = document.querySelectorAll('.spreadit-video-btn').length;
			setStatus('overlay', count>0, 'Overlay buttons: ' + count);
		}, 400);

	});

})();

