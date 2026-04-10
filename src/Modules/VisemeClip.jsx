import { LinearInterpolant, DiscreteInterpolant, Vector3, Euler, Object3D, MathUtils } from "three";


class VisemeClip {
    constructor() {

        this.interpolant = null
        this.times = []
        this.values = []
    }

    push(keyframe) {
        this.times.push(keyframe.time)
        this.values.push(keyframe.value)

        const times = new Float32Array(this.times);
        const values = new Float32Array(this.values);

        this.interpolant = new DiscreteInterpolant(times, values, 1);

    }
    reset() {

    }
    evaluate(time) {
        return this.interpolant.evaluate(time)[0]
    }

}

export default VisemeClip