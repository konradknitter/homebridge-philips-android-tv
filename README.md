# Homebridge Philips Android TV

This plug-in provides support for Homebridge Philips Android TVs.

Protocols used are the same as an official [Philips TV Remote Application](https://apps.apple.com/be/app/philips-tv-remote-app/id1479155903).

## Info

Plug-in tested on 50PUS7303 ( API 6.1.0 ), 49PUS7101 ( API 6.2.0 ), 75PUS7354 & 65OLED804/12 ( API 6.4.0 )

Functionalities:

- Integration with Home app.
    - Turn on/off TV
    - Switch inputs (Applications, Channels) TV via Home app.

- Integration of iOS Remote Widget
    - Control of TV speakers (inside widget use volume up/down buttons of TV)
        - Optional Lightbulb for scenes setup
    - Directional buttons
    - Menu, back buttons

# Configuration

## Preparing TV

To use plugin Wake over LAN feature, to allow to wake TV from sleep - Wake over LAN needs to be enabled in TV Network settings.

## Pairing TV

In version 0.9 pairing support has been added via Homebridge Config UI.
In the Plug-in settings option to Pair New TV shows up.

![Plugin Config Splash Screen](/docs/images/splash_screen.png?raw=true "Plugin Config Splash Screen")

Alternativly, I recommend to use the python script [philips_android_tv](https://github.com/suborb/philips_android_tv). 

It was noticed by users that TV resets all credentials between Software Updates. After updating TV, repair.

## Configuration

Example plug-in configuration:

    "platforms": [
        {
            "debug": false,
            "configVersion": 1,
            "tvs": [
                {
                    "ip": "192.168.0.1",
                    "mac": "33:44:55:66:77:88",
                    "name": "Living Room TV",
                    "apiUser": "<apiUser>",
                    "apiPass": "<apiPass>",
                    "apiVersion": 6,
                    "alternativePlayPause": true,
                    "dedicatedMuteSwitch": false,
                    "dedicatedVolumeLightbulb": false,
                    "apps": [
                        "Netflix",
                        "YouTube",
                        "TV"
                    ],
                    "channels": {
                        "useFavorites": false,
                        "favoriteListId": "<id>",
                        "includeAll": false,
                        "channels": [
                            "TVN"
                        ]
                    }
                }
            ],
            "platform": "PhilipsAndroidTV"
        }
    ]


Platform options:

| Option                 | Description                                                                                                   | Default |  Example       |
|------------------------|---------------------------------------------------------------------------------------------------------------|---------|----------------|
| debug                  | Enable additional prints and debugging data. Required for troubleshooting purposes.                           | false   | false          |
| configVersion          | Version of configuration schema. Future proofing for backward compatibility/migration.                        | 1       | 1              |


TV options:

| Option                 | Description                                                                                                   | Default |  Example       |
|------------------------|---------------------------------------------------------------------------------------------------------------|---------|----------------|
| ip                     | IP Address of TV                                                                                              | false   | 192.168.0.1    |
| mac                    | MAC Address of TV. Used for Wake over LAN feature. Wake over LAN feautre needs to be enabled in TV settings   | false   | AA:BB:CC:DD:EE |
| apiUser                | Credentials required for communication with TV                                                                | false   | username       |
| apiPassword            | Credentials required for communication with TV                                                                | false   | password       |
| apiVersion             | Philips TV API Version used for communicaton with TV                                                          | 6       | 6              |
|wakeUntilAPIReadyCounter| Modifies nubmer of tries before giving up connecting to TV. Set -1 for unlimited.                             | 100     | 200            |
| alternativePlayPause   | Sends Play or Pause alternating, based on internal state, instead of PlayPause to TV when not defined (false) | false   | true           |
| dedicatedMuteSwitch    | If enabled plugin register additional Switch Service that will mute, or unmute TV. Might be useful when setting scenes. | false   | true      |
| dedicatedVolumeLightbulb   | If enabled plugin register additional Lightbulb Service that will control Volume of TV. Might be useful when setting scenes. | false   | true      |
| apps                   | Configuration of Application Input Sources. Array of Strings.                                                 | []      |[Netflix, YouTube]|
| channels               | Configuration of TV Channels Input Sources. Array of Objects.                                                 | []      | More below     |


TV Channels settings

| Option                 | Description                                                                                                   | Default |  Example       |
|------------------------|---------------------------------------------------------------------------------------------------------------|---------|----------------|
| includeAll             | Registers all TV Channels as Input Source                                                                     | false   | false          |
| useFavorites           | Alternative to includeAll. Uses Favorite List as input for TV Channels to be registered as Input Source       | false   | false          |
| favoriteListId         | Required when useFavorites is used. ID of Favorite List to be used for input channels                         | 1       | 1              |
| channels               | Alternative to includeAll and useFavorites. Array of TV Channels names used to be registered as Input Sources | 1       | 1              |

NOTE: Often change of TV Inputs requires to remove and add again TV in iOS Home app. In case of problems, please readd TV in iOS Home app.

### Legacy Plug-in configuration

In version 0.9 plug-in migrated from Accessory configuration to Platform configuration.
Legacy configuration will be supported until version 2.x, without new features.

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


| Option                 | Description                                                                                                   | Default |  Example       |
|------------------------|---------------------------------------------------------------------------------------------------------------|---------|----------------|
| ip                     | IP Address of TV                                                                                              | false   | 192.168.0.1    |
| mac                    | MAC Address of TV. Used for Wake over LAN feature. Wake over LAN feautre needs to be enabled in TV settings   | false   | AA:BB:CC:DD:EE |
| apiUser                | Credentials required for communication with TV                                                                | false   | username       |
| apiPassword            | Credentials required for communication with TV                                                                | false   | password       |
| alternativePlayPause   | Sends Play or Pause alternating, based on internal state, instead of PlayPause to TV when not defined (false) | false   | true           |
| dedicatedMuteSwitch    | If enabled plugin register additional Switch Service that will mute, or unmute TV. Might be useful when setting scenes. | false   | true      |
| dedicatedVolumeLightbulb   | If enabled plugin register additional Lightbulb Service that will control Volume of TV. Might be useful when setting scenes. | false   | true      |

[comment]: <> (Maybe adding more options in table?)

Accessory is registered as "External Accessory", it has to be once added manually in Home app as option without code scan and enter code from Homebridge logs.


# Troubleshooting

If you have any issues with plug-in, please make sure to update homebridge and plug-in to newest version first.
In case of problems with TV inputs - remove and add TV in iOS Home app.

# Roadmap

Currently forseen features for next releases:

- Custom Settings UI enchancements
    - Easier configuration of TV channels and applications
- Embedding TV Ambilight as optional feature
- Plug-in verification
- Macro registration


# References

Key knowledge about Philips TV APIs https://github.com/eslavnov/pylips/wiki
Python Implementation for Philips TV API https://github.com/suborb/philips_android_tv
