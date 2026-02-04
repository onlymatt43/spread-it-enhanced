<?php
/*
Plugin Name: Spread It
Description: Front post form + Social share + Deferred AI (WP‑Cron).
Version: 1.4.0
Author: Your Name
Author URI: https://yourwebsite.com
License: GPL v2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: spread-it
Domain Path: /languages
*/

if (!defined('ABSPATH')) exit;

// Charge les modules tracking/analytics si présents
if (file_exists(__DIR__ . '/spread-it-tracking.php')) require_once __DIR__ . '/spread-it-tracking.php';
if (file_exists(__DIR__ . '/spread-it-analytics.php')) require_once __DIR__ . '/spread-it-analytics.php';

class Spread_It_Plugin {
    const OPT_GROUP = 'spread_it_group';
    const OPT_KEY   = 'spread_it_options';
    const META_AI   = '_spread_it_ai_json';
    const EVENT_AI_JOB = 'spread_it_ai_job';

    public function __construct() {
        /* Admin */
        add_action('admin_menu',  [$this,'add_settings_page']);
        add_action('admin_init',  [$this,'register_settings']);

        /* Front + commun */
        add_action('init',        [$this,'register_rewrites']);
        add_filter('query_vars',  [$this,'register_query_vars']);
        add_action('template_redirect', [$this,'handle_redirect_tracker']);
        add_action('wp_head', [$this,'output_og_cards'], 5);
        add_action('wp_ajax_spreadit_track_share',        [$this,'ajax_track_share']);
        add_action('wp_ajax_nopriv_spreadit_track_share', [$this,'ajax_track_share']);

        add_shortcode('spread-it-site',   [$this,'shortcode_site_form']);
        add_shortcode('spread-it-social', [$this,'shortcode_social']);

        add_action('wp_enqueue_scripts',  [$this,'enqueue_assets']);
        // Note: front-page composer injection disabled — composer served from standalone app
        // add_action('wp_footer',  [$this,'maybe_render_frontpage_composer']);

        /* Cron handler */
        add_action(self::EVENT_AI_JOB, [$this,'run_ai_job'], 10, 1);
    }

