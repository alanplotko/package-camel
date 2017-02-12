$(document).ready(function() {
    if ($('.tracking.button').is(':visible')) {
        $('.tracking.modal').modal({
            onDeny: function() {
            },
            onApprove: function() {
                $.ajax({
                    type: 'POST',
                    url: '/add/tracking',
                    data: {
                        tracking_number: $('#tracking_number').val()
                    },
                    success: function(data) {
                        console.log(data);
                        if (data.hasOwnProperty('invalid_tracking_error')) {
                            $('#tracking_number_warning .header').text("Error: " + data.invalid_tracking_error[0]);
                            $('#tracking_number_warning').show();
                            $('.ui.bottom.attached.blue.tracking.button').click();
                        } else {
                            $('#tracking_number_warning .header').text('');
                            $('#tracking_number_warning').hide();
                            location.reload(true);
                        }
                    },
                    error: function(data) {
                        console.log(data);
                        if (data.hasOwnProperty('invalid_tracking_error')) {
                            $('#tracking_number_warning .header').text("Error: " + data.invalid_tracking_error[0]);
                            $('#tracking_number_warning').show();
                            $('.ui.bottom.attached.blue.tracking.button').click();
                        } else {
                            $('#tracking_number_warning .header').text('');
                            $('#tracking_number_warning').hide();
                            location.reload(true);
                        }
                    }
                });
            }
        }).modal('attach events', '.tracking.button', 'show').modal('setting', 'transition', 'horizontal flip');
    }
    $('.remove.modal').modal({
        onDeny: function() {
        },
        onApprove: function() {
            $.ajax({
                type: 'GET',
                url: '/remove/' + $('#remove_tracking_number').val(),
                success: function(data) {
                    location.reload(true);
                },
                error: function(data) {
                    location.reload(true);
                }
            });
        }
    }).modal('attach events', '.remove.button', 'show').modal('setting', 'transition', 'horizontal flip');
});
