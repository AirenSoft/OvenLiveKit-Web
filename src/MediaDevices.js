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

getDevices = async function () {

    try {
        // First check both audio and video sources are available.
        await getStreamForDeviceCheck('both');
    } catch (e) {

        console.warn('MediaDevices', 'Can not find Video and Audio devices', e);

        let videoFound = null;
        let audioFound = null;

        try {
            videoFound = await getStreamForDeviceCheck('video');
        } catch (e) {
            console.warn('MediaDevices', 'Can not find Video devices', e);
        }

        try {
            audioFound = await getStreamForDeviceCheck('audio');
        } catch (e) {
            console.warn('MediaDevices', 'Can not find Audio devices', e);
        }

        if (!videoFound && !audioFound) {
            throw new Error('No input devices were found.');
        }
    }

    const deviceInfos = await getDevices();
    return gotDevices(deviceInfos)
};

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

    return devices;g
}


const MediaDevices = function (opt) {

    const errorHandler = opt.errorHandler || function () { };
    const videoElement = opt.videoElement || null;

    let instance = {
        inputStream: null
    };    

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

        console.info('MediaDevices', 'Request Stream To Input Devices With Constraints', constraints);

        return navigator.mediaDevices.getUserMedia(constraints)
            .then(function (stream) {

                console.info('MediaDevices', 'Received Media Stream From Input Device', stream);

                instance.inputStream = stream;

                // Attach stream to video element when video element is provided.
                if (videoElement) {

                    videoElement.srcObject = stream;

                    videoElement.onloadedmetadata = function (e) {

                        videoElement.play();
                    };
                }

                return new Promise(function (resolve) {

                    resolve(stream);
                });
            })
            .catch(function (error) {

                console.error('MediaDevices', 'Can\'t Get Media Stream From Input Device', error);
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

        console.info('MediaDevices', 'Request Stream To Display With Constraints', constraints);

        return navigator.mediaDevices.getDisplayMedia(constraints)
            .then(function (stream) {

                console.info('MediaDevices', 'Received Media Stream From Display', stream);

                instance.inputStream = stream;

                // Attach stream to video element when video element is provided.
                if (videoElement) {

                    videoElement.srcObject = stream;

                    videoElement.onloadedmetadata = function (e) {

                        videoElement.play();
                    };
                }

                return new Promise(function (resolve) {

                    resolve(stream);
                });
            })
            .catch(function (error) {

                console.error('MediaDevices', 'Can\'t Get Media Stream From Display', error);
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
            console.error('MediaDevices', 'Invalid MediaStream', error);
            errorHandler(error);
    
            return new Promise(function (resolve, reject) {
                reject(error);
            });
        }
    
        console.info('MediaDevices', 'Received Media Stream', stream);
    
        instance.inputStream = stream;
    
        // Attach stream to video element when video element is provided.
        if (videoElement) {
            videoElement.srcObject = stream;
    
            videoElement.onloadedmetadata = function (e) {
                videoElement.play();
            };
        }
    
        return new Promise(function (resolve) {
            resolve(stream);
        });
    }

    function closeInputStream() {
        // release video, audio stream
        if (instance.inputStream) {

            instance.inputStream.getTracks().forEach(track => {

                track.stop();
                instance.inputStream.removeTrack(track);
            });

            if (videoElement) {
                videoElement.srcObject = null;
            }

            instance.inputStream = null;
            delete instance.inputStream;
        }
    }

    function getInputStream() {
        return instance.inputStream;
    }

    return {
        getUserMedia: getUserMedia,
        getDisplayMedia: getDisplayMedia,
        setMediaStream: setMediaStream,
        closeInputStream: closeInputStream,
        getInputStream: getInputStream
    }

};


export default MediaDevices;