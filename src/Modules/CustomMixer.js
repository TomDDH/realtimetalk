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

        this.talkAction = null
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
        this.learpExpression = 0
        this.expressionAction = null
        this.lastExpression = 0
        this.expression = 0
        this.isExpression = false

        this.leftEye = root.getObjectByName("FACIAL_L_Eye")
        this.rightEye = root.getObjectByName("FACIAL_R_Eye")
        this.eyeLook = null
        this.eyeLookQuaternion = new Quaternion()
        // console.log(this.mask)
    }



    addTalkAction(clip, root) {
        this.talkAction = {
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
                this.talkAction.trackes.push(_a)
            }
        })


    }

    activeTalking(state) {
        // this.isTalking = state;
        this.learpTransition = 0.1


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
    addVisemeAction(clip) {

        const action = {
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
                    action.trackes.push(_a)

                }
            }



        })

        this.visemeAction = action;

    }
    updateExpression(value) {
        this.expression = value
        // this.learpExpression = 0

    }
    updateViseme(value) {
        this.viseme = value
        this.learpViseme = 0
        // this.visemeAction.time = 0
    }
    update(time) {
        const noise = Math.sin(performance.now() / 100) * 0.02
        // console.log (noise)
        if (!time || !this.visemeAction) return


        if (this.isExpression) {
            this.learpExpression += 0.003
            if (this.learpExpression > 0.25) {
                this.learpExpression = 0.25
                this.lastExpression = this.expression
            }
        } else {
            this.learpExpression -= 0.003
            if (this.learpExpression < 0.1) {
                this.learpExpression = 0.1

            }
        }


        // if (this.isExpression) {
        //     this.learpExpression += 0.005
        //     if (this.learpExpression > 0.15) {
        //         this.learpExpression = 0.15
        //         this.lastExpression = this.expression
        //     }
        // } else {
        //     this.learpExpression -= 0.005
        //     if (this.learpExpression < 0) {
        //         this.learpExpression = 0

        //     }
        // }


        this.visemeAction.trackes.forEach((track, i) => {
            const values = track.interpolant.evaluate(this.viseme)

            if (values.length === 4) {
                track.target.slerp(new Quaternion(...values), 0.25)
            } else {
                track.target.lerp(new Vector3(...values), 0.25)
            }
        })


        if (this.expressionAction) {
            // const learpAmout = 0.1
            const learpAmout = this.isTalking ? 0.05 : this.learpExpression

            this.expressionAction.trackes.forEach((track, i) => {
                const baseValues = track.interpolant.evaluate(8 / 24)
                // const learpAmout = this.isExpression ? 0.25 : 0.1
                if (baseValues.length === 4) {
                    const target = new THREE.Quaternion().slerp(new Quaternion(...baseValues), learpAmout + noise * 0.5) // amount
                    track.target.multiply(target)
                } else {
                    track.target.add(new Vector3(...baseValues).multiplyScalar(learpAmout + noise * 0.5))
                }
            })
        }


        if (this.learpTransition < 1) {

            this.learpTransition += 0.05
            if (this.talkAction) {
                this.talkAction.time += (time * this.timeScale)
                this.talkAction.trackes.forEach((track, i) => {
                    const values = track.interpolant.evaluate(this.talkAction.time)
                    track.target.set(...values)
                    if (track.headTarget) {
                        track.headTarget.set(...values)
                    }
                })
                if (this.talkAction.time > this.talkAction.duration) {
                    this.talkAction.time = 0
                }
            }

        } else {
            this.learpTransition = 1
        }

        if (this.idleAction) {
            this.idleAction.time += (time * this.timeScale)
            this.idleAction.trackes.forEach((track, i) => {
                const values = track.interpolant.evaluate(this.idleAction.time)
                // track.target.set(...values)
                if (values.length === 4) {
                    track.target.slerp(new Quaternion(...values), this.learpTransition)
                } else {
                    track.target.lerp(new Vector3(...values), this.learpTransition)
                }

                if (track.headTarget) {
                    if (values.length === 4) {
                        track.headTarget.slerp(new Quaternion(...values), this.learpTransition)
                    } else {
                        track.headTarget.lerp(new Vector3(...values), this.learpTransition)
                    }
                }
            })

            if (this.idleAction.time > this.idleAction.duration) {
                this.idleAction.time = 0
            }
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

        } else {

        }

        this.neck.rotation.x = 0

        if (this.eyeLook && !this.isTalking) {
            this.leftEye.quaternion.slerp(this.eyeLook, 0.03)
            this.rightEye.quaternion.slerp(this.eyeLook, 0.03)
        } else {
            this.leftEye.quaternion.slerp(this.eyeLookQuaternion, 0.03)
            this.rightEye.quaternion.slerp(this.eyeLookQuaternion, 0.03)
        }


    }
}


export { CustomMixer };