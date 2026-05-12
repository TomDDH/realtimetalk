import { EventDispatcher } from "three";
import { Quaternion, Vector3, Euler, Object3D, MathUtils } from "three";
import * as THREE from 'three';

import mask from '../assets/face_mask.json' assert { type: 'json' };

class CustomMixer extends EventDispatcher {
    constructor(root) {
        super();
        this.root = root
        this.visemeAction = null
        this.timeScale = 1
        this.viseme = 0
        this.learpViseme = 0

        this.mask = mask.mask
        this.isBlinking = false
        this.blinking = 0
        this.blinkingAction = null
        this.isTalking = false
        this.headBaseBones = ["root", "pelvis", "spine_01", "spine_02", "spine_03", "spine_04", "spine_04", "spine_05", "neck_01", "neck_02", "head", "clavicle_pec_l", "spine_04_latissimus_l", "spine_04_latissimus_r", "clavicle_pec_r", "clavicle_scap_r", "clavicle_out_r", "clavicle_scap_l", "clavicle_out_l", "upperarm_r", 'upperarm_l', "upperarm_in_r", "upperarm_bck_r", "upperarm_out_r", "upperarm_fwd_r", 'upperarm_bck_l', 'upperarm_in_l', 'upperarm_fwd_l', 'upperarm_out_l', 'clavicle_l', 'clavicle_r']
        this.eyeLipLefgt = root.getObjectByName("FACIAL_R_EyelidUpperA")
        this.eyeLipRight = root.getObjectByName("FACIAL_L_EyelidUpperA")
        this.neck = root.getObjectByName("neck_01")
        this.learpTransition = 0.1
        this.actionLearp = 0
        this.learpExpression = 0
        this.expressionAction = null
        this.lastExpression = 0
        this.expression = 0
        this.isExpression = false

        this.leftEye = root.getObjectByName("FACIAL_L_Eye")
        this.rightEye = root.getObjectByName("FACIAL_R_Eye")
        this.FACIAL_C_LowerLipRotation = root.getObjectByName("FACIAL_C_LowerLipRotation")
        this.eyeLook = null
        this.eyeLookQuaternion = new Quaternion()

        this.FACIAL_C_LowerLipRotationQuaternion = new Quaternion().setFromEuler(new Euler(-0.01, 0, 0))
        // console.log(this.mask)
        // this.laughAudio = new Audio('./assets/audio/preview.mp3');
        this.laughAudio = null

        this.onActionEnd = () => { }
        this.onAudioReady = () => { }

        this.actions = []

        this.playAction = undefined
    }

    async fetchLaughAudio() {
        if (this.laughAudio) return
        this.laughAudio = new Audio('./assets/audio/preview.mp3');
        this.onAudioReady()
    }

