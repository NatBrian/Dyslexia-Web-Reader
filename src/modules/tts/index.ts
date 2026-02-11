/* ===================================================================
 * tts/ — Text-to-Speech engine.
 *
 * Primary: Web Speech API (speechSynthesis) — zero config, always works.
 * Optional: ElevenLabs TTS API — toggled in settings.
 *
 * Provides callbacks for highlighting current chunk while speaking.
 * =================================================================== */

export interface TtsCallbacks {
    onStart?: () => void;
    onEnd?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onError?: (error: string) => void;
}

export interface TtsOptions {
    rate?: number;        // 0.5–2.0, default 1.0
    engine?: 'web' | 'elevenlabs';
    elevenLabsApiKey?: string;
    voiceId?: string;     // ElevenLabs voice ID
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let isSpeaking = false;

/**
 * Speak the given text.
 */
export function speak(text: string, options: TtsOptions = {}, callbacks: TtsCallbacks = {}): void {
    stop(); // stop any ongoing speech

    const engine = options.engine || 'web';

    if (engine === 'elevenlabs' && options.elevenLabsApiKey) {
        speakElevenLabs(text, options, callbacks);
    } else {
        speakWebSpeech(text, options, callbacks);
    }
}

/**
 * Stop all speech.
 */
export function stop(): void {
    if (currentUtterance) {
        speechSynthesis.cancel();
        currentUtterance = null;
    }
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    isSpeaking = false;
}

/**
 * Pause current speech.
 */
export function pause(): void {
    if (currentUtterance && isSpeaking) {
        speechSynthesis.pause();
    }
    if (currentAudio && isSpeaking) {
        currentAudio.pause();
    }
}

/**
 * Resume paused speech.
 */
export function resume(): void {
    if (currentUtterance) {
        speechSynthesis.resume();
    }
    if (currentAudio) {
        currentAudio.play();
    }
}

/**
 * Check if TTS is currently active.
 */
export function isActive(): boolean {
    return isSpeaking;
}

// ─── Web Speech API ─────────────────────────────────────────────────

function speakWebSpeech(text: string, options: TtsOptions, callbacks: TtsCallbacks): void {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    utterance.onstart = () => {
        isSpeaking = true;
        callbacks.onStart?.();
    };
    utterance.onend = () => {
        isSpeaking = false;
        currentUtterance = null;
        callbacks.onEnd?.();
    };
    utterance.onerror = (e) => {
        isSpeaking = false;
        currentUtterance = null;
        callbacks.onError?.(e.error || 'Speech synthesis error');
    };
    utterance.onpause = () => callbacks.onPause?.();
    utterance.onresume = () => callbacks.onResume?.();

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
}

// ─── ElevenLabs API ─────────────────────────────────────────────────

async function speakElevenLabs(text: string, options: TtsOptions, callbacks: TtsCallbacks): Promise<void> {
    const apiKey = options.elevenLabsApiKey;
    if (!apiKey) {
        // Fall back to web speech
        speakWebSpeech(text, options, callbacks);
        return;
    }

    const voiceId = options.voiceId || 'JBFqnCBsd6RMkjVDRZzb'; // Default: George voice

    try {
        callbacks.onStart?.();
        isSpeaking = true;

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    speed: options.rate ?? 1.0,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error (${response.status})`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        currentAudio = audio;

        audio.onended = () => {
            isSpeaking = false;
            currentAudio = null;
            URL.revokeObjectURL(audioUrl);
            callbacks.onEnd?.();
        };

        audio.onerror = () => {
            isSpeaking = false;
            currentAudio = null;
            URL.revokeObjectURL(audioUrl);
            callbacks.onError?.('Audio playback error');
        };

        await audio.play();
    } catch (err: any) {
        isSpeaking = false;
        console.warn('[tts] ElevenLabs failed, falling back to Web Speech:', err);
        speakWebSpeech(text, options, callbacks);
    }
}