    /* ================= SETTINGS (ADMIN) ================= */
    public function add_settings_page(){
        add_menu_page(
            'Spread It — Settings', 'Spread It',
            'manage_options', 'spread-it',
            [$this,'settings_page'], 'dashicons-share', 58
        );
        add_submenu_page('spread-it','Settings','Settings','manage_options','spread-it',[$this,'settings_page']);
    }
    public function register_settings(){
        register_setting(self::OPT_GROUP, self::OPT_KEY, [
            'type'=>'array',
            'sanitize_callback'=>function($in){
                return [
                    'openai_api_key' => isset($in['openai_api_key']) ? trim($in['openai_api_key']) : '',
                    'openai_model'   => isset($in['openai_model']) ? sanitize_text_field($in['openai_model']) : 'gpt-4o-mini',
                'composer_base_url' => isset($in['composer_base_url']) ? trim($in['composer_base_url']) : '',
                    'auto_apply'     => empty($in['auto_apply']) ? 0 : 1,
                    'tone'           => sanitize_text_field($in['tone'] ?? 'sexy-bold-confident'),
                    'language_mode'  => sanitize_text_field($in['language_mode'] ?? 'en_fr_mix'),
                    'fr_percent'     => max(0, min(100, intval($in['fr_percent'] ?? 10))),
                    'max_hashtags'   => max(0, min(12, intval($in['max_hashtags'] ?? 6))),
                    'max_emojis'     => max(0, min(6,  intval($in['max_emojis'] ?? 2))),
                    'banned_words'   => trim($in['banned_words'] ?? ''),
                    'brand_terms'    => trim($in['brand_terms'] ?? 'YourBrand, YourCompany'),
                ];
            },
            'default'=>[
                'openai_api_key' => '',
                'openai_model'   => 'gpt-4o-mini',
                // Default composer host (Render) so front-page composer uses hosted assets by default
                'composer_base_url' => 'https://spread-it-enhanced.onrender.com',
                'auto_apply'     => 0,
                'tone'           => 'sexy-bold-confident',
                'language_mode'  => 'en_fr_mix',
                'fr_percent'     => 10,
                'max_hashtags'   => 6,
                'max_emojis'     => 2,
                'banned_words'   => '',
                'brand_terms'    => 'YourBrand, YourCompany',
            ]
        ]);
    }
    public function settings_page(){
        if (!current_user_can('manage_options')) return;
        $opt = get_option(self::OPT_KEY, []);
        ?>
        <div class="wrap">
          <h1>Spread It — Settings</h1>
          <form method="post" action="options.php">
            <?php settings_fields(self::OPT_GROUP); ?>
            <table class="form-table" role="presentation">
              <tr>
                <th><label for="openai_api_key">OpenAI API Key</label></th>
                <td>
                  <input type="password" id="openai_api_key" name="<?php echo esc_attr(self::OPT_KEY); ?>[openai_api_key]" class="regular-text" placeholder="<?php echo !empty($opt['openai_api_key']) ? '••••••••••••••••' : 'sk-...'; ?>" />
                  <?php if (!empty($opt['openai_api_key'])): ?><p class="description" style="color:green;">✓ API Key configurée</p><?php endif; ?>
                </td>
              </tr>
              <tr>
                <th><label for="openai_model">OpenAI Model</label></th>
                <td><input type="text" id="openai_model" name="<?php echo esc_attr(self::OPT_KEY); ?>[openai_model]" class="regular-text" value="<?php echo esc_attr($opt['openai_model'] ?? 'gpt-4o-mini'); ?>" /></td>
              </tr>
              <tr>
                <th>Auto-apply</th>
                <td><label><input type="checkbox" name="<?php echo esc_attr(self::OPT_KEY); ?>[auto_apply]" value="1" <?php checked(!empty($opt['auto_apply'])); ?> /> Overwrite title/meta with AI suggestions</label></td>
              </tr>
              <tr><th colspan="2"><h2 style="margin-top:1rem">AI Policy</h2></th></tr>
              <tr>
                <th><label for="tone">Tone/Style</label></th>
                <td><input type="text" id="tone" name="<?php echo esc_attr(self::OPT_KEY); ?>[tone]" class="regular-text" value="<?php echo esc_attr($opt['tone'] ?? 'sexy-bold-confident'); ?>" /></td>
              </tr>
              <tr>
                <th><label for="language_mode">Language</label></th>
                <td>
                  <select id="language_mode" name="<?php echo esc_attr(self::OPT_KEY); ?>[language_mode]">
                    <option value="en" <?php selected(($opt['language_mode'] ?? 'en_fr_mix'),'en'); ?>>English</option>
                    <option value="fr" <?php selected(($opt['language_mode'] ?? 'en_fr_mix'),'fr'); ?>>Français</option>
                    <option value="en_fr_mix" <?php selected(($opt['language_mode'] ?? 'en_fr_mix'),'en_fr_mix'); ?>>English + un peu de français</option>
                  </select>
                  <span style="margin-left:8px">FR% <input type="number" min="0" max="100" step="1" style="width:80px" name="<?php echo esc_attr(self::OPT_KEY); ?>[fr_percent]" value="<?php echo esc_attr($opt['fr_percent'] ?? 10); ?>"></span>
                </td>
              </tr>
              <tr>
                <th><label for="max_hashtags">Max Hashtags</label></th>
                <td><input type="number" id="max_hashtags" name="<?php echo esc_attr(self::OPT_KEY); ?>[max_hashtags]" min="0" max="12" value="<?php echo esc_attr($opt['max_hashtags'] ?? 6); ?>" /></td>
              </tr>
              <tr>
                <th><label for="max_emojis">Max Emojis</label></th>
                <td><input type="number" id="max_emojis" name="<?php echo esc_attr(self::OPT_KEY); ?>[max_emojis]" min="0" max="6" value="<?php echo esc_attr($opt['max_emojis'] ?? 2); ?>" /></td>
              </tr>
              <tr>
                <th><label for="banned_words">Banned words/hashtags</label></th>
                <td><textarea id="banned_words" name="<?php echo esc_attr(self::OPT_KEY); ?>[banned_words]" class="large-text" rows="3"><?php echo esc_textarea($opt['banned_words'] ?? ''); ?></textarea></td>
              </tr>
              <tr>
                <th><label for="brand_terms">Brand terms (prefer)</label></th>
                <td><textarea id="brand_terms" name="<?php echo esc_attr(self::OPT_KEY); ?>[brand_terms]" class="large-text" rows="2"><?php echo esc_textarea($opt['brand_terms'] ?? 'YourBrand, YourCompany'); ?></textarea></td>
              </tr>
            </table>
            <?php submit_button(); ?>
          </form>
          <p><em>Tip:</em> après activation des réécritures, va dans <strong>Settings → Permalinks → Save</strong>.</p>
        </div>
        <?php
    }

