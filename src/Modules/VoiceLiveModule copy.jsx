
import { VoiceLiveClient } from "@azure/ai-voicelive";
import { AzureKeyCredential } from "@azure/core-auth";
import AvatarToiFrameEvents from "./AvatariFrameEvents";
import VisemeClip from "./VisemeClip";

class VoiceLiveModule {
    constructor() {

        this.config = null;
        this.client = null;
        this.session = null;
        this.subscription = null;
        this.audioCapture = null
        this.callbacks = null
        this.isConnected = false
        this.isConversationActive = false
        this.audioContext = null
        this.audioQueue = []
        this.isPlayingAudio = false
        this.nextAudioStartTime = 0
        this.nextVisemeStartTimeMs = 0
        this.currentAudioSources = []

        this.targetSampleRate = 24000
        this.targetChannels = 1

        this.playAudioContext = null

        this.updateViseme = () => { }
        this.onSessionReady = () => { }
        this.onConnected = () => { }
        this.onTalking = () => { }
        this.onFinishedTalking = () => { }
        this.onMediaCaptureStarted = () => { }
        this.collectedVisemeEvents = []
        this.avatariFrame = new AvatarToiFrameEvents();

        this.greetingSent = false;
        this.sessionID = ''

        this.bargeIn = false;

        this.assistantSpeakingMessage = ''

        this.sessionTimeout = null;
        this.visemeClip = new VisemeClip()

        this.chunkStartTime = 0

        this.isSpeaking = false
    }

    buildConfig(payload) {
        if (!payload || !payload.systemPrompt || !payload.model || !payload.endpoint || !payload.apiKey || !payload.voice) {
            console.error('Invalid configuration payload:', payload);
            return null;
        }

        const config = {
            model: payload.model,
            endpoint: payload.endpoint,
            apiKey: payload.apiKey,
            voice: payload.voice,
            welcomeMessage: payload.welcomeMessage,
            instructions: payload.systemPrompt,
            debugMode: payload.debugMode,
            sessionDuration: payload.sessionDuration || 10, // default to 30 minutes
            useTokenCredential: payload.useTokenCredential
        };
        this.config = config;

        console.log('Built configuration for Voice Live Module:', config);

        return config;
    }

    async connect(payload) {
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
            this.sessionTimeout = null;
        }
        this.greetingSent = false
        this.assistantSpeakingMessage = ''
        console.log('Connecting to Voice Live service...', { payload });

        const {
            sessionId
        } = payload || {}

        const config = this.buildConfig(payload)

        if (!config) {
            this.avatariFrame.sendToHost({
                type: "Error",
                text: "Invalid configuration for Voice Live Module"
            })
            return Promise.reject(new Error('Invalid configuration payload'));
        }

        const tools = [
            {
                type: "function",
                name: "get_who_are_you",
                description: "Answer \"Who are you?\" question, If user asks.",
            },
        ];


        this.sessionID = sessionId
        this.avatariFrame.sessionID = sessionId

        const credential = new AzureKeyCredential(config.apiKey);
        const sessionOptions = {
            connectionTimeoutInMs: 30000,
            enableDebugLogging: true // Enable by default

        };
        this.client = new VoiceLiveClient(config.endpoint, credential, {
            apiVersion: '2025-10-01',
            defaultSessionOptions: sessionOptions
        });

        this.session = await this.client.startSession(config.model, sessionOptions);
        this.subscription = this.session.subscribe(this.createEventHandlers());


        const voice = {
            type: 'azure-standard',
            name: config.voice
        }

        await this.session.updateSession({
            modalities: ['audio', 'text'],
            instructions: config.instructions,
            voice: voice, // Now using proper voice object
            inputAudioFormat: 'pcm16',
            outputAudioFormat: 'pcm16',
            animation: {
                outputs: ["viseme_id"]
            },
            tools: tools,
            toolChoice: "auto",
            turnDetection: {
                type: 'server_vad',
                threshold: 0.5,
                prefixPaddingMs: 300,
                silenceDurationMs: 500,
                autoTruncate: true,
                appendedTextAfterTruncation: "[The user interrupted me.]"
            }
        });


