# Ring HomePod Doorbell

This app detects presses of a Ring Doorbell and plays a custom audio file in
sync on selected HomePods or other AirPlay speakers. The chime, speakers,
volume, and cooldown are configured in the web interface.

## Before your first test

1. In Apple Home, open **Home Settings → Speakers & TV** and allow access for
   **Anyone On the Same Network**.
2. Upload a chime in the app.
3. Select the detected HomePods and press **Test chime**.

The app uses host networking for AirPlay/mDNS. Only run it on a trusted home
network and do not expose it directly to the internet.

You can optionally enable a virtual HomeKit doorbell. It produces Apple's
standard HomePod chime and is not required for custom sound playback.
