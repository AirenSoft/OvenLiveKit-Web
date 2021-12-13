const OvenLiveKit = {};

const logHeader = 'OvenLiveKit.js :';
const logEventHeader = 'OvenLiveKit.js ====';

// private methods
function sendMessage(webSocket, message) {

    if (webSocket) {
        webSocket.send(JSON.stringify(message));
    }
}

function generateDomainFromUrl(url) {
    let result = '';
    let match;
    if (match = url.match(/^(?:wss?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n\?\=]+)/im)) {
        result = match[1];
    }

    return result;
}

function findIp(string) {

    let result = '';
    let match;

    if (match = string.match(new RegExp('\\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b', 'gi'))) {
        result = match[0];
    }

    return result;
}

function checkIOSVersion() {
    var agent = window.navigator.userAgent,
        start = agent.indexOf('OS ');
    if ((agent.indexOf('iPhone') > -1 || agent.indexOf('iPad') > -1) && start > -1) {
        return window.Number(agent.substr(start + 3, 3).replace('_', '.'));
    }
    return 0;
}

function getFormatNumber(sdp, format) {

    const lines = sdp.split('\r\n');
    let formatNumber = -1;

    for (let i = 0; i < lines.length - 1; i++) {

        lines[i] = lines[i].toLowerCase();

        if (lines[i].indexOf('a=rtpmap') > -1 && lines[i].indexOf(format.toLowerCase()) > -1) {
            // parsing "a=rtpmap:100 H264/90000" line
            formatNumber = lines[i].split(' ')[0].split(':')[1];
            break;
        }
    }

    return formatNumber;
}

function removeFormat(sdp, formatNumber) {
    let newLines = [];
    let lines = sdp.split('\r\n');

    for (let i = 0; i < lines.length; i++) {

        if (lines[i].indexOf('m=video') === 0) {
            newLines.push(lines[i].replace(' ' + formatNumber + '', ''));
        } else if (lines[i].indexOf(formatNumber + '') > -1) {

        } else {
            newLines.push(lines[i]);
        }
    }

    return newLines.join('\r\n')
}

async function getStreamForDeviceCheck() {

    // High resolution video constraints makes browser to get maximum resolution of video device.
    const constraints = {
        audio: { deviceId: undefined },
        video: { deviceId: undefined, width: 1920, height: 1080 }
    };

    return await navigator.mediaDevices.getUserMedia(constraints);
}

async function getDevices() {

    return await navigator.mediaDevices.enumerateDevices();


}

function gotDevices(deviceInfos) {

    let devices = {
        'audioinput': [],
        'audiooutput': [],
        'videoinput': [],
        'other': [],
    };

    for (let i = 0; i !== deviceInfos.length; ++i) {

        const deviceInfo = deviceInfos[i];

        let info = {};

        info.deviceId = deviceInfo.deviceId;

        if (deviceInfo.kind === 'audioinput') {

            info.label = deviceInfo.label || `microphone ${devices.audioinput.length + 1}`;
            devices.audioinput.push(info);
        } else if (deviceInfo.kind === 'audiooutput') {

            info.label = deviceInfo.label || `speaker ${devices.audiooutput.length + 1}`;
            devices.audiooutput.push(info);
        } else if (deviceInfo.kind === 'videoinput') {

            info.label = deviceInfo.label || `camera ${devices.videoinput.length + 1}`;
            devices.videoinput.push(info);
        } else {

            info.label = deviceInfo.label || `other ${devices.other.length + 1}`;
            devices.other.push(info);
        }
    }

    return devices;
}

function initConfig(instance, options) {

    instance.stream = null;
    instance.webSocket = null;
    instance.peerConnection = null;
    instance.connectionConfig = {};

    instance.status = 'creating';

    instance.videoElement = null;
    instance.connectionUrl = null;

    if (options && options.callbacks) {

        instance.callbacks = options.callbacks;
    } else {
        instance.callbacks = {};
    }

}

