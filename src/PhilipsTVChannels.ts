
interface Channel {
    ccid: string;
    name: string;
    object: Record<string, string>;
}

class PhilipsTVChannels {
    public channels : Channel[] = [];
    
    reloadChannels(listChannels: string) {
        const channels = JSON.parse(listChannels);

        this.channels = [];

        for (const channel of channels.Channel) {
            this.channels.push({
                ccid: channel.ccid, name: channel.name, object: channel,
            });
        }
    }

    getObjectByName(name: string) : Record<string, string> {
        for (const channel of this.channels) {
            if (channel.name === name) {
                return channel.object;
            }
        }
        return {};
    }

    getNameByCcid(ccid: string) : string {
        for (const channel of this.channels) {
            if (channel.ccid === ccid) {
                return channel.name;
            }
        }
        return '';
    }
    
    getObjectByCcid(ccid: string) : Record<string, string> {
        for (const channel of this.channels) {
            if (channel.ccid === ccid) {
                return channel.object;
            }
        }
        return {};
    }
}

export = PhilipsTVChannels;