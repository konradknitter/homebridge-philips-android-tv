import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLUGIN_NAME } from './settings';
import { PhilipsTVAccessory, PhilipsTVPluginConfig} from './PhilipsTVAccessory';
import { validate } from './validate';

export class PhilipsAndroidTVPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public tvs: PhilipsTVAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
      this.log.debug('Finished initializing platform:', this.config.name);

      if (this.validateConfiguration()) {
          this.api.on('didFinishLaunching', async () => {
              log.debug('Executed didFinishLaunching callback');
              this.discoverDevices();
          });
      }
  }

  validateConfiguration() : boolean {
      for (const tv of this.config.tvs) {
          this.log.debug('[' + tv.name + '] Validating configuration');

          if (!tv.name) {
              this.log.error('[' + tv.name + '] One of TVs do not have configured name');
              return false;
          }

          if (!tv.ip || !validate.ip.test(tv.ip)) {
              this.log.error('[' + tv.name + '] IP Address is not set or not proper IP address.');
              return false;
          }

          if (tv.mac && !validate.mac.test(tv.mac)) {
              this.log.error('[' + tv.name + '] MAC Address is not set or not proper MAC address.');
              return false;
          }

          if (!tv.apiUser || !tv.apiPass) {
              this.log.error('[' + tv.name + '] API Credentials not set. Pair TV first.');
              return false;
          }
      }
      return true;
  }

  async setupAccessory(accessory: PlatformAccessory, tv: Record<string, string>) {
      const config: PhilipsTVPluginConfig = {
          debug: this.config.debug,
          name: tv.name,
          ip: tv.ip,
          mac: tv.mac,
          apiVersion: Number(tv.apiVersion),
          wakeUntilAPIReadyCounter: Number(tv.wakeUntilAPIReadyCounter),
          apiUser: tv.apiUser,
          apiPass: tv.apiPass,
          alternatingPlayPause: false,
          channels: {
              useFavorites: false,
              includeAll: false,
              favoriteListId: 1,
              channels: [],
          },
          apps: (tv.apps as any),
      };

      if (tv.channels) {
          config.channels = {
              useFavorites: (tv.channels as any).useFavorites,
              includeAll: (tv.channels as any).includeAll,
              favoriteListId: (tv.channels as any).favoriteListId,
              channels: (tv.channels as any).channels,
          };
      }

      const tvAccessory: PhilipsTVAccessory = new PhilipsTVAccessory(this.log, this.api, accessory, config);

      await tvAccessory.fetchTVData();
      await tvAccessory.setupPlatformAccessory();

      this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);

      this.tvs.push(tvAccessory);

      this.accessories.push(accessory);


      if (tv.dedicatedVolumeLightbulb) {
          this.log.info('Configuration of dedicated Volume Lightbulb');
          const volumeLightbulb = new this.api.hap.Service.Lightbulb(tv.name + ' Volume Bulb', tv.name + ' Volume Lightbulb');

          volumeLightbulb.getCharacteristic(this.api.hap.Characteristic.Brightness)
              .on('get', tvAccessory.getVolume.bind(this))
              .on('set', tvAccessory.setVolume.bind(this));

          this.accessories.push(volumeLightbulb as any);
      }

      if (tv.dedicatedMuteSwitch) {
          this.log.info('Configuration of dedicated Mute Switch');
          const muteSwitch = new this.api.hap.Service.Switch(tv.name + ' Mute Switch');
          muteSwitch.getCharacteristic(this.api.hap.Characteristic.On)
              .on('get', tvAccessory.getMute.bind(this))
              .on('set', tvAccessory.setMute.bind(this));
          this.accessories.push(muteSwitch as any);
      }

      return;
  }

  async configureAccessory(accessory: PlatformAccessory) {
      this.log.info('Loading accessory from cache:', accessory.displayName);
      for (const tv of this.config.tvs) {
          if (tv.name === accessory.displayName) {
              await this.setupAccessory(accessory, tv);
          }
      } 
  }

  async discoverDevices() {
      this.log.info(this.config.tvs);
      
      for (const tv of this.config.tvs) {
          const uuid = this.api.hap.uuid.generate(tv.name);
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
          if (existingAccessory) {
              this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          } else {
              this.log.info('Adding new accessory:', tv.name);
              const accessory = new this.api.platformAccessory(tv.name, uuid, this.api.hap.Categories.TELEVISION);
              await this.setupAccessory(accessory, tv);
          }
      }
  }
}