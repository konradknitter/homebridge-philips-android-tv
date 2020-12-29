import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    Logging,
    PlatformAccessory,
    Service,
} from 'homebridge';

import request from 'request';
import wol from 'wake_on_lan';

import PhilipsTV from './PhilipsTV';

const PLUGIN_NAME = 'homebridge-philips-android-tv';
let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory('PhilipsAndroidTV', PhilipsAndroidTvAccessory);
};

class PhilipsAndroidTvAccessory implements AccessoryPlugin {

    private readonly log: Logging;
    private readonly name: string;
    private readonly config: AccessoryConfig;
    private readonly informationService: Service;
    private readonly tvService: Service;
    private readonly tvSpeaker: Service;
    private readonly tvAccessory: PlatformAccessory;
    private readonly muteSwitch?: Service;
    private readonly volumeLightbulb?: Service;
    private readonly api: API;
    private configuredApps = {};
    private volumeCurrent = 0;
    private volumePreMute = 0;
    private volumeMin = 0;
    private volumeMax = 0;
    private unknownStructure = false;
    private lastError = '';
    private lastPlayPause = 'Pause';
    private tv : PhilipsTV;

    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.config = config;
        this.api = api;

        if (Object.keys(this.config).includes('channels')) {
            if (Array.isArray(this.config.channels)) {
                const newStructure = {
                    'useFavorites': false,
                    'channels': this.config.channels,
                };

                this.config.channels = newStructure;
                this.log.warn('You are using legacy structure of channels configuration. Please update it to remove this warning.');
            }
        } else {
            this.config.channels = {
                'useFavorites': false,
            };
        }

        this.tv = new PhilipsTV(log, String(config.ip), String(config.apiUser), String(config.apiPass), String(config.macAddress));

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

        this.tvSpeaker.setCharacteristic(hap.Characteristic.VolumeControlType, hap.Characteristic.VolumeControlType.ABSOLUTE);
      
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

        if (this.config.dedicatedMuteSwitch) {
            this.muteSwitch = new hap.Service.Switch(this.name + ' Mute Switch');
            this.muteSwitch.getCharacteristic(hap.Characteristic.On)
                .on('get', this.getMute.bind(this))
                .on('set', this.setMute.bind(this));
        }

        if (this.config.dedicatedVolumeLightbulb) {

            this.volumeLightbulb = new hap.Service.Lightbulb(this.name + ' Volume Bulb', this.name + ' Volume Lightbulb');

            this.volumeLightbulb.getCharacteristic(hap.Characteristic.Brightness)
                .on('get', this.getVolume.bind(this))
                .on('set', this.setVolume.bind(this));
        }

        new Promise((resolution) => {
            this.tv.callWhenBecomeResponsive(resolution);
        }).then(() => {
            return new Promise((resolution) => {
                this.log.info('Startup Phase #2 - Fetching information about channels from TV');
                this.fetchChannels(resolution);
            });
        }).then(() => {
            return new Promise((resolution) => {
                this.log.info('Startup Phase #3 - Fetching information about application from TV');
                this.fetchPossibleApplications(resolution);
            });
        }).then(() =>{
            if (Object.keys(this.configuredApps).length === 0) {
                this.log.warn('No applications/channel inputs had been configured.' +
                    'If that was not inteneded, make sure that TV is available during homebridge startup.');
            } else {
                if (this.config.printConfiguredApps) {
                    this.log.info(JSON.stringify(this.configuredApps));
                }
            }
            this.log.info('Startup Completed - Publishing External HomeKit Accessory.' +
                'Accessory will not be automaticly added to Home - it has to be manually added in Home app.');
            this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
        });

