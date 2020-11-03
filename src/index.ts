import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    Logger,
    Logging,
    PlatformAccessory,
    PlatformConfig,
    Service,
} from 'homebridge';

import request from 'request';
import wol from 'wake_on_lan';

const PLUGIN_NAME = 'homebridge-philips-android-tv';
const PLATFORM_NAME = 'philipsandroidplatform';
let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory('PhilipsAndroidTV', PhilipsAndroidTvAccessory);
    api.registerPlatform(PLATFORM_NAME, PhilipsAndroidTVPlatform);
};

class PhilipsAndroidTVPlatform {
    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
    }
}

class PhilipsAndroidTvAccessory implements AccessoryPlugin {

    private readonly log: Logging;
    private readonly name: string;
    private readonly config: AccessoryConfig;
    private readonly informationService: Service;
    private readonly tvService: Service;
    private readonly tvSpeaker: Service;
    private readonly tvAccessory: PlatformAccessory;
    private readonly api: API;
    // private readonly configuredApps = ['YouTube', 'Netflix'];
    private configuredApps = {};
    private volumeCurrent = 0;
    private volumePreMute = 0;
    private volumeMin = 0;
    private volumeMax = 0;

    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.config = config;
        this.api = api;

        const uuid = hap.uuid.generate(PLUGIN_NAME + this.name);

        this.tvAccessory = new api.platformAccessory(this.name, uuid, hap.Categories.TELEVISION);
        this.tvAccessory.context.isexternal = true;

        this.tvService = new hap.Service.Television(this.name, this.name);
        this.tvService.setCharacteristic(hap.Characteristic.ConfiguredName, this.name);

        this.tvService.getCharacteristic(hap.Characteristic.ActiveIdentifier)
            .on(CharacteristicEventTypes.GET, this.getCurrentActivity.bind(this))
            .on(CharacteristicEventTypes.SET, this.launchActivity.bind(this));

        this.tvService.getCharacteristic(hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.getOn.bind(this))
            .on(CharacteristicEventTypes.SET, this.setOn.bind(this));

        this.tvService.setCharacteristic(
            hap.Characteristic.SleepDiscoveryMode,
            hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
        );

        this.tvService.getCharacteristic(hap.Characteristic.RemoteKey)
            .on('set', this.sendKey.bind(this));

        this.tvSpeaker = new hap.Service.TelevisionSpeaker(this.name, 'speaker');

        this.tvSpeaker.getCharacteristic(hap.Characteristic.Mute)
            .on('get', this.getMute.bind(this))
            .on('set', this.setMute.bind(this));

        this.tvSpeaker.getCharacteristic(hap.Characteristic.Volume)
            .on('get', this.getVolume.bind(this))
            .on('set', this.setVolume.bind(this));

