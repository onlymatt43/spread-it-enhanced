<?php
/**
 * Spread It Analytics Module
 * Tableau de bord Analytics basé sur la table de tracking (totaux, top posts, heures).
 */

if (!defined('ABSPATH')) exit;

class Spread_It_Analytics {
    const TABLE = 'spreadit_clicks';
    const MENU_SLUG = 'spread-it-analytics';

    public function __construct(){
        add_action('admin_menu', [$this,'menu']);
        add_action('admin_post_spreadit_export_csv', [$this,'export_csv']);
    }

    public function menu(){
        add_menu_page(
            'Spread It — Analytics', 'Spread It', 'manage_options',
            self::MENU_SLUG, [$this,'render_page'], 'dashicons-chart-bar', 58
        );
        add_submenu_page(
            self::MENU_SLUG, 'Analytics', 'Analytics', 'manage_options',
            self::MENU_SLUG, [$this,'render_page']
        );
    }

    private function table(){ global $wpdb; return $wpdb->prefix . self::TABLE; }

    public function render_page(){
        if (!current_user_can('manage_options')) return;
        global $wpdb;
        $table = $this->table();

        // sécurité: si la table n’existe pas encore
        $exists = (bool)$wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table));
        if (!$exists){
            echo '<div class="wrap"><h1>Spread It — Analytics</h1><p>La table de tracking n’existe pas encore. Active d’abord <strong>Spread It – Tracking</strong>, clique <em>Save</em> dans Permalinks, puis collecte des clics.</p></div>';
            return;
        }

        // fenêtre: 30 jours glissants
        $since = gmdate('Y-m-d H:i:s', time() - 30*86400);

        // Totaux par réseau
        $by_net = $wpdb->get_results($wpdb->prepare("
            SELECT network, COUNT(*) AS clicks
            FROM {$table}
            WHERE clicked_at >= %s
            GROUP BY network
            ORDER BY clicks DESC
        ", $since), ARRAY_A);

        // Top posts
        $top_posts = $wpdb->get_results($wpdb->prepare("
            SELECT post_id, COUNT(*) AS clicks
            FROM {$table}
            WHERE clicked_at >= %s
            GROUP BY post_id
            ORDER BY clicks DESC
            LIMIT 20
        ", $since), ARRAY_A);

        // Clics par heure (UTC) pour heatmap simple
        $by_hour = $wpdb->get_results($wpdb->prepare("
            SELECT HOUR(clicked_at) AS h, COUNT(*) AS clicks
            FROM {$table}
            WHERE clicked_at >= %s
            GROUP BY HOUR(clicked_at)
            ORDER BY h ASC
        ", $since), ARRAY_A);

        echo '<div class="wrap"><h1>Spread It — Analytics (30 jours)</h1>';

        // Export
        $export_url = wp_nonce_url(admin_url('admin-post.php?action=spreadit_export_csv'), 'spreadit_export');
        echo '<p><a class="button button-primary" href="'.esc_url($export_url).'">Exporter CSV</a></p>';

        echo '<div style="display:grid;gap:20px;grid-template-columns:1fr 1fr;">';

        // Bloc: réseaux
        echo '<div class="card"><h2>Clicks par réseau</h2>';
        if ($by_net){
            echo '<table class="widefat striped"><thead><tr><th>Réseau</th><th>Clicks</th></tr></thead><tbody>';
            foreach ($by_net as $r){
                printf('<tr><td>%s</td><td>%d</td></tr>', esc_html($r['network']), intval($r['clicks']));
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Aucun clic enregistré.</p>';
        }
        echo '</div>';

        // Bloc: top posts
        echo '<div class="card"><h2>Top posts</h2>';
        if ($top_posts){
            echo '<table class="widefat striped"><thead><tr><th>Post</th><th>Clicks</th></tr></thead><tbody>';
            foreach ($top_posts as $r){
                $title = get_the_title($r['post_id']) ?: ('#'.$r['post_id']);
                $link  = get_permalink($r['post_id']);
                echo '<tr><td><a href="'.esc_url($link).'" target="_blank">'.esc_html($title).'</a></td><td>'.intval($r['clicks']).'</td></tr>';
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Pas encore de top posts.</p>';
        }
        echo '</div>';

        echo '</div>'; // grid

        // Bloc: heures
        echo '<div class="card" style="margin-top:20px;"><h2>Clicks par heure (UTC)</h2>';
        if ($by_hour){
            echo '<table class="widefat striped"><thead><tr><th>Heure</th><th>Clicks</th></tr></thead><tbody>';
            for ($h=0;$h<24;$h++){
                $row = array_values(array_filter($by_hour, fn($x)=>intval($x['h'])===$h));
                $c = $row ? intval($row[0]['clicks']) : 0;
                printf('<tr><td>%02d:00</td><td>%d</td></tr>', $h, $c);
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Aucune donnée horaire.</p>';
        }
        echo '</div>';

        echo '</div>'; // .wrap
    }

    public function export_csv(){
        if (!current_user_can('manage_options')) wp_die('No permission');
        check_admin_referer('spreadit_export');

        global $wpdb; $table = $this->table();
        $since = gmdate('Y-m-d H:i:s', time() - 30*86400);
        $rows = $wpdb->get_results($wpdb->prepare("
            SELECT id, post_id, network, clicked_at, user_id, ua, referrer, ip_hash
            FROM {$table}
            WHERE clicked_at >= %s
            ORDER BY clicked_at DESC
        ", $since), ARRAY_A);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=spreadit_clicks_30d.csv');
        $out = fopen('php://output', 'w');
        fputcsv($out, array_keys($rows ? $rows[0] : [
            'id','post_id','network','clicked_at','user_id','ua','referrer','ip_hash'
        ]));
        foreach ($rows as $r){ fputcsv($out, $r); }
        fclose($out);
        exit;
    }
}

add_action('plugins_loaded', function(){ $GLOBALS['spread_it_analytics'] = new Spread_It_Analytics(); });