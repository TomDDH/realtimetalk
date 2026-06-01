import { EventDispatcher } from "three";
import { Quaternion, Vector3, Euler, Object3D, MathUtils } from "three";
import * as THREE from 'three';

import mask from '../assets/face_mask.json' assert { type: 'json' };

class CustomMixer extends EventDispatcher {
    constructor(body, head, animations, expressionFame = 14) {
        super();
        this.body = body
        this.head = head
        this.animations = animations
        this.expressionFame = expressionFame

        console.log({ animations })

        this.timeScale = 1

        this.actionLearp = 1
        this.expressionLearp = 0.12
        this.blinking = 0
        this.viseme = 0

        this.playAction = undefined

        this.isBlinking = false
        this.blinkToggleEnabled = false
        this.blinkInterval = 2000
        this.blinkDuration = 150
        this.lastBlinkTime = 0
        this.blinkStartTime = 0
        this.nextBlinkDelay = 0

        this.leftEye = head.getObjectByName("FACIAL_L_Eye")
        this.rightEye = head.getObjectByName("FACIAL_R_Eye")

        this.neck = head.getObjectByName("neck_02")


        this.eyeLook = null
        this.eyeLookQuaternion = new Quaternion()

        this.idleLookEnabled = true
        this.lastLookTime = 0
        this.nextLookDelay = 0
        this.lookDuration = 0
        this.lookStartTime = 0
        this.isLooking = false
        this.currentLookTarget = new Quaternion()
        this.neutralLook = new Quaternion()
        this.currentNeckTarget = new Quaternion()
        this.neutralNeck = new Quaternion()

        this.actions = []
        this.onActionEnd = () => { }
        this.onAudioReady = () => { }
        this.iniActions()
    }