        this.tvSpeaker.getCharacteristic(hap.Characteristic.VolumeSelector)
            .on('set', this.sendVolumeControl.bind(this));

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Name, config.name)
            .setCharacteristic(hap.Characteristic.Manufacturer, 'Philips');

        this.informationService.getCharacteristic(hap.Characteristic.Model)
            .on('get', this.getModel.bind(this));

        this.tvService.addLinkedService(this.tvSpeaker);
        this.tvService.addLinkedService(this.informationService);

        this.fetchCurrentActivity();
        this.fetchCurrentTv();
        this.fetchSettings();

        log.info('Switch finished initializing!');

        this.tvAccessory.addService(this.tvService);
        this.tvAccessory.addService(this.tvSpeaker);

        new Promise((resolution) => {
            this.fetchChannels(resolution);
            return new Promise((subresolution) => {
                this.fetchPossibleApplications(subresolution);
            });
        }).then(() =>{
            this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
        });
    }

    identify(): void {
        this.log('Identify!');
    }

    getServices(): Service[] {
        return [];
    }

    buildRequest(url: string, method: string, body: string) {
        return {
            url: 'https://' + this.config.ip + ':1926/6/' + url,
            method: method,
            body: body,
            rejectUnauthorized: false,
            timeout: 1000,
            followAllRedirects: true,
            forever: true,
            auth: {
                user: this.config.apiUser,
                pass: this.config.apiPass,
                sendImmediately: false,
            },
        };
    }

    getCurrentActivity(callback: CharacteristicGetCallback) {
        request(this.buildRequest('activities/current', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    const currentApp = JSON.parse(body);
                    if (currentApp.component.packageName === 'NA') {
                        request(this.buildRequest('activities/tv', 'GET', ''), function(this, error, response, body) {
                            if (response) {
                                if (response.statusCode === 200) {
                                    this.log.debug('getCurrentTV: ' + body);
                                    callback(null);
                                }
                            }
                        }.bind(this));
                        return;
                    }
                    callback(null);
                    return;
                }
            }
            callback(null, 0);
        }.bind(this));
    }

    getModel(callback: CharacteristicGetCallback) {
        request(this.buildRequest('system', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    const system = JSON.parse(body);
                    callback(null, system.name);
                    return;
                }
                callback(null, 'Unknown');
            }
        }.bind(this));
    }

    fetchCurrentActivity() {
        request(this.buildRequest('activities/current', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    this.log.info(JSON.parse(body));
                }
            }
        }.bind(this));
    }

    fetchCurrentTv() {
        request(this.buildRequest('activities/tv', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    this.log.info(JSON.parse(body));
                }
            }
        }.bind(this));
    }

    fetchChannels(resolution) {
        request(this.buildRequest('channeldb/tv/channelLists/all', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    const settings = JSON.parse(body);
                    let log = 'Available Channels: ';
                    for (const channel of settings.Channel) {
                        log += channel.name + ', ';
                    }
                    
                    this.log.info(log);

                    let i = Object.keys(this.configuredApps).length;
                    for (const channel of settings.Channel) {
                        if (this.config.channels.includes(channel.name)) {
                            this.configuredApps[i] = {'name': channel.name, 'type': 'channel'};
                            const service = new hap.Service.InputSource(this.name + channel.name, channel.name);
                
                            service.setCharacteristic(hap.Characteristic.Identifier, i++);
                            service.setCharacteristic(hap.Characteristic.ConfiguredName, channel.name);
                            service.setCharacteristic(hap.Characteristic.IsConfigured, hap.Characteristic.IsConfigured.CONFIGURED);
                            service.setCharacteristic(hap.Characteristic.InputSourceType, hap.Characteristic.InputSourceType.TUNER);
                            service.setCharacteristic(hap.Characteristic.CurrentVisibilityState,
                                hap.Characteristic.CurrentVisibilityState.SHOWN);
                
                            service.getCharacteristic(hap.Characteristic.ConfiguredName)
                                .on('set', (name, callback) => {
                                    callback(null, name);
                                });
                
                            this.tvAccessory.addService(service);
                            this.tvService.addLinkedService(service);
                        }
                    }
                }
                resolution();
            } else {
                this.log.debug('fetchChannels:' + error);
            }
        }.bind(this));
    }

    fetchSettings() {
        request(this.buildRequest('menuitems/settings/structure', 'GET', ''), function(this, error, response) {
            if (response) {
                if (response.statusCode === 200) {
                    // const settings = JSON.parse(body);
                    // this.log.info(settings.node.data.nodes[0].data.nodes[0].data.enums);
                }
            } else {
                this.log.debug('fetchChannels:' + error);
            }
        }.bind(this));
    }

    launchActivity(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        this.log.debug('Launch activity:' + JSON.stringify(this.configuredApps[Number(value)]));
        if (this.configuredApps[Number(value)].type === 'app') {
            request(this.buildRequest('applications', 'GET', ''), function(this, error, response, body) {
                if (response) {
                    if (response.statusCode === 200) {
                        const applications = JSON.parse(body);
                        for (const application of applications.applications) {
                            if (application.label === this.configuredApps[Number(value)].name) {
                                request(this.buildRequest('activities/launch', 'POST', JSON.stringify(application)), function(this) {
                                    callback(null, value);
                                });
                                return;
                            }
                        }
                    }
                } else {
                    this.log.debug('launchActivity:' + error);
                }
                callback(null, value);
            }.bind(this));
        } else if (this.configuredApps[Number(value)].type === 'channel') {
            request(this.buildRequest('channeldb/tv/channelLists/all', 'GET', ''), function(this, error, response, body) {
                const settings = JSON.parse(body);
                for (const channel of settings.Channel) {
                    if (channel.name === this.configuredApps[Number(value)].name) {
                        const channelRequest = {'channel': channel};
                        request(this.buildRequest('activities/tv', 'GET', ''), function(this, error, response, body) {
                            if (response) {
                                if (response.statusCode === 200) {
                                    this.log.debug('getCurrentTV: ' + body);
                                    channelRequest['channelList'] = JSON.parse(body).channelList;
                                    request(this.buildRequest('activities/tv', 'POST', JSON.stringify(channelRequest)),
                                        function(this, error, response) {
                                            if (!response) {
                                                this.log.debug(error);
                                            }
                                            callback(null, value);
                                            return;
                                        }.bind(this));
                                }
                            }
                        }.bind(this));
                    }
                }
            }.bind(this));
        }
    }

    fetchPossibleApplications(resolution) {
        request(this.buildRequest('applications', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    const applications = JSON.parse(body);
                    let log = 'Available applications: ';
                    for (const application of applications.applications) {
                        log += application.label + ', ';
                    }
                    this.log.info(log);

                    let i = Object.keys(this.configuredApps).length;
                    for (const application of applications.applications) {
                        if (this.config.apps.includes(application.label)) {
                            this.configuredApps[i] = {'name': application.label, 'type': 'app'};
                            const service = new hap.Service.InputSource(this.name + application.label, application.label);
                
                            service.setCharacteristic(hap.Characteristic.Identifier, i++);
                            service.setCharacteristic(hap.Characteristic.ConfiguredName, application.label);
                            service.setCharacteristic(hap.Characteristic.IsConfigured, hap.Characteristic.IsConfigured.CONFIGURED);
                            service.setCharacteristic(hap.Characteristic.InputSourceType, hap.Characteristic.InputSourceType.APPLICATION);
                            service.setCharacteristic(hap.Characteristic.CurrentVisibilityState,
                                hap.Characteristic.CurrentVisibilityState.SHOWN);
                
                            service.getCharacteristic(hap.Characteristic.ConfiguredName)
                                .on('set', (name, callback) => {
                                    callback(null, name);
                                });
                
                            this.tvAccessory.addService(service);
                            this.tvService.addLinkedService(service);
                        }
                    }
                } else {
                    this.log.debug('fetchPossibleApplications: ' + response.statusCode);
                }
                resolution();
            }
        }.bind(this));
    }

    getVolume(callback: CharacteristicGetCallback) {
        request(this.buildRequest('audio/volume', 'GET', ''), function(this, error, response, body) {
            if (body) {
                const volume = JSON.parse(body);
                const volumeLevel = (volume.current / (volume.max - volume.min)) * 100;
                this.volumeCurrent = volume.current;
                this.volumeMax = volume.max;
                this.volumeMin = volume.min;
                callback(null, volumeLevel);
                return;
            } else {
                this.log.debug('Device ' + this.config.name + ' is offline');
                callback(null, 0);
            }
        }.bind(this));
        return this;
    }

    setVolume(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        const newVolume = Math.floor((Number(value) * (this.volumeMax - this.volumeMin)) / 100);
        const request_body = { 'muted': false, 'current': newVolume };
        request(this.buildRequest('audio/volume', 'POST', JSON.stringify(request_body)), function(this, error, response) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
                this.log.debug(response.statusCode);
            } else {
                this.log.debug('setVolume: ' + error);
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }

    getMute(callback: CharacteristicGetCallback) {
        request(this.buildRequest('audio/volume', 'GET', ''), function(this, error, response, body) {
            if (body) {
                const volume = JSON.parse(body);
                if (true === volume.muted) {
                    this.log.debug('Device ' + this.config.name + ' is muted.');
                    callback(null, true);
                    return;
                }
            } else {
                this.log.debug('Device ' + this.config.name + ' is not muted or offline');
                callback(null, true);
            }
        }.bind(this));
        return this;
    }

    setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        const request_body = { 'muted': value, 'current': this.volumeCurrent };
        if (value) {
            this.volumePreMute = this.volumeCurrent;
            request_body.current = 0;
        } else {
            request_body.current = this.volumePreMute;
        }
        request(this.buildRequest('audio/volume', 'POST', JSON.stringify(request_body)), function(this, error, response) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
            } else {
                this.log.debug('setMute: ' + error);
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }

    setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        let request_body;
        if (value === 1) {
            request_body = { 'powerstate': 'On' };
        } else {
            request_body = { 'powerstate': 'Standby' };
        }
        request(this.buildRequest('powerstate', 'POST', JSON.stringify(request_body)), function(this, error, response) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
            } else {
                this.log.debug('setOn: ' + error);
                this.wakeOnLan();
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }

    getOn(callback: CharacteristicGetCallback) {
        request(this.buildRequest('powerstate', 'GET', ''), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    if (body) {
                        const powerstate = JSON.parse(body);
                        if ('On' === powerstate.powerstate) {
                            callback(null, true);
                            return;
                        }
                        this.log.debug('Device ' + this.config.name + ' is standby. ' + body);
                        callback(null, false);
                    } else {
                        this.log.debug('Device ' + this.config.name + ' is offline. ' + response.statusCode);
                        callback(null, false);
                    }
                }
            } else {
                this.log.debug('Device ' + this.config.name + ' is offline. ' + error);
                callback(null, false);   
            }
        }.bind(this));
        return this;
    }

    sendVolumeControl(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        const request_body = { 'key': '' };
        if (remoteKey === hap.Characteristic.VolumeSelector.INCREMENT) {
            request_body.key = 'VolumeUp';
        } else if (remoteKey === hap.Characteristic.VolumeSelector.DECREMENT) {
            request_body.key = 'VolumeDown';
        }
        this.log.debug('sendkey:' + request_body);
        if (request_body.key) {
            request(this.buildRequest('input/key', 'POST', JSON.stringify(request_body)), function(this, error, response) {
                if (response) {
                    if (response.statusCode === 200) {
                        callback(null, remoteKey);
                        return;
                    } else {
                        this.log.debug('sendkey:' + response.statusCode);
                    }
                } else {
                    this.log.debug('sendkey:' + error);
                }
                callback(null, 0);
            }.bind(this));
        } else {
            this.log.debug('Unsupported key: ' + remoteKey);
        }
    }

    sendKey(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        // https://developers.homebridge.io/#/characteristic/RemoteKey
        // https://github.com/eslavnov/pylips/wiki/Input-key-(POST)
        const request_body = { 'key': '' };
        if (remoteKey === hap.Characteristic.RemoteKey.REWIND) {
            request_body.key = 'Rewind';
        } else if (remoteKey === hap.Characteristic.RemoteKey.FAST_FORWARD) {
            request_body.key = 'FastForward';
        } else if (remoteKey === hap.Characteristic.RemoteKey.NEXT_TRACK) {
            request_body.key = 'Next';
        } else if (remoteKey === hap.Characteristic.RemoteKey.PREVIOUS_TRACK) {
            request_body.key = 'Previous';
        } else if (remoteKey === hap.Characteristic.RemoteKey.ARROW_UP) {
            request_body.key = 'CursorUp';
        } else if (remoteKey === hap.Characteristic.RemoteKey.ARROW_LEFT) {
            request_body.key = 'CursorLeft';
        } else if (remoteKey === hap.Characteristic.RemoteKey.ARROW_RIGHT) {
            request_body.key = 'CursorRight';
        } else if (remoteKey === hap.Characteristic.RemoteKey.ARROW_DOWN) {
            request_body.key = 'CursorDown';
        } else if (remoteKey === hap.Characteristic.RemoteKey.SELECT) {
            request_body.key = 'Confirm';
        } else if (remoteKey === hap.Characteristic.RemoteKey.BACK) {
            request_body.key = 'Back';
        } else if (remoteKey === hap.Characteristic.RemoteKey.EXIT) {
            request_body.key = 'Exit';
        } else if (remoteKey === hap.Characteristic.RemoteKey.PLAY_PAUSE) {
            request_body.key = 'PlayPause';
        } else if (remoteKey === hap.Characteristic.RemoteKey.INFORMATION) {
            request_body.key = 'Home';
        }

        if (request_body.key) {
            request(this.buildRequest('input/key', 'POST', JSON.stringify(request_body)), function(this, error, response) {
                if (response) {
                    if (response.statusCode === 200) {
                        callback(null, remoteKey);
                        return;
                    } else {
                        this.log.debug('sendkey:' + response.statusCode);
                    }
                }
                this.log.debug('sendkey:' + error);
                callback(null, 0);
            }.bind(this));
        } else {
            this.log.debug('Unsupported key: ' + remoteKey);
        }
    }

    wakeOnLan() {
        if (!this.config.macAddress) {
            return;
        }
        this.log.debug('Trying to wake ' + this.config.name + ' on ' + this.config.macAddress);
        wol.wake(this.config.macAddress, { address: '255.255.255.255' }, function (this, error) {
            if (error) {
                this.log.warn('Error when sending WOL packets', error);
            }
        }.bind(this));
    }
}