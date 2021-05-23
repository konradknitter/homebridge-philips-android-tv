import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { PhilipsAndroidTvAccessory } from './LegacyPhilipsTVAccessory';
import { PhilipsAndroidTVPlatform } from './PhilipsTVPlatform';


export = (api: API) => {
    api.registerAccessory('PhilipsAndroidTV', PhilipsAndroidTvAccessory);
    api.registerPlatform(PLATFORM_NAME, PhilipsAndroidTVPlatform);
};