function addMethod(instance) {

    function errorHandler(error) {

        if (instance.callbacks.error) {

            instance.callbacks.error(error);
        }
    }

    function getUserMedia(constraints) {

        if (!constraints) {

            constraints = {
                video: {
                    deviceId: undefined
                },
                audio: {
                    deviceId: undefined
                }
            };
        }

        console.info(logHeader, 'Requested Constraint To Input Devices', constraints);

        return navigator.mediaDevices.getUserMedia(constraints)
            .then(function (stream) {

                console.info(logHeader, 'Received Media Stream From Input Device', stream);

                instance.stream = stream;

                let elem = instance.videoElement;

                // Attach stream to video element when video element is provided.
                if (elem) {

                    elem.srcObject = stream;

                    elem.onloadedmetadata = function (e) {

                        elem.play();
                    };
                }

                return new Promise(function (resolve) {

                    resolve(stream);
                });
            })
            .catch(function (error) {

                console.error(logHeader, 'Can\'t Get Media Stream From Input Device', error);
                errorHandler(error);

                return new Promise(function (resolve, reject) {
                    reject(error);
                });
            });
    }

    function getDisplayMedia(constraints) {

        if (!constraints) {
            constraints = {};
        }

        console.info(logHeader, 'Requested Constraint To Display', constraints);

        return navigator.mediaDevices.getDisplayMedia(constraints)
            .then(function (stream) {

                console.info(logHeader, 'Received Media Stream From Display', stream);

                instance.stream = stream;

                let elem = instance.videoElement;

                // Attach stream to video element when video element is provided.
                if (elem) {

                    elem.srcObject = stream;

                    elem.onloadedmetadata = function (e) {

                        elem.play();
                    };
                }

                return new Promise(function (resolve) {

                    resolve(stream);
                });
            })
            .catch(function (error) {

                console.error(logHeader, 'Can\'t Get Media Stream From Display', error);
                errorHandler(error);

                return new Promise(function (resolve, reject) {
                    reject(error);
                });
            });
    }

    // From https://webrtchacks.com/limit-webrtc-bandwidth-sdp/
    function setBitrateLimit(sdp, media, bitrate) {

        let lines = sdp.split('\r\n');
        let line = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('m=' + media) === 0) {
                line = i;
                break;
            }
        }
        if (line === -1) {
            // Could not find the m line for media
            return sdp;
        }

        // Pass the m line
        line++;

        // Skip i and c lines
        while (lines[line].indexOf('i=') === 0 || lines[line].indexOf('c=') === 0) {

            line++;
        }

        // If we're on a b line, replace it
        if (lines[line].indexOf('b') === 0) {

            lines[line] = 'b=AS:' + bitrate;

            return lines.join('\r\n');
        }

        // Add a new b line
        let newLines = lines.slice(0, line)

        newLines.push('b=AS:' + bitrate)
        newLines = newLines.concat(lines.slice(line, lines.length))

        return newLines.join('\r\n')
    }

    function initWebSocket(connectionUrl) {

        if (!connectionUrl) {
            errorHandler('connectionUrl is required');
            return;
        }

        instance.connectionUrl = connectionUrl;

        let webSocket = null;

        try {

            webSocket = new WebSocket(connectionUrl);
        } catch (error) {

            errorHandler(error);
        }


        instance.webSocket = webSocket;

        webSocket.onopen = function () {

            // Request offer at the first time.
            sendMessage(webSocket, {
                command: 'request_offer'
            });
        };

        webSocket.onmessage = function (e) {

            let message = JSON.parse(e.data);

            if (message.error) {
                console.error('webSocket.onmessage', message.error);
                errorHandler(message.error);
            }

            if (message.command === 'offer') {

                // OME returns offer. Start create peer connection.
                createPeerConnection(
                    message.id,
                    message.peer_id,
                    message.sdp,
                    message.candidates,
                    message.ice_servers
                );
            }
        };

        webSocket.onerror = function (error) {

            console.error('webSocket.onerror', error);
            errorHandler(error);
        };

        webSocket.onclose = function (e) {

            if (!instance.removing) {

                if (instance.callbacks.connectionClosed) {

                    instance.callbacks.connectionClosed('websocket', e);
                }
            }
        };

    }

    function appendFmtp(sdp) {

        const fmtpStr = instance.connectionConfig.sdp.appendFmtp;

        const lines = sdp.split('\r\n');
        const payloads = [];

        for (let i = 0; i < lines.length; i++) {

            if (lines[i].indexOf('m=video') === 0) {

                let tokens = lines[i].split(' ')

                for (let j = 3; j < tokens.length; j++) {

                    payloads.push(tokens[j]);
                }

                break;
            }
        }

        for (let i = 0; i < payloads.length; i++) {

            let fmtpLineFound = false;

            for (let j = 0; j < lines.length; j++) {

                if (lines[j].indexOf('a=fmtp:' + payloads[i]) === 0) {
                    fmtpLineFound = true;
                    lines[j] += ';' + fmtpStr;
                }
            }

            if (!fmtpLineFound) {

                for (let j = 0; j < lines.length; j++) {

                    if (lines[j].indexOf('a=rtpmap:' + payloads[i]) === 0) {

                        lines[j] += '\r\na=fmtp:' + payloads[i] + ' ' + fmtpStr;
                    }
                }
            }
        }

        return lines.join('\r\n')
    }

    function createPeerConnection(id, peerId, offer, candidates, iceServers) {

        let peerConnectionConfig = {};

        if (instance.connectionConfig.iceServers) {

            // first priority using ice servers from local config.
            peerConnectionConfig.iceServers = instance.connectionConfig.iceServers;

            if (instance.connectionConfig.iceTransportPolicy) {

                peerConnectionConfig.iceTransportPolicy = instance.connectionConfig.iceTransportPolicy;
            }
        } else if (iceServers) {

            // second priority using ice servers from ome and force using TCP
            peerConnectionConfig.iceServers = [];

            for (let i = 0; i < iceServers.length; i++) {

                let iceServer = iceServers[i];

                let regIceServer = {};

                regIceServer.urls = iceServer.urls;

                let hasWebSocketUrl = false;
                let webSocketUrl = generateDomainFromUrl(instance.connectionUrl);

                for (let j = 0; j < regIceServer.urls.length; j++) {

                    let serverUrl = regIceServer.urls[j];

                    if (serverUrl.indexOf(webSocketUrl) > -1) {
                        hasWebSocketUrl = true;
                        break;
                    }
                }

                if (!hasWebSocketUrl) {

                    if (regIceServer.urls.length > 0) {

                        let cloneIceServer = regIceServer.urls[0];
                        let ip = findIp(cloneIceServer);

                        if (webSocketUrl && ip) {
                            regIceServer.urls.push(cloneIceServer.replace(ip, webSocketUrl));
                        }
                    }
                }

                regIceServer.username = iceServer.user_name;
                regIceServer.credential = iceServer.credential;

                peerConnectionConfig.iceServers.push(regIceServer);
            }

            peerConnectionConfig.iceTransportPolicy = 'relay';
        } else {
            // last priority using default ice servers.

            if (instance.iceTransportPolicy) {

                peerConnectionConfig.iceTransportPolicy = instance.iceTransportPolicy;
            }
        }

        let advancedSetting = {
            optional: [
                {
                    googHighStartBitrate: {
                        exact: !0
                    }
                },
                {
                    googPayloadPadding: {
                        exact: !0
                    }
                },
                {
                    googScreencastMinBitrate: {
                        exact: 500
                    }
                },
                {
                    enableDscp: {
                        exact: true
                    }
                }
            ]
        };

        console.info(logHeader, 'Create Peer Connection With Config', peerConnectionConfig);

        let peerConnection = new RTCPeerConnection(peerConnectionConfig);

        instance.peerConnection = peerConnection;

        // set local stream
        instance.stream.getTracks().forEach(function (track) {

            console.info(logHeader, 'Add Track To Peer Connection', track);
            peerConnection.addTrack(track, instance.stream);
        });


        if (checkIOSVersion() >= 15) {
            const formatNumber = getFormatNumber(offer.sdp, 'H264');

            if (formatNumber > 0) {
                offer.sdp = removeFormat(offer.sdp, formatNumber);
            }
        }

        if (instance.connectionConfig.maxVideoBitrate) {

            // if bandwith limit is set. modify sdp from ome to limit acceptable bandwidth of ome
            offer.sdp = setBitrateLimit(offer.sdp, 'video', instance.connectionConfig.maxVideoBitrate);
        }

        if (instance.connectionConfig.sdp && instance.connectionConfig.sdp.appendFmtp) {

            offer.sdp = appendFmtp(offer.sdp);
        }

        peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
            .then(function () {

                peerConnection.createAnswer()
                    .then(function (answer) {

                        console.log(logHeader, 'Answer')
                        console.log(answer.sdp)

                        if (checkIOSVersion() >= 15) {

                            const formatNumber = getFormatNumber(answer.sdp, 'H264');

                            if (formatNumber > 0) {

                                answer.sdp = removeFormat(answer.sdp, formatNumber);
                            }
                        }

                        if (instance.connectionConfig.sdp && instance.connectionConfig.sdp.appendFmtp) {

                            answer.sdp = appendFmtp(answer.sdp);
                        }

                        peerConnection.setLocalDescription(answer)
                            .then(function () {

                                sendMessage(instance.webSocket, {
                                    id: id,
                                    peer_id: peerId,
                                    command: 'answer',
                                    sdp: answer
                                });
                            })
                            .catch(function (error) {

                                console.error('peerConnection.setLocalDescription', error);
                                errorHandler(error);
                            });
                    })
                    .catch(function (error) {

                        console.error('peerConnection.createAnswer', error);
                        errorHandler(error);
                    });
            })
            .catch(function (error) {

                console.error('peerConnection.setRemoteDescription', error);
                errorHandler(error);
            });

        if (candidates) {

            addIceCandidate(peerConnection, candidates);
        }

        peerConnection.onicecandidate = function (e) {

            if (e.candidate && e.candidate.candidate) {

                console.info(logHeader, 'Candidate Sent', '\n', e.candidate.candidate, '\n', e);

                sendMessage(instance.webSocket, {
                    id: id,
                    peer_id: peerId,
                    command: 'candidate',
                    candidates: [e.candidate]
                });
            }
        };

        peerConnection.oniceconnectionstatechange = function (e) {

            let state = peerConnection.iceConnectionState;

            if (instance.callbacks.iceStateChange) {

                console.info(logHeader, 'ICE State', '[' + state + ']');
                instance.callbacks.iceStateChange(state);
            }

            if (state === 'connected') {

                if (instance.callbacks.connected) {

                    console.info(logHeader, 'Iceconnection Connected', e);
                    instance.callbacks.connected(e);
                }
            }

            if (state === 'failed' || state === 'disconnected' || state === 'closed') {

                if (instance.callbacks.connectionClosed) {

                    console.error(logHeader, 'Iceconnection Closed', e);
                    instance.callbacks.connectionClosed('ice', e);
                }
            }
        }
    }

    function addIceCandidate(peerConnection, candidates) {

        for (let i = 0; i < candidates.length; i++) {

            if (candidates[i] && candidates[i].candidate) {

                let basicCandidate = candidates[i];

                peerConnection.addIceCandidate(new RTCIceCandidate(basicCandidate))
                    .then(function () {

                    })
                    .catch(function (error) {

                        console.error('peerConnection.addIceCandidate', error);
                        errorHandler(error);
                    });
            }
        }
    }

    // instance methods
    instance.attachMedia = function (videoElement) {

        instance.videoElement = videoElement;
    };

    instance.getUserMedia = function (constraints) {

        return getUserMedia(constraints);
    };

    instance.getDisplayMedia = function (constraints) {

        return getDisplayMedia(constraints);
    };

    instance.startStreaming = function (connectionUrl, connectionConfig) {

        console.info(logEventHeader, 'Start Streaming');

        if (connectionConfig) {

            instance.connectionConfig = connectionConfig;
        }

        initWebSocket(connectionUrl);
    };

    instance.remove = function () {

        instance.removing = true;

        // first release peer connection with ome
        if (instance.peerConnection) {

            // remove tracks from peer connection
            instance.peerConnection.getSenders().forEach(function (sender) {
                instance.peerConnection.removeTrack(sender);
            });

            instance.peerConnection.close();
            instance.peerConnection = null;
            delete instance.peerConnection;
        }

        // release video, audio stream
        if (instance.stream) {

            instance.stream.getTracks().forEach(track => {

                track.stop();
                instance.stream.removeTrack(track);
            });

            if (instance.videoElement) {
                instance.videoElement.srcObject = null;
            }

            instance.stream = null;
            delete instance.stream;
        }

        // release websocket
        if (instance.webSocket) {

            instance.webSocket.close();
            instance.webSocket = null;
            delete instance.webSocket;
        }

        instance.status = 'removed';

        console.info(logEventHeader, 'Removed');

    };
}

// static methods
OvenLiveKit.create = function (options) {

    console.info(logEventHeader, 'Create WebRTC Input v1.0.2');

    let instance = {};

    instance.removing = false;

    initConfig(instance, options);
    addMethod(instance);

    return instance;
};

OvenLiveKit.getDevices = async function () {

    await getStreamForDeviceCheck();
    const deviceInfos = await getDevices();
    return gotDevices(deviceInfos)
};

export default OvenLiveKit;