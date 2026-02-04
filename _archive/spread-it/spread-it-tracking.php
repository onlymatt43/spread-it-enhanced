<?php
/**
 * Module: Spread It — Tracking & Analytics (séparé)
 * Place ce fichier dans le même dossier que spread-it.php
 */
if (!defined('ABSPATH')) exit;

if (!class_exists('Spread_It_Tracking')):
class Spread_It_Tracking {

    const DB_CLICKS     = 'spreadit_clicks';
    const DB_FOLLOWERS  = 'spreadit_followers';
    const MENU_ANALYTICS= 'spread-it-analytics';
    const MENU_SETTINGS = 'spread-it-analytics-settings';
    const OPT_KEY       = 'spread_it_tracking_options';
    const CRON_FOLLOW   = 'spread_it_pull_metrics'; // déjà planifié par le plugin principal

    public function __construct() {
        // Log des clics AVANT la redirection du plugin principal
        add_action('template_redirect', [$this,'log_click_if_any'], 5);

        // Admin UI
        add_action('admin_menu',  [$this,'add_menus']);
        add_action('admin_init',  [$this,'register_settings']);

        // Cron: capture des followers (si tokens présents)
        add_action(self::CRON_FOLLOW, [$this,'capture_followers_counts']);
    }

    /* ================= Activation (DB) ================= */
    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();

