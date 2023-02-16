# OvenLiveKit for Web

## What is OvenLiveKit for Web?
OvenLiveKit for Web is a JavaScript-based Live Streaming Encoder that supports WebRTC optimized for [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine), Sub-Second Latency Streaming Server. OvenLiveKit for Web relies on the browser's WebRTC API and wraps it to make it easy for you to broadcast WebRTC streams to OvenMediaEngine.

## Demo
<img src="./assets/05_OvenSpace_230214.png" style="max-width: 100%; height: auto;">

OvenSpace is a sub-second latency streaming demo service using [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine), [OvenPlayer](https://github.com/AirenSoft/OvenPlayer) and [OvenLiveKit](https://github.com/AirenSoft/OvenLiveKit-Web). You can experience OvenLiveKit in the **[OvenSpace Demo](https://space.ovenplayer.com/)** and and see examples of applying in [OvenSpace Repository](https://github.com/AirenSoft/OvenSpace).

## Features
* Streaming to OvenMediaEngine's WebRTC Provider.  
	* Implement [OvenMediaEngine's signaling protocol](https://airensoft.gitbook.io/ovenmediaengine/live-source/webrtc-beta#custom-webrtc-producer)
* Built-in Device Capture.
* Set the Quality of the Input Stream.

## Quick Start

### OvenLiveKit Demo
* https://demo.ovenplayer.com/demo_input.html

### Installation
#### OveliveKit CDN
```html
<script src="https://cdn.jsdelivr.net/npm/ovenlivekit@latest/dist/OvenLiveKit.min.js"></script>
```
#### Install via npm
```
$ npm install ovenlivekit
```

```JavaScript
import OvenLiveKit from 'ovenlivekit'
```
### Getting started
This is the simplest example of sending a device media stream such as a webcam to OvenMediaEngine's WebRTC Provider.
```JavaScript
// Initialize OvenLiveKit
const ovenLivekit = OvenLiveKit.create();

// Get media stream from user device
ovenLivekit.getUserMedia().then(function () {

    // Got device stream and start streaming to OvenMediaEngine
    ovenLivekit.startStreaming('wss://your_oven_media_engine:3333/app/stream?direction=send');
});
```
### Quick demo
You can see a quick demo in action by cloning the repository.
1. Clone repository
```
$ git clone https://github.com/AirenSoft/OvenLiveKit-Web.git
```
```
$ cd OvenLiveKit-Web
```
2. Install development dependencies.
```
$ npm install
```
3. Open the demo page using the WebPack's built-in web server.
```
$ npm run start
```
## Configurations & APIs

- [`Initialization and destroying instance`](#)
    - `OvenLiveKit.create()`
    - `Configuration`
    - `instance.remove()`
- [`Input device listing`](#)
    - `OvenLiveKit.getDevices()`
- [`Media APIs`](#)
    - `instance.attachMedia(videoElement)`
    - `instance.getUserMedia()`
- [`Streaming APIs`](#)
    - `instance.startStreaming()`
    - `instance.stopStreaming()`

### Initialization and destroying instance
Configuration parameters could be provided to OvenLiveKit.js upon instantiation of the OvenLiveKit object.

```JavaScript
// Configuration
var config = {
    callbacks: {
        error: function (error) {

        },
        connected: function (event) {

        },
        connectionClosed: function (type, event) {

        },
        iceStateChange: function (state) {

        }
    }
}

// Initialize ovenLivekit instance
const ovenLivekit = OvenLiveKit.create(config);

// Release all resources and destroy the instance
ovenLivekit.remove();
```
#### `OvenLiveKit.create(config)`
- parameters 
    - config: [Initialization configurations](#).
- Initialize OvenLiveKit instance. Please see the [configuration details](#) next.

#### `Configurations`
To make the library lightweight and easy to use, only callback options are implemented now.
##### `callbacks.error`
- type
    - Function
- parameters 
    - error: Various Type of Error
- A callback that receives any errors that occur in an instance of OvenLiveKit.
- Errors are could occur from `getUserMedia`, `webSocket`, or `peerConnection`.

##### `callbacks.connected`
- type
    - Function
- parameters 
    - event: event object of iceconnectionstatechange
- This is a callback that occurs when the `RTCPeerConnection.iceConnectionState` becomes `connected`.
- It means that the media stream is normally being transmitted to OvenMediaEngine's WebRTC Provider.

##### `callbacks.connectionClosed`
- type
    - Function
- parameters 
    - type: (`ice` | `websocket`) Notes which connection is closed.
    - event: event object of iceconnectionstatechange or websocket
- A callback that is fired when the websocket's `onclose` event occurs, or when `RTCPeerConnection.iceConnectionState` changes to `failed`, `disconnected`, or `closed`.
- It may be that the media stream is not being sent normally to OvenMediaEngine.
##### `callbacks.iceStateChange`
- type
    - Function
- parameters 
    - event: event object of iceconnectionstatechange
- A callback that fires whenever [`RTCPeerConnection.iceConnectionState`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState) changes.
- This is useful when checking the current streaming status.

#### `instance.remove()`
-  Release all resources(websocket, peerconnection, mediastream) and destroy the instance.

### Input device listing
OvenLiveKit provides an API to get a list of user devices for convenience.
```JavaScript
// Lists the available media input and output devices
OvenLiveKit.getDevices().then(function (devices) {

    // Got a list of user devices
    console.log(devices);

    /*
    console output is

    {
        "videoinput": [
            {
                "deviceId": "b1ab3a7041b1c9a91037b51d9c380f599f3914297b5c0ce2eb8d385dab3b8812",
                "label": "c922 Pro Stream Webcam (046d:085c)"
            }
        ],
        "audioinput": [
            {
                "deviceId": "default",
                "label": "default - Microphone(C922 Pro Stream Webcam) (046d:085c)"
            },
            {
                "deviceId": "communications",
                "label": "Communication - Microphone(C922 Pro Stream Webcam) (046d:085c)"
            },
            {
                "deviceId": "2feb7f29a130802404f47d8ad9adc9418b1a01e0a4d37e60335771aba21f328d",
                "label": "Microphone(C922 Pro Stream Webcam) (046d:085c)"
            }
        ],
        "audiooutput": [
            {
                "deviceId": "default",
                "label": "default - Headphone(2- Xbox Controller) (045e:02f6)"
            },
            {
                "deviceId": "communications",
                "label": "Communication - Headphone(2- Xbox Controller) (045e:02f6)"
            },
            {
                "deviceId": "c3d04828621712f9cc006c49486218aca0d89619ac9993809d5f082a2d13a6b0",
                "label": "Headphone(2- Xbox Controller) (045e:02f6)"
            },
        ],
        "other": []
    }
    */

}).catch(function (error) {

    // Failed to get a list of user devices
    console.log(error);
});
```
#### `OvenLiveKit.getDevices()`
- This static method lists the available media input and output devices, such as microphones, cameras, headsets, and so forth. 
- `videoinput`, `audioinput`, `audiooutput`, `other` is available input/output devices. You can use `deviceId` to specify a device to streaming or `label` to make device selection UI.

### Media APIs
OvenLiveKit also provides APIs to control a media stream from a user device.
```HTML
<video id="myVideo"></video>
```
```JavaScript
// Create instance
const ovenLivekit = OvenLiveKit.create();

// Attaching video element for playing device stream
ovenLivekit.attachMedia(document.getElementById('myVideo'));

// Gets a device stream with a constraint that specifies the type of media to request.
ovenLivekit.getUserMedia(constraints).then(function (stream) {

    // Got device stream. Ready for streaming.
}).catch(function (error) {

    // Failed to get device stream.
});
```
#### `instance.attachMedia(videoElement)`
- parameters 
    - videoElement: HTML `<video>` element
- If the video element is attached, when the media stream is received from the user device, it starts playing in the automatically set video element.
- This can be useful when previewing the media stream you want to stream.

#### `instance.getUserMedia(constraints)`
- parameters 
    - constraints: [MediaStreamConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints) dictionary. If not set the optimal input that the browser thinks is selected.
- returns Promise
    - resolved
        - stream: [MediaStream](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream). You can use this stream for whatever you need.
    - rejected
        - error: Throws error while getting the stream from the user device.
- This API is the most important API in OvenLiveKit. Make the OvenLiveKit streamable by getting the media stream from the user input device. You can get the media stream from any user input device you want using the `constraints` parameter. The device ID to be used in the `constraints` parameter can also be obtained from `OvenLiveKit.getDevices()`.
- For natural behavior, you can have the browser automatically select the device stream without passing a `constraints` parameter. However, if you want to control the device stream strictly (e.g., specify input devices, video resolution, video frame rates), you can control it by passing the constraints parameter.

### Streaming APIs
Congrats on getting the media stream from the user device and then ready to stream into OvenMediaEngine.
```JavaScript
// Create instance
const ovenLivekit = OvenLiveKit.create();

ovenLivekit.getUserMedia().then(function () {

    const connectionConfig = {
        iceServers : null ,
        iceTransportPolicy: null,
        maxBitrate: null
    }

    // Got media stream from user device and start to stream to OvenMedieEngeine
    ovenLivekit.startStreaming(connectionUrl, connectionConfig);
});
```
#### `instance.startStreaming(connectionUrl, connectionConfig)`
- parameters
    - connectionUrl: The connection URL to OvenMediaEngine is explained [here](https://airensoft.gitbook.io/ovenmediaengine/live-source/webrtc-beta#url-pattern).
    - connectionConfig: See [ConnectionConfig](#) details next.
- When this API is called, the media stream starts to be streamed according to OvenMediaEngine's signaling protocol.

#### `ConnectionConfig`
##### `iceServers`
- type
    - [`RTCConfiguration.iceServers`](https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration/iceServers)
- If set use the set STUN and TURN servers.
##### `iceTransportPolicy`
- type
    - [`RTCConfiguration.iceTransportPolicy`](https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration/iceTransportPolicy)
- If set use the set ice policy.
##### `maxVideoBitrate`
- type
    - Number: Unit is Kbps.
- If set limits max bitrates of streaming to OvenMediaEngine.

##### `sdp.appendFmtp`
- type
    - String: String you want to append to a=fmtp of SDP.
- If set video format is appended to the a=fmtp sections of SDP.

#### `instance.stopStreaming()`
- Close peer connection and websocket associated with OvenMediaEngine.

## For more information
* [AirenSoft Website](https://airensoft.com) 
  * About OvenMediaEngine, OvenMediaEngine Enterprise, OvenVideo, AirenBlog and more
* [OvenMediaEngine GitHub](https://github.com/AirenSoft/OvenMediaEngine)
  * Sub-Second Latency Streaming Server with LLHLS and WebRTC
* [OvenMediaEngine Getting Started](https://airensoft.gitbook.io/ovenmediaengine/)
  * User guide for OvenMediaEngine Configuration, ABR, Clustering, and more
* [OvenPlayer GitHub](https://github.com/AirenSoft/OvenPlayer)
  * JavaScript-based Player with LLHLS and WebRTC
* [OvenPlayer Getting Started](https://airensoft.gitbook.io/ovenplayer)
  * User guide for OvenPlayer UI Customize, API Reference, Examples, and more
* [OvenSpace Demo](https://space.ovenplayer.com/)
  * Sub-Second Latency Streaming Demo Service

## License
OvenLiveKit for Web is licensed under the [MIT](./LICENSE) license.

## About AirenSoft
AirenSoft aims to make it easier for you to build a stable broadcasting/streaming service with Sub-Second Latency.
Therefore, we will continue developing and providing the most optimized tools for smooth Sub-Second Latency Streaming.

Would you please click on each link below for details:
* ["JavaScript-based Live Streaming Encdoer" **OvenLiveKit**](https://github.com/AirenSoft/OvenLiveKit-Web)
* ["Sub-Second Latency Streaming Server with LLHLS and WebRTC" **OvenMediaEngine**](https://github.com/AirenSoft/OvenMediaEngine)
* ["JavaScript-based Player with LLHLS and WebRTC" **OvenPlayer**](https://github.com/AirenSoft/OvenPlayer)
