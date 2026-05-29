

class AvatarToiFrameEvents {
    constructor() {
        this.init()
        this.sessionID = ''
        this.expectedParentOrigin = null
        this.mediaStatus = 'idle'
        this.mediaErrorMessage = "";
        this.audioActive = false
        this.init()
    }

    init() {

        this.expectedParentOrigin = this.getBootstrapParentOrigin();
    }

    getBootstrapParentOrigin() {
        try {
            const url = new URL(window.location.href);
            const parentOrigin = url.searchParams.get("parentOrigin");
            return this.isValidOrigin(parentOrigin) ? parentOrigin : null;
        } catch {
            return null;
        }
    }

    isValidOrigin(origin) {
        if (!origin) {
            return false;
        }

        try {
            const parsed = new URL(origin);
            return Boolean(parsed.origin) && parsed.origin !== "null";
        } catch {
            return false;
        }
    }

    sendToHost(message) {

        if (!this.expectedParentOrigin) {
            console.log('Sending message to host without expectedParentOrigin set:', message);
            return;
        }

        window.parent.postMessage({
            ...message,
            timestampUtc: new Date().toISOString(),
            sessionId: this.sessionID,
        }, this.expectedParentOrigin);
    }

    postDiagnostics(update) {
        this.sendToHost({
            type: "diagnostics",
            mediaStatus: this.mediaStatus,
            mediaError: this.mediaErrorMessage || undefined,
            audioActive: this.audioActive,
            ...update
        });
    }

    addLog(message, logType = "") {
        this.sendToHost({
            type: "log",
            message,
            logType,
            timestampUtc: new Date().toLocaleTimeString(),
        });
    }

}

export default AvatarToiFrameEvents;