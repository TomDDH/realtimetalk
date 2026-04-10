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
                type: "iframeReady",
            })
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
        this.avatariFrame = new AvatarToiFrameEvents()
        this.sessionID = ''
        this.init()
        this.loadAssets()
        this.animate()

        this.frames = 0

    }

    init() {
        this.camera.position.set(-0.1, 1.55, 0.95)
        this.controls.target.set(0, 1.55, 0)
    }

    registerBlink() {
        this.mixer.isBlinking = true;
        // 0.25
        setTimeout(() => {
            this.mixer.isBlinking = false;
        }, Math.random() * 500 + 200); // random blink duration between 2-6 seconds

        setTimeout(() => {
            this.registerBlink();
        }, Math.random() * 3000 + 2500); // random blink duration between 2-6 seconds
    }

    registerEyeLook() {

        const rand = Math.random()
        if (rand < 0.25) {
            this.mixer.eyeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0)) // down
        } else if (rand < 0.5) {
            this.mixer.eyeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.1, 0)) // up 
        } else if (rand < 0.75) {
            this.mixer.eyeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.43, 0)) // right
        } else {
            this.mixer.eyeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.43, 0)) // left
        }

        setTimeout(() => {
            this.mixer.eyeLook = null
        }, Math.random() * 1000 + 1000); // random blink duration between 2-6 seconds

        setTimeout(() => {
            this.registerEyeLook();
        }, Math.random() * 5000 + 3500); // random blink duration between 2-6 seconds
    }

    registerExpression() {

        // const express = this.randomInt(1, 9) / 24 // 1-4
        // const express = Math.random() > 0.5 ? 14 / 24 : 8 / 24
        const express = 8 / 24
        this.mixer.updateExpression(express)
        this.mixer.isExpression = true;
        // this.mixer.expression = express
        // this.mixer.expression =
        setTimeout(() => {
            // this.mixer.expression = 0
            this.mixer.updateExpression(0 / 24)
            // this.mixer.expression = 8 / 24
            this.mixer.isExpression = false
        }, Math.random() * 4000 + 500); // random blink duration between 2-6 seconds

        setTimeout(() => {
            this.registerExpression();
        }, Math.random() * 8000 + 1500); // random blink duration between 2-6 seconds

    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }



    loadAssets() {
        this.gltfLoader.load(
            './assets/gavin_viseme.glb',
            (gltf) => {
                this.scene.add(gltf.scene)
                console.log(gltf)
                this.mixer = new CustomMixer(gltf.scene)
                // this.mixer.addVisemeAction(gltf.animations[0])
                this.registerBlink()
                this.registerExpression()
                this.registerEyeLook()
                const hair = gltf.scene.getObjectByName("Hair_S_Messy_CardsMesh_Group0_LOD0")
                hair.material.side = THREE.DoubleSide;
                // this.talkAction = this.mixer.clipAction(gltf.animations[0])
                // this.talkAction.play()
                // const skeleton = new THREE.SkeletonHelper(gltf.scene);
                // this.scene.add(skeleton);



                if (this.body) {

                    this.mixer.addTalkAction(this.talkAnimationClip, this.body)

                    // // const action = this.bodyMixer.clipAction(gltf.animations[0])
                    // // action.play()
                    // // 710  1550

                    this.gltfLoader.load(
                        './assets/gavin_idle.glb',
                        (gltf) => {
                            this.mixer.addIdleAction(gltf.animations[0], this.body)
                        }
                    )
                    this.gltfLoader.load(
                        './assets/gavin_expression2.glb',
                        (gltfes) => {
                            console.log(gltfes.animations[0])
                            // this.mixer.addTalkAction(gltf.animations[0], this.body)
                            this.mixer.addExpressionAction(gltfes.animations[0])
                        }
                    )
                    this.gltfLoader.load(
                        './assets/gavin_viseme2.glb',
                        (gltf) => {
                            this.mixer.addVisemeAction(gltf.animations[0])



                        }
                    )



                    this.gltfLoader.load(
                        './assets/gavin_blink.glb',
                        (gltf) => {

                            // this.mixer.addTalkAction(gltf.animations[0], this.body)
                            this.mixer.addBlinkingAction(gltf.animations[0])
                            // const clip = gltf.animations[0]
                            // THREE.AnimationUtils.makeClipAdditive( clip );
                            console.log(gltf.animations[0])
                        }
                    )


                }


                this.setLoading(false)
            },
            (e) => {
                const progress = (e.loaded / e.total) * 100;
                console.log(`GLTF model loading: ${progress.toFixed(2)}%`)
                this.setLoading(progress.toFixed(2) + '%')
            },
            (error) => {
                console.error('Error loading GLTF model:', error)
                this.setLoading(false)
            }
        )

        this.gltfLoader.load(
            './assets/gavin_body.glb',
            (gltf) => {
                this.scene.add(gltf.scene)
                // this.bodyMixer = new THREE.AnimationMixer(gltf.scene)
                // const action = this.bodyMixer.clipAction(gltf.animations[0])
                // action.play()
                this.body = gltf.scene
                this.talkAnimationClip = gltf.animations[0]

            },
            (e) => {
                // const progress = (e.loaded / e.total) * 100;
                // console.log(`GLTF model loading: ${progress.toFixed(2)}%`)
                // this.setLoading(progress.toFixed(2) + '%')
            },
            (error) => {
                console.error('Error loading GLTF model:', error)
                this.setLoading(false)
            }
        )

    }

    animate() {
        requestAnimationFrame(this.animate.bind(this))
        this.renderer.render(this.scene, this.camera)
        this.controls.update()
        const delta = this.clock.getDelta();
        if (this.mixer) {
            this.mixer.update(delta);
        }
        if (this.bodyMixer) {
            this.bodyMixer.update(delta);
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
    connect(payload) {
        this.setSpeakStates('connecting')
        console.log('Connecting to Voice Live service...', { payload });
        const { sessionId } = payload || {}
        this.sessionID = sessionId
        this.avatariFrame.sessionID = sessionId
        this.voiceAssistant.connect(payload)

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