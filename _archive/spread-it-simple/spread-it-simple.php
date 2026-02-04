<?php
/*
Plugin Name: Spread It Simple
Description: Créer des posts avec l'IA et les partager facilement sur les réseaux sociaux
Version: 1.0.0
Author: OM43
*/

// Sécurité
if (!defined('ABSPATH')) {
    exit;
}

// Activation du plugin
register_activation_hook(__FILE__, 'spread_it_activate');
function spread_it_activate() {
    // Créer la table pour stocker les posts IA
    global $wpdb;
    $table_name = $wpdb->prefix . 'spread_it_posts';
    
    $charset_collate = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE $table_name (
        id mediumint(9) NOT NULL AUTO_INCREMENT,
        title varchar(255) NOT NULL,
        content text NOT NULL,
        keywords text DEFAULT NULL,
        ai_suggestions text DEFAULT NULL,
        social_text text DEFAULT NULL,
        image_url varchar(500) DEFAULT NULL,
        created_at datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    ) $charset_collate;";
    
    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql);
    
    // Options par défaut
    add_option('spread_it_openai_key', '');
}

// Menu admin
add_action('admin_menu', 'spread_it_menu');
function spread_it_menu() {
    add_menu_page(
        'Spread It',
        'Spread It',
        'manage_options',
        'spread-it',
        'spread_it_admin_page',
        'dashicons-share',
        30
    );
}

