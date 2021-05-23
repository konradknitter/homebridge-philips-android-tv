/*global $, homebridge :writable*/

let configs = [];
let tv = {};
let pairTimestamp = 0;

const validate = {
    mac: /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/,
    ip: /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    pin: /^[0-9]{4}$/
};

function resetUI() {
    $('.card').hide();
    homebridge.hideSchemaForm();
}

function showSchemaEditor() {
    homebridge.showSchemaForm();
}

$('.startPairingProcess').each(function () {
    $(this).on('click', () => {
        $('.card').hide();
        $('#pairing').show();
    
        if (tv.ip) {
            $('#ip').val(tv.ip)
        }
    
        if (tv.mac) {
            $('#mac').val(tv.mac)
        }
    
        if (tv.name) {
            $('#name').val(tv.name)
        }
    });
});

$('#parameterEditor').on('click', () => {
    $('.card').hide();
    homebridge.showSchemaForm();
});

$('#startPair').on('click', async () => {
    if (!validate.ip.test($('#ip').val())) {
        homebridge.toast.error('There is no valid ip configured for this tv!', 'Error');
        return
    }

    if (!$('#name').val()) {
        homebridge.toast.error('Missing name', 'Error');
        return
    }

    if ($('#mac').val() && !validate.mac.test($('#mac').val())) {
        homebridge.toast.error('There is no valid MAC Address configured for this tv!', 'Error');
        return;
    }

    try {
        let result = await homebridge.request('/startpair', {
            'ip': $('#ip').val(),
        });
        if (result.status === 0) {
            tv['ip'] = $('#ip').val(),
            tv['mac'] = $('#mac').val(),
            tv['name'] = $('#name').val(),

            pairTimestamp = result.timestamp;
            $('.card').hide();
            $('#pairAuthentication').show();
        }
        else {
            homebridge.toast.error('Error ' + result.errorCode);
        }
    } catch (err) {
        homebridge.toast.error(err.message, 'Error');
    }
});

$("#pairAuthenticationButton").on('click', async () => {
    if (!validate.pin.test($('#pin').val())) {
        homebridge.toast.error('Wrong PIN', 'Error');
    } else {
        try {
            let result = await homebridge.request('/authgrant', {
                ip: $('#ip').val(),
                pin: $('#pin').val(),
                timestamp: pairTimestamp
            });

            if (result.status === 0) {
                tv['apiUser'] = result.login,
                tv['apiPass'] = result.password,    
                console.log(configs)
                configs[0].tvs.push(tv);
                await homebridge.updatePluginConfig(configs);
                await homebridge.savePluginConfig();
                $('.card').hide();
                $('#login').html(tv.apiUser)
                $('#password').html(tv.apiPass)
                $('#pairSuccess').show();
            } else {
                homebridge.toast.error('Error ' + result.errorCode);
            }
        } catch (err) {
            homebridge.toast.error(err.message, 'Error');
        }
    }
});

(async () => {
    try {
        configs = await homebridge.getPluginConfig();
        console.log(configs)
        if (!configs.length) {
            configs = [{
                "debug": false,
                "configVersion": 1,
                "tvs": []
            }];
        } else {
            configs[0].tvs.forEach((tv, index) => {
                $('#tvs').html(
                    '<button id="editTv' + index + '" class="btn center-it tvEdit">Edit "' + tv.name + '"</button><br/>'
                    + $('#tvs').html());
            })

            configs[0].tvs.forEach((tv, index) => {
                $('#editTv' + index).on('click', () => {
                    $('.card').hide();
                    tv = configs[0].tvs[index];
                    $('#config').show();
                });
            })
        }
        $('#connectNewTV').on('click', () => {
            $('.card').hide();
            tv = {};
            $('#instructions').show();
        });
        $('.card').hide();
        $('#welcome').show();
    } catch {
        console.log("ERROR");
    }
})();