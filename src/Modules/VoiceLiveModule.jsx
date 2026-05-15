
import { VoiceLiveClient } from "@azure/ai-voicelive";
import { AzureKeyCredential } from "@azure/core-auth";
import AvatarToiFrameEvents from "./AvatariFrameEvents";
import VisemeClip from "./VisemeClip";
import jokeIntentPhrases from "./jokeIntentPhrases";

class VoiceLiveModule {
    constructor() {
        this.audioContext = null
        this.audioQueue = []

        this.isPlayingAudio = false
        this.nextAudioStartTime = 0
        this.nextVisemeStartTimeMs = 0
        this.currentAudioSources = []
        this.ws = null

        this.targetSampleRate = 24000
        this.targetChannels = 1

        this.playAudioContext = null

        this.updateViseme = () => { }
        this.onSessionReady = () => { }
        this.onConnected = () => { }
        this.onTalking = () => { }
        this.onFinishedTalking = () => { }
        this.onMediaCaptureStarted = () => { }
        this.onStopActions = () => { }
        this.startAction = () => { }


        this.collectedVisemeEvents = []
        this.avatariFrame = new AvatarToiFrameEvents();

        this.greetingSent = false;

        this.bargeIn = false;


        this.sessionTimeout = null;
        this.visemeClip = new VisemeClip()

        this.chunkStartTime = 0

        this.isSpeaking = false

        this.playAudioContext = new AudioContext();

        this.needAction = false
        this.jokeString = ''
    }


    handleVisemDelta(event) {
        // console.log("handle audio delta event:", event);
        const animation = event;
        const audioOffsetInMs = animation.audioOffsetInMs
        this.collectedVisemeEvents.push({ uuid: crypto.randomUUID(), timeout: null, visemeId: animation.visemeId, audioOffsetInMs });
        this.visemeClip.push({ time: audioOffsetInMs, value: animation.visemeId })

    }

    async handleAudioDelta(event) {
        // console.log("handle audio delta event:", event);
        const audioBase64 = event.delta;
        const samples = this.base64Pcm16ToFloat32(audioBase64);
        await this.playAudioChunk(samples);

    }
    base64Pcm16ToFloat32(base64) {
        const buffer = this.decodeBase64ToArrayBuffer(base64);
        if (!buffer) {
            return null;
        }

        const view = new DataView(buffer);
        const samples = new Float32Array(buffer.byteLength / 2);

        for (let index = 0; index < samples.length; index += 1) {
            samples[index] = view.getInt16(index * 2, true) / 0x8000;
        }

        return samples;
    }

