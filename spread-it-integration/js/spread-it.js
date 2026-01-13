jQuery(document).ready(function($) {

    // Création de contenu depuis la page admin
    $('#create-btn').on('click', function() {
        const content = $('#content-input').val();
        const style = $('#style-select').val();
        const length = $('#length-select').val();

        if (!content.trim()) {
            alert('Veuillez saisir du contenu');
            return;
        }

        $(this).prop('disabled', true).text('Traitement...');

        $.ajax({
            url: spread_it_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'spread_it_create',
                nonce: spread_it_ajax.nonce,
                content: content,
                style: style,
                length: length
            },
            success: function(response) {
                const data = JSON.parse(response);

                if (data.error) {
                    alert('Erreur: ' + data.error);
                    return;
                }

                // Afficher les résultats
                $('#improved-content').html(data.content.replace(/\n/g, '<br>'));
                $('#optimal-times').html(data.optimalTimes ?
                    data.optimalTimes.recommended.map(time =>
                        '<span class="badge bg-info me-1">' + time + '</span>'
                    ).join('') : ''
                );

                // Contenu social
                if (data.social) {
                    let socialHtml = '';
                    Object.keys(data.social).forEach(platform => {
                        socialHtml += '<div class="social-item mb-2 p-2 border rounded">' +
                            '<strong>' + platform.charAt(0).toUpperCase() + platform.slice(1) + ':</strong><br>' +
                            data.social[platform].replace(/\n/g, '<br>') +
                            '</div>';
                    });
                    $('#social-content').html(socialHtml);
                }

                $('#result-container').show();
            },
            error: function() {
                alert('Erreur lors de la requête');
            },
            complete: function() {
                $('#create-btn').prop('disabled', false).text('Créer avec IA');
            }
        });
    });

    // Publier sur WordPress
    $('#publish-btn').on('click', function() {
        const content = $('#improved-content').html().replace(/<br>/g, '\n');

        // Créer un nouveau post
        if (confirm('Voulez-vous créer un nouveau post WordPress avec ce contenu ?')) {
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'create_wp_post',
                    content: content,
                    nonce: spread_it_ajax.nonce
                },
                success: function(response) {
                    const data = JSON.parse(response);
                    if (data.success) {
                        alert('Post créé avec succès!');
                        window.open(data.edit_url, '_blank');
                    } else {
                        alert('Erreur: ' + data.message);
                    }
                }
            });
        }
    });

    // Partage sur réseaux sociaux
    $('#share-btn').on('click', function() {
        if (confirm('Voulez-vous partager ce contenu sur les réseaux sociaux ?')) {
            $.ajax({
                url: spread_it_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'spread_it_share',
                    nonce: spread_it_ajax.nonce,
                    platforms: ['facebook', 'twitter'], // À personnaliser
                    schedule: 'now'
                },
                success: function(response) {
                    const data = JSON.parse(response);
                    if (data.success) {
                        alert('Contenu partagé avec succès!');
                    } else {
                        alert('Erreur: ' + data.error);
                    }
                }
            });
        }
    });

    // Meta box - Améliorer le contenu
    $('#enhance-btn').on('click', function() {
        const postContent = tinymce.activeEditor ? tinymce.activeEditor.getContent() :
                           $('#content').val();

        if (!postContent.trim()) {
            alert('Le contenu du post est vide');
            return;
        }

        $(this).prop('disabled', true).text('Amélioration...');

        $.ajax({
            url: spread_it_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'spread_it_create',
                nonce: spread_it_ajax.nonce,
                content: postContent,
                style: 'professionnel',
                length: 'moyen'
            },
            success: function(response) {
                const data = JSON.parse(response);

                if (data.error) {
                    alert('Erreur: ' + data.error);
                    return;
                }

                $('#enhance-result').show();
                $('#enhance-result').data('improved-content', data.content);
            },
            error: function() {
                alert('Erreur lors de l\'amélioration');
            },
            complete: function() {
                $('#enhance-btn').prop('disabled', false).text('Améliorer avec IA');
            }
        });
    });

    // Appliquer l'amélioration
    $('#apply-enhancement').on('click', function() {
        const improvedContent = $('#enhance-result').data('improved-content');

        if (tinymce.activeEditor) {
            tinymce.activeEditor.setContent(improvedContent);
        } else {
            $('#content').val(improvedContent);
        }

        alert('Contenu amélioré appliqué!');
    });

    // Programmer le partage
    $('#schedule-share').on('click', function() {
        alert('Fonctionnalité de programmation à implémenter');
        // TODO: Ouvrir une modal pour choisir les plateformes et l'heure
    });

});