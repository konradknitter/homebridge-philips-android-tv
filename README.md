# Homebridge Philips Android TV

This plug-in provides support for Homebridge Philips Android TVs.
Protocols used are the same as official [Philips TV Remote Application](https://apps.apple.com/be/app/philips-tv-remote-app/id1479155903)

## Info

Plug-in tested on 50PUS7303 ( API 6.1.0 ), 49PUS7101 ( API 6.2.0 ), 75PUS7354 & 65OLED804/12 ( API 6.4.0 )

Working:

- Turning on TV (including Wake over LAN, WoWOL and Wireless card MAC address have to be setup)
- Remote Control from iOS, Remote Widget
- Speaker Control, tested from Homebridge (mute, volume control)
- Input Control (Configurable via config)
    - Applications
    - TV Channels

What's next?

- HDMI

- Ambilight full control support as separate plug-in. (done under homebridge-philips-tv-ambilight)

This roadmap should led to 1.0 release.

Scf-Fi:
- Auto-pairing support?

# Authentication

Since plug-in version 0.9 pairing support has been added via Homebridge Config UI.
In the Plug-in settings option to Pair New TV shows up.

![Plugin Config Splash Screen](/docs/images/splash_screen.png?raw=true "Plugin Config Splash Screen")

Alternativly, I recommend to use the python script [philips_android_tv](https://github.com/suborb/philips_android_tv). 

It was noticed by users that TV resets all credentials between Software Updates. After updating TV, repair.

# Plug-in configuration

    {
        "accessory": "PhilipsAndroidTV", 
        "name": "Name of TV",
        "ip": "IP Address of TV",
        "macAddress": "TV Wireless card MAC Address for Wake on LAN functionality",
        "apiUser": "API user",
        "apiPass": "API password",
        "apps": [
            "Netflix",
            "YouTube",
            "TV"
        ],
        "channels": {
            "useFavorites": false, 
            "channels": [
                "TVP3 Wroclaw",
                "Polsat",
                "TVN",
                "TV4",
                "TVN 7",
                "TV6"
            ]
        }
        "alternativePlayPause": true
    }


| Option                 | Description                                                                                                   | Default |  Example  |
|------------------------|---------------------------------------------------------------------------------------------------------------|---------|-----------|
| alternativePlayPause   | Sends Play or Pause alternating, based on internal state, instead of PlayPause to TV when not defined (false) | false   | true      |
| dedicatedMuteSwitch     | If enabled plugin register additional Switch Service that will mute, or unmute TV. Might be useful when setting scenes. | false   | true      |
| dedicatedVolumeLightbulb   | If enabled plugin register additional Lightbulb Service that will control Volume of TV. Might be useful when setting scenes. | false   | true      |

[comment]: <> (Maybe adding more options in table?)

Accessory is registered as "External Accessory", it has to be once added manually in Home app as option without code scan and enter code from Homebridge logs.

# References

Key knowledge about Philips TV APIs https://github.com/eslavnov/pylips/wiki
Python Implementation for Philips TV API https://github.com/suborb/philips_android_tv