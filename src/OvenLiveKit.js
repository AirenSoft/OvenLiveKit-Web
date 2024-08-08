import Consumer from './Consumer';
import Producer from './Producer';
import MediaDevices from './MediaDevices';

const OvenLiveKit = {};

const version = '1.1.0';
const logHeader = 'OvenLiveKit.js :';
const logEventHeader = 'OvenLiveKit.js ====';

OvenLiveKit.getVersion = function () {
    return version;
}

// static methods
OvenLiveKit.create = function (options) {

    console.info(logEventHeader, '==>Create WebRTC Input ' + version);

    function consume(url, element, opt) {
        return Consumer(url, element, opt);
    }

    function produce(url, mediaStream) {
        return Producer(url, mediaStream);
    }

    function mediaDevices(opt) {
        return MediaDevices(opt);
    }

    return {
        consume: consume,
        produce: produce,
        mediaDevices: mediaDevices
    };
};



export default OvenLiveKit;