    /* ================= ASSETS ================= */
    public function enqueue_assets(){
        wp_enqueue_script('jquery');

        // CSS minimal et neutre (suit le thème)
        $css = '.spreadit-wrap{margin:1rem 0;font:inherit}'
             . '.spreadit-title{margin:0 0 .4rem 0;font-weight:600;letter-spacing:.04em}'
             . '.social-buttons{display:flex;flex-wrap:wrap;gap:.5rem}'
             . '.social-buttons .btn{display:inline-flex;align-items:center;justify-content:center;padding:.5rem .75rem;border-radius:.5rem;border:1px solid rgba(0,0,0,.12);text-decoration:none;color:inherit;background:#fff}'
             . '.social-buttons .btn:hover{background:rgba(0,0,0,.04)}'
             . '.spreadit-meta{margin-top:.75rem}'
             . '.spreadit-copy{display:flex;gap:.5rem;margin:.25rem 0}'
             . '.spreadit-copy input{flex:1;padding:.5rem;border:1px solid rgba(0,0,0,.15);border-radius:.375rem;background:#fff}'
             . '.spreadit-copy-btn{padding:.5rem .75rem;border:1px solid rgba(0,0,0,.15);border-radius:.375rem;background:#fff;cursor:pointer}'
             . '@media (prefers-color-scheme: dark){'
             . '.social-buttons .btn{border-color:rgba(255,255,255,.18);background:#111;color:#eee}'
             . '.social-buttons .btn:hover{background:#1a1a1a}'
             . '.spreadit-copy input,.spreadit-copy-btn{border-color:rgba(255,255,255,.18);background:#111;color:#eee}'
             . '}';
        wp_register_style('spread-it-inline', false);
        wp_enqueue_style('spread-it-inline');
        wp_add_inline_style('spread-it-inline', $css);

        // Copy-to-clipboard + tracking clics
        $copyJS = "(function(){
          document.addEventListener('click',function(e){
            var b=e.target.closest('.spreadit-copy-btn');
            if(b){var i=b.previousElementSibling;if(i&&i.select){i.select();document.execCommand('copy');}
              b.textContent='Copied';setTimeout(function(){b.textContent='Copy';},1200);}
          });
        })();";
        wp_add_inline_script('jquery', $copyJS);

        wp_register_script('spread-it-share', false, ['jquery'], null, true);
        wp_enqueue_script('spread-it-share');
        wp_localize_script('spread-it-share', 'spreadIt', [
            'ajax'  => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('spreadit'),
        ]);
        // Video overlay script: inject mini Spread It buttons on video elements
        wp_register_script('spread-it-video', false, [], null, true);
        wp_enqueue_script('spread-it-video');
        $video_js = @file_get_contents(__DIR__ . '/public/js/video-overlay.js') ?: '';
        // Provide composer_base to the client script
        $composer_base = esc_url_raw(trim((get_option(self::OPT_KEY, [])['composer_base_url'] ?? '')));
        $init = "window.SpreadIt = window.SpreadIt || {}; window.SpreadIt.composerBase = '".esc_js($composer_base)."';";
        wp_add_inline_script('spread-it-video', $init . "\n" . $video_js);
        $trackJS = <<<JS