    decodeBase64ToArrayBuffer(value) {
        if (typeof value !== "string" || !value) {
            return null;
        }

        try {
            const binary = atob(value);
            const bytes = new Uint8Array(binary.length);

            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }

            return bytes.buffer;
        } catch {
            return null;
        }
    }

    async connect(payload) {
        console.log('Connecting to Voice Live service with payload:', payload);

        if (!payload.webSocketTarget) {
            console.error("Connect message missing wsUrl.");
            this.avatariFrame.sendToHost({
                type: "error",
                message: "Connect message missing wsUrl."
            })
            this.avatariFrame.addLog("Connect message missing wsUrl.", "error");
            return;
        }


        if (this.ws) {
            this.avatariFrame.addLog("Existing WebSocket connection found. Closing it before establishing a new one.", "system");
            this.ws.close();
            this.end("New session started");

        }

        this.avatariFrame.addLog(`Connecting to ${payload.webSocketTarget}...`, "system");


        try {
            this.ws = new WebSocket(payload.webSocketTarget);

        } catch (error) {
            const message = error ? error.message : String(error);
            console.error('WebSocket connection failed:', message);
            this.avatariFrame.addLog(`Failed to connect: ${message}`, "error");
            this.avatariFrame.sendToHost({
                type: "error",
                message: message
            })

            return;
        }

        this.ws.addEventListener("open", () => {
            this.avatariFrame.addLog("Connected.", "system");
            this.avatariFrame.sendToHost({
                type: "connected",
                message: "Avatar Connected to websocket successfully"
            })

            console.log('WebSocket connection established successfully', this.ws);
            this.start()

        });

        this.ws.addEventListener("error", () => {
            this.avatariFrame.sendToHost({
                type: "error",
                message: "WebSocket error occurred."
            })
            this.avatariFrame.addLog("WebSocket error occurred.", "error");
        });

        this.ws.addEventListener("close", (event) => {
            this.avatariFrame.sendToHost({
                type: "disconnected",
                code: event.code,
                reason: event.reason
            })
            this.avatariFrame.addLog(`Disconnected (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ""}).`, "system");
            this.ws = null
        });

        this.ws.addEventListener("message", (event) => {
            try {
                const msg = JSON.parse(event.data);
                // console.log("Received message from WebSocket:", msg.eventType);
                this.avatariFrame.postDiagnostics({ lastServerEventType: msg?.eventType ? `${msg.type}:${msg.eventType}` : String(msg?.type ?? "unknown") });

                if (msg?.type === "azureEvent") {
                    switch (msg?.eventType) {
                        case 'response.animation_viseme.delta':
                            this.handleVisemDelta(msg);
                            break;
                        case 'response.audio.delta':
                            this.handleAudioDelta(msg.event);
                            break;
                        case 'response.created':
                            this.collectedVisemeEvents = [];
                            this.visemeClip.reset()
                            this.bargeIn = false;

                            if (this.needAction) {
                                this.startAction()
                            }

                            break;
                        case 'onConversationItemInputAudioTranscriptionCompleted':
                            this.jokeString = this.jokeString + " " + msg.transcript

                            this.checkActionToPlay()
                            break;
                        case 'conversation.item.truncated':
                            this.audioQueue = [];
                            this.collectedVisemeEvents.forEach(ev => {
                                if (ev?.timeout) {
                                    clearTimeout(ev?.timeout);
                                }
                            })
                            this.updateViseme(0);
                            this.collectedVisemeEvents = [];
                            this.bargeIn = true;
                            this.assistantSpeakingMessage = ''

                            const itemId = typeof msg.itemId === "string" ? msg.itemId : "";
                            const audioEndMs = Number.isFinite(msg.audioEndMs) ? msg.audioEndMs : null;
                            const suffix = itemId ? ` Item: ${itemId}${audioEndMs === null ? "" : `, audioEndMs: ${audioEndMs}`}.` : "";

                            this.avatariFrame.addLog(`Azure truncated the avatar response.${suffix}`, "system");

                            break;
                        default:
                            break;
                    }

                }
                const normalizedEvent = this.findFirstObjectByKeyDeep(msg);

                if (normalizedEvent) {
                    console.log("Received non-azureEvent message from WebSocket:", msg);
                    switch (normalizedEvent.type) {
                        case 'responseStarted':
                            console.log("Response started:", normalizedEvent);
                            this.avatariFrame.addLog("Server event: response started.", "system");
                            break;
                        case 'transcript':
                            if (data.event.speaker === "assistant") {
                                this.avatariFrame.addLog(`AI output: ${data.event.text}`, "system");
                            } else {
                                this.avatariFrame.addLog(`You said: ${data.event.text}`, "system");

                            }
                            console.log("Transcript received:", normalizedEvent);
                            break;
                        case 'responseCompleted':
                            console.log("Response completed:", normalizedEvent);
                            this.avatariFrame.addLog("Server event: response completed.", "system");
                            break;
                        case 'error':
                            console.log("Error received:", normalizedEvent);
                            this.avatariFrame.sendToHost({
                                type: "error",
                                event: normalizedEvent?.message
                            })
                            this.avatariFrame.addLog(`Server error: ${normalizedEvent.message}`, "error");
                            break;
                        default:
                            break;
                    }

                }

                switch (msg.type) {
                    case "ready":
                        console.log("Session is ready:", msg);
                        this.avatariFrame.addLog("Server: ready.", "system");
                        break;
                    case "azureEvent":
                        break;
                    case "sessionEnded":
                        this.avatariFrame.addLog("Server: session ended.", "system");
                        console.log("Session ended:", msg);
                        this.end()
                        break;
                    case "userTranscript":
                        console.log("Received message from WebSocket:", msg);

                        this.jokeString = this.jokeString + " " + msg.text
                        this.checkActionToPlay()
                        break;
                    default:
                        this.avatariFrame.addLog(`Server: ${msg.type ?? "unknown event"}`, "system");
                        console.log("Received message from WebSocket:", msg);
                }

                this.avatariFrame.sendToHost({
                    type: "event",
                    event: normalizedEvent
                })
            } catch {
                this.avatariFrame.addLog("Server sent a non-JSON message.", "system");
                console.log("Server sent a non-JSON message.", "system");
            }
        });

    }

    sendGreeting() {
        console.log("send greeting message")
        this.ws.send(JSON.stringify({ type: "sendText", text: "hello, Who are you?" }));
        this.avatariFrame.addLog(`You: sendText (hello, Who are you?)`, "system");

    }
    onActionEnd() {
        this.needAction = false
        this.startAudioPlayback()
    }

    checkActionToPlay() {
        console.log("checkActionToPlay", this.jokeString)
        const normalized = this.jokeString
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        const jokePhrases = jokeIntentPhrases.map(p =>
            p
                .toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
        )

        console.log("check joke intent detected, will play action after response", jokePhrases.some(phrase => normalized.includes(phrase)))
        if (jokePhrases.some(phrase => normalized.includes(phrase))) {
            this.needAction = true;

        }
    }

    async playAudioChunk(audioData) {
        if (!this.playAudioContext) {
            console.warn('AudioContext not available for audio playback');
            return;
        }
        try {
            const sampleRate = 24000; // VoiceLive default output sample rate
            const numberOfChannels = 1; // Mono audio
            const byteLength = audioData.byteLength;
            const numberOfSamples = byteLength / 4; // 16-bit = 2 bytes per sample

            if (numberOfSamples === 0) {
                console.warn('Empty audio chunk received');
                return;
            }

            // // Create AudioBuffer for the PCM data
            const audioBuffer = this.playAudioContext.createBuffer(
                numberOfChannels,
                numberOfSamples,
                sampleRate
            );

            audioBuffer.copyToChannel(audioData, 0);
            // Add to audio queue instead of playing immediately
            this.audioQueue.push(audioBuffer);

            if (!this.isPlayingAudio && !this.needAction) {
                this.startAudioPlayback();
            }

        } catch (error) {
            console.error('Failed to process audio chunk:', error);
        }
    }

    startAudioPlayback() {
        if (!this.playAudioContext || this.isPlayingAudio || this.audioQueue.length === 0) {
            return;
        }


        this.isPlayingAudio = true;

        this.onTalking()

        this.jokeString = ' '
        this.nextVisemeStartTimeMs = 0

        console.log("start play audio", performance.now())

        this.nextAudioStartTime = this.playAudioContext.currentTime;
        this.chunkStartTime = this.playAudioContext.currentTime;

        console.log('🔊 Starting sequential audio playback');
        this.playNextAudioChunk();
    }

    playNextAudioChunk() {
        if (!this.playAudioContext || this.audioQueue.length === 0) {
            this.isPlayingAudio = false;
            this.playNextViseme([{
                visemeId: 0,
                audioOffsetInMs: 100
            }], 1)
            this.onFinishedTalking()

            this.chunkStartTime = 0

            if (!this.bargeIn) {
                this.avatariFrame.sendToHost({
                    type: "assistantTurnCompleted",
                    timestampUtc: new Date().toISOString()
                })
            }
            console.log('🔊 Audio playback completed');

            return;
        }

        const audioBuffer = this.audioQueue.shift();
        const source = this.playAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.playAudioContext.destination);

        // Track this source for potential barge-in interruption
        this.currentAudioSources.push(source);

        // Schedule this chunk to start exactly when the previous one ends
        source.start(this.nextAudioStartTime); // with offset for precise timing

        // Calculate when this chunk will end
        const chunkDuration = audioBuffer.length / audioBuffer.sampleRate;
        const chunkDurationMs = chunkDuration * 1000;
        const nextcurrent = performance.now()

        const visemeBegining = this.nextVisemeStartTimeMs
        const visemeEnding = this.nextVisemeStartTimeMs + chunkDurationMs

        const nextVisemes = this.collectedVisemeEvents.filter(vism => vism.audioOffsetInMs >= visemeBegining && vism.audioOffsetInMs < visemeEnding)

        this.playNextViseme(nextVisemes, visemeBegining)

        this.nextVisemeStartTimeMs += chunkDurationMs
        this.nextAudioStartTime += chunkDuration;
        // Schedule the next chunk to play when this one ends
        source.onended = () => {
            // Remove this source from tracking
            const index = this.currentAudioSources.indexOf(source);
            if (index > -1) {
                this.currentAudioSources.splice(index, 1);
            }
            this.playNextAudioChunk();
        };

    }

    playNextViseme(visemes, offsetMs) {
        visemes.forEach(vs => {
            const event = this.collectedVisemeEvents.find(ev => ev.uuid === vs.uuid);
            if (event) {
                const deplay = vs.audioOffsetInMs - offsetMs
                event.timeout = setTimeout(() => {
                    this.updateViseme(vs.visemeId);
                }, deplay - 50);
            }
        })
    }

    update() {

        if (!this.isPlayingAudio) {
            this.updateViseme(0);
        }

    }

    async start() {

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: this.targetChannels,
                    sampleRate: this.targetSampleRate,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            this.audioContext = new AudioContext({ sampleRate: this.targetSampleRate });


            this.avatariFrame.postDiagnostics({ mediaStatus: "ready", mediaError: undefined });
            this.avatariFrame.addLog(`Media ready. Capture ${this.audioContext.sampleRate}Hz -> send ${16000}Hz PCM16 mono.`, "system");

            // Create audio context

            // Create nodes
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;

            // Create script processor for audio data
            this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(this.analyserNode);
            this.analyserNode.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);



            this.scriptProcessor.onaudioprocess = (event) => {
                // console.log("processing")
                const audio = this.float32ToPcm16Base64(
                    event.inputBuffer.getChannelData(0),
                    event.inputBuffer.sampleRate,
                    16000
                );
                this.ws.send(JSON.stringify({ type: "sendAudioChunk", audio }));
            };

            if (!this.greetingSent) {
                this.greetingSent = true
                this.sendGreeting()
            }

            this.avatariFrame.mediaStatus = 'ready'
            this.avatariFrame.mediaErrorMessage = ''
            this.avatariFrame.audioActive = true

            this.avatariFrame.postDiagnostics({ mediaStatus: 'ready', audioActive: true });
            this.avatariFrame.addLog("Microphone streaming started.", "system");

        } catch (error) {
            this.avatariFrame.mediaStatus = 'error'
            this.avatariFrame.mediaErrorMessage = error instanceof Error ? error.message : String(error);

            this.avatariFrame.postDiagnostics({ mediaStatus: "error", mediaError: this.avatariFrame.mediaErrorMessage, audioActive: false });
            this.avatariFrame.addLog(`Media error: ${this.avatariFrame.mediaErrorMessage}`, "error");
        }

    }

    float32ToPcm16Base64(input, sourceSampleRate, targetSampleRate = 16000) {
        const monoSamples = this.downsampleFloat32Buffer(input, sourceSampleRate, targetSampleRate);
        const buffer = new ArrayBuffer(monoSamples.length * 2);
        const view = new DataView(buffer);

        for (let index = 0; index < monoSamples.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, monoSamples[index]));
            view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        }

        return this.encodeArrayBufferToBase64(buffer);
    }
    encodeArrayBufferToBase64(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";

        for (let index = 0; index < bytes.length; index += 4096) {
            const chunk = bytes.subarray(index, index + 4096);
            binary += String.fromCharCode(...chunk);
        }

        return btoa(binary);
    }

    downsampleFloat32Buffer(input, sourceSampleRate, targetSampleRate) {
        if (!(input instanceof Float32Array) || input.length === 0) {
            return new Float32Array();
        }

        if (!Number.isFinite(sourceSampleRate) || !Number.isFinite(targetSampleRate)) {
            return input;
        }

        if (targetSampleRate <= 0 || sourceSampleRate <= 0 || targetSampleRate >= sourceSampleRate) {
            return input;
        }

        const sampleRateRatio = sourceSampleRate / targetSampleRate;
        const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio));
        const output = new Float32Array(outputLength);

        let outputIndex = 0;
        let inputIndex = 0;

        while (outputIndex < outputLength) {
            const nextInputIndex = Math.min(input.length, Math.round((outputIndex + 1) * sampleRateRatio));
            let accumulator = 0;
            let sampleCount = 0;

            while (inputIndex < nextInputIndex) {
                accumulator += input[inputIndex];
                sampleCount += 1;
                inputIndex += 1;
            }

            output[outputIndex] = sampleCount > 0 ? accumulator / sampleCount : input[Math.min(inputIndex, input.length - 1)];
            outputIndex += 1;
        }

        return output;
    }


    end(reason = "Session Expired") {

        this.clearAudioQueue();

        if (this.playAudioContext) {
            this.playAudioContext.close();
            this.playAudioContext = undefined;
        }
        this.scriptProcessor.disconnect();
        this.analyserNode.disconnect();
        this.audioContext.close();
        this.mediaStream.getTracks().forEach(track => track.stop());

        this.avatariFrame.sendToHost({
            type: "sessionEnded",
            reason: reason
        })

        this.playNextViseme([{
            visemeId: 0,
            audioOffsetInMs: 100
        }], 1)
        this.avatariFrame.audioActive = false

        this.avatariFrame.postDiagnostics({ audioActive: false })
        this.onFinishedTalking()
    }
    clearAudioQueue() {
        this.currentAudioSources.forEach(source => {
            try {
                source.stop();
            } catch (error) {
                // Source might already be stopped, ignore the error
            }
        });
        this.currentAudioSources = [];
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.nextAudioStartTime = this.audioContext.currentTime;
    }

    normalizeServerEvent(message) {
        if (!message || typeof message !== "object") {
            return null;
        }

        if (message.type === "userTranscript") {
            const text = typeof message.text === "string" ? message.text.trim() : "";
            return text ? { type: "transcript", speaker: "user", text } : null;
        }

        if (message.type === "error") {
            return {
                type: "error",
                message: typeof message.message === "string" ? message.message : "Unknown server error"
            };
        }

        if (message.type !== "azureEvent") {
            return null;
        }

        if (message.eventType === "error") {
            return {
                type: "error",
                message: extractTextValue(message, ["message", "error", "detail"]) ?? "Unknown Azure event error"
            };
        }

        switch (message.eventType) {
            case "response.created":
            case "response.started":
                return { type: "responseStarted" };
            case "response.audio_transcript.done": {
                const text =
                    this.getEventPayloadValue(message, "transcript") ??
                    this.getEventPayloadValue(message, "text") ??
                    this.extractTextValue(message, ["transcript", "text"]);
                return typeof text === "string" && text ? { type: "transcript", speaker: "assistant", text } : null;
            }
            case "conversation.item.input_audio_transcription.completed":
            case "input_audio_transcription.completed": {
                const text =
                    this.getEventPayloadValue(message, "transcript") ??
                    this.getEventPayloadValue(message, "text") ??
                    this.extractTextValue(message, ["transcript", "text"]);
                return typeof text === "string" && text ? { type: "transcript", speaker: "user", text } : null;
            }
            case "conversation.item.created": {
                const text = this.extractUserTranscriptFromConversationItem(message);
                return typeof text === "string" && text ? { type: "transcript", speaker: "user", text } : null;
            }
            case "input_audio_buffer.speech_stopped":
            case "input_audio_buffer.committed": {
                const text =
                    this.getEventPayloadValue(message, "transcript") ??
                    this.getEventPayloadValue(message, "text") ??
                    this.extractTextValue(message, ["transcript", "text"]);
                return typeof text === "string" && text ? { type: "transcript", speaker: "user", text } : null;
            }
            case "response.done":
            case "response.completed":
                return { type: "responseCompleted" };
            default:
                return null;
        }
    }
    getEventPayloadValue(message, key) {
        if (!message || typeof message !== "object") {
            return undefined;
        }

        if (message.payload && typeof message.payload === "object" && key in message.payload) {
            return message.payload[key];
        }

        return message[key];
    }
    extractTextValue(message, preferredKeys) {
        for (const candidate of this.getCandidateContainers(message)) {
            const value = this.findFirstStringByKeys(candidate, preferredKeys);
            if (value) {
                return value;
            }
        }

        return null;
    }
    getCandidateContainers(message) {
        if (!message || typeof message !== "object") {
            return [];
        }
    }

    extractUserTranscriptFromConversationItem(message) {
        const item = this.getEventPayloadValue(message, "item") ?? this.findFirstObjectByKeyDeep(message, "item");
        if (!item || typeof item !== "object") {
            return null;
        }

        const role = typeof item.role === "string" ? item.role : "";
        if (role.toLowerCase() !== "user") {
            return null;
        }

        if (!Array.isArray(item.content)) {
            return null;
        }

        for (const part of item.content) {
            if (!part || typeof part !== "object") {
                continue;
            }

            const partType = typeof part.type === "string" ? part.type : "";
            if (
                partType === "input_text" ||
                partType === "text" ||
                partType === "input_audio" ||
                partType === "audio" ||
                partType === "input_audio_transcription"
            ) {
                const text =
                    (typeof part.text === "string" && part.text) ||
                    (typeof part.transcript === "string" && part.transcript) ||
                    this.findFirstPreferredStringDeep(part, ["transcript", "text"]) ||
                    null;

                if (text) {
                    return text;
                }
            }
        }

        return null;
    }

    findFirstObjectByKeyDeep(value, key, visited = new WeakSet()) {
        if (!value || typeof value !== "object") {
            return null;
        }

        if (visited.has(value)) {
            return null;
        }

        visited.add(value);

        if (!Array.isArray(value) && key in value && value[key] && typeof value[key] === "object") {
            return value[key];
        }

        if (Array.isArray(value)) {
            for (const entry of value) {
                const result = this.findFirstObjectByKeyDeep(entry, key, visited);
                if (result) {
                    return result;
                }
            }
            return null;
        }

        for (const child of Object.values(value)) {
            const result = this.findFirstObjectByKeyDeep(child, key, visited);
            if (result) {
                return result;
            }
        }

        return null;
    }

    findFirstStringByKeys(value, preferredKeys, visited = new WeakSet()) {
        if (typeof value === "string" && value) {
            return value;
        }

        if (!value || typeof value !== "object") {
            return null;
        }

        if (visited.has(value)) {
            return null;
        }

        visited.add(value);

        for (const key of preferredKeys) {
            if (key in value) {
                const result = this.findFirstStringByKeys(value[key], preferredKeys, visited);
                if (result) {
                    return result;
                }
            }
        }

        return null;
    }
}

export default VoiceLiveModule;