const OvenLiveKit = {};

const version = '1.4.0';
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

async function getStreamForDeviceCheck(type) {

  // High resolution video constraints makes browser to get maximum resolution of video device.
  const constraints = {
  };

  if (type === 'both') {
    constraints.audio = true;
    constraints.video = true;
  } else if (type === 'audio') {
    constraints.audio = true;
  } else if (type === 'video') {
    constraints.video = true;
  }

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

  // webrtc or whip
  instance.streamingMode = null;

  instance.inputStream = null;
  instance.webSocket = null;
  instance.peerConnection = null;
  instance.connectionConfig = {};

  instance.videoElement = null;
  instance.endpointUrl = null;
  instance.resourceUrl = null;

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

  async function fetchWithRedirect(url, options) {
    let fetched = await fetch(url, options);

    while (fetched.redirected) {
      url = fetched.url;
      fetched = await fetch(url, options);
    }

    return fetched;
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

    console.info(logHeader, 'Request Stream To Input Devices With Constraints', constraints);

    return navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {

        console.info(logHeader, 'Received Media Stream From Input Device', stream);

        instance.inputStream = stream;

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

    console.info(logHeader, 'Request Stream To Display With Constraints', constraints);

    return navigator.mediaDevices.getDisplayMedia(constraints)
      .then(function (stream) {

        console.info(logHeader, 'Received Media Stream From Display', stream);

        instance.inputStream = stream;

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

  function setMediaStream(stream) {
    // Check if a valid stream is provided
    if (!stream || !(stream instanceof MediaStream)) {

      const error = new Error("Invalid MediaStream provided");
      console.error(logHeader, 'Invalid MediaStream', error);
      errorHandler(error);

      return new Promise(function (resolve, reject) {
        reject(error);
      });
    }

    console.info(logHeader, 'Received Media Stream', stream);

    instance.inputStream = stream;

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

  function initWebSocket(endpointUrl) {

    if (!endpointUrl) {
      errorHandler('endpointUrl is required');
      return;
    }

    let webSocket = null;

    try {

      webSocket = new WebSocket(endpointUrl);
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

  async function startWhip(endpointUrl) {

    if (instance.peerConnection) {
      console.error('Connection already established');
      errorHandler('Connection already established');
      return;
    }

    const peerConnectionConfig = {
      bundlePolicy: "max-bundle"
    };

    if (instance.connectionConfig.iceServers) {

      // first priority using ice servers from local config.
      peerConnectionConfig.iceServers = instance.connectionConfig.iceServers;

      if (instance.connectionConfig.iceTransportPolicy) {

        peerConnectionConfig.iceTransportPolicy = instance.connectionConfig.iceTransportPolicy;
      }
    } else {
      // last priority using default ice servers.

      if (instance.connectionConfig.iceTransportPolicy) {

        peerConnectionConfig.iceTransportPolicy = instance.connectionConfig.iceTransportPolicy;
      }
    }

    console.info(logHeader, 'Create Peer Connection With Config', peerConnectionConfig);

    const peerConnection = new RTCPeerConnection(peerConnectionConfig);

    instance.peerConnection = peerConnection;

    if (!instance.inputStream) {
      console.error('No input stream in OvenLiveKit');
      errorHandler('No input stream in OvenLiveKit');
      return;
    }

    for (const track of instance.inputStream.getTracks()) {
      console.log(logHeader, 'Adding track: ', track);

      const transceiverConfig = {
        direction: 'sendonly'
      };

      // Add simulcast layers if configured
      const simulcastConfig = instance.connectionConfig.simulcast;

      if (track.kind === 'video' && simulcastConfig && simulcastConfig.length > 0) {

        transceiverConfig.sendEncodings = [];

        for (let i = 0; i < simulcastConfig.length; i++) {

          const layer = {
            rid: i,
            active: true,
            ...simulcastConfig[i]
          };

          console.log(logHeader, `Adding simulcast layer to: ${track.kind}`, layer);

          transceiverConfig.sendEncodings.push(layer);
        }
      }

      peerConnection.addTransceiver(track, transceiverConfig);
    }

    peerConnection.oniceconnectionstatechange = function (e) {

      let state = peerConnection.iceConnectionState;

      if (instance.callbacks.iceStateChange) {

        console.info(logHeader, 'ICE State', '[' + state + ']');
        instance.callbacks.iceStateChange(state);
      }

      if (state === 'connected') {

        if (instance.callbacks.connected) {
          instance.callbacks.connected(e);
        }
      }

      if (state === 'failed') {

        if (instance.callbacks.connectionClosed) {
          console.error(logHeader, 'Ice connection failed', e);
          instance.callbacks.errorHandler(e);
        }
      }

      if (state === 'disconnected' || state === 'closed') {

        if (instance.callbacks.connectionClosed) {
          console.error(logHeader, 'Ice connection disconnected or closed', e);
          instance.callbacks.connectionClosed('ice', e);
        }
      }
    }

    const offer = await peerConnection.createOffer();
    console.log(logHeader, 'Offer SDP: ', offer.sdp);

    if (instance.connectionConfig.maxVideoBitrate) {

      // if bandwidth limit is set. modify sdp from ome to limit acceptable bandwidth of ome
      offer.sdp = setBitrateLimit(offer.sdp, 'video', instance.connectionConfig.maxVideoBitrate);
    }

    if (instance.connectionConfig.sdp && instance.connectionConfig.sdp.appendFmtp) {

      offer.sdp = appendFmtp(offer.sdp);
    }

    if (instance.connectionConfig.preferredVideoFormat) {
      offer.sdp = setPreferredVideoFormat(offer.sdp, instance.connectionConfig.preferredVideoFormat);
    } else {
      // default to H264
      offer.sdp = setPreferredVideoFormat(offer.sdp, 'H264');
    }

    const headers = {
      "Content-Type": "application/sdp"
    };

    if (instance.connectionConfig.httpHeaders) {
      Object.assign(headers, instance.connectionConfig.httpHeaders);
    }

    const fetched = await fetchWithRedirect(endpointUrl, {
      method: "POST",
      body: offer.sdp,
      headers
    });

    if (!fetched.ok) {
      console.error('Failed to fetch', fetched.status);
      errorHandler(`Failed to fetch ${fetched.status}`);
      closePeerConnection();
      return;
    }

    if (!fetched.headers.get("location")) {
      console.error('No location header on answer response');
      errorHandler('No location header on answer response');
      return;
    }

    // update endpointUrl
    instance.endpointUrl = fetched.url;
    console.log(logHeader, 'Updated endpointUrl: ', instance.endpointUrl);

    const baseUrl = new URL(endpointUrl).origin;
    instance.resourceUrl = baseUrl + fetched.headers.get("location");

    const answer = await fetched.text();
    console.log(logHeader, 'Answer SDP: ', answer);

    try {
      await peerConnection.setLocalDescription(offer);
    } catch (error) {
      console.error('peerConnection.setLocalDescription', error);
      errorHandler(error);
    }

    try {
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answer
      });
    } catch (error) {
      console.error('peerConnection.setRemoteDescription', error);
      errorHandler(error);
    }
  }

  async function stopWhip() {

    if (!instance.peerConnection) {
      console.error('No connection to close');
      errorHandler('No connection to close');
      return;
    }

    closePeerConnection();

    if (instance.resourceUrl) {

      const headers = {
      };

      if (instance.connectionConfig.httpHeaders) {
        Object.assign(headers, instance.connectionConfig.httpHeaders);
      }

      await fetchWithRedirect(instance.resourceUrl, {
        method: "DELETE",
        headers
      });
    }
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
        let webSocketUrl = generateDomainFromUrl(instance.endpointUrl);

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

      if (instance.connectionConfig.iceTransportPolicy) {

        peerConnectionConfig.iceTransportPolicy = instance.connectionConfig.iceTransportPolicy;
      } else {
        peerConnectionConfig.iceTransportPolicy = 'relay';
      }
    } else {
      // last priority using default ice servers.

      if (instance.connectionConfig.iceTransportPolicy) {

        peerConnectionConfig.iceTransportPolicy = instance.connectionConfig.iceTransportPolicy;
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
    instance.inputStream.getTracks().forEach(function (track) {

      console.info(logHeader, 'Add Track To Peer Connection', track);
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
    console.info(logHeader, 'Modified offer sdp\n\n' + offer.sdp);

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

            console.info(logHeader, 'Modified answer sdp\n\n' + answer.sdp);

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

        console.info(logHeader, 'ICE State', '[' + state + ']');
        instance.callbacks.iceStateChange(state);
      }

      if (state === 'connected') {

        if (instance.callbacks.connected) {
          instance.callbacks.connected(e);
        }
      }

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {

        if (instance.callbacks.connectionClosed) {
          console.error(logHeader, 'Ice connection closed', e);
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

  function closeInputStream() {
    // release video, audio stream
    if (instance.inputStream) {

      instance.inputStream.getTracks().forEach(track => {

        track.stop();
        instance.inputStream.removeTrack(track);
      });

      if (instance.videoElement) {
        instance.videoElement.srcObject = null;
      }

      instance.inputStream = null;
      delete instance.inputStream;
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

  instance.setMediaStream = function (stream) {

    return setMediaStream(stream);
  };

  instance.startStreaming = function (endpointUrl, connectionConfig) {

    console.info(logEventHeader, `Start Streaming to ${endpointUrl} with connectionConfig`, connectionConfig);

    if (!endpointUrl) {
      console.error('endpointUrl is required');
      errorHandler('endpointUrl is required');
      return;
    }

    instance.endpointUrl = endpointUrl;

    if (connectionConfig) {
      instance.connectionConfig = connectionConfig;
    }

    try {

      const protocol = new URL(endpointUrl).protocol;

      if (protocol === 'wss:' || protocol === 'ws:') {

        instance.streamingMode = 'webrtc';
        initWebSocket(endpointUrl);
      } else if (protocol === 'https:' || protocol === 'http:') {

        instance.streamingMode = 'whip';
        startWhip(endpointUrl);
      } else {
        console.error('Invalid protocol', error);
        errorHandler(error);
      }

    } catch (error) {
      console.error('Cannot parse connection URL', error);
      errorHandler(error);
    }
  };

  instance.stopStreaming = async function () {

    if (instance.streamingMode === 'webrtc') {

      instance.webSocketClosedByUser = true;

      closeWebSocket();
      closePeerConnection();
    } else if (instance.streamingMode === 'whip') {

      await stopWhip();
    }

    if (instance.callbacks.connectionClosed) {
      console.log(logHeader, 'Connection closed by user');
      instance.callbacks.connectionClosed('user', 'Connection closed by user');
    }
  };

  instance.remove = function () {

    if (instance.streamingMode === 'webrtc') {

      instance.webSocketClosedByUser = true;

      closeWebSocket();
      closePeerConnection();
    } else if (instance.streamingMode === 'whip') {
      stopWhip();
    }

    closeInputStream();

    console.info(logEventHeader, 'Removed');

  };
}

OvenLiveKit.getVersion = function () {
  return version;
}

// static methods
OvenLiveKit.create = function (options) {

  console.info(logEventHeader, 'Create WebRTC Input ' + version);

  let instance = {};

  instance.webSocketClosedByUser = false;

  initConfig(instance, options);
  addMethod(instance);

  return instance;
};

OvenLiveKit.getDevices = async function (type = 'both') {

  try {
    // First check both audio and video sources are available.
    await getStreamForDeviceCheck(type);
  } catch (e) {

    console.warn(logHeader, 'Can not find Video and Audio devices', e);

    let videoFound = null;
    let audioFound = null;

    try {
      videoFound = await getStreamForDeviceCheck('video');
    } catch (e) {
      console.warn(logHeader, 'Can not find Video devices', e);
    }

    try {
      audioFound = await getStreamForDeviceCheck('audio');
    } catch (e) {
      console.warn(logHeader, 'Can not find Audio devices', e);
    }

    if (!videoFound && !audioFound) {
      throw new Error('No input devices were found.');
    }
  }

  const deviceInfos = await getDevices();
  return gotDevices(deviceInfos)
};

export default OvenLiveKit;
