<?php
/*
Plugin Name: Spread It Integration
Description: Intègre le service Spread It standalone pour créer du contenu IA et le partager sur les réseaux sociaux
Version: 1.0.0
Author: OM43
*/

// Sécurité
if (!defined('ABSPATH')) {
    exit;
}

// Classe principale
class Spread_It_Integration {

    private $api_url;
    private $api_key;

    public function __construct() {
        $this->api_url = get_option('spread_it_api_url', '');
        $this->api_key = get_option('spread_it_api_key', '');

        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('add_meta_boxes', array($this, 'add_meta_box'));
        add_action('wp_ajax_spread_it_create', array($this, 'ajax_create_content'));
        add_action('wp_ajax_spread_it_share', array($this, 'ajax_share_content'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
        // OAuth callback
        add_action('admin_post_spread_it_oauth_callback', array($this, 'oauth_callback'));
        add_action('admin_post_spread_it_disconnect', array($this, 'oauth_disconnect'));
    }

    // Menu admin
    public function add_admin_menu() {
        add_menu_page(
            'Spread It Integration',
            'Spread It',
            'manage_options',
            'spread-it-integration',
            array($this, 'admin_page'),
            'dashicons-share-alt',
            30
        );
    }

    // Page d'administration
    public function admin_page() {
        // Show OAuth status messages
        $status = isset($_GET['spread_it_oauth_status']) ? sanitize_text_field($_GET['spread_it_oauth_status']) : '';
        ?>
        <div class="wrap">
            <h1>Spread It Integration</h1>
            <?php if ($status): ?>
                <?php if ($status === 'connected'): ?>
                    <div class="updated notice"><p>✅ Connexion réussie.</p></div>
                <?php elseif ($status === 'disconnected'): ?>
                    <div class="updated notice"><p>✅ Compte déconnecté.</p></div>
                <?php else: ?>
                    <div class="error notice"><p>⚠️ Statut OAuth: <?php echo esc_html($status); ?></p></div>
                <?php endif; ?>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php
                settings_fields('spread_it_integration_settings');
                do_settings_sections('spread_it_integration_settings');
                submit_button();
                ?>
            </form>

            <hr>
            <h2>Connexion aux réseaux (OAuth)</h2>
            <p>Connectez vos comptes Facebook / Instagram pour permettre les publications directement depuis Spread It.</p>
            <?php
            $fb_app_id = get_option('spread_it_facebook_app_id', '');
            $fb_page_id = get_option('spread_it_facebook_page_id', '');
            $fb_token = get_option('spread_it_facebook_access_token', '');
            $callback = admin_url('admin-post.php?action=spread_it_oauth_callback&provider=facebook');
            $state = wp_create_nonce('spread_it_oauth_state');
            if ($fb_app_id) {
                $auth_url = 'https://www.facebook.com/v16.0/dialog/oauth?client_id=' . urlencode($fb_app_id) . '&redirect_uri=' . urlencode($callback) . '&state=' . urlencode($state) . '&scope=pages_manage_posts,pages_read_engagement,instagram_basic,pages_show_list';
                echo '<p><strong>Facebook / Instagram</strong></p>';
                if (!empty($fb_token)) {
                    echo '<p style="color:green;">✓ Compte connecté (Page ID: ' . esc_html($fb_page_id) . ')</p>';
                    echo '<p><a class="button" href="' . esc_url(add_query_arg(array('action'=>'spread_it_disconnect','provider'=>'facebook'), admin_url('admin-post.php'))) . '">Déconnecter</a></p>';
                } else {
                    echo '<p><a class="button button-primary" href="' . esc_url($auth_url) . '" target="_blank">Connecter Facebook / Instagram</a></p>';
                }
            } else {
                echo '<p class="description">Définissez d\'abord le <strong>Facebook App ID</strong> et le <strong>Facebook App Secret</strong> puis enregistrez pour activer OAuth.</p>';
            }
            ?>

            <hr>

            <h2>Créer du Contenu</h2>
            <div id="spread-it-creator">
                <div class="spread-it-form">
                    <textarea id="content-input" placeholder="Saisissez votre contenu ici..." rows="8" style="width: 100%;"></textarea>
                    <br><br>
                    <select id="style-select">
                        <option value="professionnel">Professionnel</option>
                        <option value="decontracte">Décontracté</option>
                        <option value="informatif">Informatif</option>
                        <option value="inspirant">Inspirant</option>
                    </select>
                    <select id="length-select">
                        <option value="court">Court</option>
                        <option value="moyen" selected>Moyen</option>
                        <option value="long">Long</option>
                    </select>
                    <button id="create-btn" class="button button-primary">Créer avec IA</button>
                </div>

                <div id="result-container" style="display: none; margin-top: 20px;">
                    <h3>Contenu Amélioré</h3>
                    <div id="improved-content" style="border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"></div>

                    <h4>Horaires Optimaux</h4>
                    <div id="optimal-times"></div>

                    <h4>Partage Social</h4>
                    <div id="social-content"></div>

                    <button id="publish-btn" class="button button-primary">Publier sur WordPress</button>
                    <button id="share-btn" class="button">Partager sur Réseaux</button>
                </div>
            </div>
        </div>
        <?php
    }

    // Enregistrer les paramètres
    public function register_settings() {
        register_setting('spread_it_integration_settings', 'spread_it_api_url');
        register_setting('spread_it_integration_settings', 'spread_it_api_key');

        // Social / OAuth settings
        register_setting('spread_it_integration_settings', 'spread_it_facebook_app_id');
        register_setting('spread_it_integration_settings', 'spread_it_facebook_app_secret');
        register_setting('spread_it_integration_settings', 'spread_it_facebook_page_id');
        // Twitter OAuth settings
        register_setting('spread_it_integration_settings', 'spread_it_twitter_client_id');
        register_setting('spread_it_integration_settings', 'spread_it_twitter_client_secret');

        add_settings_section(
            'spread_it_integration_main',
            'Configuration API',
            null,
            'spread_it_integration_settings'
        );

        add_settings_field(
            'spread_it_api_url',
            'URL de l\'API Spread It',
            array($this, 'api_url_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_api_key',
            'Clé API',
            array($this, 'api_key_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_facebook_app_id',
            'Facebook App ID',
            array($this, 'facebook_app_id_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_facebook_app_secret',
            'Facebook App Secret',
            array($this, 'facebook_app_secret_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_facebook_page_id',
            'Facebook Page ID',
            array($this, 'facebook_page_id_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_twitter_client_id',
            'Twitter Client ID',
            array($this, 'twitter_client_id_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );

        add_settings_field(
            'spread_it_twitter_client_secret',
            'Twitter Client Secret',
            array($this, 'twitter_client_secret_field'),
            'spread_it_integration_settings',
            'spread_it_integration_main'
        );
    }

    public function api_url_field() {
        $value = get_option('spread_it_api_url', '');
        echo '<input type="url" name="spread_it_api_url" value="' . esc_attr($value) . '" class="regular-text" placeholder="https://your-spread-it-app.com" required>';
        echo '<p class="description">URL de votre instance Spread It standalone</p>';
    }

    public function api_key_field() {
        $value = get_option('spread_it_api_key', '');
        $placeholder = !empty($value) ? '••••••••••••••••' : 'Enter API key';
        echo '<input type="password" name="spread_it_api_key" placeholder="' . esc_attr($placeholder) . '" class="regular-text" required>';
        if (!empty($value)) {
            echo '<p class="description" style="color:green;">✓ API Key configurée</p>';
        }
        echo '<p class="description">Clé API pour accéder au service</p>';
    }

    public function facebook_app_id_field() {
        $value = get_option('spread_it_facebook_app_id', '');
        echo '<input type="text" name="spread_it_facebook_app_id" value="' . esc_attr($value) . '" class="regular-text" placeholder="1234567890" />';
        echo '<p class="description">Votre Facebook App ID (nécessaire pour OAuth)</p>';
    }

    public function facebook_app_secret_field() {
        $value = get_option('spread_it_facebook_app_secret', '');
        $placeholder = !empty($value) ? '••••••••••••••••' : '(App Secret)';
        echo '<input type="password" name="spread_it_facebook_app_secret" placeholder="' . esc_attr($placeholder) . '" class="regular-text" />';
        if (!empty($value)) {
            echo '<p class="description" style="color:green;">✓ App Secret configuré</p>';
        }
        echo '<p class="description">Gardez ce secret privé. Utilisé pour échanger le code OAuth.</p>';
    }

    public function facebook_page_id_field() {
        $value = get_option('spread_it_facebook_page_id', '');
        echo '<input type="text" name="spread_it_facebook_page_id" value="' . esc_attr($value) . '" class="regular-text" placeholder="Page ID (numeric)" />';
        echo '<p class="description">ID de la Page Facebook/Instagram Business où poster</p>';
    }

    public function twitter_client_id_field() {
        $value = get_option('spread_it_twitter_client_id', '');
        echo '<input type="text" name="spread_it_twitter_client_id" value="' . esc_attr($value) . '" class="regular-text" placeholder="Twitter Client ID" />';
        echo '<p class="description">Client ID pour OAuth Twitter (v2)</p>';
    }

    public function twitter_client_secret_field() {
        $value = get_option('spread_it_twitter_client_secret', '');
        $placeholder = !empty($value) ? '••••••••••••••••' : '(Client Secret)';
        echo '<input type="password" name="spread_it_twitter_client_secret" placeholder="' . esc_attr($placeholder) . '" class="regular-text" />';
        if (!empty($value)) {
            echo '<p class="description" style="color:green;">✓ Client Secret configuré</p>';
        }
        echo '<p class="description">Utilisé pour le flux OAuth utilisateur/admin.</p>';
    }

    // PKCE helpers
    private function pkce_generate_verifier($length = 64) {
        try {
            $bytes = random_bytes(64);
            return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
        } catch (Exception $e) {
            // fallback
            return rtrim(strtr(base64_encode(openssl_random_pseudo_bytes(64)), '+/', '-_'), '=');
        }
    }

    private function pkce_code_challenge($verifier) {
        $hash = hash('sha256', $verifier, true);
        return rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
    }

    // Meta box pour les posts
    public function add_meta_box() {
        add_meta_box(
            'spread-it-meta-box',
            'Spread It - Amélioration IA',
            array($this, 'meta_box_content'),
            'post',
            'side',
            'default'
        );
    }

    public function meta_box_content($post) {
        ?>
        <div id="spread-it-meta-box">
            <button id="enhance-btn" class="button button-primary button-large" style="width: 100%; margin-bottom: 10px;">
                Améliorer avec IA
            </button>

            <div id="enhance-result" style="display: none;">
                <p><strong>Contenu amélioré généré!</strong></p>
                <button id="apply-enhancement" class="button button-secondary button-small">
                    Appliquer au contenu
                </button>
            </div>

            <hr style="margin: 15px 0;">

            <div style="margin-top:10px">
                <button id="schedule-share" class="button button-secondary button-large" style="width: 100%;">
                    Programmer le partage
                </button>

                <?php
                // Per-user OAuth connect buttons (authors)
                $current_user_id = get_current_user_id();
                $fb_user_token = get_user_meta($current_user_id, 'spread_it_facebook_access_token', true);
                $tw_user_token = get_user_meta($current_user_id, 'spread_it_twitter_access_token', true);
                $fb_app_id = get_option('spread_it_facebook_app_id', '');
                $tw_client_id = get_option('spread_it_twitter_client_id', '');
                $callback_base = admin_url('admin-post.php?action=spread_it_oauth_callback');

                echo '<div style="margin-top:10px">';
                // Facebook per-user connect
                if ($fb_app_id) {
                    $callback = $callback_base . '&provider=facebook&per_user=1';
                    $state = wp_create_nonce('spread_it_oauth_state');
                    $auth_url = 'https://www.facebook.com/v16.0/dialog/oauth?client_id=' . urlencode($fb_app_id) . '&redirect_uri=' . urlencode($callback) . '&state=' . urlencode($state) . '&scope=pages_show_list,pages_read_engagement,instagram_basic';
                    if ($fb_user_token) {
                        echo '<p style="margin:6px 0;color:green">✓ Votre compte Facebook connecté</p>';
                        echo '<p><a class="button" href="' . esc_url(add_query_arg(array('action'=>'spread_it_disconnect','provider'=>'facebook','per_user'=>1), admin_url('admin-post.php'))) . '">Déconnecter mon Facebook</a></p>';
                    } else {
                        echo '<p><a class="button" href="' . esc_url($auth_url) . '" target="_blank">Connecter mon Facebook</a></p>';
                    }
                }

                // Twitter per-user connect (PKCE)
                if ($tw_client_id) {
                    $callback_tw = $callback_base . '&provider=twitter&per_user=1';
                    $state_tw = wp_create_nonce('spread_it_oauth_state');

                    // Generate PKCE verifier and challenge and store verifier transient keyed by state
                    $code_verifier = $this->pkce_generate_verifier();
                    $code_challenge = $this->pkce_code_challenge($code_verifier);
                    set_transient('spreadit_pkce_' . $state_tw, $code_verifier, 300);

                    $tw_auth = 'https://twitter.com/i/oauth2/authorize?response_type=code&client_id=' . urlencode($tw_client_id) . '&redirect_uri=' . urlencode($callback_tw) . '&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=' . urlencode($state_tw) . '&code_challenge=' . urlencode($code_challenge) . '&code_challenge_method=S256';
                    if ($tw_user_token) {
                        echo '<p style="margin:6px 0;color:green">✓ Votre compte Twitter connecté</p>';
                        echo '<p><a class="button" href="' . esc_url(add_query_arg(array('action'=>'spread_it_disconnect','provider'=>'twitter','per_user'=>1), admin_url('admin-post.php'))) . '">Déconnecter mon Twitter</a></p>';
                    } else {
                        echo '<p><a class="button" href="' . esc_url($tw_auth) . '" target="_blank">Connecter mon Twitter</a></p>';
                    }
                }

                echo '</div>';
                ?>
            </div>
        </div>
        <?php
    }

    // Scripts et AJAX
    public function enqueue_scripts($hook) {
        if ($hook === 'toplevel_page_spread-it-integration' || $hook === 'post.php' || $hook === 'post-new.php') {
            wp_enqueue_script('spread-it-integration', plugins_url('js/spread-it.js', __FILE__), array('jquery'), '1.0.0', true);
            wp_localize_script('spread-it-integration', 'spread_it_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('spread_it_nonce')
            ));
        }
    }

    // AJAX handlers
    public function ajax_create_content() {
        check_ajax_referer('spread_it_nonce', 'nonce');

        if (empty($this->api_url) || empty($this->api_key)) {
            wp_die(json_encode(array('error' => 'Configuration API manquante')));
        }

        $content = sanitize_textarea_field($_POST['content']);
        $style = sanitize_text_field($_POST['style']);
        $length = sanitize_text_field($_POST['length']);

        if (empty($content)) {
            wp_die(json_encode(array('error' => 'Contenu requis')));
        }

        // Appel à l'API
        $response = wp_remote_post($this->api_url . '/api/create-post', array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'x-api-key' => $this->api_key
            ),
            'body' => json_encode(array(
                'content' => $content,
                'options' => array(
                    'style' => $style,
                    'length' => $length
                )
            )),
            'timeout' => 30
        ));

        if (is_wp_error($response)) {
            wp_die(json_encode(array('error' => 'Erreur de connexion à l\'API')));
        }

        $response_code = wp_remote_retrieve_response_code($response);
        if ($response_code !== 200) {
            wp_die(json_encode(array('error' => 'Erreur API: ' . $response_code)));
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!$data || isset($data['error'])) {
            wp_die(json_encode(array('error' => $data['error'] ?? 'Erreur inconnue')));
        }

        wp_die(json_encode($data));
    }

    public function ajax_share_content() {
        check_ajax_referer('spread_it_nonce', 'nonce');

        // Logique de partage à implémenter selon les besoins
        wp_die(json_encode(array('success' => true, 'message' => 'Partage programmé')));
    }

    // OAuth callback handler for admin-post.php?action=spread_it_oauth_callback&provider=...
    public function oauth_callback() {
        if (empty($_GET['provider'])) {
            wp_die('Missing provider');
        }
        $provider = sanitize_text_field(wp_unslash($_GET['provider']));

        if ($provider === 'facebook') {
            // Verify state
            $state = $_GET['state'] ?? '';
            if (!wp_verify_nonce($state, 'spread_it_oauth_state')) {
                // continue anyway but mark error
                wp_redirect(add_query_arg('spread_it_oauth_status', 'invalid_state', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $code = $_GET['code'] ?? '';
            if (empty($code)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'no_code', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $app_id = get_option('spread_it_facebook_app_id', '');
            $app_secret = get_option('spread_it_facebook_app_secret', '');
            $redirect = admin_url('admin-post.php?action=spread_it_oauth_callback&provider=facebook');

            if (empty($app_id) || empty($app_secret)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'no_app_credentials', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            // Exchange code for short-lived token
            $token_url = add_query_arg(array(
                'client_id' => $app_id,
                'redirect_uri' => $redirect,
                'client_secret' => $app_secret,
                'code' => $code
            ), 'https://graph.facebook.com/v16.0/oauth/access_token');

            $res = wp_remote_get($token_url, array('timeout' => 20));
            if (is_wp_error($res)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'exchange_failed', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $body = wp_remote_retrieve_body($res);
            $data = json_decode($body, true);
            if (empty($data['access_token'])) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'no_token', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $short_lived = $data['access_token'];

            // Exchange for long-lived token
            $exchange_url = add_query_arg(array(
                'grant_type' => 'fb_exchange_token',
                'client_id' => $app_id,
                'client_secret' => $app_secret,
                'fb_exchange_token' => $short_lived
            ), 'https://graph.facebook.com/v16.0/oauth/access_token');

            $res2 = wp_remote_get($exchange_url, array('timeout' => 20));
            if (!is_wp_error($res2)) {
                $body2 = wp_remote_retrieve_body($res2);
                $d2 = json_decode($body2, true);
                if (!empty($d2['access_token'])) {
                    $long_token = $d2['access_token'];
                } else {
                    $long_token = $short_lived;
                }
            } else {
                $long_token = $short_lived;
            }

            // Store token
            if (isset($_GET['per_user']) && $_GET['per_user']) {
                $uid = get_current_user_id();
                if ($uid) update_user_meta($uid, 'spread_it_facebook_access_token', $long_token);
            } else {
                update_option('spread_it_facebook_access_token', $long_token);
            }

            // Optionally fetch pages and store selected page id
            $page_id = get_option('spread_it_facebook_page_id', '');
            if (empty($page_id)) {
                // Try to fetch pages
                $pages_res = wp_remote_get('https://graph.facebook.com/v16.0/me/accounts?access_token=' . urlencode($long_token), array('timeout' => 20));
                if (!is_wp_error($pages_res)) {
                    $pages_body = wp_remote_retrieve_body($pages_res);
                    $pages = json_decode($pages_body, true);
                    if (!empty($pages['data'][0]['id'])) {
                        update_option('spread_it_facebook_page_id', $pages['data'][0]['id']);
                    }
                }
            }

            wp_redirect(add_query_arg('spread_it_oauth_status', 'connected', admin_url('admin.php?page=spread-it-integration')));
            exit;
        }

        if ($provider === 'twitter') {
            // Twitter OAuth2 exchange
            $state = $_GET['state'] ?? '';
            if (!wp_verify_nonce($state, 'spread_it_oauth_state')) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'invalid_state', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }
            $code = $_GET['code'] ?? '';
            if (empty($code)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'no_code', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $client_id = get_option('spread_it_twitter_client_id', '');
            $client_secret = get_option('spread_it_twitter_client_secret', '');
            $redirect = admin_url('admin-post.php?action=spread_it_oauth_callback&provider=twitter');
            if (isset($_GET['per_user']) && $_GET['per_user']) {
                $redirect .= '&per_user=1';
            }

            if (empty($client_id) || empty($client_secret)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'no_twitter_credentials', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            // Retrieve PKCE code_verifier stored earlier
            $code_verifier = get_transient('spreadit_pkce_' . $state);
            if ($code_verifier) {
                delete_transient('spreadit_pkce_' . $state);
            }

            $body_params = array(
                'client_id' => $client_id,
                'code' => $code,
                'grant_type' => 'authorization_code',
                'redirect_uri' => $redirect,
            );
            if (!empty($client_secret)) {
                $body_params['client_secret'] = $client_secret;
            }
            if (!empty($code_verifier)) {
                $body_params['code_verifier'] = $code_verifier;
            }

            $args = array(
                'body' => $body_params,
                'headers' => array('Content-Type' => 'application/x-www-form-urlencoded'),
                'timeout' => 20
            );

            $token_res = wp_remote_post('https://api.twitter.com/2/oauth2/token', $args);
            if (is_wp_error($token_res)) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'twitter_exchange_failed', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }
            $body = wp_remote_retrieve_body($token_res);
            $data = json_decode($body, true);
            if (empty($data['access_token'])) {
                wp_redirect(add_query_arg('spread_it_oauth_status', 'twitter_no_token', admin_url('admin.php?page=spread-it-integration')));
                exit;
            }

            $access_token = $data['access_token'];
            if (isset($_GET['per_user']) && $_GET['per_user']) {
                $uid = get_current_user_id();
                if ($uid) update_user_meta($uid, 'spread_it_twitter_access_token', $access_token);
            } else {
                update_option('spread_it_twitter_access_token', $access_token);
            }

            wp_redirect(add_query_arg('spread_it_oauth_status', 'connected', admin_url('admin.php?page=spread-it-integration')));
            exit;
        }

        // Other providers to implement
        wp_redirect(add_query_arg('spread_it_oauth_status', 'unsupported_provider', admin_url('admin.php?page=spread-it-integration')));
        exit;
    }

    // Disconnect OAuth provider (simple remove stored tokens/options)
    public function oauth_disconnect() {
        if (empty($_GET['provider'])) {
            wp_redirect(admin_url('admin.php?page=spread-it-integration'));
            exit;
        }
        $provider = sanitize_text_field(wp_unslash($_GET['provider']));
        $per_user = isset($_GET['per_user']) && $_GET['per_user'];
        if ($provider === 'facebook') {
            if ($per_user) {
                $uid = get_current_user_id(); if ($uid) delete_user_meta($uid, 'spread_it_facebook_access_token');
            } else {
                delete_option('spread_it_facebook_access_token');
                delete_option('spread_it_facebook_page_id');
            }
        }
        if ($provider === 'twitter') {
            if ($per_user) {
                $uid = get_current_user_id(); if ($uid) delete_user_meta($uid, 'spread_it_twitter_access_token');
            } else {
                delete_option('spread_it_twitter_access_token');
            }
        }
        wp_redirect(add_query_arg('spread_it_oauth_status', 'disconnected', admin_url('admin.php?page=spread-it-integration')));
        exit;
    }

    /**
     * Refresh all stored tokens (global options and per-user meta)
     * Runs via WP-Cron daily
     */
    public function refresh_all_tokens() {
        // Facebook/Instagram global
        $fb_app_id = get_option('spread_it_facebook_app_id', '');
        $fb_app_secret = get_option('spread_it_facebook_app_secret', '');
        $fb_token = get_option('spread_it_facebook_access_token', '');
        if ($fb_app_id && $fb_app_secret && $fb_token) {
            $res = $this->refresh_facebook_token($fb_token, $fb_app_id, $fb_app_secret);
            if ($res && !empty($res['access_token'])) {
                update_option('spread_it_facebook_access_token', $res['access_token']);
                if (!empty($res['expires_at'])) update_option('spread_it_facebook_access_token_expires', $res['expires_at']);
            }
        }

        // Facebook/Instagram per-user
        $users = get_users();
        foreach ($users as $u) {
            $u_fb = get_user_meta($u->ID, 'spread_it_facebook_access_token', true);
            if ($u_fb && $fb_app_id && $fb_app_secret) {
                $r = $this->refresh_facebook_token($u_fb, $fb_app_id, $fb_app_secret);
                if ($r && !empty($r['access_token'])) {
                    update_user_meta($u->ID, 'spread_it_facebook_access_token', $r['access_token']);
                    if (!empty($r['expires_at'])) update_user_meta($u->ID, 'spread_it_facebook_access_token_expires', $r['expires_at']);
                }
            }
        }

        // Twitter global
        $tw_client_id = get_option('spread_it_twitter_client_id', '');
        $tw_client_secret = get_option('spread_it_twitter_client_secret', '');
        $tw_token = get_option('spread_it_twitter_access_token', '');
        $tw_refresh = get_option('spread_it_twitter_refresh_token', '');
        if ($tw_client_id && ($tw_refresh || $tw_token)) {
            $r = $this->refresh_twitter_token($tw_client_id, $tw_client_secret, $tw_refresh, false);
            if ($r && !empty($r['access_token'])) {
                update_option('spread_it_twitter_access_token', $r['access_token']);
                if (!empty($r['refresh_token'])) update_option('spread_it_twitter_refresh_token', $r['refresh_token']);
                if (!empty($r['expires_at'])) update_option('spread_it_twitter_access_token_expires', $r['expires_at']);
            }
        }

        // Twitter per-user
        foreach ($users as $u) {
            $u_tw_refresh = get_user_meta($u->ID, 'spread_it_twitter_refresh_token', true);
            if ($tw_client_id && ($u_tw_refresh)) {
                $r = $this->refresh_twitter_token($tw_client_id, $tw_client_secret, $u_tw_refresh, true, $u->ID);
                if ($r && !empty($r['access_token'])) {
                    update_user_meta($u->ID, 'spread_it_twitter_access_token', $r['access_token']);
                    if (!empty($r['refresh_token'])) update_user_meta($u->ID, 'spread_it_twitter_refresh_token', $r['refresh_token']);
                    if (!empty($r['expires_at'])) update_user_meta($u->ID, 'spread_it_twitter_access_token_expires', $r['expires_at']);
                }
            }
        }

        // LinkedIn global
        $li_client_id = get_option('spread_it_linkedin_client_id', '');
        $li_client_secret = get_option('spread_it_linkedin_client_secret', '');
        $li_refresh = get_option('spread_it_linkedin_refresh_token', '');
        if ($li_client_id && $li_client_secret && $li_refresh) {
            $r = $this->refresh_linkedin_token($li_client_id, $li_client_secret, $li_refresh);
            if ($r && !empty($r['access_token'])) {
                update_option('spread_it_linkedin_access_token', $r['access_token']);
                if (!empty($r['refresh_token'])) update_option('spread_it_linkedin_refresh_token', $r['refresh_token']);
                if (!empty($r['expires_at'])) update_option('spread_it_linkedin_access_token_expires', $r['expires_at']);
            }
        }
    }

    /**
     * Refresh a Facebook long-lived token by exchanging it; returns array with access_token and optional expires_at
     */
    private function refresh_facebook_token($current_token, $app_id, $app_secret) {
        $exchange_url = add_query_arg(array(
            'grant_type' => 'fb_exchange_token',
            'client_id' => $app_id,
            'client_secret' => $app_secret,
            'fb_exchange_token' => $current_token
        ), 'https://graph.facebook.com/v16.0/oauth/access_token');

        $res = wp_remote_get($exchange_url, array('timeout' => 20));
        if (is_wp_error($res)) return false;
        $body = wp_remote_retrieve_body($res);
        $data = json_decode($body, true);
        if (empty($data['access_token'])) return false;
        $out = array('access_token' => $data['access_token']);
        if (!empty($data['expires_in'])) {
            $out['expires_at'] = time() + intval($data['expires_in']);
        }
        return $out;
    }

    /**
     * Refresh Twitter token using refresh_token grant
     * If $per_user true, returns result without updating options
     */
    private function refresh_twitter_token($client_id, $client_secret, $refresh_token, $per_user = false, $user_id = 0) {
        if (empty($refresh_token)) return false;
        $body = array(
            'grant_type' => 'refresh_token',
            'refresh_token' => $refresh_token,
            'client_id' => $client_id
        );
        if (!empty($client_secret)) $body['client_secret'] = $client_secret;

        $args = array(
            'body' => $body,
            'headers' => array('Content-Type' => 'application/x-www-form-urlencoded'),
            'timeout' => 20
        );

        $res = wp_remote_post('https://api.twitter.com/2/oauth2/token', $args);
        if (is_wp_error($res)) return false;
        $resp = json_decode(wp_remote_retrieve_body($res), true);
        if (empty($resp['access_token'])) return false;
        $out = array('access_token' => $resp['access_token']);
        if (!empty($resp['refresh_token'])) $out['refresh_token'] = $resp['refresh_token'];
        if (!empty($resp['expires_in'])) $out['expires_at'] = time() + intval($resp['expires_in']);
        return $out;
    }

    /**
     * Refresh LinkedIn token via refresh_token grant
     */
    private function refresh_linkedin_token($client_id, $client_secret, $refresh_token) {
        if (empty($refresh_token)) return false;
        $args = array(
            'body' => array(
                'grant_type' => 'refresh_token',
                'refresh_token' => $refresh_token,
                'client_id' => $client_id,
                'client_secret' => $client_secret
            ),
            'headers' => array('Content-Type' => 'application/x-www-form-urlencoded'),
            'timeout' => 20
        );
        $res = wp_remote_post('https://www.linkedin.com/oauth/v2/accessToken', $args);
        if (is_wp_error($res)) return false;
        $resp = json_decode(wp_remote_retrieve_body($res), true);
        if (empty($resp['access_token'])) return false;
        $out = array('access_token' => $resp['access_token']);
        if (!empty($resp['refresh_token'])) $out['refresh_token'] = $resp['refresh_token'];
        if (!empty($resp['expires_in'])) $out['expires_at'] = time() + intval($resp['expires_in']);
        return $out;
    }
}

// Initialisation
new Spread_It_Integration();

// Activation du plugin
register_activation_hook(__FILE__, 'spread_it_integration_activate');
function spread_it_integration_activate() {
    // Options par défaut
    add_option('spread_it_api_url', '');
    add_option('spread_it_api_key', '');

    // Schedule daily token refresh if not scheduled
    if (!wp_next_scheduled('spread_it_refresh_tokens')) {
        wp_schedule_event(time(), 'daily', 'spread_it_refresh_tokens');
    }
}

register_deactivation_hook(__FILE__, 'spread_it_integration_deactivate');
function spread_it_integration_deactivate() {
    // Clear scheduled event
    $ts = wp_next_scheduled('spread_it_refresh_tokens');
    if ($ts) wp_unschedule_event($ts, 'spread_it_refresh_tokens');
}

// Hook for cron job
add_action('spread_it_refresh_tokens', function() {
    $integration = new Spread_It_Integration();
    if (method_exists($integration, 'refresh_all_tokens')) {
        $integration->refresh_all_tokens();
    }
});