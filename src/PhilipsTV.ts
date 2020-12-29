import { Logging } from 'homebridge';

import request from 'request';
import wol from 'wake_on_lan';

import PhilipsTVChannels from './PhilipsTVChannels';

class PhilipsTV {

    private on = false;
    private responsive = false;
    private ip : string;
    private apiUser: string;
    private apiPass: string;
    private macAddress : string;
    private log : Logging;
    public tvChannels: PhilipsTVChannels;

    constructor(log: Logging, ip: string, apiUser: string, apiPass: string, macAddress: string) {
        this.log = log;
        this.ip = ip;
        this.apiUser = apiUser;
        this.apiPass = apiPass;
        this.macAddress = macAddress;

        this.tvChannels = new PhilipsTVChannels;

        setInterval(() => {
            this.checkPowerState();
        }, 5000);
    }

    debug(log: string) {
        this.log.debug('PhilipsTV [' + this.ip + ']: ' + log);
    }

    warn(log: string) {
        this.log.warn('PhilipsTV [' + this.ip + ']: ' + log);
    }

    isOn() : boolean {
        return this.on;
    }

    callWhenBecomeResponsive(callback: (value: any) => void, counter = 0) {
        if (this.responsive) {
            this.wakeOnLan();
            this.debug('callWhenBecomeResponsive - TV is responsive');
            callback(true);
        } else {
            if (counter === 0) {
                this.debug('callWhenBecomeResponsive - TV not responsive. Trying to wake it up.');
            }
            if (counter === 100) {
                this.warn('Tried to make TV responsive over 100 requests and failed. Please double check configuration.');
                return;
            }
            setTimeout(() => {
                this.callWhenBecomeResponsive(callback, ++counter);
            }, 1000);
            this.wakeOnLan();
            this.checkPowerState();
        }
    }

    turnOn(counter = 0) : void {
        if (counter === 0) {
            this.debug('Turning on the TV.');
        }
        if (counter === 100) {
            this.warn('Tried to turnOn TV over 100 requests and failed. Please double check configuration.');
            return;
        }

        if (!this.responsive) {
            setTimeout(() => {
                this.turnOn(++counter);
            }, 1000);
            this.wakeOnLan();
            return;
        }

        if (!this.on) {
            setTimeout(() => {
                this.turnOn(++counter);
            }, 1000);
            this.sendPowerState(true);
            return;
        }
    }

    turnOff(counter = 0) : void {
        if (counter === 0) {
            this.debug('Turning off the TV.');
        }

        if (counter === 100) {
            this.warn('Tried to turnOff TV over 100 requests and failed. Please double check configuration.');
            return;
        }

        if (!this.responsive) {
            this.debug('Not responsive. Turn Off complete');
            return;
        }

        if (this.on) {
            setTimeout(() => {
                this.turnOff(++counter);
            }, 1000);
            this.debug('Not responsive. Turn Off complete');
            this.sendPowerState(false);
        }
    }

    checkPowerState() : void {
        request(this.buildRequest('powerstate', 'GET', ''), function(this, error, response, body) {
            if (response) {
                this.responsive = true;
                if (response.statusCode === 200) {
                    if (body) {
                        const powerstate = JSON.parse(body);
                        this.debug('powerState is: ' + powerstate.powerstate + '.');
                        if ('On' === powerstate.powerstate) {
                            this.on = true;
                            return;
                        }
                    }
                } else {
                    this.debug('powerState response.statusCode: ' + response.statusCode + '.');
                }
            } else {
                this.log.debug('PhilipsTV [' + this.ip + '] powerState no response. Err: ' + error);
                this.responsive = false;
            }
            this.on = false;
        }.bind(this));
    }

    sendPowerState(on: boolean) : void {
        let request_body;
        if (on) {
            request_body = { 'powerstate': 'On' };
        } else {
            request_body = { 'powerstate': 'Standby' };
        }
        request(this.buildRequest('powerstate', 'POST', JSON.stringify(request_body)), function(this, error, response) {
            if (response) {
                this.responsive = true;
                if (response.statusCode === 200) {
                    this.on = on;
                    return;
                }
            } else {
                this.responsive = false;
            }
        }.bind(this));
    }

    updateChannelList(callback: (value: any) => void) : void {
        this.getResponse('channeldb/tv/channelLists/all', 'GET', '', (body) => {
            this.tvChannels.reloadChannels(body);
            callback(true);
        }, (err) => {
            this.debug(err);
        });
    }

    getResponse(url: string, method: string, body: string, callback: (body: string) => void, callback_err: (err: string) => void) {
        request(this.buildRequest(url, method, body), function(this, error, response, body) {
            if (response) {
                if (response.statusCode === 200) {
                    callback(body);
                    return;
                }
            }
            callback_err(error);
        }.bind(this));
    }

    buildRequest(url: string, method: string, body: string) {
        return {
            url: 'https://' + this.ip + ':1926/6/' + url,
            method: method,
            body: body,
            rejectUnauthorized: false,
            timeout: 1000,
            followAllRedirects: true,
            forever: true,
            auth: {
                user: this.apiUser,
                pass: this.apiPass,
                sendImmediately: false,
            },
        };
    }

    wakeOnLan() {
        wol.wake(this.macAddress, { address: '255.255.255.255' }, function (this, error) {
            if (error) {
                this.warn('wakeOnLan: error: ' + error);
            }
        }.bind(this));
    }
}

export = PhilipsTV;