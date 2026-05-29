import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/Addons.js';
import { CustomMixer } from './CustomMixer';
import VoiceLiveModule from './VoiceLiveModule';
import AvatarToiFrameEvents from './AvatariFrameEvents';

class ThreejsModule {
    constructor(parameters) {
        this.setSpeakStates = parameters.setSpeakStates
        this.setLoading = parameters.setLoading
        this.container = parameters.container
        this.setIsPending = parameters.setIsPending
        this.setAudioReady = parameters.setAudioReady
        this.appData = parameters.appData
        this.mixer = null
        this.bodyMixer = null
        this.clock = new THREE.Clock()
        this.clickStart = window.self === window.top
        this.scene = new THREE.Scene()
        this.nextPlayTime = 0
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        this.talkAnimationClip = null
        this.body = null
        this.collectedEvents = [];
        this.startTime = 0
        this.isSpeaking = false

        console.log('Character in ThreejsModule:', this.appData)

        this.visemeQueue = []

        this.mixer = null
        this.talkAction = null
        this.talkAudio = null

        this.camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, })
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.container.appendChild(this.renderer.domElement)
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true
        this.controls.enabled = false
        this.gltfLoader = new GLTFLoader()

        THREE.DefaultLoadingManager.onLoad = () => {
            console.log('Loading Complete!');
            this.setLoading('done')
            // this.connect()
            this.avatariFrame.sendToHost({
                type: "ready",
            })
            this.avatariFrame.postDiagnostics({ audioActive: false });
            this.setSpeakStates('loaded')

        };

        THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const percentage = (itemsLoaded / itemsTotal) * 100
            this.setLoading(percentage.toFixed(2) + '%')
        }
        THREE.DefaultLoadingManager.onError = (url) => {
            console.error('There was an error loading ' + url);
            this.avatariFrame.sendToHost({
                type: "Error",
                message: 'There was an error loading ' + url
            })
        }
        window.addEventListener('resize', this.onWindowResize.bind(this), false)

        this.voiceAssistant = new VoiceLiveModule()
        this.voiceAssistant.updateViseme = this.updateViseme.bind(this)
        this.voiceAssistant.onSessionReady = () => {
            this.setSpeakStates('connected')
            this.avatariFrame.sendToHost({
                type: "sessionStarted",
            })

            console.log('Session is ready and connected to Voice Live service');
            this.start()
        }
        this.voiceAssistant.onConnected = () => {
            this.setSpeakStates('connected')
        }
        this.voiceAssistant.onTalking = () => {
            this.mixer.isTalking = true;
            console.log('active talking');
        }
        this.voiceAssistant.onFinishedTalking = () => {
            this.mixer.isTalking = false;
            console.log('Finished talking');
        }

        this.voiceAssistant.startAction = () => {
            // this.mixer.startIndexAction(Math.random() > 0.5 ? 0 : 1)
            console.log('Start action triggered');
            this.mixer.startIndexAction(0)
        }
        this.voiceAssistant.onStopActions = () => {
            this.mixer.stopAction()
        }

        this.avatariFrame = new AvatarToiFrameEvents()
        this.sessionID = ''
        // this.init()
        this.loadAssets()
        this.animate()

        this.frames = 0

    }
    avatarLaugh() {
        this.mixer.startIndexAction(1)
    }
    playAction(index) {
        // this.mixer.startIndexAction(Math.random() > 0.5 ? 0 : 1)
        this.mixer.startIndexAction(index)
    }
    stopAction() {
        this.mixer.stopAction()
    }


    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }


    loadGLTF(url) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                url,
                (gltf) => resolve(gltf),
                undefined,
                (error) => reject(error)
            );
        });
    };
    async loadAssets() {

        const [bodyGltf, headGltf, animations] = await Promise.all([
            this.loadGLTF(this.appData.body),
            this.loadGLTF(this.appData.head),
            this.loadGLTF(this.appData.animations),
        ])

        const hair = headGltf.scene.getObjectByName("Hair")
        if (hair) {
            hair.material.side = THREE.DoubleSide
            console.log('Model hair:', hair)
        }

        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        new THREE.Box3().setFromObject(headGltf.scene).getSize(size)
        new THREE.Box3().setFromObject(headGltf.scene).getCenter(center)
        this.camera.position.y = center.y

        this.camera.position.set(-0.1, center.y, 0.95)
        this.controls.target.set(0, center.y, 0)
        const frame = this.appData.key == 'gavin' ? 20 : 14.1
        this.mixer = new CustomMixer(bodyGltf.scene, headGltf.scene, animations.animations, frame)
        this.mixer.onActionEnd = () => {
            this.voiceAssistant.onActionEnd()
            this.visemeId = 0
        }
        this.mixer.onAudioReady = () => {
            console.log('Audio is ready to play')
            this.setAudioReady(true)
        }
        this.mixer.fetchLaughAudio(this.appData.audio)

        this.scene.add(bodyGltf.scene)
        this.scene.add(headGltf.scene)


    }

    animate() {
        requestAnimationFrame(this.animate.bind(this))
        this.renderer.render(this.scene, this.camera)
        this.controls.update()
        const delta = this.clock.getDelta();
        if (this.mixer) {
            this.mixer.update(delta);
        }
        if (this.voiceAssistant) {
            this.voiceAssistant.update()
        }
        // this.frames++
    }
    cleanup() {
        this.renderer.dispose()
        this.scene.clear()
        this.container.removeChild(this.renderer.domElement)
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
        }
    }

    mapToRange(x) {
        const xMin = 0;
        const xMax = 21;
        const yMin = 0;
        const yMax = 0.9583333134651184;
        return ((x - xMin) / (xMax - xMin)) * (yMax - yMin) + yMin;
    }
    updateViseme(visemeId) {
        if (this.mixer) {
            // this.mixer.viseme = this.mapToRange(visemeId);
            this.mixer.updateViseme(this.mapToRange(visemeId))
        }
    }
    sendTextChat(payload) {
        this.voiceAssistant.sendTextChat(payload)
    }

    onPing() {
        this.avatariFrame.sendToHost({
            type: "pong",
        })
    }
    async connect(payload) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const speakers = devices.filter(d => d.kind === 'audiooutput');
        console.log('Available audio output devices:', speakers);

        this.voiceAssistant.connect({
            webSocketTarget: payload.wsUrl,
            settings: {
                ...payload?.settings,
                speakerDeviceId: payload?.settings?.speakerDeviceId || speakers[0].deviceId,
                microphoneDeviceId: payload?.settings?.microphoneDeviceId || undefined,
            }

        })
    }
    updateSettings(payload) {
        this.voiceAssistant.updateSettings(payload)
    }
    stopConnection() {
        this.sessionID = null
        this.avatariFrame.sessionID = null
        this.voiceAssistant.end("user ended Session")
    }
    start() {
        this.setSpeakStates('ready')
        this.voiceAssistant.start()
    }
    stop() {
        this.setSpeakStates('idle')
        this.voiceAssistant.end()
        this.avatariFrame.sendToHost({
            type: "sessionStopped",
            sessionId: "",
            timestampUtc: new Date().toISOString()
        })
    }

}

export default ThreejsModule;