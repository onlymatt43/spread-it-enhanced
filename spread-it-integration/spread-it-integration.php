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
        ?>
        <div class="wrap">
            <h1>Spread It Integration</h1>

            <form method="post" action="options.php">
                <?php
                settings_fields('spread_it_integration_settings');
                do_settings_sections('spread_it_integration_settings');
                submit_button();
                ?>
            </form>

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
    }

    public function api_url_field() {
        $value = get_option('spread_it_api_url', '');
        echo '<input type="url" name="spread_it_api_url" value="' . esc_attr($value) . '" class="regular-text" placeholder="https://your-spread-it-app.com" required>';
        echo '<p class="description">URL de votre instance Spread It standalone</p>';
    }

    public function api_key_field() {
        $value = get_option('spread_it_api_key', '');
        echo '<input type="password" name="spread_it_api_key" value="' . esc_attr($value) . '" class="regular-text" required>';
        echo '<p class="description">Clé API pour accéder au service</p>';
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

            <button id="schedule-share" class="button button-secondary button-large" style="width: 100%;">
                Programmer le partage
            </button>
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
}

// Initialisation
new Spread_It_Integration();

// Activation du plugin
register_activation_hook(__FILE__, 'spread_it_integration_activate');
function spread_it_integration_activate() {
    // Options par défaut
    add_option('spread_it_api_url', '');
    add_option('spread_it_api_key', '');
}