    iniActions() {

        const idleClip = this.animations.find(clip => clip.name === 'idle')
        this.idleAction = {
            time: 0,
            duration: idleClip.duration,
            trackes: []
        }
        idleClip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if (target === "position" || target === "quaternion") {
                const _a = {
                    interpolant: track.createInterpolant(),
                    target: this.body.getObjectByName(name)?.[target] || null,
                    headTarget: this.head.getObjectByName(name)?.[target] || null,
                    name: name
                }
                this.idleAction.trackes.push(_a)
            }
        })

        const expressionsClip = this.animations.find(clip => clip.name === 'expression')
        THREE.AnimationUtils.makeClipAdditive(expressionsClip);
        this.expressionAction = {
            time: 0,
            duration: expressionsClip.duration,
            trackes: []
        }
        expressionsClip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if ((target === "position" || target === "quaternion") && !this.body.getObjectByName(name)) {
                const _a = {
                    interpolant: track.createInterpolant(),
                    target: this.head.getObjectByName(name)[target],
                    name: name
                }
                this.expressionAction.trackes.push(_a)
            }
        })
        console.log('Expression Action:', this.expressionAction)

        const visemeClip = this.animations.find(clip => clip.name === 'viseme')
        // THREE.AnimationUtils.makeClipAdditive(visemeClip);
        this.visemeAction = {
            time: 0,
            duration: visemeClip.duration,
            trackes: []

        }
        visemeClip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if ((target === "position" || target === "quaternion") && !this.body.getObjectByName(name)) {
                const _a = {
                    interpolant: track.createInterpolant(),
                    target: this.head.getObjectByName(name)[target],
                    name: name,
                }
                this.visemeAction.trackes.push(_a)
            }
        })

        const blinkClip = this.animations.find(clip => clip.name === 'blink')
        THREE.AnimationUtils.makeClipAdditive(blinkClip);
        this.blinkAction = {
            time: 0,
            duration: blinkClip.duration,
            trackes: []
        }
        blinkClip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if ((target === "quaternion") && !this.body.getObjectByName(name)) {
                const _a = {
                    interpolant: track.createInterpolant(),
                    target: this.head.getObjectByName(name)[target],
                    name: name
                }
                this.blinkAction.trackes.push(_a)
            }
        })

        this.animations.forEach(clip => {
            if (clip.name === 'idle' || clip.name === 'expression' || clip.name === 'viseme' || clip.name === 'blink') return;
            const action = {
                name: clip.name,
                duration: clip.duration,
                time: 0,
                trackes: []
            }
            clip.tracks.forEach(track => {
                const [name, target] = track.name.split('.')
                if (name && (target === "position" || target === "quaternion")) {
                    const _a = {
                        interpolant: track.createInterpolant(),
                        target: this.body.getObjectByName(name)?.[target] || null,
                        headTarget: this.head.getObjectByName(name)?.[target] || null,
                        name: name,
                    }
                    action.trackes.push(_a)
                }
            })
            this.actions.push(action)
        })
        this.enableBlinking()
        this.enableIdleLook()

    }
    startIndexAction(index) {
        this.playAction = this.actions?.[index] || undefined
        this.actionLearp = 0
        this.playAudio()
    }

    async fetchLaughAudio(url) {
        if (this.laughAudio || !url) return
        // this.laughAudio = new Audio('./assets/audio/preview.mp3');
        this.laughAudio = new Audio(url);
        console.log("Fetching laugh audio from URL:", this.laughAudio.setSinkId);
        this.onAudioReady()
    }
    async updateSettings(payload) {

        const setting = payload?.settings || {}
        if (setting.speakerDeviceId) {
            console.log('CustomMixer received settings update:', payload)
            await this.laughAudio.setSinkId(setting.speakerDeviceId)
        }

    }

    playAudio() {
        if (!this.laughAudio) return
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
        this.laughAudio.play();
    }
    stopAudio() {
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
    }

    updateViseme(value) {
        this.viseme = value
    }

    actionStop() {
        this.playAction = undefined
        this.actionLearp = 0
        this.stopAudio()
        this.onActionEnd()
    }

    update(time) {
        // return false;
        const noise = Math.sin(performance.now() / 100) * 0.02
        if (this.actionLearp < 1) {
            this.actionLearp += 0.001
        } else {
            this.actionLearp = 1
        }

        if (this.playAction) {

            this.playAction.time += (time * this.timeScale)
            this.playAction.trackes.forEach((track, i) => {
                const values = track.interpolant.evaluate(this.playAction.time)
                if (track.target) {
                    if (values.length === 4) {
                        track.target.slerp(new Quaternion(...values), this.actionLearp)
                    } else {
                        track.target.lerp(new Vector3(...values), this.actionLearp)
                    }
                }
                if (track.headTarget) {
                    if (values.length === 4) {
                        track.headTarget.slerp(new Quaternion(...values), this.actionLearp)
                    } else {
                        track.headTarget.lerp(new Vector3(...values), this.actionLearp)
                    }
                }
            })

            if (this.playAction.time > this.playAction.duration) {
                this.playAction.time = 0
                this.playAction = undefined
                this.actionLearp = 0
                this.actionStop()
            }

        } else {
            if (this.idleAction) {
                this.idleAction.time += (time * this.timeScale)
                this.idleAction.trackes.forEach((track, i) => {
                    const values = track.interpolant.evaluate(this.idleAction.time)
                    if (values.length === 4) {
                        track.target.slerp(new Quaternion(...values), this.actionLearp)
                    } else {
                        track.target.lerp(new Vector3(...values), this.actionLearp)
                    }
                    if (track.headTarget) {
                        if (values.length === 4) {
                            track.headTarget.slerp(new Quaternion(...values), this.actionLearp)
                        } else {
                            track.headTarget.lerp(new Vector3(...values), this.actionLearp)
                        }
                    }
                })
                if (this.idleAction.time > this.idleAction.duration) {
                    this.idleAction.time = 0
                }
            }
            if (this.visemeAction) {
                this.visemeAction.trackes.forEach((track, i) => {
                    const values = track.interpolant.evaluate(this.viseme)
                    if (values.length === 4) {
                        track.target.slerp(new Quaternion(...values), 0.25)
                    } else {
                        track.target.lerp(new Vector3(...values), 0.25)
                    }
                })
            }
            if (this.expressionAction) {
                const learpAmout = this.expressionLearp
                this.expressionAction.trackes.forEach((track, i) => {
                    const baseValues = track.interpolant.evaluate(this.expressionFame / 30) // 14/30 20/30
                    if (baseValues.length === 4) {
                        const target = new THREE.Quaternion().slerp(new Quaternion(...baseValues), learpAmout + noise * 0.5) // amount
                        track.target.multiply(target)
                    } else {
                        track.target.add(new Vector3(...baseValues).multiplyScalar(learpAmout + noise * 0.5))
                    }
                })
            }
            if (this.blinkToggleEnabled) {
                const currentTime = performance.now()
                if (!this.isBlinking && (currentTime - this.lastBlinkTime) > this.nextBlinkDelay) {
                    this.isBlinking = true
                    this.blinkStartTime = currentTime
                    this.lastBlinkTime = currentTime
                    this.generateNextBlinkDelay()
                }
                if (this.isBlinking && (currentTime - this.blinkStartTime) > this.blinkDuration) {
                    this.isBlinking = false
                }
            }
            if (this.isBlinking && this.blinkAction) {
                this.blinkAction.trackes.forEach((track, i) => {
                    if ((track.name.includes("Eye") || track.name.includes("Forehead")) || track.name.includes("Nose") || track.name.includes("Cheek") || track.name.includes("Temple") || track.name.includes("Pupil")) {
                        const values = track.interpolant.evaluate(0.9)
                        if (values.length === 4) {
                            const target = new THREE.Quaternion().slerp(new Quaternion(...values), 0.6)
                            track.target.multiply(target)
                        } else {
                            track.target.add(new Vector3(...values).multiplyScalar(0.6))
                        }
                    }
                })
            }

            this.updateIdleLookMovement()
        }
    }

    enableBlinking(interval = 4000, duration = 250) {
        this.blinkToggleEnabled = true
        this.blinkInterval = interval
        this.blinkDuration = duration
        this.lastBlinkTime = performance.now()
        this.generateNextBlinkDelay()
    }

    generateNextBlinkDelay() {
        const baseInterval = this.blinkInterval
        const variation = 0.4
        const minInterval = baseInterval * (1 - variation)
        const maxInterval = baseInterval * (1 + variation)
        this.nextBlinkDelay = minInterval + Math.random() * (maxInterval - minInterval)

        if (Math.random() < 0.15) {
            this.nextBlinkDelay *= 0.3
        }
    }

    disableBlinking() {
        this.blinkToggleEnabled = false
        this.isBlinking = false
    }

    triggerBlink() {
        if (!this.isBlinking) {
            this.isBlinking = true
            this.blinkStartTime = performance.now()
        }
    }

    enableIdleLook() {
        this.idleLookEnabled = true
        this.lastLookTime = performance.now()
        this.generateNextLookDelay()
    }

    disableIdleLook() {
        this.idleLookEnabled = false
        this.isLooking = false
    }

    generateNextLookDelay() {
        const baseInterval = 3000
        const variation = 0.6
        const minInterval = baseInterval * (1 - variation)
        const maxInterval = baseInterval * (1 + variation)
        this.nextLookDelay = minInterval + Math.random() * (maxInterval - minInterval)

        this.lookDuration = 1000 + Math.random() * 2000
    }

    generateRandomLookTarget() {
        const intensity = 0.6
        const neckIntensity = 0.15
        const directions = [
            {
                eye: { x: 0, y: intensity, z: 0 },
                neck: { x: 0, y: neckIntensity * 0.6, z: 0 }
            },      // up
            {
                eye: { x: 0, y: -intensity * 0.4, z: 0 },
                neck: { x: 0, y: -neckIntensity * 0.6, z: 0 }
            }, // down (less intense)
            {
                eye: { x: 0, y: 0, z: intensity },
                neck: { x: 0, y: 0, z: neckIntensity }
            },      // left
            {
                eye: { x: 0, y: 0, z: -intensity },
                neck: { x: 0, y: 0, z: -neckIntensity }
            },     // right
            {
                eye: { x: 0, y: intensity * 0.4, z: intensity * 0.6 },
                neck: { x: 0, y: neckIntensity * 0.5, z: neckIntensity * 0.6 }
            },  // up-left
            {
                eye: { x: 0, y: intensity * 0.4, z: -intensity * 0.6 },
                neck: { x: 0, y: neckIntensity * 0.5, z: -neckIntensity * 0.6 }
            }, // up-right
            {
                eye: { x: 0, y: 0, z: 0 },
                neck: { x: 0, y: 0, z: 0 }
            }               // center (return to neutral)
        ]

        const randomDirection = directions[Math.floor(Math.random() * directions.length)]
        this.currentLookTarget.setFromEuler(new Euler(randomDirection.eye.x, randomDirection.eye.y, randomDirection.eye.z))
        this.currentNeckTarget.setFromEuler(new Euler(randomDirection.neck.x, randomDirection.neck.y, randomDirection.neck.z))
    }

    updateIdleLookMovement() {
        if (!this.idleLookEnabled || this.playAction || !this.leftEye || !this.rightEye) return

        const currentTime = performance.now()

        if (!this.isLooking && (currentTime - this.lastLookTime) > this.nextLookDelay) {
            this.isLooking = true
            this.lookStartTime = currentTime
            this.lastLookTime = currentTime
            this.generateRandomLookTarget()
            this.generateNextLookDelay()
        }

        if (this.isLooking && (currentTime - this.lookStartTime) > this.lookDuration) {
            this.isLooking = false
            this.currentLookTarget.copy(this.neutralLook)
            this.currentNeckTarget.copy(this.neutralNeck)
        }

        if (this.isLooking && !this.viseme) {
            const progress = Math.min((currentTime - this.lookStartTime) / (this.lookDuration * 0.3), 1)
            const smoothProgress = 0.5 * (1 - Math.cos(Math.PI * progress))

            const targetQuaternion = new Quaternion().copy(this.neutralLook)
            targetQuaternion.slerp(this.currentLookTarget, smoothProgress)

            this.leftEye.quaternion.slerp(targetQuaternion, 0.1)
            this.rightEye.quaternion.slerp(targetQuaternion, 0.1)

            if (this.neck) {
                const target = new THREE.Quaternion().slerp(this.currentNeckTarget, 0.0)
                this.neck.quaternion.multiply(target)
            }
        } else {
            this.leftEye.quaternion.slerp(this.neutralLook, 0.05)
            this.rightEye.quaternion.slerp(this.neutralLook, 0.05)


        }
    }
}


export { CustomMixer };