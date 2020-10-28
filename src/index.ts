import {
    AccessoryConfig,
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    DynamicPlatformPlugin,
    HAP,
    Logging,
    PlatformAccessory,
    Service
} from "homebridge";

import request from 'request';
import wol from 'wake_on_lan';

const PLUGIN_NAME = 'homebridge-philips-android-tv';
const PLATFORM_NAME = 'PhilipsAndroidTVPlatform';

let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("PhilipsAndroidTV", PhilipsAndroidTvAccessory);
    api.registerPlatform(PLATFORM_NAME, PhilipsAndroidTvPlatform);
};

class PhilipsAndroidTvPlatform implements DynamicPlatformPlugin {
    constructor(log, config, api) {
    }
    configureAccessory(accessory: PlatformAccessory) {
    }
}

class PhilipsAndroidTvAccessory implements AccessoryPlugin {

    private readonly log: Logging;
    private readonly name: string;
    private switchOn = false;
    private readonly config: AccessoryConfig;
    private readonly informationService: Service;
    private readonly tvService: Service;
    private readonly tvSpeaker: Service;
    private readonly tvAccessory: PlatformAccessory;
    private readonly configuredApps = ["YouTube", "Netflix"];
    private applications: Array<{label: string}> = [];
    private inputServices: Array<Service> = [];
    private volumeCurrent = 0;
    private volumePreMute = 0;
    private volumeMin = 0;
    private volumeMax = 0;

    constructor(log: Logging, config: AccessoryConfig, api: API) {
        this.log = log;
        this.name = config.name;
        this.config = config;

        const uuid = hap.uuid.generate(PLUGIN_NAME + this.name);

        this.tvAccessory = new api.platformAccessory(this.name, uuid);
        this.tvAccessory.category = hap.Categories.TELEVISION;


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
            hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
        );

        this.tvService.getCharacteristic(hap.Characteristic.RemoteKey)
            .on('set', this.sendKey.bind(this));

        this.tvSpeaker = new hap.Service.TelevisionSpeaker(this.name, "speaker");

        this.tvSpeaker.getCharacteristic(hap.Characteristic.Mute)
            .on('get', this.getMute.bind(this))
            .on('set', this.setMute.bind(this));

