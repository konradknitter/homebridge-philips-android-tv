const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { PhilipsTV } = require('@konradknitter/philipsandroidtv')

class UiServer extends HomebridgePluginUiServer {
    constructor() {
        super();

        this.onRequest('/startpair', this.requestPair);
        this.onRequest('/authgrant', this.authenticateRequest);

        this.ready();
    }

    async requestPair(query) {
        this.tv = new PhilipsTV(query.ip)
        const result = await this.tv.requestPair();

        return {
            'status': 0,
            'timestamp': result.timestamp
        }
    }

    async authenticateRequest(query) {
        const response = await this.tv.authorizePair(query.timestamp, query.pin)
        return {
            'status': 0,
            'login': response.apiUser,
            'password': response.apiPass,
        }
    }
}


(() => {
    return new UiServer();
})();