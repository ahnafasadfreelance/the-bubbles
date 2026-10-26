type NotificationSound = "orderPlaced" | "orderAccepted" | "newOrder";

const SOUND_NOTES: Record<NotificationSound, readonly { frequency: number; start: number; duration: number }[]> = {
    orderPlaced: [
        { frequency: 523.25, start: 0, duration: 0.13 },
        { frequency: 659.25, start: 0.11, duration: 0.13 },
        { frequency: 783.99, start: 0.22, duration: 0.18 },
        { frequency: 1046.5, start: 0.37, duration: 0.24 },
    ],
    orderAccepted: [
        { frequency: 659.25, start: 0, duration: 0.16 },
        { frequency: 830.61, start: 0.14, duration: 0.16 },
        { frequency: 1046.5, start: 0.28, duration: 0.26 },
    ],
    newOrder: [
        { frequency: 783.99, start: 0, duration: 0.12 },
        { frequency: 1046.5, start: 0.13, duration: 0.12 },
        { frequency: 783.99, start: 0.26, duration: 0.12 },
        { frequency: 1174.66, start: 0.39, duration: 0.2 },
    ],
};

let audioContext: AudioContext | null = null;

export async function activateNotificationAudio(): Promise<AudioContext> {
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContext();
    await audioContext.resume();
    if (audioContext.state !== "running") throw new Error("Notification audio could not be started.");
    return audioContext;
}

export function playNotificationSound(sound: NotificationSound) {
    const context = audioContext;
    if (!context || context.state !== "running") return;

    const startedAt = context.currentTime;
    for (const note of SOUND_NOTES[sound]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = startedAt + note.start;
        const end = start + note.duration;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(note.frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end);
    }
}



