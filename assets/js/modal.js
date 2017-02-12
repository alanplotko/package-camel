$(document).ready(function() {
    if ($('.tracking.button').is(':visible')) {
        $('.tracking.modal').modal({
            onDeny: function() {
                return false;
            },
            onApprove: function() {
                $.ajax({
                    type: 'POST',
                    url: '/add/tracking',
                    data: {
                        tracking_number: $('#tracking_number').val()
                    },
                    dataType: 'json',
                    success: function(data) {
                        window.location.replace('/dashboard');
                    }
                });
            }
        }).modal('attach events', '.tracking.button', 'show').modal('setting', 'closable', true).modal('setting', 'transition', 'horizontal flip');
    }
});
