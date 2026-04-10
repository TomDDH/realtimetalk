

class AvatarToiFrameEvents {
    constructor() {
        this.init()
        this.hostOrigin = "*"
        this.sessionID = ''
    }

    init() {
        // Initialization logic here
    }

    sendToHost(message) {
        window.parent.postMessage({
            ...message,
            timestampUtc: new Date().toISOString(),
            sessionId: this.sessionID,
        }, "*");
    }

}

export default AvatarToiFrameEvents;