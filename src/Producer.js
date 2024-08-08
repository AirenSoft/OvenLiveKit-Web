
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

function getFormatNumber(sdp, format) {

    const lines = sdp.split('\r\n');
    let formatNumber = -1;

    for (let i = 0; i < lines.length - 1; i++) {

        lines[i] = lines[i].toLowerCase();

        if (lines[i].indexOf('a=rtpmap') === 0 && lines[i].indexOf(format.toLowerCase()) > -1) {
            // parsing "a=rtpmap:100 H264/90000" line
            // a=rtpmap:<payload type> <encoding name>/<clock rate>[/<encoding parameters >]
            formatNumber = lines[i].split(' ')[0].split(':')[1];
            break;
        }
    }

    return formatNumber;
}

function setPreferredVideoFormat(sdp, formatName) {

    const formatNumber = getFormatNumber(sdp, formatName);

    if (formatNumber === -1) {
        return sdp;
    }

    let newLines = [];
    const lines = sdp.split('\r\n');

    for (let i = 0; i < lines.length - 1; i++) {

        const line = lines[i];

        if (line.indexOf('m=video') === 0) {

            // m=<media> <port>/<number of ports> <transport> <fmt list>
            const others = line.split(' ').slice(0, 3);
            const formats = line.split(' ').slice(3);
            formats.sort(function (x, y) { return x == formatNumber ? -1 : y == formatNumber ? 1 : 0; });
            newLines.push(others.concat(formats).join(' '));
        } else {
            newLines.push(line);
        }

    }

    return newLines.join('\r\n') + '\r\n';
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



const Producer = function (url, inputStream, opt = {}) {

    let instance = {
        webSocketClosedByUser: false,
        inputStream: inputStream,
        webSocket: null,
        peerConnection: null,
        connectionConfig: opt.connectionConfig || {},
        connectionUrl: url,
        callbacks: opt.callbacks || {}
    };

    const errorHandler = opt.errorHandler || function () { };

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

            if (!instance.webSocketClosedByUser) {

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

    function appendOrientation(sdp) {

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

            for (let j = 0; j < lines.length; j++) {

                if (lines[j].indexOf('a=rtpmap:' + payloads[i]) === 0) {

                    lines[j] += '\r\na=extmap:' + payloads[i] + ' urn:3gpp:video-orientation';
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

        console.info('Producder', 'Create Peer Connection With Config', peerConnectionConfig);

        let peerConnection = new RTCPeerConnection(peerConnectionConfig);

        instance.peerConnection = peerConnection;

        // set local stream
        instance.inputStream.getTracks().forEach(function (track) {

            console.info('Producder', 'Add Track To Peer Connection', track);
            peerConnection.addTrack(track, instance.inputStream);
        });

        if (instance.connectionConfig.maxVideoBitrate) {

            // if bandwith limit is set. modify sdp from ome to limit acceptable bandwidth of ome
            offer.sdp = setBitrateLimit(offer.sdp, 'video', instance.connectionConfig.maxVideoBitrate);
        }

        if (instance.connectionConfig.sdp && instance.connectionConfig.sdp.appendFmtp) {

            offer.sdp = appendFmtp(offer.sdp);
        }

        if (instance.connectionConfig.preferredVideoFormat) {
            offer.sdp = setPreferredVideoFormat(offer.sdp, instance.connectionConfig.preferredVideoFormat)
        }


        // offer.sdp = appendOrientation(offer.sdp);
        console.info('Producder', 'Modified offer sdp\n\n' + offer.sdp);

        peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
            .then(function () {

                peerConnection.createAnswer()
                    .then(function (answer) {

                        if (instance.connectionConfig.sdp && instance.connectionConfig.sdp.appendFmtp) {

                            answer.sdp = appendFmtp(answer.sdp);
                        }

                        if (instance.connectionConfig.preferredVideoFormat) {
                            answer.sdp = setPreferredVideoFormat(answer.sdp, instance.connectionConfig.preferredVideoFormat)
                        }

                        console.info('Producder', 'Modified answer sdp\n\n' + answer.sdp);

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

                console.info('Producder', 'ICE State', '[' + state + ']');
                instance.callbacks.iceStateChange(state);
            }

            if (state === 'connected') {

                if (instance.callbacks.connected) {
                    instance.callbacks.connected(e);
                }
            }

            if (state === 'failed' || state === 'disconnected' || state === 'closed') {

                if (instance.callbacks.connectionClosed) {
                    console.error('Producder', 'Iceconnection Closed', e);
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

    function closePeerConnection() {
        if (instance.peerConnection) {

            // remove tracks from peer connection
            instance.peerConnection.getSenders().forEach(function (sender) {
                instance.peerConnection.removeTrack(sender);
            });

            instance.peerConnection.close();
            instance.peerConnection = null;
            delete instance.peerConnection;
        }
    }

    function closeWebSocket() {

        if (instance.webSocket) {

            instance.webSocket.close();
            instance.webSocket = null;
            delete instance.webSocket;
        }
    }

    initWebSocket(instance.connectionUrl);

    return {        
        stop: function () {

            this.webSocketClosedByUser = true;

            closeWebSocket();
            closePeerConnection();
        }
    }
};


export default Producer;