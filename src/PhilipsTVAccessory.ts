import {
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    Logger,
    PlatformAccessory,
    Service,
} from 'homebridge';

import { Authentication, PhilipsTV, PhilipsTVConfig } from '@konradknitter/philipsandroidtv';
import PhilipsTVChannels from './PhilipsTVChannels';

export interface PhilipsTVPluginConfig {
    debug: boolean;
    name: string;
    ip: string;
    mac: string;
    apiVersion: number;
    wakeUntilAPIReadyCounter: number;
    apiUser: string;
    apiPass: string;
    alternatingPlayPause: boolean;
    channels: {
        useFavorites: boolean;
        favoriteListId: number;
        includeAll: boolean;
        channels: Array<string>;
    };
    apps: Array<string>;
}

export class PhilipsTVAccessory {
    private readonly accessory: PlatformAccessory;
    private readonly api: API;
    private readonly config: PhilipsTVPluginConfig;
    private readonly channels: PhilipsTVChannels;
    private readonly log: Logger;
    private apps = {};
    private configuredApps = {};
    private tvService?: Service;
    private tvSpeaker?: Service;
    private informationService?: Service;
    private tv: PhilipsTV;

    private lastPlayPause = 'Play';

    private on = false;
    private responsive = false;
    private volume = 0;
    private lastPositiveVolume = 0;
    private currentApp = {
        component: {
            packageName: '',
        },
    };

    private currentChannel = {
        channel: {
            name: '',
        },
    };

    constructor(log: Logger, api: API, accessory: PlatformAccessory, config: PhilipsTVPluginConfig) {
        this.accessory = accessory;
        this.api = api;
        this.config = config;
        this.log = log;
        this.channels = new PhilipsTVChannels;

        const auth: Authentication = {
            user: config.apiUser,
            pass: config.apiPass,
            sendImmediately: false,
        };

        const tvConfig: PhilipsTVConfig = {
            apiVersion: 6,
            wakeUntilAPIReadyCounter: 100,
        };

        if (this.config.apiVersion) {
            tvConfig.apiVersion = this.config.apiVersion;
        }

        if (this.config.wakeUntilAPIReadyCounter) {
            tvConfig.wakeUntilAPIReadyCounter = this.config.wakeUntilAPIReadyCounter;
        }
        
        this.tv = new PhilipsTV(config.ip, config.mac, auth, tvConfig);
    }

    getSupportingServices() {
        return [this.tvService, this.tvSpeaker];
    }

    async fetchTVData() {
        this.log.info('[' + this.config.name + '] Connecting to TV to fetch current informations');
        try {
            const result = await this.tv.wakeUntilAPIReady();
            this.log.info('[' + this.config.name + '] TV state ' + JSON.stringify(result));
    
            const apps = await this.tv.getApplications();
            this.log.debug('[' + this.config.name + '] Applications: (lenght) ' + apps.applications.length);
    
            this.apps = apps;
    
            const channels = await this.tv.getTVChannels();
            this.log.debug('[' + this.config.name + '] Channels: (lenght) ' + channels.Channel.length);
    
            this.channels.reloadChannels(JSON.stringify(channels));
    
            await this.tv.getVolumePercentage();
        } catch {
            this.log.error('[' + this.config.name + '] Couldn\'t fetch basic informations from TV.');
        }
    }

    async setupPlatformAccessory() {
        this.accessory.context.isexternal = true;

        this.tvService = new this.api.hap.Service.Television(this.accessory.displayName, this.accessory.displayName);
        this.tvService.setCharacteristic(this.api.hap.Characteristic.ConfiguredName, this.accessory.displayName);

        this.tvService = new this.api.hap.Service.Television(this.accessory.displayName, this.accessory.displayName);
        this.tvService.setCharacteristic(this.api.hap.Characteristic.ConfiguredName, this.accessory.displayName);

        this.tvService.getCharacteristic(this.api.hap.Characteristic.ActiveIdentifier)
            .on(CharacteristicEventTypes.GET, this.getCurrentActivity.bind(this))
            .on(CharacteristicEventTypes.SET, this.launchActivity.bind(this));

        this.tvService.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.getOn.bind(this))
            .on(CharacteristicEventTypes.SET, this.setOn.bind(this));