        $tbl_clicks = $wpdb->prefix . self::DB_CLICKS;
        $sql1 = "CREATE TABLE {$tbl_clicks} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            network VARCHAR(32) NOT NULL,
            click_time DATETIME NOT NULL,
            ip VARCHAR(45) NULL,
            ua TEXT NULL,
            country VARCHAR(2) NULL,
            device VARCHAR(16) NULL,
            PRIMARY KEY (id),
            KEY post_id (post_id),
            KEY network (network),
            KEY click_time (click_time)
        ) {$charset};";

        $tbl_follow = $wpdb->prefix . self::DB_FOLLOWERS;
        $sql2 = "CREATE TABLE {$tbl_follow} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            captured_at DATETIME NOT NULL,
            network VARCHAR(32) NOT NULL,
            followers BIGINT UNSIGNED NULL,
            PRIMARY KEY (id),
            KEY network (network),
            KEY captured_at (captured_at)
        ) {$charset};";

        dbDelta($sql1);
        dbDelta($sql2);
    }

    /* ================= CLICKS ================= */
    public function log_click_if_any() {
        $pid = get_query_var('spread_post');
        $net = get_query_var('spread_net');
        if (!$pid || !$net) return;

        $pid = intval($pid);
        $net = sanitize_key($net);

        $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field($_SERVER['REMOTE_ADDR']) : '';
        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? wp_kses_post($_SERVER['HTTP_USER_AGENT']) : '';
        $ua_l = strtolower($ua);
        $device = (strpos($ua_l,'mobile')!==false || strpos($ua_l,'android')!==false || strpos($ua_l,'iphone')!==false) ? 'mobile'
                : ((strpos($ua_l,'ipad')!==false || strpos($ua_l,'tablet')!==false) ? 'tablet' : 'desktop');

        global $wpdb;
        $tbl = $wpdb->prefix . self::DB_CLICKS;
        $wpdb->insert($tbl, [
            'post_id'    => $pid,
            'network'    => $net,
            'click_time' => current_time('mysql', false),
            'ip'         => $ip,
            'ua'         => $ua,
            'country'    => null,
            'device'     => $device,
        ], ['%d','%s','%s','%s','%s','%s','%s']);
        // la redirection finale est gérée par le plugin principal
    }

    /* ================= FOLLOWERS (cron) ================= */
    public function capture_followers_counts() {
        $opt = get_option(self::OPT_KEY, []);
        $counts = [
            'facebook'  => $this->get_fb_followers_count($opt),
            'x'         => $this->get_x_followers_count($opt),
            'instagram' => $this->get_ig_followers_count($opt),
        ];

        global $wpdb;
        $tbl = $wpdb->prefix . self::DB_FOLLOWERS;
        $now = current_time('mysql', false);

        foreach ($counts as $net=>$val) {
            if ($val === null) continue; // non configuré / erreur silencieuse
            $wpdb->insert($tbl, [
                'captured_at' => $now,
                'network'     => $net,
                'followers'   => intval($val),
            ], ['%s','%s','%d']);
        }
    }

    private function get_fb_followers_count($opt) {
        // Nécessite: page_id + access_token (Graph API)
        $page_id = trim($opt['fb_page_id'] ?? '');
        $token   = trim($opt['fb_access_token'] ?? '');
        if (!$page_id || !$token) return null;

        // Sur les Pages: fan_count est le plus fiable
        $url = add_query_arg([
            'fields' => 'fan_count',
            'access_token' => $token,
        ], "https://graph.facebook.com/v18.0/{$page_id}");

        $res = wp_remote_get($url, ['timeout'=>20]);
        if (is_wp_error($res)) return null;
        $code = wp_remote_retrieve_response_code($res);
        if ($code < 200 || $code >= 300) return null;
        $data = json_decode(wp_remote_retrieve_body($res), true);
        return isset($data['fan_count']) ? intval($data['fan_count']) : null;
    }

    private function get_ig_followers_count($opt) {
        // Nécessite: ig_user_id (compte business relié) + access_token (Graph API)
        $ig_user_id = trim($opt['ig_user_id'] ?? '');
        $token      = trim($opt['ig_access_token'] ?? '');
        if (!$ig_user_id || !$token) return null;

        $url = add_query_arg([
            'fields' => 'followers_count',
            'access_token' => $token,
        ], "https://graph.facebook.com/v18.0/{$ig_user_id}");

        $res = wp_remote_get($url, ['timeout'=>20]);
        if (is_wp_error($res)) return null;
        $code = wp_remote_retrieve_response_code($res);
        if ($code < 200 || $code >= 300) return null;
        $data = json_decode(wp_remote_retrieve_body($res), true);
        return isset($data['followers_count']) ? intval($data['followers_count']) : null;
    }

    private function get_x_followers_count($opt) {
        // Nécessite: x_username + x_bearer (Twitter API v2)
        $username = trim(ltrim($opt['x_username'] ?? '', '@'));
        $bearer   = trim($opt['x_bearer'] ?? '');
        if (!$username || !$bearer) return null;

        // 1) resolve user id
        $u = "https://api.twitter.com/2/users/by/username/".rawurlencode($username);
        $res1 = wp_remote_get($u, [
            'timeout'=>20,
            'headers'=>['Authorization'=>'Bearer '.$bearer, 'User-Agent'=>'SpreadIt/1.0']
        ]);
        if (is_wp_error($res1)) return null;
        $d1 = json_decode(wp_remote_retrieve_body($res1), true);
        $id = $d1['data']['id'] ?? null;
        if (!$id) return null;

        // 2) metrics
        $m = "https://api.twitter.com/2/users/{$id}?user.fields=public_metrics";
        $res2 = wp_remote_get($m, [
            'timeout'=>20,
            'headers'=>['Authorization'=>'Bearer '.$bearer, 'User-Agent'=>'SpreadIt/1.0']
        ]);
        if (is_wp_error($res2)) return null;
        $d2 = json_decode(wp_remote_retrieve_body($res2), true);
        return isset($d2['data']['public_metrics']['followers_count'])
            ? intval($d2['data']['public_metrics']['followers_count'])
            : null;
    }

    /* ================= ADMIN MENUS ================= */
    public function add_menus() {
        // Sous-menu Analytics
        add_submenu_page(
            'spread-it',
            'Analytics',
            'Analytics',
            'manage_options',
            self::MENU_ANALYTICS,
            [$this,'render_analytics']
        );
        // Sous-menu Analytics Settings (tokens API)
        add_submenu_page(
            'spread-it',
            'Analytics Settings',
            'Analytics Settings',
            'manage_options',
            self::MENU_SETTINGS,
            [$this,'render_settings_page']
        );
    }

    /* ================= SETTINGS (tokens API) ================= */
    public function register_settings() {
        register_setting(self::OPT_KEY, self::OPT_KEY, [
            'type'=>'array',
            'sanitize_callback'=>function($in){
                return [
                    // Facebook / Instagram (Graph API)
                    'fb_page_id'       => sanitize_text_field($in['fb_page_id'] ?? ''),
                    'fb_access_token'  => trim($in['fb_access_token'] ?? ''),
                    'ig_user_id'       => sanitize_text_field($in['ig_user_id'] ?? ''),
                    'ig_access_token'  => trim($in['ig_access_token'] ?? ''),
                    // X (Twitter) API v2
                    'x_username'       => sanitize_text_field($in['x_username'] ?? ''),
                    'x_bearer'         => trim($in['x_bearer'] ?? ''),
                ];
            },
            'default'=>[
                'fb_page_id'      => '',
                'fb_access_token' => '',
                'ig_user_id'      => '',
                'ig_access_token' => '',
                'x_username'      => '',
                'x_bearer'        => '',
            ]
        ]);
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) return;
        $opt = get_option(self::OPT_KEY, []);
        ?>
        <div class="wrap">
            <h1>Spread It — Analytics Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields(self::OPT_KEY); ?>
                <table class="form-table" role="presentation">
                    <tr><th colspan="2"><h2>Facebook (Page)</h2></th></tr>
                    <tr>
                        <th><label for="fb_page_id">Page ID</label></th>
                        <td><input type="text" id="fb_page_id" name="<?php echo esc_attr(self::OPT_KEY); ?>[fb_page_id]" class="regular-text" value="<?php echo esc_attr($opt['fb_page_id'] ?? ''); ?>"></td>
                    </tr>
                    <tr>
                        <th><label for="fb_access_token">Access Token</label></th>
                        <td>
                            <input type="password" id="fb_access_token" name="<?php echo esc_attr(self::OPT_KEY); ?>[fb_access_token]" class="regular-text" placeholder="<?php echo !empty($opt['fb_access_token']) ? '••••••••••••••••' : 'Enter token'; ?>">
                            <?php if (!empty($opt['fb_access_token'])): ?><p class="description" style="color:green;">✓ Token configuré</p><?php endif; ?>
                        </td>
                    </tr>

                    <tr><th colspan="2"><h2>Instagram (Business)</h2></th></tr>
                    <tr>
                        <th><label for="ig_user_id">IG User ID</label></th>
                        <td><input type="text" id="ig_user_id" name="<?php echo esc_attr(self::OPT_KEY); ?>[ig_user_id]" class="regular-text" value="<?php echo esc_attr($opt['ig_user_id'] ?? ''); ?>"></td>
                    </tr>
                    <tr>
                        <th><label for="ig_access_token">Access Token</label></th>
                        <td>
                            <input type="password" id="ig_access_token" name="<?php echo esc_attr(self::OPT_KEY); ?>[ig_access_token]" class="regular-text" placeholder="<?php echo !empty($opt['ig_access_token']) ? '••••••••••••••••' : 'Enter token'; ?>">
                            <?php if (!empty($opt['ig_access_token'])): ?><p class="description" style="color:green;">✓ Token configuré</p><?php endif; ?>
                        </td>
                    </tr>

                    <tr><th colspan="2"><h2>X (Twitter) API v2</h2></th></tr>
                    <tr>
                        <th><label for="x_username">Username (@…)</label></th>
                        <td><input type="text" id="x_username" name="<?php echo esc_attr(self::OPT_KEY); ?>[x_username]" class="regular-text" value="<?php echo esc_attr($opt['x_username'] ?? ''); ?>" placeholder="@yourusername"></td>
                    </tr>
                    <tr>
                        <th><label for="x_bearer">Bearer Token</label></th>
                        <td>
                            <input type="password" id="x_bearer" name="<?php echo esc_attr(self::OPT_KEY); ?>[x_bearer]" class="regular-text" placeholder="<?php echo !empty($opt['x_bearer']) ? '••••••••••••••••' : 'Enter token'; ?>">
                            <?php if (!empty($opt['x_bearer'])): ?><p class="description" style="color:green;">✓ Token configuré</p><?php endif; ?>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <p><em>Note:</em> si les tokens sont vides, on ignore le réseau (aucun appel API).</p>
        </div>
        <?php
    }

    /* ================= ANALYTICS UI ================= */
    public function render_analytics() {
        if (!current_user_can('manage_options')) return;
        global $wpdb;

        $tbl = $wpdb->prefix . self::DB_CLICKS;
        $since = gmdate('Y-m-d H:i:s', time() - 30*DAY_IN_SECONDS);

        // Totaux par réseau (30 jours)
        $by_net = $wpdb->get_results($wpdb->prepare(
            "SELECT network, COUNT(*) c FROM {$tbl} WHERE click_time >= %s GROUP BY network ORDER BY c DESC",
            $since
        ), ARRAY_A);

        // Best hour par réseau (30 jours)
        $best = $wpdb->get_results($wpdb->prepare(
            "SELECT network, HOUR(click_time) h, COUNT(*) c
             FROM {$tbl}
             WHERE click_time >= %s
             GROUP BY network, HOUR(click_time)
             ORDER BY network, c DESC",
            $since
        ), ARRAY_A);

        // Derniers clics
        $recent = $wpdb->get_results(
            "SELECT post_id, network, click_time, device, ip
             FROM {$tbl}
             ORDER BY id DESC
             LIMIT 50", ARRAY_A
        );

        // Map best hour par réseau
        $best_map = [];
        foreach ($best as $row) {
            $n = $row['network'];
            if (!isset($best_map[$n])) $best_map[$n] = ['h'=>$row['h'],'c'=>$row['c']];
        }

        echo '<div class="wrap"><h1>Spread It — Analytics</h1>';

        // Bloc 1: Totaux
        echo '<h2>Clicks (30 jours)</h2>';
        if ($by_net) {
            echo '<table class="widefat striped" style="max-width:720px"><thead><tr><th>Réseau</th><th>Clicks</th><th>Heure optimale</th></tr></thead><tbody>';
            foreach ($by_net as $r) {
                $n = esc_html($r['network']);
                $c = intval($r['c']);
                $best_txt = isset($best_map[$r['network']])
                    ? sprintf('%02dh (~%d clicks)', $best_map[$r['network']]['h'], $best_map[$r['network']]['c'])
                    : '—';
                echo "<tr><td>{$n}</td><td>{$c}</td><td>{$best_txt}</td></tr>";
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Aucun clic enregistré (encore).</p>';
        }

        // Bloc 2: Derniers clics
        echo '<h2 style="margin-top:2rem">Derniers clics</h2>';
        if ($recent) {
            echo '<table class="widefat striped"><thead><tr><th>Date/heure</th><th>Post</th><th>Réseau</th><th>Device</th><th>IP</th></tr></thead><tbody>';
            foreach ($recent as $r) {
                $p = intval($r['post_id']);
                $link = get_permalink($p);
                $title = get_the_title($p) ?: ('#'.$p);
                printf(
                    '<tr><td>%s</td><td><a href="%s" target="_blank">%s</a></td><td>%s</td><td>%s</td><td>%s</td></tr>',
                    esc_html($r['click_time']),
                    esc_url($link),
                    esc_html($title),
                    esc_html($r['network']),
                    esc_html($r['device']),
                    esc_html($r['ip'] ?? '')
                );
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Pas encore de clics récents.</p>';
        }

        echo '<p style="margin-top:2rem"><em>Astuce :</em> ces stats se mettent à jour dès qu\'un visiteur clique un bouton via <code>/spread-go/&lt;post&gt;/&lt;réseau&gt;</code>. Les followers sont pris par cron si les tokens sont configurés.</p>';
        echo '</div>';
    }

    /* ================= Helper public ================= */
    public static function get_best_hour_for_network($network, $days = 30) {
        global $wpdb;
        $tbl = $wpdb->prefix . self::DB_CLICKS;
        $since = gmdate('Y-m-d H:i:s', time() - $days*DAY_IN_SECONDS);
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT HOUR(click_time) h, COUNT(*) c
             FROM {$tbl}
             WHERE click_time >= %s AND network = %s
             GROUP BY HOUR(click_time)
             ORDER BY c DESC LIMIT 1",
            $since, $network
        ), ARRAY_A);
        return $rows ? intval($rows[0]['h']) : null;
    }
}
endif;

// Bootstrap module
add_action('plugins_loaded', function(){
    $GLOBALS['spread_it_tracking'] = new Spread_It_Tracking();
});
