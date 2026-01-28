<?php
/*
Plugin Name: Spread It Connect
Description: Connecte votre site WordPress à l'application Spread It pour activer les boutons de partage intelligents.
Version: 1.0.0
Author: Spread It
*/

if (!defined('ABSPATH')) exit;

class Spread_It_Connect {

    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('wp_enqueue_scripts', [$this, 'inject_widget']);
    }

    public function add_menu() {
        add_options_page(
            'Spread It Connect',
            'Spread It',
            'manage_options',
            'spread-it-connect',
            [$this, 'settings_page']
        );
    }

    public function register_settings() {
        register_setting('spread_it_options', 'spread_it_app_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw'
        ]);
    }

    public function settings_page() {
        ?>
        <div class="wrap">
            <h1>Connexion Spread It</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('spread_it_options');
                do_settings_sections('spread_it_options');
                ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">URL de l'application Spread It</th>
                        <td>
                            <input type="text" name="spread_it_app_url" value="<?php echo esc_attr(get_option('spread_it_app_url')); ?>" class="regular-text" placeholder="https://votre-app.vercel.app" />
                            <p class="description">Entrez l'URL où votre application Spread It Standalone est déployée.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <div class="card" style="margin-top: 20px; padding: 20px; max-width: 800px;">
                <h2>État de la connexion</h2>
                <?php if (get_option('spread_it_app_url')): ?>
                    <p style="color: green;">✅ <strong>Connecté</strong> : Le widget est actif sur votre site.</p>
                    <p>Pour vérifier, allez sur votre site et survolez une image.</p>
                <?php else: ?>
                    <p style="color: #d63638;">⚠️ <strong>Non connecté</strong> : Veuillez entrer l'URL de votre application ci-dessus.</p>
                <?php endif; ?>
            </div>
        </div>
        <?php
    }

    public function inject_widget() {
        $app_url = get_option('spread_it_app_url');
        
        if ($app_url) {
            // S'assure que l'URL ne finit pas par un slash pour éviter le double slash
            $app_url = untrailingslashit($app_url);
            
            wp_enqueue_script(
                'spread-it-widget', 
                $app_url . '/js/widget.js', 
                [], 
                '1.0.0', 
                true
            );
        }
    }
}

new Spread_It_Connect();