        this.tvService.setCharacteristic(
            this.api.hap.Characteristic.SleepDiscoveryMode,
            this.api.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
        );

        this.tvService.getCharacteristic(this.api.hap.Characteristic.RemoteKey)
            .on('set', this.sendKey.bind(this));

        this.tvSpeaker = new this.api.hap.Service.TelevisionSpeaker(this.accessory.displayName, 'speaker');

        this.tvSpeaker.getCharacteristic(this.api.hap.Characteristic.Mute)
            .on('get', this.getMute.bind(this))
            .on('set', this.setMute.bind(this));

        this.tvSpeaker.getCharacteristic(this.api.hap.Characteristic.Volume)
            .on('get', this.getVolume.bind(this))
            .on('set', this.setVolume.bind(this));

        this.tvSpeaker.setCharacteristic(this.api.hap.Characteristic.VolumeControlType,
            this.api.hap.Characteristic.VolumeControlType.ABSOLUTE);
      
        this.tvSpeaker.getCharacteristic(this.api.hap.Characteristic.VolumeSelector)
            .on('set', this.sendVolumeControl.bind(this));

        this.informationService = new this.api.hap.Service.AccessoryInformation()
            .setCharacteristic(this.api.hap.Characteristic.Name, this.accessory.displayName)
            .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'Philips');

        this.tvService.addLinkedService(this.tvSpeaker);
        this.tvService.addLinkedService(this.informationService);

        this.accessory.addService(this.tvService);
        this.accessory.addService(this.tvSpeaker);

        if (this.config.apps && this.config.apps.length > 0 && this.apps && Object.keys(this.apps).length !== 0) {
            for (const application of (this.apps as any).applications) {
                if (this.config.apps.includes(application.label)) {
                    this.setupApplication(application);
                }
            }
        }

        this.log.info('[' + this.config.name + '] Applications setup finished');

        const channels = await this.tv.getTVChannels();
        for (const channel of channels.Channel) {
            if (this.config.channels.includeAll 
                || (this.config.channels.channels && this.config.channels.channels.includes(channel.name))) {
                this.setupChannel(channel);
            } else if (this.config.channels.useFavorites) {
                const favoriteChannels = await this.tv.getFavoriteList(this.config.channels.favoriteListId);
                for (const favoriteChannel of favoriteChannels.channels) {
                    if (channel.ccid === favoriteChannel.ccid) {
                        this.setupChannel(channel);
                    }
                }   
            }
        }

        this.log.info('[' + this.config.name + '] Channels setup finished');

        setInterval(() => {
            this.checkStatus();
        }, 5000);
    }

    async checkStatus() {
        try {
            const powerState = await this.tv.getPowerState();

            if (!this.responsive) {
                this.log.info('[' + this.config.name + '] Start responding again.');
                this.responsive = true;
            }

            if (powerState.powerstate === 'On') {
                if (!this.on) {
                    this.log.info('[' + this.config.name + '] TV has been turn on.');
                    this.on = true;
                    this.tvService!.updateCharacteristic(this.api.hap.Characteristic.Active, this.on);
                }
            } else {
                if (this.on) {
                    this.log.info('[' + this.config.name + '] TV has been turned off.');
                    this.on = false;
                    this.tvService!.updateCharacteristic(this.api.hap.Characteristic.Active, this.on);
                }
            }
            
            const volume = await this.tv.getVolumePercentage();

            if (volume !== this.volume) {
                this.log.info('[' + this.config.name + '] TV volume has been changed to ' + volume + '%.');
                this.volume = volume;
                if (volume > 0) {
                    this.lastPositiveVolume = this.volume;
                }
                this.tvSpeaker!.updateCharacteristic(this.api.hap.Characteristic.Volume, this.volume);
                this.tvSpeaker!.updateCharacteristic(this.api.hap.Characteristic.Mute, this.volume === 0);
            }

            const app = await this.tv.getCurrentActivity();
            if (app.component.packageName !== this.currentApp.component.packageName) {
                this.currentApp = app;
                this.log.info('[' + this.config.name + '] Current application has been changed to ' + app.component.packageName + '.');
            }

            const tvChannel = await this.tv.getCurrentTVChannel();

            if (tvChannel.channel && tvChannel.channel.name !== this.currentChannel.channel.name) {
                this.currentChannel = tvChannel;
                this.log.info('[' + this.config.name + '] TV Channel has been changed to ' + tvChannel.channel.name + '.');
            }
        } catch (err) {
            if (this.responsive) {
                this.log.info('[' + this.config.name + '] Stop responding.');
                this.responsive = false;
            }
            if (this.config.debug) {
                this.log.debug('checkStatus: error:' + err);
            }
        }
    }

    setupChannel(channel: Record<string, string>) {
        const i = Object.keys(this.configuredApps).length;

        this.configuredApps[i] = {'name': channel.name, 'type': 'channel'};
        const service = new this.api.hap.Service.InputSource(this.accessory.displayName + channel.name, channel.name);
                            
        service.setCharacteristic(this.api.hap.Characteristic.Identifier, i);
        service.setCharacteristic(this.api.hap.Characteristic.ConfiguredName, channel.name);
        service.setCharacteristic(
            this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED);
        service.setCharacteristic(
            this.api.hap.Characteristic.InputSourceType, this.api.hap.Characteristic.InputSourceType.TUNER);
        service.setCharacteristic(this.api.hap.Characteristic.CurrentVisibilityState,
            this.api.hap.Characteristic.CurrentVisibilityState.SHOWN);
                            
        service.getCharacteristic(this.api.hap.Characteristic.ConfiguredName)
            .on('set', (name, callback) => {
                callback(null, name);
            });
                            
        this.accessory.addService(service);
        this.tvService!.addLinkedService(service);
    }

    setupApplication(application: Record<string, string>) {
        let i = Object.keys(this.configuredApps).length;
        this.configuredApps[i] = {'name': application.label, 'type': 'app'};
        const service = new this.api.hap.Service.InputSource(this.accessory.displayName + application.label, application.label);
                    
        service.setCharacteristic(this.api.hap.Characteristic.Identifier, i++);
        service.setCharacteristic(this.api.hap.Characteristic.ConfiguredName, application.label);
        service.setCharacteristic(this.api.hap.Characteristic.IsConfigured, this.api.hap.Characteristic.IsConfigured.CONFIGURED);
        service.setCharacteristic(this.api.hap.Characteristic.InputSourceType,
            this.api.hap.Characteristic.InputSourceType.APPLICATION);
        service.setCharacteristic(this.api.hap.Characteristic.CurrentVisibilityState,
            this.api.hap.Characteristic.CurrentVisibilityState.SHOWN);
                    
        service.getCharacteristic(this.api.hap.Characteristic.ConfiguredName)
            .on('set', (name, callback) => {
                callback(null, name);
            });
                    
        this.accessory.addService(service);
        this.tvService!.addLinkedService(service);
    }

    async getOn(callback: CharacteristicGetCallback) {
        callback(null, Number(this.on));
    }

    async setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        try {
            callback(null);
            this.log.info('Turn on TV:' + value);
            if (value as boolean) {
                await this.tv.turnOn();
            } else {
                await this.tv.setPowerState(value as boolean);
            }
        } catch (err) {
            if (this.config.debug) {
                this.log.debug('setOn:' + err);
            }
        }
    }

    async getMute(callback: CharacteristicGetCallback) {
        callback(null, this.volume === 0);
    }

    async setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        try {
            const result = await this.tv.setMute(value as boolean);
            if (!value) {
                await this.tv.setVolumePercentage(this.lastPositiveVolume);
            }
            callback(null, result.muted as boolean);
        } catch (err) {
            callback(err);
        }
    }

    async getVolume(callback: CharacteristicGetCallback) {
        callback(null, this.volume);
    }

    async setVolume(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        try {
            await this.tv.setVolumePercentage(value as number);
            callback(null, value);
        } catch (err) {
            callback(err);
        }
    }

    async sendVolumeControl(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        try {
            if (remoteKey === this.api.hap.Characteristic.VolumeSelector.INCREMENT) {
                await this.tv.sendKey('VolumeUp');
            } else if (remoteKey === this.api.hap.Characteristic.VolumeSelector.DECREMENT) {
                await this.tv.sendKey('VolumeDown');
            }
            callback(null, remoteKey);
        } catch (err) {
            callback(err);
        }
    }

    async sendKey(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        // https://developers.homebridge.io/#/characteristic/RemoteKey
        // https://github.com/eslavnov/pylips/wiki/Input-key-(POST)
        const keyMapArray = [
            [this.api.hap.Characteristic.RemoteKey.REWIND, 'Rewind'],
            [this.api.hap.Characteristic.RemoteKey.FAST_FORWARD, 'FastForward'],
            [this.api.hap.Characteristic.RemoteKey.NEXT_TRACK, 'Next'],
            [this.api.hap.Characteristic.RemoteKey.PREVIOUS_TRACK, 'Previous'],
            [this.api.hap.Characteristic.RemoteKey.ARROW_UP, 'CursorUp'],
            [this.api.hap.Characteristic.RemoteKey.ARROW_LEFT, 'CursorLeft'],
            [this.api.hap.Characteristic.RemoteKey.ARROW_RIGHT, 'CursorRight'],
            [this.api.hap.Characteristic.RemoteKey.ARROW_DOWN, 'CursorDown'],
            [this.api.hap.Characteristic.RemoteKey.SELECT, 'Confirm'],
            [this.api.hap.Characteristic.RemoteKey.BACK, 'Back'],
            [this.api.hap.Characteristic.RemoteKey.EXIT, 'Exit'],
            [this.api.hap.Characteristic.RemoteKey.PLAY_PAUSE, 'PlayPause'],
            [this.api.hap.Characteristic.RemoteKey.INFORMATION, 'Home'],
        ];
        const keyMap : Map<CharacteristicValue, string> = new Map();

        for (const key of keyMapArray) {
            keyMap.set(key[0], key[1] as string);
        }

        let key = '';
        if (this.config.alternatingPlayPause && remoteKey === this.api.hap.Characteristic.RemoteKey.PLAY_PAUSE) {
            if (this.lastPlayPause === 'Pause') {
                key = 'Play';
                this.lastPlayPause = 'Play';
            } else {
                key = 'Pause';
                this.lastPlayPause = 'Pause';
            }
        } else {
            if (keyMap.has(remoteKey)) {
                key = keyMap.get(remoteKey) as string;
            } else {
                this.log.error('[' + this.config.name + '] Unsupported key ' + remoteKey);
            }
        }

        try {
            await this.tv.sendKey(key);
            callback(null, remoteKey);
        } catch (err) {
            callback(err);
        }
    }

    async getCurrentActivity(callback: CharacteristicGetCallback) {
        if (this.currentApp.component.packageName === 'NA'
            || this.currentApp.component.packageName === 'org.droidtv.zapster'
            || this.currentApp.component.packageName === 'org.droidtv.playtv') {
            for (const [app_id, app] of Object.entries(this.configuredApps)) {  
                    
                if ((app as any).name === this.currentChannel.channel.name){
                    callback(null, Number(app_id));
                    return;
                }
            }
        } else {
            for (const app of (this.apps as any).applications) {
                if (app.intent.component.packageName === this.currentApp.component.packageName) {
                    for (const [app_id, configuredApp] of Object.entries(this.configuredApps)) {  
                        if ((configuredApp as any).name === app.label){
                            callback(null, Number(app_id));
                            return;
                        }
                    }
                }
            }
        }
        callback(null, 0);
    }

    async launchActivity(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        callback(null);
        if (this.configuredApps[Number(value)].type === 'app') {
            for (const application of (this.apps as any).applications) {
                if (application.label === this.configuredApps[Number(value)].name) {
                    try {
                        await this.tv.launchApplication(application);
                    } catch (err) {
                        this.log.debug('Launch Application failed:' + err);
                    }
                    return;
                }
            }
        } else if (this.configuredApps[Number(value)].type === 'channel') {
            const channel = this.channels.getObjectByName(this.configuredApps[Number(value)].name);
            const channelRequest = {'channel': channel};

            try {
                const currentChannel = await this.tv.getCurrentTVChannel();
                channelRequest['channelList'] = currentChannel.channelList;
    
                await this.tv.launchTVChannel(channelRequest as any);
            } catch (err) {
                this.log.debug('Launch TV Channel failed:' + err);
            }

        }
    }
}
