import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    Logger,
    PlatformAccessory,
    Service,
} from 'homebridge';

import { PhilipsTVAccessory, PhilipsTVPluginConfig} from './PhilipsTVAccessory';
import { validate } from './validate';


const PLUGIN_NAME = 'homebridge-philips-android-tv';

export class PhilipsAndroidTvAccessory implements AccessoryPlugin {

    private readonly log: Logger;
    private readonly name: string;
    private readonly config: AccessoryConfig;
    private tvAccessory?: PlatformAccessory;
    private tv?: PhilipsTVAccessory;
    private muteSwitch?: Service;
    private volumeLightbulb?: Service;
    private readonly api: API;

    constructor(log: Logger, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.config = config;
        this.api = api;

        if (this.validateConfiguration()) {
            this.api.on('didFinishLaunching', async () => {
                this.log.debug('Executed didFinishLaunching callback');
                await this.setupTV();
            });
        }
    }

    validateConfiguration() {
        if (!this.config.name) {
            this.log.error('One of TVs do not have configured name');
            return false;
        }

        if (!this.config.ip || !validate.ip.test(this.config.ip)) {
            this.log.error(this.config.name + ' IP Address is not set or not proper IP address.');
            return false;
        }

        if (this.config.mac && !validate.mac.test(this.config.mac)) {
            this.log.error(this.config.name + ' MAC Address is not set or not proper MAC address.');
            return false;
        }

        if (!this.config.apiUser || !this.config.apiPass) {
            this.log.error(this.config.name + ' API Credentials not set. Pair TV first.');
            return false;
        }

        if (Object.keys(this.config).includes('channels')) {
            if (Array.isArray(this.config.channels)) {
                const newStructure = {
                    'useFavorites': false,
                    'channels': this.config.channels,
                    'includeAll': false,
                };

                this.config.channels = newStructure;
                this.log.warn('You are using legacy structure of channels configuration. Please update it to remove this warning.');
            }
        } else {
            this.config.channels = {
                'useFavorites': false,
                'includeAll': false,
            };
        }

        return true;
    }

    async setupTV() {
        const config: PhilipsTVPluginConfig = {
            debug: false,
            name: this.config.name,
            ip: this.config.ip,
            mac: this.config.mac,
            apiVersion: this.config.apiVersion,
            wakeUntilAPIReadyCounter: this.config.wakeUntilAPIReadyCounter,
            apiUser: this.config.apiUser,
            apiPass: this.config.apiPass,
            alternatingPlayPause: false,
            broadcastIP: this.config.broadcastIP,
            channels: {
                useFavorites: this.config.channels.useFavorites,
                includeAll: this.config.channels.includeAll,
                favoriteListId: this.config.channels.favoriteListId,
                channels: this.config.channels.channels,
            },
            apps: this.config.apps,
        };

        const uuid = this.api.hap.uuid.generate(PLUGIN_NAME + this.name);

        this.tvAccessory = new this.api.platformAccessory(this.name, uuid, this.api.hap.Categories.TELEVISION);
        this.tvAccessory.context.isexternal = true;

        this.tv = new PhilipsTVAccessory(this.log, this.api, this.tvAccessory, config);

        try {
            await this.tv.fetchTVData();
            await this.tv.setupPlatformAccessory();
      
            this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
            this.log.debug(this.name + ' setup finished');
    
            if (this.config.dedicatedVolumeLightbulb) {
                this.volumeLightbulb = new this.api.hap.Service.Lightbulb(this.name + ' Volume Bulb', this.name + ' Volume Lightbulb');
    
                this.volumeLightbulb.getCharacteristic(this.api.hap.Characteristic.Brightness)
                    .on('get', this.tv.getVolume.bind(this))
                    .on('set', this.tv.setVolume.bind(this));
            }
    
            if (this.config.dedicatedMuteSwitch) {
                this.muteSwitch = new this.api.hap.Service.Switch(this.name + ' Mute Switch');
                this.muteSwitch.getCharacteristic(this.api.hap.Characteristic.On)
                    .on('get', this.tv.getMute.bind(this))
                    .on('set', this.tv.setMute.bind(this));
            }
        } catch {
            this.log.error('Failure in setup.');
        }
       
    }

    identify(): void {
        this.log.debug('Identify!');
    }

    getServices(): Service[] {
        const services : Service[] = [];
        if (this.config.dedicatedVolumeLightbulb) {
            services.push(this.volumeLightbulb!);
        }
        if (this.config.dedicatedMuteSwitch) {
            services.push(this.muteSwitch!);
        }
        return services;
    }
}
