# Homebridge Philips Andorid TV

This plug-in provides support for Homebridge Philips Android TVs.

## Info

Plug-in tested on 49PUS7101 ( API 6.2.0 ) & 75PUS7354 ( API 6.4.0 )

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

Android TV 2016 models Philips use an authenticated HTTPS JointSpace API version 6.
Every control- or status-call needs digest authentification which contains of a pre generated username and password.
You have to do this once for your TV, to use the python script philips_android_tv.

Here is an example pairing call for philips_android_tv :

python ./philips.py --host 10.0.1.23 pair

You can then add username and password key in your homebridge config

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
        "channels": [
            "TVP3 Wroclaw",
            "Polsat",
            "TVN",
            "TV4",
            "TVN 7",
            "TV6"
        ],
        "alternativePlayPause": true # Sends Play or Pause alternating, based on internal state, instead of PlayPause to TV when not defined (false)
    }

Accessory is registered as "External Accessory", it has to be once added manually in Home app as option without code scan and enter code from Homebridge logs.

# References

Key knowledge about Philips TV APIs https://github.com/eslavnov/pylips/wiki