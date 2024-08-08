/**
 * Created by hoho on 2018. 6. 11..
 */
import WebRTCLoader from "./WebRTCLoader";

let that = {};
let audioCtx = null;
let connected = false;
let connectionStartTime = null;
let connectedTime = null;

const isMobile = {
    Android: function() {
        return navigator.userAgent.match(/Android/i);
    },
    iOS: function() {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Opera: function() {
        return navigator.userAgent.match(/Opera Mini/i);
    },
    any: function() {
        return (isMobile.Android() || isMobile.iOS() || isMobile.Opera());
    }
};

const unlockAudio = (audioCtx) => {
    let called = false;
    if (isMobile.any() && audioCtx.state === 'suspended') {

        document.addEventListener('touchend', () => {
            if (!called && audioCtx.state !== 'running') {
                audioCtx.resume();
                called = true
            }
        })
    }
};


const Consumer = function (url, element, opt = {}) {

    let onReady = opt.onReady || function () {};

    const webrtcLoader = WebRTCLoader(
        url,
        {
            loadCallback: (stream) => {

                if (element.srcObject) {
                    element.srcObject = null;
                }

                if (audioCtx) {
                    audioCtx.close();
                    audioCtx = null;
                }

                element.srcObject = stream;

                if (stream.getAudioTracks().length > 0) {

                    // Add some weird code to avoid the audio delay bug in Safari.
                    // We don't even know why this code solves the audio delay.
                    const AudioContext = window.AudioContext || window.webkitAudioContext;

                    // This code resolves audio delay in MacOS not IOS.
                    audioCtx = new AudioContext();
                    unlockAudio(audioCtx);


                    // This code resolves audio delay in IOS.
                    audioCtx.createMediaStreamSource(stream);
                }
                onReady()
            },
            connectedCallback: () => {
                connectedTime = performance.now();
                connected = true;
            },
            internalErrorCallback: (error) => {
            }
        }
    );

    connectionStartTime = performance.now();
    webrtcLoader.connect();

    return that;
};


export default Consumer;