// Page d'administration
function spread_it_admin_page() {
    // Vérifier les permissions
    if (!current_user_can('manage_options')) {
        wp_die(__('Vous n\'avez pas les permissions suffisantes.'));
    }
    
    // Sauvegarder les settings
    if (isset($_POST['save_settings'])) {
        // Vérifier le nonce
        if (!isset($_POST['spread_it_nonce']) || !wp_verify_nonce($_POST['spread_it_nonce'], 'spread_it_settings')) {
            wp_die(__('Erreur de sécurité.'));
        }
        
        update_option('spread_it_openai_key', sanitize_text_field($_POST['openai_key']));
        echo '<div class="notice notice-success"><p>Paramètres sauvegardés!</p></div>';
    }
    
    // Traiter la création de post
    if (isset($_POST['create_post'])) {
        // Vérifier le nonce
        if (!isset($_POST['spread_it_nonce']) || !wp_verify_nonce($_POST['spread_it_nonce'], 'spread_it_create')) {
            wp_die(__('Erreur de sécurité.'));
        }
        
        $result = spread_it_create_post($_POST);
        if ($result['success']) {
            echo '<div class="notice notice-success"><p>Post créé avec succès! <a href="' . get_edit_post_link($result['post_id']) . '">Voir le post</a></p></div>';
        } else {
            echo '<div class="notice notice-error"><p>Erreur: ' . esc_html($result['message']) . '</p></div>';
        }
    }
    
    $openai_key = get_option('spread_it_openai_key', '');
    ?>
    <div class="wrap">
        <h1>Spread It - Créateur de Posts IA</h1>
        
        <!-- Onglets -->
        <h2 class="nav-tab-wrapper">
            <a href="#" class="nav-tab nav-tab-active" onclick="showTab('create')">Créer un Post</a>
            <a href="#" class="nav-tab" onclick="showTab('settings')">Paramètres</a>
            <a href="#" class="nav-tab" onclick="showTab('history')">Historique</a>
        </h2>
        
        <!-- Onglet Créer -->
        <div id="tab-create" class="tab-content">
            <form method="post" style="margin-top: 20px;">
                <?php wp_nonce_field('spread_it_create', 'spread_it_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="topic">Sujet du post</label></th>
                        <td><input type="text" id="topic" name="topic" class="regular-text" placeholder="Ex: Les bienfaits du yoga" required /></td>
                    </tr>
                    <tr>
                        <th><label for="style">Style d'écriture</label></th>
                        <td>
                            <select name="style">
                                <option value="professionnel">Professionnel</option>
                                <option value="decontracte">Décontracté</option>
                                <option value="informatif">Informatif</option>
                                <option value="inspirant">Inspirant</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="length">Longueur</label></th>
                        <td>
                            <select name="length">
                                <option value="court">Court (200-300 mots)</option>
                                <option value="moyen" selected>Moyen (400-600 mots)</option>
                                <option value="long">Long (700-1000 mots)</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th><label for="keywords">Mots-clés (optionnel)</label></th>
                        <td><input type="text" id="keywords" name="keywords" class="regular-text" placeholder="Ex: yoga, meditation, bien-être" /></td>
                    </tr>
                    <tr>
                        <th><label for="generate_image">Générer une image</label></th>
                        <td><input type="checkbox" name="generate_image" value="1" /> Créer une image avec DALL-E</td>
                    </tr>
                </table>
                <p class="submit">
                    <input type="submit" name="create_post" class="button-primary" value="Créer le Post avec l'IA" />
                </p>
            </form>
        </div>
        
        <!-- Onglet Paramètres -->
        <div id="tab-settings" class="tab-content" style="display:none;">
            <form method="post" style="margin-top: 20px;">
                <?php wp_nonce_field('spread_it_settings', 'spread_it_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="openai_key">Clé API OpenAI</label></th>
                        <td>
                            <input type="password" id="openai_key" name="openai_key" placeholder="<?php echo !empty($openai_key) ? '••••••••••••••••' : 'sk-...'; ?>" class="regular-text" />
                            <?php if (!empty($openai_key)): ?><p class="description" style="color:green;">✓ Clé configurée</p><?php endif; ?>
                            <p class="description">Obtenez votre clé sur <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI</a></p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <input type="submit" name="save_settings" class="button-primary" value="Sauvegarder" />
                </p>
            </form>
        </div>
        
        <!-- Onglet Historique -->
        <div id="tab-history" class="tab-content" style="display:none;">
            <h3>Posts créés avec l'IA</h3>
            <?php spread_it_show_history(); ?>
        </div>
    </div>
    
    <style>
    .tab-content { padding: 20px 0; }
    .nav-tab-active { background: #fff; border-bottom: 1px solid #fff; }
    .social-share { margin-top: 20px; padding: 15px; background: #f1f1f1; border-radius: 5px; }
    .social-share h4 { margin-top: 0; }
    .social-buttons a { display: inline-block; margin-right: 10px; padding: 8px 15px; background: #0073aa; color: white; text-decoration: none; border-radius: 3px; }
    .social-buttons a.facebook { background: #1877f2; }
    .social-buttons a.twitter { background: #1da1f2; }
    .social-buttons a.linkedin { background: #0077b5; }
    .copy-text { width: 100%; height: 100px; margin-top: 10px; }
    </style>
    
    <script>
    function showTab(tab) {
        // Cacher tous les onglets
        var tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(function(t) { t.style.display = 'none'; });
        
        // Enlever la classe active
        var navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(function(t) { t.classList.remove('nav-tab-active'); });
        
        // Afficher l'onglet sélectionné
        document.getElementById('tab-' + tab).style.display = 'block';
        event.target.classList.add('nav-tab-active');
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(function() {
            alert('Texte copié dans le presse-papiers!');
        }).catch(function(err) {
            console.error('Erreur lors de la copie:', err);
        });
    }
    </script>
    <?php
}

// Fonction pour créer un post avec l'IA
function spread_it_create_post($data) {
    $openai_key = get_option('spread_it_openai_key');
    if (empty($openai_key)) {
        return array('success' => false, 'message' => 'Clé API OpenAI non configurée');
    }
    
    $topic = sanitize_text_field($data['topic']);
    $style = sanitize_text_field($data['style']);
    $length = sanitize_text_field($data['length']);
    $keywords = sanitize_text_field($data['keywords']);
    $generate_image = isset($data['generate_image']);
    
    // Validation des données
    if (empty($topic)) {
        return array('success' => false, 'message' => 'Le sujet est requis');
    }
    
    $allowed_styles = array('professionnel', 'decontracte', 'informatif', 'inspirant');
    if (!in_array($style, $allowed_styles)) {
        $style = 'professionnel';
    }
    
    $allowed_lengths = array('court', 'moyen', 'long');
    if (!in_array($length, $allowed_lengths)) {
        $length = 'moyen';
    }
    
    // Préparer le prompt
    $length_words = array(
        'court' => '200-300',
        'moyen' => '400-600', 
        'long' => '700-1000'
    );
    
    $prompt = "Écris un article de blog en français sur le sujet: '$topic'. 
Style: $style. 
Longueur: " . $length_words[$length] . " mots.";
    
    if (!empty($keywords)) {
        $prompt .= " Inclure ces mots-clés: $keywords.";
    }
    
    $prompt .= " Structure l'article avec un titre accrocheur, une introduction, plusieurs sections avec sous-titres, et une conclusion. Optimise pour le SEO et les partages sur réseaux sociaux.";
    
    // Appel à l'API OpenAI
    $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $openai_key,
            'Content-Type' => 'application/json'
        ),
        'body' => json_encode(array(
            'model' => 'gpt-4',
            'messages' => array(
                array('role' => 'user', 'content' => $prompt)
            ),
            'max_tokens' => 2000,
            'temperature' => 0.7
        )),
        'timeout' => 60
    ));
    
    if (is_wp_error($response)) {
        return array('success' => false, 'message' => 'Erreur de connexion à OpenAI: ' . $response->get_error_message());
    }
    
    $response_code = wp_remote_retrieve_response_code($response);
    if ($response_code !== 200) {
        return array('success' => false, 'message' => 'Erreur API OpenAI (Code: ' . $response_code . ')');
    }
    
    $body = wp_remote_retrieve_body($response);
    $api_response = json_decode($body, true);
    
    if (!isset($api_response['choices'][0]['message']['content'])) {
        $error_msg = isset($api_response['error']['message']) ? $api_response['error']['message'] : 'Réponse invalide';
        return array('success' => false, 'message' => 'Erreur OpenAI: ' . $error_msg);
    }
    
    $ai_content = $api_response['choices'][0]['message']['content'];
    
    // Extraire le titre (première ligne) et le contenu
    $lines = explode("\n", $ai_content);
    $title = trim($lines[0], "# \t\n\r\0\x0B");
    $content = trim(substr($ai_content, strlen($lines[0])));
    
    // Validation du contenu généré
    if (empty($title) || empty($content)) {
        return array('success' => false, 'message' => 'Contenu généré invalide');
    }
    
    // Générer une image si demandé
    $image_url = '';
    if ($generate_image) {
        $image_result = spread_it_generate_image($topic, $openai_key);
        if ($image_result['success']) {
            $image_url = $image_result['url'];
        }
    }
    
    // Créer le post WordPress
    $post_data = array(
        'post_title' => $title,
        'post_content' => $content,
        'post_status' => 'draft',
        'post_type' => 'post'
    );
    
    $post_id = wp_insert_post($post_data);
    
    if (is_wp_error($post_id)) {
        return array('success' => false, 'message' => 'Erreur lors de la création du post: ' . $post_id->get_error_message());
    }
    
    if ($post_id) {
        // Ajouter l'image comme featured image si générée
        if (!empty($image_url)) {
            $image_id = spread_it_upload_image_from_url($image_url, $post_id);
            if ($image_id && !is_wp_error($image_id)) {
                set_post_thumbnail($post_id, $image_id);
            }
        }
        
        // Sauvegarder dans notre table pour l'historique
        global $wpdb;
        $table_name = $wpdb->prefix . 'spread_it_posts';
        
        // Générer du texte optimisé pour les réseaux sociaux
        $social_text = spread_it_generate_social_text($title, $content);
        
        $wpdb->insert(
            $table_name,
            array(
                'title' => $title,
                'content' => $content,
                'keywords' => $keywords,
                'social_text' => $social_text,
                'image_url' => $image_url
            ),
            array('%s', '%s', '%s', '%s', '%s')
        );
        
        return array('success' => true, 'post_id' => $post_id);
    }
    
    return array('success' => false, 'message' => 'Erreur lors de la création du post');
}

// Générer une image avec DALL-E
function spread_it_generate_image($topic, $openai_key) {
    $prompt = "Create a professional, high-quality image related to: " . sanitize_text_field($topic) . ". Style: modern, clean, suitable for blog post.";
    
    $response = wp_remote_post('https://api.openai.com/v1/images/generations', array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $openai_key,
            'Content-Type' => 'application/json'
        ),
        'body' => json_encode(array(
            'model' => 'dall-e-3',
            'prompt' => $prompt,
            'n' => 1,
            'size' => '1024x1024'
        )),
        'timeout' => 60
    ));
    
    if (is_wp_error($response)) {
        return array('success' => false, 'message' => $response->get_error_message());
    }
    
    $response_code = wp_remote_retrieve_response_code($response);
    if ($response_code !== 200) {
        return array('success' => false, 'message' => 'Erreur API DALL-E (Code: ' . $response_code . ')');
    }
    
    $body = wp_remote_retrieve_body($response);
    $api_response = json_decode($body, true);
    
    if (isset($api_response['data'][0]['url'])) {
        return array('success' => true, 'url' => $api_response['data'][0]['url']);
    }
    
    return array('success' => false, 'message' => 'Impossible de générer l\'image');
}

// Upload une image depuis une URL (sécurisé)
function spread_it_upload_image_from_url($image_url, $post_id) {
    // Vérifier que l'URL est valide
    if (!filter_var($image_url, FILTER_VALIDATE_URL)) {
        return false;
    }
    
    // Vérifier que c'est bien une URL OpenAI
    if (strpos($image_url, 'oaidalleapiprodscus.blob.core.windows.net') === false) {
        return false;
    }
    
    // Télécharger l'image de manière sécurisée
    $response = wp_remote_get($image_url, array(
        'timeout' => 30,
        'user-agent' => 'WordPress/' . get_bloginfo('version')
    ));
    
    if (is_wp_error($response)) {
        return false;
    }
    
    $image_data = wp_remote_retrieve_body($response);
    if (empty($image_data)) {
        return false;
    }
    
    $upload_dir = wp_upload_dir();
    $filename = 'ai-generated-' . $post_id . '-' . time() . '.png';
    $file = $upload_dir['path'] . '/' . $filename;
    
    // Vérifier les permissions d'écriture
    if (!wp_is_writable($upload_dir['path'])) {
        return false;
    }
    
    $saved = file_put_contents($file, $image_data);
    if ($saved === false) {
        return false;
    }
    
    $attachment = array(
        'post_mime_type' => 'image/png',
        'post_title' => 'AI Generated Image',
        'post_content' => '',
        'post_status' => 'inherit'
    );
    
    $attach_id = wp_insert_attachment($attachment, $file, $post_id);
    
    if (!is_wp_error($attach_id)) {
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $file);
        wp_update_attachment_metadata($attach_id, $attach_data);
        return $attach_id;
    }
    
    return false;
}

// Générer du texte optimisé pour les réseaux sociaux
function spread_it_generate_social_text($title, $content) {
    // Nettoyer et extraire les premières phrases
    $clean_content = wp_strip_all_tags($content);
    $sentences = preg_split('/[.!?]+/', $clean_content);
    $intro = '';
    
    for ($i = 0; $i < min(2, count($sentences)); $i++) {
        if (!empty(trim($sentences[$i]))) {
            $intro .= trim($sentences[$i]) . '. ';
        }
    }
    
    // Limiter la longueur
    $intro = wp_trim_words($intro, 30, '...');
    
    // Créer différents formats pour les réseaux sociaux
    $social_formats = array(
        'facebook' => $title . "\n\n" . $intro . "\n\n#blog #article",
        'twitter' => $title . "\n\n" . wp_trim_words($intro, 20, '...') . "\n\n#blog",
        'linkedin' => $title . "\n\n" . $intro . "\n\nQu'en pensez-vous? \n\n#professionnel #article"
    );
    
    return json_encode($social_formats, JSON_UNESCAPED_UNICODE);
}

// Afficher l'historique des posts
function spread_it_show_history() {
    global $wpdb;
    $table_name = $wpdb->prefix . 'spread_it_posts';
    
    $results = $wpdb->get_results("SELECT * FROM $table_name ORDER BY created_at DESC LIMIT 10");
    
    if (empty($results)) {
        echo '<p>Aucun post créé pour le moment.</p>';
        return;
    }
    
    echo '<table class="wp-list-table widefat fixed striped">';
    echo '<thead><tr><th>Titre</th><th>Créé le</th><th>Actions</th></tr></thead>';
    echo '<tbody>';
    
    foreach ($results as $post) {
        echo '<tr>';
        echo '<td>' . esc_html($post->title) . '</td>';
        echo '<td>' . esc_html($post->created_at) . '</td>';
        echo '<td>';
        
        // Trouver le post WordPress correspondant
        $wp_post = get_page_by_title($post->title, OBJECT, 'post');
        if ($wp_post) {
            echo '<a href="' . esc_url(get_edit_post_link($wp_post->ID)) . '" class="button">Éditer</a> ';
            echo '<a href="' . esc_url(get_permalink($wp_post->ID)) . '" class="button" target="_blank">Voir</a> ';
        }
        
        echo '<button class="button" onclick="showSocialShare(' . intval($post->id) . ')">Partager</button>';
        echo '</td>';
        echo '</tr>';
        
        // Div caché pour le partage social
        echo '<tr id="social-' . intval($post->id) . '" style="display:none;">';
        echo '<td colspan="3">';
        echo '<div class="social-share">';
        echo '<h4>Partage sur les réseaux sociaux</h4>';
        
        if (!empty($post->social_text)) {
            $social_data = json_decode($post->social_text, true);
            
            if ($social_data) {
                foreach ($social_data as $platform => $text) {
                    echo '<h5>' . esc_html(ucfirst($platform)) . '</h5>';
                    echo '<textarea class="copy-text" readonly>' . esc_textarea($text) . '</textarea>';
                    echo '<button class="button" onclick="copyToClipboard(\'' . esc_js($text) . '\')">Copier</button><br><br>';
                }
            }
        }
        
        // Liens de partage direct
        if ($wp_post) {
            $share_title = urlencode($post->title);
            $share_url = urlencode(get_permalink($wp_post->ID));
            
            echo '<div class="social-buttons">';
            echo '<a href="https://www.facebook.com/sharer/sharer.php?u=' . $share_url . '" target="_blank" class="facebook">Facebook</a>';
            echo '<a href="https://twitter.com/intent/tweet?text=' . $share_title . '&url=' . $share_url . '" target="_blank" class="twitter">Twitter</a>';
            echo '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' . $share_url . '" target="_blank" class="linkedin">LinkedIn</a>';
            echo '</div>';
        }
        
        echo '</div>';
        echo '</td>';
        echo '</tr>';
    }
    
    echo '</tbody></table>';
    
    echo '<script>
    function showSocialShare(id) {
        var row = document.getElementById("social-" + id);
        if (row.style.display === "none") {
            row.style.display = "table-row";
        } else {
            row.style.display = "none";
        }
    }
    </script>';
}

// Shortcode pour afficher le formulaire en frontend
add_shortcode('spread_it_form', 'spread_it_frontend_form');
function spread_it_frontend_form() {
    if (!is_user_logged_in() || !current_user_can('edit_posts')) {
        return '<p>Vous devez être connecté et avoir les permissions pour créer des posts.</p>';
    }
    
    ob_start();
    ?>
    <form id="spread-it-frontend" method="post" style="max-width: 600px;">
        <?php wp_nonce_field('spread_it_frontend', 'spread_it_nonce'); ?>
        <h3>Créer un post avec l'IA</h3>
        
        <p>
            <label for="topic">Sujet du post :</label><br>
            <input type="text" id="topic" name="topic" style="width: 100%;" required />
        </p>
        
        <p>
            <label for="style">Style :</label><br>
            <select name="style" style="width: 100%;">
                <option value="professionnel">Professionnel</option>
                <option value="decontracte">Décontracté</option>
                <option value="informatif">Informatif</option>
                <option value="inspirant">Inspirant</option>
            </select>
        </p>
        
        <p>
            <label for="length">Longueur :</label><br>
            <select name="length" style="width: 100%;">
                <option value="court">Court (200-300 mots)</option>
                <option value="moyen" selected>Moyen (400-600 mots)</option>
                <option value="long">Long (700-1000 mots)</option>
            </select>
        </p>
        
        <p>
            <label for="keywords">Mots-clés (optionnel) :</label><br>
            <input type="text" id="keywords" name="keywords" style="width: 100%;" />
        </p>
        
        <p>
            <label>
                <input type="checkbox" name="generate_image" value="1" />
                Générer une image avec l'IA
            </label>
        </p>
        
        <p>
            <input type="submit" name="create_post_frontend" value="Créer le Post" style="background: #0073aa; color: white; padding: 10px 20px; border: none; cursor: pointer;" />
        </p>
    </form>
    <?php
    return ob_get_clean();
}

// Traiter les soumissions frontend
add_action('init', 'spread_it_handle_frontend_submission');
function spread_it_handle_frontend_submission() {
    if (isset($_POST['create_post_frontend']) && isset($_POST['topic'])) {
        // Vérifier les permissions
        if (!is_user_logged_in() || !current_user_can('edit_posts')) {
            wp_redirect(add_query_arg('spread_it_error', urlencode('Permissions insuffisantes'), wp_get_referer()));
            exit;
        }
        
        // Vérifier le nonce
        if (!isset($_POST['spread_it_nonce']) || !wp_verify_nonce($_POST['spread_it_nonce'], 'spread_it_frontend')) {
            wp_redirect(add_query_arg('spread_it_error', urlencode('Erreur de sécurité'), wp_get_referer()));
            exit;
        }
        
        $result = spread_it_create_post($_POST);
        if ($result['success']) {
            wp_redirect(add_query_arg('spread_it_success', $result['post_id'], wp_get_referer()));
            exit;
        } else {
            wp_redirect(add_query_arg('spread_it_error', urlencode($result['message']), wp_get_referer()));
            exit;
        }
    }
}

// Afficher les messages de succès/erreur
add_action('wp_head', 'spread_it_show_messages');
function spread_it_show_messages() {
    if (isset($_GET['spread_it_success'])) {
        $post_id = intval($_GET['spread_it_success']);
        echo '<div style="position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 15px; border-radius: 5px; z-index: 9999;">
                Post créé avec succès! <a href="' . esc_url(get_edit_post_link($post_id)) . '" style="color: white; text-decoration: underline;">Voir le post</a>
              </div>';
    }
    
    if (isset($_GET['spread_it_error'])) {
        $error = sanitize_text_field(urldecode($_GET['spread_it_error']));
        echo '<div style="position: fixed; top: 20px; right: 20px; background: #f44336; color: white; padding: 15px; border-radius: 5px; z-index: 9999;">
                Erreur: ' . esc_html($error) . '
              </div>';
    }
}
?>