    addActions(clips, body) {

        clips.forEach(clip => {
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
                        target: body.getObjectByName(name) ? body.getObjectByName(name)[target] : null,
                        headTarget: this.root.getObjectByName(name) ? this.root.getObjectByName(name)[target] : null,
                        name: name,
                    }
                    action.trackes.push(_a)
                }
            })
            this.actions.push(action)
        })
        console.log('clips', clips, this.actions)
    }

    addIdleAction(clip, root) {
        this.idleAction = {
            time: 0,
            duration: clip.duration,
            trackes: []
        }

        clip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if (name && target) {

                const _a = {
                    interpolant: track.createInterpolant(),
                    target: root.getObjectByName(name)[target],
                    headTarget: this.headBaseBones.includes(name) ? this.root.getObjectByName(name)[target] : null,
                    name: name,
                    default: {
                        quaternion: root.getObjectByName(name).quaternion,
                        position: root.getObjectByName(name).position
                    }
                }
                this.idleAction.trackes.push(_a)
            }
        })
    }


    addExpressionAction(clip) {
        THREE.AnimationUtils.makeClipAdditive(clip);
        this.expressionAction = {
            time: 0,
            duration: clip.duration,
            trackes: []
        }

        clip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if (name && target) {
                // console.log(name, target)

                if (target === "position" || target === "quaternion") {
                    if (name === 'FACIAL_C_LowerLipRotation' && target === "quaternion") {
                        console.log(name, target, track)
                        track.values = [
                            ...this.FACIAL_C_LowerLipRotationQuaternion.toArray(),
                            ...this.FACIAL_C_LowerLipRotationQuaternion.toArray()]
                    }

                    const _a = {
                        interpolant: track.createInterpolant(),
                        target: this.root.getObjectByName(name)[target],
                        name: name,
                        default: {
                            quaternion: this.root.getObjectByName(name).quaternion,
                            position: this.root.getObjectByName(name).position
                        }
                    }
                    this.expressionAction.trackes.push(_a)
                }
            }

        })
    }
    addBlinkingAction(clip) {
        THREE.AnimationUtils.makeClipAdditive(clip);
        this.blinkingAction = {
            time: 0,
            duration: clip.duration,
            trackes: []
        }

        clip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')
            if (name && target) {
                // console.log(name, target)
                if (target === "position" || target === "quaternion") {
                    const _a = {
                        interpolant: track.createInterpolant(),
                        target: this.root.getObjectByName(name)[target],
                        name: name,
                        default: {
                            quaternion: this.root.getObjectByName(name).quaternion,
                            position: this.root.getObjectByName(name).position
                        }
                    }
                    this.blinkingAction.trackes.push(_a)
                }
            }
        })
    }
    addVisemeAction(clip, body) {
        // THREE.AnimationUtils.makeClipAdditive(clip);
        this.visemeAction = {
            time: 0,
            duration: clip.duration,
            trackes: []

        }

        clip.tracks.forEach(track => {
            const [name, target] = track.name.split('.')

            // console.log(body)

            if (name && target && !body.getObjectByName(name)) {
                // console.log(name, target)
                if (target === "position" || target === "quaternion") {
                    const _a = {
                        interpolant: track.createInterpolant(),
                        target: this.root.getObjectByName(name)[target],
                        name: name,
                        default: {
                            quaternion: this.root.getObjectByName(name).quaternion,
                            position: this.root.getObjectByName(name).position
                        }
                    }
                    this.visemeAction.trackes.push(_a)

                }
            }



        })

    }
    updateExpression(value) {
        this.expression = value
        // this.learpExpression = 0

    }
    updateViseme(value) {
        this.viseme = value
        this.learpViseme = 0
        // console.log('updateViseme', value)
        // this.visemeAction.time = 0
    }


    startIndexAction(index) {

        this.playAction = index
        this.actionLearp = 0
        this.viseme = 0

        this.playAudio()
    }

    playAudio() {
        if (!this.laughAudio) return
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
        this.laughAudio.play();
    }

    stopAction() {
        this.playAction = undefined
        this.actionLearp = 0
        this.learpTransition = 0
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
        this.actions.forEach(action => {
            action.time = 0
        })
        this.onActionEnd()
    }

    update(time) {
        const noise = Math.sin(performance.now() / 100) * 0.02
        // console.log (noise)
        if (!time || !this.visemeAction) return

        if (this.isExpression) {
            this.learpExpression += 0.003
            if (this.learpExpression > 0.22) {
                this.learpExpression = 0.22
                this.lastExpression = this.expression
            }
        } else {
            this.learpExpression -= 0.003
            if (this.learpExpression < 0.12) {
                this.learpExpression = 0.12

            }
        }

        if (this.actionLearp < 1) {
            this.actionLearp += 0.001

        } else {
            this.actionLearp = 1
        }

        if (this.playAction != undefined && this.actions.length) {
            const clipAction = this.actions[this.playAction]

            if (clipAction) {

                clipAction.time += (time * this.timeScale)
                clipAction.trackes.forEach((track, i) => {
                    const values = track.interpolant.evaluate(clipAction.time)
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

                if (clipAction.time > clipAction.duration) {
                    clipAction.time = 0
                    this.playAction = undefined
                    this.actionLearp = 0
                    this.stopAction()
                }

            }


        } else {

            if (this.idleAction) {
                this.idleAction.time += (time * this.timeScale)
                this.idleAction.trackes.forEach((track, i) => {
                    const values = track.interpolant.evaluate(this.idleAction.time)
                    // track.target.set(...values)
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
                // const learpAmout = 0.1
                const learpAmout = this.isTalking ? 0.05 : this.learpExpression

                this.expressionAction.trackes.forEach((track, i) => {
                    const baseValues = track.interpolant.evaluate(8 / 24)

                    if (baseValues.length === 4) {
                        const target = new THREE.Quaternion().slerp(new Quaternion(...baseValues), learpAmout + noise * 0.5) // amount
                        track.target.multiply(target)
                    } else {
                        track.target.add(new Vector3(...baseValues).multiplyScalar(learpAmout + noise * 0.5))
                    }
                })
            }

            if (this.isBlinking) {

                if (this.blinkingAction) {
                    this.blinkingAction.trackes.forEach((track, i) => {
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

            }
        }
    }
}


export { CustomMixer };