        this.tvSpeaker.getCharacteristic(hap.Characteristic.Volume)
            .on('get', this.getVolume.bind(this))
            .on('set', this.setVolume.bind(this));

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Name, config.name)
            .setCharacteristic(hap.Characteristic.Manufacturer, "Philips");

        this.informationService.getCharacteristic(hap.Characteristic.Model)
            .on('get', this.getModel.bind(this));

        this.tvService.addLinkedService(this.tvSpeaker)
        this.tvService.addLinkedService(this.informationService)

        var i = 0
        for (const appLabel of this.configuredApps) {
            const service = new hap.Service.InputSource(this.name + appLabel, appLabel);

            service.setCharacteristic(hap.Characteristic.Identifier, i++);
            service.setCharacteristic(hap.Characteristic.ConfiguredName, appLabel);
            service.setCharacteristic(hap.Characteristic.IsConfigured, hap.Characteristic.IsConfigured.CONFIGURED);
            service.setCharacteristic(hap.Characteristic.InputSourceType, hap.Characteristic.InputSourceType.APPLICATION);
            service.setCharacteristic(hap.Characteristic.CurrentVisibilityState, hap.Characteristic.CurrentVisibilityState.SHOWN);

            service.getCharacteristic(hap.Characteristic.ConfiguredName)
                .on('set', (name, callback) => {
                    callback(null)
                });

            this.inputServices.push(service)
            this.tvAccessory.addService(service)
            this.tvService.addLinkedService(service)
        }

        this.fetchCurrentActivity();
        this.fetchCurrentTv();

        this.fetchPossibleApplications();


        log.info("Switch finished initializing!");

        api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
    }

    /*
     * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
     * Typical this only ever happens at the pairing process.
     */
    identify(): void {
        this.log("Identify!");
    }

    getServices(): Service[] {
        return [
            this.informationService,
            this.tvService,
            this.tvSpeaker
        ].concat(this.inputServices);
    }
    buildRequest(url: string, method: string, body: string): Object {
        return {
            url: "https://" + this.config.ip + ":1926/6/" + url,
            method: method,
            body: body,
            rejectUnauthorized: false,
            timeout: 1000,
            followAllRedirects: true,
            forever: true,
            auth: {
                user: this.config.apiUser,
                pass: this.config.apiPass,
                sendImmediately: false
            }
        };
    }
    getCurrentActivity(callback: CharacteristicGetCallback) {
        request(this.buildRequest("activities/current", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    var currentApp = JSON.parse(body)
                    console.log("getCurrentActivity" + body);
                    if (currentApp.component.packageName == "NA")
                    {
                        request(this.buildRequest("activities/tv", "GET", ""), function (this, error, response, body) {
                            if (response) {
                                if (response.statusCode === 200) {
                                    var currentApp = JSON.parse(body)
                                    console.log("getCurrentTV" + body);
                                    callback(null)
                                }
                            }
                        }.bind(this));
                        return;
                    }
                    callback(null)
                    return
                }
            }
            callback(null, 0)
        }.bind(this));
        // request(this.buildRequest("activities/tv", "GET", ""), function (this, error, response, body) {
        //     if (response) {
        //         if (response.statusCode === 200) {
        //             var currentTv = JSON.parse(body)
        //             callback(null, currentTv.channel.ccid)
        //             return
        //         }
        //     }
        //     callback(null, 0)
        // }.bind(this));
    }
    getModel(callback: CharacteristicGetCallback) {
        request(this.buildRequest("system", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    var system = JSON.parse(body)
                    callback(null, system.name);
                    return;
                }
                callback(null, "Unknown")
            }
        }.bind(this));
    }
    fetchCurrentActivity() {
        request(this.buildRequest("activities/current", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode == 200) {
                    this.log.info(JSON.parse(body))
                }
            }
        }.bind(this));
    }
    fetchCurrentTv() {
        request(this.buildRequest("activities/tv", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode == 200) {
                    this.log.info(JSON.parse(body))
                }
            }
        }.bind(this));
    }
    launchActivity(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        console.log("Launch activity:" + this.configuredApps[Number(value)])
        request(this.buildRequest("applications", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    let applications = JSON.parse(body)
                    for (const application of applications.applications) {
                        if (application.label == this.configuredApps[Number(value)]) {
                            request(this.buildRequest("activities/launch", "POST", JSON.stringify(application)), function (this, error, response, body) {
                                callback(null, value);
                            }.bind(this));
                            return
                        }
                    }
                }
            }
            callback(null, value)
        }.bind(this));
    }
    fetchPossibleApplications() {
        request(this.buildRequest("activities", "GET", ""), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    let applications = JSON.parse(body)
                    var log = "Available applications: ";
                    for (const application of applications.applications) {
                        log += application.label + ", "
                    }
                    this.applications = applications.applications
                    this.log.info(log);
                }
            }
        }.bind(this));
    }
    getVolume(callback: CharacteristicGetCallback) {
        request(this.buildRequest("audio/volume", "GET", ""), function (this, error, response, body) {
            if (body) {
                let volume = JSON.parse(body)
                let volumeLevel = (volume.current / (volume.max - volume.min)) * 100
                this.volumeCurrent = volume.current
                this.volumeMax = volume.max
                this.volumeMin = volume.min
                callback(null, volumeLevel)
                return
            }
            else {
                this.log.debug("Device " + this.config.name + " is offline")
                callback(null, 0)
            }
        }.bind(this));
        return this;
    }
    setVolume(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        let newVolume = Math.floor((Number(value) * (this.volumeMax - this.volumeMin)) / 100)
        let request_body = { "muted": false, "current": newVolume }
        request(this.buildRequest("audio/volume", "POST", JSON.stringify(request_body)), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
                this.log.debug(response.statusCode)
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }
    getMute(callback: CharacteristicGetCallback) {
        request(this.buildRequest("audio/volume", "GET", ""), function (this, error, response, body) {
            if (body) {
                let volume = JSON.parse(body)
                if (true === volume.muted) {
                    this.log.debug("Device " + this.config.name + " is muted.");
                    callback(null, true)
                    return
                }
            }
            else {
                this.log.debug("Device " + this.config.name + " is not muted or offline")
                callback(null, true)
            }
        }.bind(this));
        return this;
    }
    setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        var request_body = { "muted": value, "current": this.volumeCurrent }
        if (value) {
            this.volumePreMute = this.volumeCurrent
            request_body.current = 0
        }
        else {
            request_body.current = this.volumePreMute
        }
        request(this.buildRequest("audio/volume", "POST", JSON.stringify(request_body)), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }
    setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        var request_body;
        if (value === 1) {
            request_body = { "powerstate": "On" };
        } else {
            request_body = { "powerstate": "Standby" };
        }
        request(this.buildRequest("powerstate", "POST", JSON.stringify(request_body)), function (this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(null, value);
                    return;
                }
            } else {
                this.wakeOnLan()
            }
            callback(null, 0);
        }.bind(this));
        return this;
    }
    getOn(callback: CharacteristicGetCallback) {
        request(this.buildRequest("powerstate", "GET", ""), function (this, error, response, body) {
            if (body) {
                let powerstate = JSON.parse(body)
                if ("On" === powerstate.powerstate) {
                    callback(null, true);
                    return
                }
                this.log.debug("Device " + this.config.name + " is standby. " + body);
                callback(null, false)
            }
            else {
                this.log.debug("Device " + this.config.name + " is offline.")
                callback(null, false)
            }
        }.bind(this));
        return this;
    }

    sendKey(remoteKey: CharacteristicValue, callback: CharacteristicSetCallback) {
        // https://developers.homebridge.io/#/characteristic/RemoteKey
        // https://github.com/eslavnov/pylips/wiki/Input-key-(POST)
        var request_body = { "key": "" };
        if (remoteKey == hap.Characteristic.RemoteKey.REWIND) {
            request_body.key = "Rewind";
        } else if (remoteKey == hap.Characteristic.RemoteKey.FAST_FORWARD) {
            request_body.key = "FastForward";
        } else if (remoteKey == hap.Characteristic.RemoteKey.NEXT_TRACK) {
            request_body.key = "Next";
        } else if (remoteKey == hap.Characteristic.RemoteKey.PREVIOUS_TRACK) {
            request_body.key = "Previous";
        } else if (remoteKey == hap.Characteristic.RemoteKey.ARROW_UP) {
            request_body.key = "CursorUp";
        } else if (remoteKey == hap.Characteristic.RemoteKey.ARROW_LEFT) {
            request_body.key = "CursorLeft";
        } else if (remoteKey == hap.Characteristic.RemoteKey.ARROW_RIGHT) {
            request_body.key = "CursorRight";
        } else if (remoteKey == hap.Characteristic.RemoteKey.ARROW_DOWN) {
            request_body.key = "CursorDown";
        } else if (remoteKey == hap.Characteristic.RemoteKey.SELECT) {
            request_body.key = "Confirm";
        } else if (remoteKey == hap.Characteristic.RemoteKey.BACK) {
            request_body.key = "Back";
        } else if (remoteKey == hap.Characteristic.RemoteKey.EXIT) {
            request_body.key = "Exit";
        } else if (remoteKey == hap.Characteristic.RemoteKey.PLAY_PAUSE) {
            request_body.key = "PlayPause";
        } else if (remoteKey == hap.Characteristic.RemoteKey.INFORMATION) {
            request_body.key = "Home";
        }

        if (request_body.key) {
            request(this.buildRequest("input/key", "POST", JSON.stringify(request_body)), function (this, error, response, body) {
                if (response) {
                    if (response.statusCode === 200) {
                        callback(null, remoteKey);
                        return;
                    }
                    else {
                        this.log.warn("sendkey:" + response.statusCode)
                    }
                }
                callback(null, 0);
            }.bind(this));
        } else {
            this.log.warn("Unsupported key: " + remoteKey)
        }
    }

    wakeOnLan() {
        if (!this.config.macAddress)
            return;
        this.log.debug("Trying to wake " + this.config.name + " on " + this.config.macAddress)
        wol.wake(this.config.macAddress)
    };

}