(function(){
  function ping(net,pid){
    try{
      var d=new URLSearchParams({action:'spreadit_track_share',network:net,post_id:pid,nonce:spreadIt.nonce});
      if(navigator.sendBeacon){navigator.sendBeacon(spreadIt.ajax,d);}
      else {jQuery.post(spreadIt.ajax,Object.fromEntries(d));}
    }catch(_){}
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a.spreadit-share'); if(!a) return;
    ping(a.dataset.net,a.dataset.pid);
  },true);
})();
JS;
        wp_add_inline_script('spread-it-share', $trackJS);

        // Player vidéo WP (pour <video> généré)
        wp_enqueue_style('wp-mediaelement');
        wp_enqueue_script('wp-mediaelement');
    }

    /* ================ FRONT PAGE COMPOSER ================ */
    public function maybe_render_frontpage_composer(){
      // Disabled: keep composer logic only in standalone app.
      return;
      if (is_admin()) return;
        // Render on front page or posts index (some WP sites use the blog index as the homepage)
        if (!is_front_page() && !is_home()) return;

      // Allow hosting composer assets externally (Vercel). Configure via plugin option 'composer_base_url'.
      $opt = get_option(self::OPT_KEY, []);
      $composer_base = trim($opt['composer_base_url'] ?? '');
      ob_start();
      // If configured, reference external CSS; otherwise inline local CSS as fallback.
      if ($composer_base) {
        $composer_base = rtrim($composer_base, '/');
        // Check remotely if composer.css exists (avoid injecting 404 links)
        $head = wp_remote_head($composer_base . '/css/composer.css', ['timeout'=>3]);
        $code = is_array($head) ? wp_remote_retrieve_response_code($head) : 0;
        if ($code >= 200 && $code < 400) {
          echo '<link rel="stylesheet" href="' . esc_url($composer_base . '/css/composer.css') . '">';
        } else {
          // remote asset missing -> fallback to local inline
          $composer_base = ''; // clear to indicate fallback
          echo '<style>' . (@file_get_contents(__DIR__ . '/../spread-it-standalone/public/css/composer.css') ?: '') . '</style>';
        }
      } else {
        echo '<style>' . (@file_get_contents(__DIR__ . '/../spread-it-standalone/public/css/composer.css') ?: '') . '</style>';
      }
      ?>

      <div id="spreaditComposerWrapper" class="composer-dark" style="display:none;position:fixed;inset:0;z-index:9999">
        <div class="composer-backdrop"></div>

        <header class="composer-topbar">
          <div class="brand">Spread It — Composer</div>
          <div class="top-actions">
            <button id="toggleChat" class="btn-small">Chat AI</button>
            <a href="/create" class="btn-small muted">Ancien UI</a>
          </div>
        </header>

        <main class="composer-stage">
          <div class="cards-stack" id="cardsStack">
            <div class="post-card underside card-4"></div>
            <div class="post-card underside card-3"></div>
            <div class="post-card underside card-2"></div>
            <div class="post-card top-card card-1" id="activeCard">
              <div class="card-header">
                <div class="platforms">
                  <span class="badge p facebook">Facebook</span>
                  <span class="badge p twitter">Twitter</span>
                  <span class="badge p instagram">Instagram</span>
                  <span class="badge p linkedin">LinkedIn</span>
                </div>
                <div class="card-actions">
                  <button id="aiPolish" class="btn-accent">Améliorer (respecter le contenu)</button>
                  <button id="switchToChat" class="btn-ghost">Écrire en chat</button>
                </div>
              </div>

              <div class="card-body">
                <div id="postEditor" class="editor" contenteditable="true" data-placeholder="Écrivez votre post ici — l'IA corrigera la grammaire et respectera votre contenu."></div>
              </div>

              <div class="card-footer">
                <div class="meta-left">Draft • <span id="charCount">0</span> caractères</div>
                <div class="meta-right">
                  <button id="previewBtn" class="btn-outline">Aperçu</button>
                  <button id="publishBtn" class="btn-primary">Publier</button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside class="ai-chat" id="aiChat">
          <div class="ai-header">
            <strong>Assistant AI</strong>
            <button id="closeChat" class="close">✕</button>
          </div>
          <div class="ai-messages" id="aiMessages" aria-live="polite"></div>
          <form id="aiForm" class="ai-form">
            <input type="text" id="aiInput" placeholder="Demandez: 'Crée un thread inspirant sur IA'" autocomplete="off">
            <button type="submit" class="btn-send">Envoyer</button>
          </form>
        </aside>

        <button class="spreadit-open-btn" id="spreaditFloatingOpen" style="position:fixed;right:1rem;bottom:1rem;padding:.75rem 1rem;border-radius:999px;background:#ff5a5f;color:#fff;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.2);border:0;cursor:pointer">Spread It</button>
        <button aria-label="Close" id="spreaditClose" style="position:fixed;right:1rem;bottom:4.5rem;padding:.5rem;border-radius:8px;background:transparent;color:inherit;z-index:10000;border:0;cursor:pointer;font-weight:600">✕</button>

      <?php
      // Load composer JS externally if configured, otherwise inline the local file.
      if ($composer_base) {
        echo '<script src="' . esc_url($composer_base . '/js/composer.js') . '"></script>';
        // small helper to control show/hide (external script handles UI internals)
        echo "<script>(function(){var wrapper=document.getElementById('spreaditComposerWrapper');var openBtn=document.getElementById('spreaditFloatingOpen');var closeBtn=document.getElementById('spreaditClose');function open(){if(wrapper){wrapper.style.display='block';document.body.style.overflow='hidden';}}function close(){if(wrapper){wrapper.style.display='none';document.body.style.overflow='';}}openBtn&&openBtn.addEventListener('click',open);closeBtn&&closeBtn.addEventListener('click',close);window.SpreadIt=window.SpreadIt||{};window.SpreadIt.showComposer=open;window.SpreadIt.hideComposer=close;})();</script>";
      } else {
        echo '<script>' . (@file_get_contents(__DIR__ . '/../spread-it-standalone/public/js/composer.js') ?: '') . '</script>';
        echo "<script>(function(){var wrapper=document.getElementById('spreaditComposerWrapper');var openBtn=document.getElementById('spreaditFloatingOpen');var closeBtn=document.getElementById('spreaditClose');function open(){if(wrapper){wrapper.style.display='block';document.body.style.overflow='hidden';}}function close(){if(wrapper){wrapper.style.display='none';document.body.style.overflow='';}}openBtn&&openBtn.addEventListener('click',open);closeBtn&&closeBtn.addEventListener('click',close);window.SpreadIt=window.SpreadIt||{};window.SpreadIt.showComposer=open;window.SpreadIt.hideComposer=close;})();</script>";
      }

      echo ob_get_clean();
    }

    /* ================= OG / TWITTER CARDS ================= */
    public function output_og_cards(){
        if (!is_singular('post')) return;

        $post_id = get_the_ID();
        $title   = wp_strip_all_tags(get_the_title($post_id));
        $perma   = get_permalink($post_id);

        // Description = excerpt propre (fallback: tronqué du contenu)
        $desc = get_the_excerpt($post_id);
        if (!$desc) {
            $desc = wp_trim_words( wp_strip_all_tags( get_post_field('post_content', $post_id) ), 40, '…' );
        }
        $desc = wp_strip_all_tags($desc);

        // Image OG = miniature du post si dispo, sinon première image du contenu (optionnel), sinon rien
        $img = '';
        $thumb_id = get_post_thumbnail_id($post_id);
        if ($thumb_id) {
            $img = wp_get_attachment_image_url($thumb_id, 'full');
        }
        // (Optionnel) si tu veux tenter de choper une image dans le contenu :
        // if (!$img && preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', get_post_field('post_content',$post_id), $m)) { $img = $m[1]; }

        // Sortie des meta (on évite de doubler si un SEO plugin veut les gérer)
        if (!apply_filters('spread_it_output_og', true)) return;

        echo "\n<!-- Spread It: OG/Twitter -->\n";
        echo '<meta property="og:url" content="'.esc_url($perma).'" />'."\n";
        echo '<meta property="og:type" content="article" />'."\n";
        echo '<meta property="og:title" content="'.esc_attr($title).'" />'."\n";
        echo '<meta property="og:description" content="'.esc_attr($desc).'" />'."\n";
        if ($img) {
            echo '<meta property="og:image" content="'.esc_url($img).'" />'."\n";
        }

        echo '<meta name="twitter:card" content="'.($img ? 'summary_large_image' : 'summary').'" />'."\n";
        echo '<meta name="twitter:title" content="'.esc_attr($title).'" />'."\n";
        echo '<meta name="twitter:description" content="'.esc_attr($desc).'" />'."\n";
        if ($img) {
            echo '<meta name="twitter:image" content="'.esc_url($img).'" />'."\n";
        }
        echo "<!-- /Spread It -->\n";
    }

    /* ================= REWRITES & TRACKER ================= */
    public function register_rewrites(){
        add_rewrite_rule('^spread-go/([0-9]+)/([a-zA-Z0-9_-]+)/?$', 'index.php?spread_post=$matches[1]&spread_net=$matches[2]', 'top');
    }
    public function register_query_vars($vars){
        $vars[]='spread_post'; $vars[]='spread_net'; return $vars;
    }
    public function handle_redirect_tracker(){
        $pid = get_query_var('spread_post');
        $net = get_query_var('spread_net');
        if (!$pid || !$net) return;
        $pid = intval($pid); $net = sanitize_key($net);
        $k = '_spread_clicks_'.$net;
        $c = (int)get_post_meta($pid, $k, true);
        update_post_meta($pid, $k, $c+1);
        wp_safe_redirect(get_permalink($pid));
        exit;
    }
    private function tracked_url($post_id, $network){
        return home_url('spread-go/'.intval($post_id).'/'.sanitize_key($network).'/');
    }

    /* ================= HELPER: BEST CAPTION ================= */
    private function best_caption($ai, $net, $fallback){
        $net = strtolower($net);
        if (is_array($ai) && !empty($ai['captions']) && is_array($ai['captions'])) {
            // alias courants
            $map = [
                'x'         => ['x','twitter'],
                'whatsapp'  => ['whatsapp','wa'],
                'telegram'  => ['telegram','tg'],
                'reddit'    => ['reddit'],
                'email'     => ['email','mail'],
                'linkedin'  => ['linkedin','li'],
                'facebook'  => ['facebook','fb'],
            ];
            if (!empty($map[$net])) {
                foreach ($map[$net] as $key){
                    if (!empty($ai['captions'][$key])) {
                        return wp_strip_all_tags($ai['captions'][$key]);
                    }
                }
            }
        }
        return wp_strip_all_tags($fallback);
    }

    /* ================= SHORTCODE: SOCIAL ================= */
    public function shortcode_social($atts = []){
        if (!is_singular()) return '';
        $post_id = get_the_ID();
        $title   = get_the_title($post_id);
        $encoded = rawurlencode($title);
        $url     = get_permalink($post_id); // Direct permalink instead of tracked URL

        $nets = array_map('trim', explode(',', ($atts['networks'] ?? 'x,facebook,linkedin,whatsapp,telegram,reddit,email,copy')));
        $links = [];
        
        $ai = json_decode(get_post_meta($post_id, self::META_AI, true) ?: '[]', true);

        foreach ($nets as $n) {
            $k   = strtolower($n);
            $url = $this->tracked_url($post_id, $k);

            // texte par défaut = titre ; on tente une AI caption spécifique au réseau
            $text      = $this->best_caption($ai, $k, $title);
            $enc_text  = rawurlencode($text);
            $enc_url   = rawurlencode($url);
            $encoded_t = rawurlencode($title); // utile pour sujets email, fallback, etc.

            switch ($k) {
                case 'x':
                case 'twitter':
                    // X autorise texte + url
                    $links['X'] = "https://twitter.com/intent/tweet?text={$enc_text}&url={$enc_url}";
                    break;

                case 'whatsapp':
                    // WhatsApp prend tout dans ?text=
                    $links['WhatsApp'] = "https://api.whatsapp.com/send?text={$enc_text}%20{$enc_url}";
                    break;

                case 'telegram':
                    // Telegram sépare url et text
                    $links['Telegram'] = "https://t.me/share/url?url={$enc_url}&text={$enc_text}";
                    break;

                case 'reddit':
                    // Reddit : titre + url
                    $links['Reddit'] = "https://www.reddit.com/submit?url={$enc_url}&title={$enc_text}";
                    break;

                case 'email':
                    // Email : subject = titre, body = caption + url
                    $body = rawurlencode($text."\n\n".$url);
                    $links['Email'] = "mailto:?subject={$encoded_t}&body={$body}";
                    break;

                case 'linkedin':
                    // LinkedIn ne permet pas de préremplir le texte
                    $links['LinkedIn'] = "https://www.linkedin.com/sharing/share-offsite/?url={$enc_url}";
                    break;

                case 'facebook':
                    // Facebook ne permet pas de préremplir le message
                    $links['Facebook'] = "https://www.facebook.com/sharer/sharer.php?u={$enc_url}";
                    break;

                case 'copy':
                    $links['Copy Link']= $url;
                    break;
            }
        }

        ob_start(); ?>
        <div class="spreadit-wrap">
          <h3 class="spreadit-title">SPREAD IT</h3>
          <div class="social-buttons">
            <?php foreach ($links as $label => $href): ?>
              <?php if ($label==='Copy Link'): ?>
                <div class="btn social copy" role="button" aria-label="Copy share link" data-net="copy" data-pid="<?php echo $post_id; ?>">
                  <span class="label">Copy</span>
                  <input type="text" value="<?php echo esc_attr($href); ?>" style="position:absolute;left:-9999px" readonly>
                </div>
              <?php else: $key = strtolower(preg_replace('/\s+/', '', $label)); ?>
                <a target="_blank" rel="noopener nofollow" href="<?php echo esc_url($href); ?>" class="btn social <?php echo esc_attr($key); ?>" data-net="<?php echo esc_attr($key); ?>" data-pid="<?php echo $post_id; ?>">
                  <span class="label"><?php echo esc_html($label); ?></span>
                </a>
              <?php endif; ?>
            <?php endforeach; ?>
          </div>

          <?php
          // --- ADMIN-ONLY: show AI captions only to admins (hidden from public) ---
          if ( current_user_can('manage_options')
               && !empty($ai['captions']) && is_array($ai['captions']) ): ?>
            <div class="spreadit-meta" style="border:1px dashed #ccc;padding:.75rem;margin-top:1rem">
              <h4>AI Captions (admin only)</h4>
              <?php foreach ($ai['captions'] as $net => $cap): ?>
                <div class="spreadit-copy">
                  <input type="text" value="<?php echo esc_attr($cap); ?>" readonly>
                  <button type="button" class="spreadit-copy-btn">Copy</button>
                </div>
              <?php endforeach; ?>
              <p style="font-size:12px;opacity:.7;margin:0">Ce bloc est visible uniquement pour les administrateurs.</p>
            </div>
          <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }

    /* ================= SHORTCODE: SITE FORM ================= */
    public function shortcode_site_form(){
        $out = '';
        $notice = '';

        if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_POST['spreadit_form_nonce']) && wp_verify_nonce($_POST['spreadit_form_nonce'],'spreadit_submit')) {
            $title   = sanitize_text_field($_POST['spreadit_title'] ?? '');
            $content = wp_kses_post($_POST['spreadit_content'] ?? '');
            $feat_url= esc_url_raw($_POST['spreadit_feat_url'] ?? '');
            $video_url = esc_url_raw($_POST['spreadit_video_url'] ?? '');
            $video_embed = wp_kses_post($_POST['spreadit_video_embed'] ?? '');
            $status = 'publish'; // demandé: pas de brouillon

            // créer le post
            $post_id = wp_insert_post([
                'post_title'   => $title ?: '(Untitled)',
                'post_content' => $content,
                'post_status'  => $status,
                'post_type'    => 'post',
            ], true);

            if (is_wp_error($post_id)) {
                $notice = '<div class="spreadit-error">Erreur: '.$post_id->get_error_message().'</div>';
            } else {
                // feature image: upload fichier
                if (!empty($_FILES['spreadit_feat_file']['name'])) {
                    $fid = $this->handle_upload_attachment($_FILES['spreadit_feat_file'], $post_id);
                    if ($fid && !is_wp_error($fid)) set_post_thumbnail($post_id, $fid);
                }
                // feature image: URL distante
                if (!$this->has_thumbnail($post_id) && $feat_url) {
                    $fid = $this->sideload_image($feat_url, $post_id);
                    if ($fid && !is_wp_error($fid)) set_post_thumbnail($post_id, $fid);
                }

                // vidéo: upload fichier
                $video_html = '';
                if (!empty($_FILES['spreadit_video_file']['name'])) {
                    $vid = $this->handle_upload_attachment($_FILES['spreadit_video_file'], $post_id, ['video']);
                    if ($vid && !is_wp_error($vid)) {
                        $src = wp_get_attachment_url($vid);
                        $video_html = wp_video_shortcode(['src'=>$src]);
                    }
                }
                // vidéo: URL directe
                if (!$video_html && $video_url) {
                    $video_html = wp_video_shortcode(['src'=>$video_url]);
                }
                // vidéo: embed
                if (!$video_html && $video_embed) {
                    $video_html = $video_embed;
                }
                if ($video_html) {
                    $append = "\n\n<!-- SpreadIt Video -->\n".$video_html;
                    wp_update_post(['ID'=>$post_id,'post_content'=>$content.$append]);
                }

                // Déclencher AI en différé (pas d’appel direct)
                $this->schedule_ai_job($post_id);

                $perma = get_permalink($post_id);
                $notice = '<div class="spreadit-ok">✅ Publié. <a href="'.esc_url($perma).'">Voir le post</a></div>';
            }
        }

        ob_start(); ?>
        <div class="spreadit-wrap">
          <?php echo $notice; ?>
          <form class="spreadit-form" method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('spreadit_submit','spreadit_form_nonce'); ?>
            <div>
              <label>Titre</label>
              <input type="text" name="spreadit_title" required>
            </div>
            <div>
              <label>Contenu</label>
              <textarea name="spreadit_content" rows="6" required></textarea>
            </div>

            <div class="row">
              <div>
                <label>Feature image (upload)</label>
                <input type="file" name="spreadit_feat_file" accept="image/*">
              </div>
              <div>
                <label>Feature image (URL)</label>
                <input type="url" name="spreadit_feat_url" placeholder="https://...jpg">
              </div>
            </div>

            <div class="row">
              <div>
                <label>Vidéo (upload)</label>
                <input type="file" name="spreadit_video_file" accept="video/*">
              </div>
              <div>
                <label>Vidéo (URL directe)</label>
                <input type="url" name="spreadit_video_url" placeholder="https://...mp4">
              </div>
            </div>
            <div>
              <label>Vidéo (embed code)</label>
              <input type="text" name="spreadit_video_embed" placeholder='<iframe ...>'>
            </div>

            <div>
              <button type="submit">Create + queue AI</button>
            </div>
          </form>
        </div>
        <?php
        $out .= ob_get_clean();
        return $out;
    }

    private function has_thumbnail($post_id){
        return (bool)get_post_thumbnail_id($post_id);
    }
    private function handle_upload_attachment($file_arr, $post_id, $allow_types = ['image','video']){
        if (empty($file_arr['name'])) return 0;
        require_once ABSPATH.'wp-admin/includes/file.php';
        require_once ABSPATH.'wp-admin/includes/media.php';
        require_once ABSPATH.'wp-admin/includes/image.php';
        $overrides = ['test_form'=>false];
        $movefile = wp_handle_upload($file_arr, $overrides);
        if (!empty($movefile['error'])) return new WP_Error('upload_error',$movefile['error']);

        $filetype = wp_check_filetype($movefile['file']);
        $mime = $filetype['type'] ?? '';
        $ok = false;
        foreach ($allow_types as $t) {
            if (strpos($mime, $t.'/') === 0) { $ok = true; break; }
        }
        if (!$ok) return new WP_Error('mime_error','Type de fichier non supporté');

        $attachment = [
            'post_mime_type' => $mime,
            'post_title'     => sanitize_file_name(basename($movefile['file'])),
            'post_content'   => '',
            'post_status'    => 'inherit'
        ];
        $attach_id = wp_insert_attachment($attachment, $movefile['file'], $post_id);
        if (is_wp_error($attach_id)) return $attach_id;
        $attach_data = wp_generate_attachment_metadata($attach_id, $movefile['file']);
        wp_update_attachment_metadata($attach_id, $attach_data);
        return $attach_id;
    }
    private function sideload_image($url, $post_id){
        if (!$url) return 0;
        require_once ABSPATH.'wp-admin/includes/media.php';
        require_once ABSPATH.'wp-admin/includes/file.php';
        require_once ABSPATH.'wp-admin/includes/image.php';
        $tmp = media_sideload_image($url, $post_id, null, 'id');
        return (is_wp_error($tmp)) ? 0 : intval($tmp);
    }

    /* ================= AI: DIFFÉRÉ ================= */
    public function schedule_ai_job($post_id){
        $post_id = intval($post_id);
        if ($post_id <= 0) return;
        if (!wp_next_scheduled(self::EVENT_AI_JOB, [$post_id])) {
            wp_schedule_single_event(time()+10, self::EVENT_AI_JOB, [$post_id]);
        }
    }
    public function run_ai_job($post_id){
        $post_id = intval($post_id);
        if ($post_id <= 0) return;

        $opt = get_option(self::OPT_KEY, []);
        $ai  = $this->analyze_with_openai($post_id); // [] si pas config/erreur
        if (!is_array($ai) || empty($ai)) return;

        update_post_meta($post_id, self::META_AI, wp_json_encode($ai));

        if (!empty($opt['auto_apply'])) {
            $upd = ['ID' => $post_id];
            if (!empty($ai['seo_title']))       $upd['post_title']   = wp_strip_all_tags($ai['seo_title']);
            if (!empty($ai['seo_description'])) $upd['post_excerpt'] = wp_strip_all_tags($ai['seo_description']);
            wp_update_post($upd);

            if (!empty($ai['tags']) && is_array($ai['tags'])) {
                wp_set_post_tags($post_id, array_map('sanitize_text_field', $ai['tags']), true);
            }
            if (!empty($ai['categories']) && is_array($ai['categories'])) {
                $term_ids = [];
                foreach ($ai['categories'] as $cat) {
                    $t = term_exists($cat, 'category');
                    if (!$t) { $t = wp_insert_term($cat, 'category'); }
                    if (!is_wp_error($t) && !empty($t['term_id'])) $term_ids[] = intval($t['term_id']);
                }
                if ($term_ids) wp_set_post_categories($post_id, $term_ids, true);
            }
        }
    }
    public function analyze_with_openai($post_id){
        $opt = get_option(self::OPT_KEY, []);
        $api = $opt['openai_api_key'] ?? '';
        $model = $opt['openai_model'] ?? 'gpt-4o-mini';
        if (!$api) return [];

        $post = get_post($post_id);
        if (!$post) return [];

        $policy = [
            'tone'          => $opt['tone'] ?? 'sexy-bold-confident',
            'language_mode' => $opt['language_mode'] ?? 'en_fr_mix',
            'fr_percent'    => (int)($opt['fr_percent'] ?? 10),
            'max_hashtags'  => (int)($opt['max_hashtags'] ?? 6),
            'max_emojis'    => (int)($opt['max_emojis'] ?? 2),
            'banned_words'  => $opt['banned_words'] ?? '',
            'brand_terms'   => $opt['brand_terms'] ?? '',
        ];
        $signals = [
            'clicks'=>[
                'facebook'=>(int)get_post_meta($post_id,'_spread_clicks_facebook',true),
                'x'       =>(int)get_post_meta($post_id,'_spread_clicks_x',true),
                'linkedin'=>(int)get_post_meta($post_id,'_spread_clicks_linkedin',true),
                'whatsapp'=>(int)get_post_meta($post_id,'_spread_clicks_whatsapp',true),
            ]
        ];
        $schema = '{ "seo_title": "string", "seo_description": "string", "tags": ["string"], "categories": ["string"], "alt_titles": ["string","string","string"], "captions": {"x": "string","instagram": "string","tiktok": "string","youtube":"string"} }';
        $content_text = wp_strip_all_tags($post->post_title."\n\n".$post->post_content);

        $sys = "You are a copy + SEO assistant for your client. "
             . "tone={$policy['tone']}; language={$policy['language_mode']}(FR%={$policy['fr_percent']}); "
             . "max_hashtags={$policy['max_hashtags']}; max_emojis={$policy['max_emojis']}; "
             . "banned_words={$policy['banned_words']}; prefer_terms={$policy['brand_terms']}; "
             . "engagement_signals=".json_encode($signals, JSON_UNESCAPED_SLASHES)
             . ". Output STRICT JSON only.";

        $req = [
            'model'=>$model,
            'messages'=>[
                ['role'=>'system','content'=>$sys],
                ['role'=>'user','content'=>"SCHEMA:\n{$schema}\n\nReturn only JSON for this post content:\n{$content_text}"]
            ],
            'temperature'=>0.6,
            'response_format'=>['type'=>'json_object']
        ];

        $res = wp_remote_post('https://api.openai.com/v1/chat/completions', [
            'timeout'=>45,
            'headers'=>[
                'Authorization'=>'Bearer '.$api,
                'Content-Type'=>'application/json',
                'User-Agent'=>'WordPress/'.get_bloginfo('version').' +SpreadIt'
            ],
            'body'=>wp_json_encode($req),
        ]);

        if (is_wp_error($res)) return [];
        $code = wp_remote_retrieve_response_code($res);
        if ($code < 200 || $code >= 300) return [];
        $body = wp_remote_retrieve_body($res);
        $data = json_decode($body, true);
        $json = [];
        if (!empty($data['choices'][0]['message']['content'])) {
            $json = json_decode($data['choices'][0]['message']['content'], true);
            if (!is_array($json)) $json = [];
        }
        return $json;
    }

    /* ================= AJAX: Track Share ================= */
    public function ajax_track_share() {
        // Check nonce
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'spreadit_track')) {
            wp_die('Invalid nonce', 'Security Error', 403);
        }

        $post_id = (int)($_POST['post_id'] ?? 0);
        $network = sanitize_key($_POST['network'] ?? '');
        
        if ($post_id && $network) {
            // Increment the click counter
            $key = "_spread_clicks_{$network}";
            $current = (int)get_post_meta($post_id, $key, true);
            update_post_meta($post_id, $key, $current + 1);
            
            wp_send_json_success(['clicks' => $current + 1]);
        } else {
            wp_send_json_error(['message' => 'Invalid parameters']);
        }
    }

    /* ================= OUTPUT: Open Graph Tags ================= */
    public function output_og_tags() {
        if (!is_singular()) return;
        
        global $post;
        $title = get_the_title();
        $description = get_the_excerpt() ?: wp_trim_words(wp_strip_all_tags($post->post_content), 20);
        $url = get_permalink();
        $image = get_the_post_thumbnail_url($post->ID, 'large');
        $site_name = get_bloginfo('name');
        
        echo "\n<!-- Spread It Social Meta Tags -->\n";
        echo '<meta property="og:title" content="' . esc_attr($title) . '">' . "\n";
        echo '<meta property="og:description" content="' . esc_attr($description) . '">' . "\n";
        echo '<meta property="og:url" content="' . esc_url($url) . '">' . "\n";
        echo '<meta property="og:site_name" content="' . esc_attr($site_name) . '">' . "\n";
        echo '<meta property="og:type" content="article">' . "\n";
        
        if ($image) {
            echo '<meta property="og:image" content="' . esc_url($image) . '">' . "\n";
        }
        
        // Twitter Cards
        echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
        echo '<meta name="twitter:title" content="' . esc_attr($title) . '">' . "\n";
        echo '<meta name="twitter:description" content="' . esc_attr($description) . '">' . "\n";
        if ($image) {
            echo '<meta name="twitter:image" content="' . esc_url($image) . '">' . "\n";
        }
        echo "<!-- /Spread It Social Meta Tags -->\n\n";
    }
}

/* ================= Loader & Hooks ================= */
add_action('plugins_loaded', function(){
    $GLOBALS['spread_it_plugin'] = new Spread_It_Plugin();
});

register_activation_hook(__FILE__, function(){
    // Activation du tracking si présent
    if (class_exists('Spread_It_Tracking')) {
        Spread_It_Tracking::activate();
    }
    // Nettoyage: s'il reste un ancien cron, on l'efface
    wp_clear_scheduled_hook('spread_it_pull_metrics');
    flush_rewrite_rules(false);
});

register_deactivation_hook(__FILE__, function(){
    wp_clear_scheduled_hook('spread_it_pull_metrics');
    flush_rewrite_rules(false);
});

// Instanciation du plugin
new Spread_It_Plugin();