        this.isConnected = true;
        this.sessionTimeout = setTimeout(() => {
            console.log('Session timeout reached, ending session');
            this.end();
        }, config.sessionDuration * 60 * 1000) // session timeout based on configuration

    }
    createEventHandlers() {
        return {

            onConnected: async (args, context) => {
                console.log('🔔 Connected:', args);
            },
            onDisconnected: async (args, context) => {
                console.log('🔔 Disconnected:', args);
            },
            onError: async (args, context) => {
                console.log('🔔 Error:', args);
                this.avatariFrame.sendToHost({
                    type: "Error",
                    ...args,
                    message: "Connection error with Voice Live service. Please try again later."
                })
            },
            onServerError: async (args, context) => {
                //  Called when an error event is received from the server
            },
            onSessionCreated: async (event, context) => {
                // Called when the session is created on the server

            },
            onSessionUpdated: async () => {
                // console.log('🔔 Session Updated');
                this.onSessionReady()
            },

            onInputAudioBufferCommitted: async (event, context) => {
                // Called when the input audio buffer is committed
            },
            onInputAudioBufferCleared: async (event, context) => {

            },
            onInputAudioBufferSpeechStarted: async (event, context) => {
                // console.log('🔔 Speech Started:');
                this.currentUserTranscription = ''; // Reset transcription
                this.systemTurnMessage = ''

            },
            onInputAudioBufferSpeechStopped: async (event, context) => {
                // Called when speech stops being detected in the user's audio input
            },
            onConversationItemCreated: async (event, context) => {
                this.bargeIn = false;
                console.log('🔔 Conversation Item Created:', event);
                // Called when a conversation item is created
            },
            onConversationItemInputAudioTranscriptionCompleted: async (event, context) => {
                console.log('🔔 User Transcription Completed:', event);

                this.avatariFrame.sendToHost({
                    type: "userTurnCompleted",
                    text: event.transcript,
                })
                this.currentUserTranscription = event.transcript; // Store the final transcription result
            },
            onConversationItemInputAudioTranscriptionFailed: async (event, context) => {
                // Called when transcription of user audio input fails

            },
            onConversationItemInputAudioTranscriptionDelta: async (event, context) => {
                console.log('🔔 User Transcription Delta:', event.delta);
                // const message = event.transcript

            },

            onConversationItemTruncated: async (event, context) => {
                console.log('🔔 Conversation Item Truncated:', event);
                this.audioQueue = [];
                this.collectedVisemeEvents.forEach(ev => {
                    if (ev?.timeout) {
                        clearTimeout(ev?.timeout);
                    }
                })
                this.updateViseme(0);
                this.collectedVisemeEvents = [];
                this.avatariFrame.sendToHost({
                    type: "bargeIn",
                    bargeInMessage: this.assistantSpeakingMessage,
                })
                this.bargeIn = true;
                this.assistantSpeakingMessage = ''
            },
            onConversationItemDeleted: async (event, context) => {

            },
            onConversationItemRetrieved: async (event, context) => {

            },
            onResponseCreated: async (event, context) => {
                console.log('🔔 new Response Created:', event);
                this.collectedVisemeEvents = [];
                this.visemeClip.reset()
                this.assistantSpeakingMessage = ''
            },
            onResponseDone: async (event, context) => {

            },
            onResponseOutputItemAdded: async (event, context) => {

            },
            onResponseOutputItemDone: async (event, context) => {

            },
            onResponseContentPartAdded: async (event, context) => {

            },
            onResponseContentPartDone: async (event, context) => {

            },
            onResponseTextDelta: async (event, context) => {
                // console.log('🔔 Response Text Delta:', event.delta);

            },
            onResponseTextDone: async (event, context) => {

            },
            onResponseAudioDelta: async (event, context) => {
                if (event.delta && event.delta.byteLength > 0) {
                    const audioBuffer = new ArrayBuffer(event.delta.byteLength);
                    const view = new Uint8Array(audioBuffer);
                    view.set(event.delta);
                    await this.playAudioChunk(audioBuffer);
                } else {
                    console.warn('🔊 Empty or invalid audio chunk received');
                }
            },
            onResponseAudioDone: async (event, context) => {

            },
            onResponseAudioTranscriptDelta: async (event, context) => {
                // console.log('🔔 Audio Transcript Delta:', event.delta);
                this.assistantSpeakingMessage = this.assistantSpeakingMessage + event.delta
            },
            onResponseAudioTranscriptDone: async (event, context) => {
                // console.log('🔔 User onResponseAudioTranscriptDone Completed:', event);

                // console.log("assistant final message", event.transcript)
                // this.assistantSpeakingMessage = event.transcript
            },
            onResponseAnimationVisemeDone: async (event) => {
                console.log("end play visme done", this.visemeClip)
            },
            onResponseAnimationVisemeDelta: async (event) => {
                const animation = event;
                const audioOffsetInMs = animation.audioOffsetInMs
                this.collectedVisemeEvents.push({ uuid: crypto.randomUUID(), timeout: null, visemeId: animation.visemeId, audioOffsetInMs });
                this.visemeClip.push({ time: audioOffsetInMs, value: animation.visemeId })
            },
            onResponseFunctionCallArgumentsDone: async (event, context) => {
                if (event.name === "get_who_are_you") {
                    const args = JSON.parse(event.arguments);
                    console.log("Function call arguments received for 'get_who_are_you':", args);

                    this.session.addConversationItem({
                        type: "function_call_output",
                        callId: event.callId,
                        output: "you are an AI assistant created by aCauch, who is a AI assistant to help user understand company products.",
                    });

                    // Request response generation
                    this.session.sendEvent({
                        type: "response.create",
                    });
                }

                this.avatariFrame.sendToHost({
                    type: "MCPFunctionCalled",
                    functionName: event.name,
                    args: { ...args },
                })
            },
            onServerEvent: async (event, context) => {

                // if (event.type.endsWith("done")) {
                //     console.log("Server event:", event);
                // }
            },
        }
    }

    sendTextChat() {
        console.log("send text message")
        this.session.addConversationItem({
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Can you tell me a story?" }]
        });
        this.session.sendEvent({ type: "response.create" });
    }
    sendGreeting() {
        console.log("send greeting message")

        this.session.sendEvent({
            type: 'response.create',
            response: {
                preGeneratedAssistantMessage: {
                    content: [
                        {
                            type: "text",
                            text: this.config.welcomeMessage || "Hello! I'm your AI assistant. How can I help you today?"
                        }
                    ]
                }
            }
        })
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
            const numberOfSamples = byteLength / 2; // 16-bit = 2 bytes per sample

            if (numberOfSamples === 0) {
                console.warn('Empty audio chunk received');
                return;
            }

            // Create AudioBuffer for the PCM data
            const audioBuffer = this.playAudioContext.createBuffer(
                numberOfChannels,
                numberOfSamples,
                sampleRate
            );

            // Convert Int16 PCM data to Float32 for Web Audio API
            const pcm16Data = new Int16Array(audioData);
            const float32Data = audioBuffer.getChannelData(0);

            for (let i = 0; i < numberOfSamples; i++) {
                // Convert from Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
                float32Data[i] = pcm16Data[i] / 32768.0;
            }

            // Add to audio queue instead of playing immediately
            this.audioQueue.push(audioBuffer);

            if (!this.isPlayingAudio) {
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
                    text: this.assistantSpeakingMessage,
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
        if (!this.session || !this.isConnected) {
            throw new Error('Not connected to Voice Live service');
        }

        try {

            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: this.targetChannels,
                    sampleRate: this.targetSampleRate,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            // Create audio context
            this.audioContext = new AudioContext({ sampleRate: this.targetSampleRate });

            this.playAudioContext = new AudioContext();

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

                const inputBuffer = event.inputBuffer;
                const inputData = inputBuffer.getChannelData(0);

                // Convert to the format needed by Voice Live (PCM16)
                const pcm16Data = this.convertToPCM16(inputData);


                // Ensure we have an ArrayBuffer, not SharedArrayBuffer
                let buffer;
                if (pcm16Data.buffer instanceof ArrayBuffer) {
                    buffer = pcm16Data.buffer.slice(pcm16Data.byteOffset, pcm16Data.byteOffset + pcm16Data.byteLength);
                } else {
                    // Convert SharedArrayBuffer to ArrayBuffer
                    const tempArray = new Uint8Array(pcm16Data);
                    buffer = tempArray.buffer.slice(tempArray.byteOffset, tempArray.byteOffset + tempArray.byteLength);
                }
                this.sendAudioData(buffer);

            };

            if (!this.greetingSent) {
                this.greetingSent = true
                this.sendGreeting()
            }
            this.avatariFrame.sendToHost({
                type: "mediaCaptureStarted",
            })

        } catch (error) {
            this.avatariFrame.sendToHost({
                type: "Error",
                reason: 'Session Connection Error'
            })
        }

    }

    async sendAudioData(audioData) {
        console.log("sending audio")
        if (!this.session) return;
        try {
            // Convert ArrayBuffer to Uint8Array for sending
            const audioBytes = new Uint8Array(audioData);
            await this.session.sendAudio(audioBytes);

        } catch (error) {
            console.error('Failed to send audio data:', error);
        }
    }

    convertToPCM16(floatData) {
        const pcm16 = new Int16Array(floatData.length);

        for (let i = 0; i < floatData.length; i++) {
            // Convert float (-1 to 1) to int16 (-32768 to 32767)
            const sample = Math.max(-1, Math.min(1, floatData[i]));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        return pcm16;
    }

    end(reason = "Session Expired") {

        if (!this.session || !this.isConnected) {

            this.avatariFrame.sendToHost({
                type: "Error",
                reason: 'Not connected Session to end'
            })
            throw new Error('Not connected to Voice Live service');

        }
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
        this.onFinishedTalking()
        this.isConnected = false;
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
}

export default VoiceLiveModule;