        setInterval(() => {
            this.getOn((error, state) => {
                if (error) {
                    this.log.warn('recurentTask:' + error);
                } else {
                    this.tvService.getCharacteristic(hap.Characteristic.Active).updateValue(state as number);
                }
            });

            this.getCurrentActivity((error, state) => {
                if (error) {
                    this.log.warn('recurentTask:' + error);
                } else {
                    this.tvService.getCharacteristic(hap.Characteristic.ActiveIdentifier).updateValue(state as number);
                }
            });
        }, 10000);
    }

    identify(): void {
        this.log('Identify!');
    }

    getServices(): Service[] {
        const services : Service[] = [];
        if (this.config.dedicatedVolumeLightbulb) {
            services.push(this.volumeLightbulb!);
        }
        if (this.config.dedicatedMuteSwitch) {
            services.push(this.muteSwitch!);
        }
        if (this.config.registerAsDefaultAccessory) {
            services.push(this.tvService);
            services.push(this.informationService);
            services.push(this.tvSpeaker);
        }
        return services;
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
                    if (currentApp.component.packageName === 'NA'
                        || currentApp.component.packageName === 'org.droidtv.zapster'
                        || currentApp.component.packageName === 'org.droidtv.playtv') {
                        request(this.buildRequest('activities/tv', 'GET', ''), function(this, error, response, body) {
                            if (response) {
                                if (response.statusCode === 200) {
                                    const currentChannel = JSON.parse(body);
                                    for (const [app_id, app] of Object.entries(this.configuredApps)) {  
                                        if (currentChannel && Object.prototype.hasOwnProperty.call(currentChannel, 'channel')
                                            && Object.prototype.hasOwnProperty.call(currentChannel.channel, 'name')) {
                                            if ((app as any).name === currentChannel.channel.name){
                                                this.log.debug('Current TV Channel is: ' + (app as any).name);
                                                callback(null, Number(app_id));
                                                return;
                                            }
                                        } else {
                                            if (!this.unknownStructure) {
                                                this.log.warn('getCurrentActivity: unknown activities/tv structure: ' + body);
                                                this.unknownStructure = true;
                                            }
                                        }
                                    }
                                }
                            }
                            if (!this.unknownStructure) {
                                this.log.debug('getCurrentActivity: unknown application:' + body);
                                this.unknownStructure = true;
                            }
                            callback(null);
                        }.bind(this));
                        return;
                    } else {
                        request(this.buildRequest('applications', 'GET', ''), function(this, error, response, body) {
                            if (response) {
                                if (response.statusCode === 200) {
                                    const applications = JSON.parse(body);
                                    for (const application of applications.applications) {
                                        if (application.intent.component.packageName === currentApp.component.packageName) {
                                            for (const [app_id, app] of Object.entries(this.configuredApps)) {  
                                                if ((app as any).name === application.label){
                                                    this.log.debug('Current APP is: ' + (app as any).name);
                                                    callback(null, Number(app_id));
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    this.log.warn('getCurrentActivity: statusCode:' + response.statusCode);
                                }
                            } else {
                                if (this.lastError !== String(error)) {
                                    this.log.warn('getCurrentActivity: error:' + error);
                                    this.lastError = String(error);
                                }
                            }
                            this.log.warn('getCurrentActivity: unknown application:' + JSON.stringify(currentApp));
                            callback(null);
                        }.bind(this));
                    }
                    return;
                } else {
                    this.log.warn('getCurrentActivity: statusCode:' + response.statusCode);
                }
            } else {
                if (this.lastError !== String(error)) { 
                    this.log.warn('getCurrentActivity: error: ' + error);
                    this.lastError = String(error);
                }
                callback(null, 0);
            }
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
        //@ts-ignore
        if (this.config.channels.useFavorites) {
            request(this.buildRequest('channeldb/tv/favoritelLists/all', 'GET', ''), function(this, error, response, body) {
                if (response) {
                    if (response.statusCode === 200) {
                        const settings = JSON.parse(body);
                        let log = 'Favorite Channels: ';
                        for (const channel of settings.Channel) {
                            log += channel.name + ', ';
                        }
                        
                        this.log.info(log);

                        let i = Object.keys(this.configuredApps).length;
                        for (const channel of settings.Channel) {
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
                    } else {
                        this.log.debug('fetchChannels: ' + response.statusCode);
                    }
                } else {
                    this.log.debug('fetchChannels:' + error);
                    this.log.warn('fetchChannels - can not reach TV API.' + 
                        'Inputs won\'t be visible in HomeKit. Please restart homebridge when TV will be online to recover inputs.');
                }
                resolution();
            }.bind(this));
        } else {
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
                            if (Object.keys(this.config).includes('channels')) {
                                if (this.config.channels.channels.includes(channel.name)) {
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
                    } else {
                        this.log.debug('fetchChannels: ' + response.statusCode);
                    }
                } else {
                    this.log.debug('fetchChannels:' + error);
                    this.log.warn('fetchChannels - can not reach TV API.' + 
                        'Inputs won\'t be visible in HomeKit. Please restart homebridge when TV will be online to recover inputs.');
                }
                resolution();
            }.bind(this));
        }
        
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
                        if (Object.keys(this.config).includes('apps')) {
                            if (this.config.apps.includes(application.label)) {
                                this.configuredApps[i] = {'name': application.label, 'type': 'app'};
                                const service = new hap.Service.InputSource(this.name + application.label, application.label);
                    
                                service.setCharacteristic(hap.Characteristic.Identifier, i++);
                                service.setCharacteristic(hap.Characteristic.ConfiguredName, application.label);
                                service.setCharacteristic(hap.Characteristic.IsConfigured, hap.Characteristic.IsConfigured.CONFIGURED);
                                service.setCharacteristic(hap.Characteristic.InputSourceType,
                                    hap.Characteristic.InputSourceType.APPLICATION);
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
                } else {
                    this.log.debug('fetchPossibleApplications: ' + response.statusCode);
                }
            } else {
                this.log.warn('fetchPossibleApplications - can not reach TV API.' +
                    ' Inputs won\'t be visible in HomeKit. Please restart homebridge when TV will be online to recover inputs.');
            }
            resolution();
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
        if (value === 1) {
            this.tv.turnOn();
        } else {
            this.tv.turnOff();
        }
        callback(null, value);
    }

    getOn(callback: CharacteristicGetCallback) {
        callback(null, this.tv.isOn());
    }

    sendVolumeControl(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        const request_body = { 'key': '' };
        if (remoteKey === hap.Characteristic.VolumeSelector.INCREMENT) {
            request_body.key = 'VolumeUp';
        } else if (remoteKey === hap.Characteristic.VolumeSelector.DECREMENT) {
            request_body.key = 'VolumeDown';
        }
        this.log.debug('sendkey:' + request_body.key);
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
            if (this.config.alternativePlayPause) {
                if (this.lastPlayPause === 'Pause') {
                    request_body.key = 'Play';
                    this.lastPlayPause = 'Play';
                } else {
                    request_body.key = 'Pause';
                    this.lastPlayPause = 'Pause';
                }
            } else {
                request_body.key = 'PlayPause';
            }
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

    wakeOnLan(callback) {
        if (!this.config.macAddress) {
            this.log.debug('MAC address not configured, no wakey');
            if (callback) {
                callback();
            }
            return;
        }
        this.log.debug('Try to wake up ' + this.config.name + ' on ' + this.config.macAddress);
        wol.wake(this.config.macAddress, { address: '255.255.255.255' }, function (this, error) {
            if (error) {
                this.log.warn('Error when sending WOL packets', error);
            } else {
                this.log.debug('WOL packets sends successful');
                if (callback) {
                    callback();
                }
            }
        }.bind(this));
    }
}
