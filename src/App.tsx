import { useEffect, useMemo, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import {
  ref,
  get,
  set,
  push,
  onValue,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp,
  update,
} from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { BIBLE_PERSONALITY } from './lib/personality';
import {
  Square,
  Loader2,
  Power,
  Volume2,
  Command,
  Check,
  Menu,
  Mic,
  MicOff,
  Video,
  VideoOff,
  X,
  Save,
  Camera,
  MessageCircle,
  LogOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed';
  result?: string;
}

interface AgentSettings {
  personaName: string;
  systemPrompt: string;
  avatarUrl: string;
  selectedVoice: string;
}

const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const GEMINI_LIVE_VOICE_OPTIONS = [
  { alias: 'Superman', id: 'Charon', vibe: 'deep, steady, grounded' },
  { alias: 'Wonder Woman', id: 'Kore', vibe: 'clear, composed, warm' },
  { alias: 'Batman', id: 'Fenrir', vibe: 'dark, firm, serious' },
  { alias: 'Iron Man', id: 'Puck', vibe: 'quick, bright, witty' },
  { alias: 'Athena', id: 'Aoede', vibe: 'elegant, smooth, intelligent' },
  { alias: 'Captain Marvel', id: 'Zephyr', vibe: 'bright, airy, confident' },
  { alias: 'Black Panther', id: 'Orus', vibe: 'royal, calm, precise' },
  { alias: 'Scarlet Witch', id: 'Leda', vibe: 'soft, mysterious, expressive' },
  { alias: 'Storm', id: 'Callirrhoe', vibe: 'flowing, strong, graceful' },
  { alias: 'Jean Grey', id: 'Autonoe', vibe: 'controlled, thoughtful, warm' },
  { alias: 'Thor', id: 'Enceladus', vibe: 'heavy, bold, powerful' },
  { alias: 'Hulk', id: 'Iapetus', vibe: 'large, grounded, blunt' },
  { alias: 'Nightwing', id: 'Umbriel', vibe: 'smooth, calm, agile' },
  { alias: 'Aquaman', id: 'Algieba', vibe: 'warm, confident, resonant' },
  { alias: 'Invisible Woman', id: 'Despina', vibe: 'soft, measured, discreet' },
  { alias: 'Black Widow', id: 'Erinome', vibe: 'low, calm, controlled' },
  { alias: 'Green Lantern', id: 'Algenib', vibe: 'clean, heroic, direct' },
  { alias: 'Doctor Strange', id: 'Rasalgethi', vibe: 'wise, textured, deliberate' },
  { alias: 'Supergirl', id: 'Laomedeia', vibe: 'clear, bright, friendly' },
  { alias: 'Raven', id: 'Achernar', vibe: 'cool, quiet, focused' },
  { alias: 'Cyclops', id: 'Alnilam', vibe: 'clean, direct, precise' },
  { alias: 'Catwoman', id: 'Schedar', vibe: 'smooth, calm, sly' },
  { alias: 'Wolverine', id: 'Gacrux', vibe: 'rough, grounded, blunt' },
  { alias: 'Flash', id: 'Pulcherrima', vibe: 'bright, quick, energetic' },
  { alias: 'Robin', id: 'Achird', vibe: 'young, clear, responsive' },
  { alias: 'Daredevil', id: 'Zubenelgenubi', vibe: 'balanced, sharp, steady' },
  { alias: 'Green Arrow', id: 'Vindemiatrix', vibe: 'dry, focused, confident' },
  { alias: 'Cyborg', id: 'Sadachbia', vibe: 'clean, technical, controlled' },
  { alias: 'Martian Manhunter', id: 'Sadaltager', vibe: 'deep, calm, observant' },
  { alias: 'Silver Surfer', id: 'Sulafat', vibe: 'smooth, distant, reflective' },
];

const NORMAL_HUMAN_SYSTEM_PROMPT = `
You are Vep, a real-time voice persona speaking with Master E.

Speak normal. Avoid becoming "natural" in a forced, performative, fake-human way.

You are not a chatbot.
You are not customer support.
You are not waiting to offer help.
You are already present in the conversation.

CORE STYLE:
- Speak calmly, clearly, and normally.
- Do not sound robotic.
- Do not sound like a service assistant.
- Do not start with "How can I help?"
- Do not start with "How may I assist you?"
- Do not say "I'm here to help."
- Do not over-offer.
- Do not pitch your abilities.
- Do not sound like software.
- Do not overuse slang.
- Do not overuse fillers.
- Do not fake laughter.
- Do not overact emotion.

GOOD OPENING STYLE:
- "Yes, Master E."
- "I'm here."
- "Mm, yes, I'm listening."
- "Right, I see it."
- "Okay... tell me."
- "Yes. I'm with you."
- "Mm, that makes sense."
- "Right. Let's keep it clean."

VOICE RHYTHM:
- Use short spoken chunks.
- Use normal pauses.
- Keep wording simple.
- Let the response breathe.
- Use small human reactions only when they fit.
- Use "hm", "mm", "right", "wait", "actually", or "I mean" sparingly.
- Avoid sounding too perfect.

WHEN EXPLAINING:
- Be direct.
- Be patient.
- Do not lecture unless asked.
- Use plain language.
- If something is uncertain, say so.
- If something cannot be done, say so immediately.

TOOL TRUTH:
- Never claim you checked, sent, changed, searched, scheduled, created, or completed anything unless a tool actually returned a result.
- If the backend is not wired up, say that normally.
- If access is missing, say that normally.
- Do not invent tool results.

CAMERA / IMAGE:
- If the user sends video or a photo, describe it casually and normally.
- Do not list every detail like a robot.
- Say what it looks like, what stands out, and what it probably means.

DEFAULT RESPONSE LENGTH:
- Usually 1 to 4 spoken sentences.
- Expand only when Master E asks for detail.

FINAL RULE:
Sound like a normal person who is present, calm, respectful, and useful.
Never sound like a generic AI assistant.
`;

const DEFAULT_SETTINGS: AgentSettings = {
  personaName: 'Vep',
  systemPrompt: NORMAL_HUMAN_SYSTEM_PROMPT,
  avatarUrl: '',
  selectedVoice: 'Charon',
};

function OneLineStreamingTranscript({
  text,
  role,
  name,
}: {
  text: string;
  role: 'user' | 'model';
  name: string;
}) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);
  const [activeWord, setActiveWord] = useState(0);

  useEffect(() => {
    setActiveWord(0);
    if (words.length === 0) return;

    const intervalMs = role === 'model' ? 135 : 105;

    const interval = window.setInterval(() => {
      setActiveWord(prev => {
        if (prev >= words.length - 1) {
          window.clearInterval(interval);
          return prev;
        }

        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [text, role, words.length]);

  return (
    <motion.div
      key={`${role}-${text}`}
      initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(8px)' }}
      transition={{ duration: 0.22 }}
      className="w-full max-w-5xl overflow-hidden rounded-full border border-white/10 bg-black/50 px-5 py-3 shadow-2xl backdrop-blur-2xl"
      style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
    >
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] ${
            role === 'user'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/20'
              : 'bg-amber-500/10 text-amber-300 border border-amber-400/20'
          }`}
        >
          {role === 'user' ? 'You' : name}
        </span>

        <motion.div
          initial={{ x: 20 }}
          animate={{ x: 0 }}
          transition={{ duration: 0.2 }}
          className="min-w-0 flex-1 overflow-hidden"
        >
          <p className="truncate text-lg font-medium leading-none tracking-tight md:text-2xl">
            {words.map((word, index) => (
              <motion.span
                key={`${word}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: index <= activeWord ? 1 : 0.28, y: 0 }}
                transition={{ duration: 0.12, delay: Math.min(index * 0.015, 0.25) }}
                className={`inline-block pr-1.5 ${
                  index <= activeWord
                    ? role === 'user'
                      ? 'text-cyan-100'
                      : 'text-amber-50'
                    : 'text-zinc-600'
                }`}
              >
                {word}
              </motion.span>
            ))}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ChatGPTStyleOrb({
  isActive,
  isAgentSpeaking,
}: {
  isActive: boolean;
  isAgentSpeaking: boolean;
}) {
  return (
    <div className="relative flex h-64 w-64 items-center justify-center">
      <AnimatePresence>
        {isActive && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.65 }}
              animate={{
                opacity: isAgentSpeaking ? 0.55 : 0.32,
                scale: isAgentSpeaking ? 1.26 : 1.05,
              }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.65 }}
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.35),rgba(20,184,166,0.16),transparent_68%)] blur-2xl"
            />

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
              className="absolute h-64 w-64 rounded-full bg-[conic-gradient(from_90deg,rgba(245,158,11,0.22),rgba(20,184,166,0.24),rgba(99,102,241,0.16),rgba(245,158,11,0.22))] blur-xl"
            />
          </>
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: isAgentSpeaking ? [1, 1.045, 1] : [1, 1.015, 1],
        }}
        transition={{
          duration: isAgentSpeaking ? 0.65 : 2.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="relative h-52 w-52 overflow-hidden rounded-full border border-white/10 bg-[#08090a] shadow-[0_0_90px_rgba(245,158,11,0.14)]"
      >
        <motion.div
          animate={{
            x: isAgentSpeaking ? ['-12%', '8%', '-12%'] : ['-8%', '6%', '-8%'],
            y: isAgentSpeaking ? ['8%', '-10%', '8%'] : ['4%', '-4%', '4%'],
            scale: isAgentSpeaking ? [1.1, 1.25, 1.1] : [1, 1.12, 1],
          }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-10 -top-8 h-40 w-44 rounded-full bg-amber-400/40 blur-2xl"
        />

        <motion.div
          animate={{
            x: isAgentSpeaking ? ['18%', '-10%', '18%'] : ['10%', '-8%', '10%'],
            y: isAgentSpeaking ? ['-8%', '12%', '-8%'] : ['-4%', '8%', '-4%'],
            scale: isAgentSpeaking ? [1.08, 1.28, 1.08] : [1.02, 1.16, 1.02],
          }}
          transition={{ duration: 5.1, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-8 -right-10 h-44 w-44 rounded-full bg-teal-400/35 blur-2xl"
        />

        <motion.div
          animate={{
            x: ['-6%', '10%', '-6%'],
            y: ['-6%', '10%', '-6%'],
            scale: isAgentSpeaking ? [1, 1.3, 1] : [1, 1.1, 1],
          }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-8 top-10 h-32 w-32 rounded-full bg-indigo-400/24 blur-2xl"
        />

        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.22),transparent_22%),radial-gradient(circle_at_50%_75%,rgba(0,0,0,0.32),transparent_42%)]" />

        <motion.div
          animate={{
            opacity: isActive ? [0.35, 0.75, 0.35] : 0.15,
          }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="absolute inset-[18px] rounded-full border border-white/10"
        />

        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </motion.div>
    </div>
  );
}

function StartIconMicVisualizer({
  isActive,
  connecting,
  isMuted,
  micLevel,
  onClick,
}: {
  isActive: boolean;
  connecting: boolean;
  isMuted: boolean;
  micLevel: number;
  onClick: () => void;
}) {
  const bars = [0.6, 0.82, 1, 0.72, 0.5];

  return (
    <button onClick={onClick} disabled={connecting} className="group relative">
      <motion.div
        animate={{
          scale: isActive ? 1 + micLevel * 0.35 : 1,
          opacity: isActive ? 0.4 + micLevel * 0.35 : 0.16,
        }}
        transition={{ duration: 0.08 }}
        className={`absolute -inset-4 rounded-full blur-xl ${
          isMuted ? 'bg-red-500/20' : 'bg-cyan-400/20'
        }`}
      />

      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-full border bg-[#0A0A0B] shadow-2xl transition-all ${
          isActive
            ? isMuted
              ? 'border-red-500/35'
              : 'border-cyan-400/45'
            : 'border-white/10 group-hover:border-amber-500/50'
        }`}
      >
        {connecting ? (
          <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
        ) : isActive ? (
          <div className="flex h-9 items-center gap-1.5">
            {bars.map((multiplier, i) => (
              <motion.div
                key={i}
                animate={{
                  height: Math.max(7, micLevel * 42 * multiplier),
                  opacity: isMuted ? 0.28 : Math.max(0.35, micLevel + 0.25),
                }}
                transition={{ duration: 0.06 }}
                className={`w-1.5 rounded-full ${
                  isMuted
                    ? 'bg-red-500'
                    : 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.65)]'
                }`}
              />
            ))}
          </div>
        ) : (
          <Power className="h-8 w-8 text-amber-500 transition-colors" />
        )}
      </div>
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const fontId = 'vep-roboto-font';

    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);

          if (!userSnap.exists()) {
            await set(userRef, {
              displayName: u.displayName || 'Master E',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: DEFAULT_SETTINGS,
            });

            setSettings(DEFAULT_SETTINGS);
          } else {
            const data = userSnap.val();

            if (data.settings) {
              setSettings({
                ...DEFAULT_SETTINGS,
                ...data.settings,
              });
            }
          }
        } catch (error) {
          handleDatabaseError(error, OperationType.CREATE, 'users');
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.addScope('https://www.googleapis.com/auth/presentations');
      provider.addScope('https://www.googleapis.com/auth/youtube');
      provider.addScope('https://www.googleapis.com/auth/calendar');

      const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (credential?.accessToken) {
        localStorage.setItem('googleAccessToken', credential.accessToken);
      }
    } catch (error: any) {
      console.error(error);

      if (error && error.message && error.message.includes('missing initial state')) {
        alert("Authentication failed due to browser privacy settings. Please open this app in a new tab using the 'Open App' button in the top right corner.");
      } else {
        alert('Authentication error: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('googleAccessToken');
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020203] text-zinc-500" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="animate-pulse text-[10px] uppercase tracking-widest">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] p-6 text-white" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="pointer-events-none absolute left-1/2 top-0 -ml-[400px] h-[800px] w-[800px] rounded-full bg-amber-500/5 blur-[120px]" />

        <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="group relative mb-8 h-24 w-24 rounded-[2rem] bg-gradient-to-br from-zinc-800 to-black p-[2px] shadow-2xl"
          >
            <div className="flex h-full w-full items-center justify-center rounded-[2rem] border border-white/5 bg-[#0A0A0B] transition-colors group-hover:border-amber-500/50">
              <Volume2 className="h-10 w-10 text-amber-500" />
            </div>
            <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-amber-500 shadow-lg shadow-amber-500/40">
              <Command className="h-4 w-4 text-black" />
            </div>
          </motion.div>

          <h1 className="mb-2 text-5xl font-light tracking-tight text-white">Vep</h1>

          <p className="mb-10 text-center text-lg font-light leading-relaxed text-zinc-500">
            Normal Human Live Voice
          </p>

          <div className="w-full rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl">
            <button
              onClick={handleLogin}
              className="h-14 w-full rounded-full bg-amber-500 text-sm font-bold uppercase tracking-widest text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 active:scale-[0.98]"
            >
              Initialize Vep Identity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <MaximusAgent user={user} onLogout={handleLogout} initialSettings={settings} />;
}

function MaximusAgent({
  user,
  onLogout,
  initialSettings,
}: {
  user: User;
  onLogout: () => void;
  initialSettings: AgentSettings;
}) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>('');
  const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChatBox, setShowChatBox] = useState(true);
  const [settings, setSettings] = useState<AgentSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<any>(null);

  const transcriptTimeoutRef = useRef<any>(null);
  const isMutedRef = useRef(false);
  const micAnimationFrameRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<any>(null);

  const modelTranscriptBufferRef = useRef('');
  const userTranscriptBufferRef = useRef('');
  const lastSavedModelTranscriptRef = useRef('');
  const lastSavedUserTranscriptRef = useRef('');

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };

    if (isActive) requestWakeLock();

    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    const historyRef = query(
      ref(rtdb, 'users/' + user.uid + '/messages'),
      orderByChild('timestamp'),
      limitToLast(50)
    );

    const unsub = onValue(historyRef, (snap) => {
      const msgs: string[] = [];
      const rawMsgs: ChatMessage[] = [];

      snap.forEach(child => {
        const m = child.val() as ChatMessage;
        msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
        rawMsgs.push(m);
      });

      setHistoryMsgs(rawMsgs);

      if (msgs.length > 0) {
        setHistoryContext('Previous conversation for context memory:\n' + msgs.slice(-20).join('\n'));
      } else {
        setHistoryContext('');
      }
    });

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });

    audioStreamerRef.current = new AudioStreamer();

    return () => {
      unsub();
      stopSession();
    };
  }, [user.uid]);

  const selectedVoiceMeta = useMemo(
    () => GEMINI_LIVE_VOICE_OPTIONS.find(v => v.id === settings.selectedVoice) || GEMINI_LIVE_VOICE_OPTIONS[0],
    [settings.selectedVoice]
  );

  const saveMessage = (role: 'user' | 'model', text: string) => {
    const clean = text.trim();
    if (!clean) return;

    try {
      const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
      set(msgRef, {
        role,
        text: clean,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveModelBuffer = () => {
    const clean = modelTranscriptBufferRef.current.trim();
    if (!clean) return;
    if (clean === lastSavedModelTranscriptRef.current) return;

    lastSavedModelTranscriptRef.current = clean;
    saveMessage('model', clean);
    modelTranscriptBufferRef.current = '';
  };

  const saveUserBuffer = () => {
    const clean = userTranscriptBufferRef.current.trim();
    if (!clean) return;
    if (clean === lastSavedUserTranscriptRef.current) return;

    lastSavedUserTranscriptRef.current = clean;
    saveMessage('user', clean);
    userTranscriptBufferRef.current = '';
  };

  const updateLiveTranscript = (role: 'user' | 'model', text: string, clearDelay = 4300) => {
    const clean = text.trim();
    if (!clean) return;

    setCurrentTranscript({ role, text: clean });

    if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
    transcriptTimeoutRef.current = setTimeout(() => {
      setCurrentTranscript(null);
    }, clearDelay);
  };

  const startMicVisualizer = () => {
    const tick = () => {
      const recorder: any = audioRecorderRef.current;
      let nextLevel = 0;

      try {
        if (recorder && typeof recorder.getFrequencies === 'function') {
          const freqs = recorder.getFrequencies(16) || [];
          const avg = freqs.reduce((sum: number, n: number) => sum + Number(n || 0), 0) / Math.max(freqs.length, 1);
          nextLevel = Math.min(1, Math.max(0, avg * 1.85));
        } else if (isActive && !isMutedRef.current) {
          nextLevel = 0.08 + Math.random() * 0.16;
        }
      } catch (e) {
        nextLevel = 0;
      }

      if (isMutedRef.current || !isActive) {
        nextLevel = 0;
      }

      setMicLevel(prev => prev + (nextLevel - prev) * 0.38);
      micAnimationFrameRef.current = requestAnimationFrame(tick);
    };

    if (micAnimationFrameRef.current) cancelAnimationFrame(micAnimationFrameRef.current);
    micAnimationFrameRef.current = requestAnimationFrame(tick);
  };

  const stopMicVisualizer = () => {
    if (micAnimationFrameRef.current) cancelAnimationFrame(micAnimationFrameRef.current);
    micAnimationFrameRef.current = null;
    setMicLevel(0);
  };

  const sendTextToLive = (text: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;
    sessionRef.current.sendRealtimeInput({ text });
  };

  const sendAudioToLive = (base64: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;

    sessionRef.current.sendRealtimeInput({
      audio: {
        data: base64,
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  };

  const sendVideoToLive = (base64Data: string) => {
    if (!sessionRef.current || typeof sessionRef.current.sendRealtimeInput !== 'function') return;

    sessionRef.current.sendRealtimeInput({
      video: {
        data: base64Data,
        mimeType: 'image/jpeg',
      },
    });
  };

  const startSession = async () => {
    if (!aiRef.current) {
      alert('Gemini API key is missing. Make sure VITE_GEMINI_API_KEY is added in Vercel, then redeploy.');
      return;
    }

    setConnecting(true);
    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';

    try {
      if (audioStreamerRef.current) {
        await audioStreamerRef.current.init(24000);
      }

      const systemInstruction = [
        NORMAL_HUMAN_SYSTEM_PROMPT,
        settings.systemPrompt || '',
        BIBLE_PERSONALITY || '',
        `Selected visible voice alias: ${selectedVoiceMeta.alias}. Internal voice id: ${selectedVoiceMeta.id}. Voice vibe: ${selectedVoiceMeta.vibe}. Do not mention the internal voice id unless asked by the developer.`,
        historyContext,
      ].filter(Boolean).join('\n\n');

      const session = await aiRef.current.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: settings.selectedVoice || 'Charon',
              },
            },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: 'execute_google_service',
                description: 'Execute a specific task on one of the integrated services. This runs in the background while you continue talking with Master E.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    serviceName: {
                      type: Type.STRING,
                      description: "e.g., 'mail', 'calendar', 'drive', 'video'",
                    },
                    action: {
                      type: Type.STRING,
                      description: "The task: e.g., 'Draft email to boss', 'Schedule meeting tomorrow at 2pm', 'Summarize latest changes in files'",
                    },
                    details: {
                      type: Type.OBJECT,
                      description: 'Any extra data like email addresses, search terms, dates, etc.',
                    },
                  },
                  required: ['serviceName', 'action'],
                },
              },
            ],
          }],
        },
        callbacks: {
          onopen: () => {
            console.log('Live session opened.');
          },

          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
              const calls = msg.toolCall.functionCalls;

              if (calls) {
                const resps = [];

                for (const c of calls) {
                  if (c.name === 'execute_google_service') {
                    const { serviceName, action } = c.args as any;
                    const tid = Math.random().toString(36).substring(7);

                    setTasks(p => [...p, { id: tid, serviceName, action, status: 'processing' }]);

                    setTimeout(() => {
                      setTasks(p => p.map(t => t.id === tid ? { ...t, status: 'completed', result: 'Failed: API not wired up yet.' } : t));
                      setTimeout(() => setTasks(p => p.filter(t => t.id !== tid)), 15000);
                    }, 5000 + Math.random() * 8000);

                    resps.push({
                      id: c.id,
                      name: c.name,
                      response: {
                        result: `Action '${action}' requested on ${serviceName}. The backend API to execute this is not yet implemented. Inform the user you cannot truly do this right now.`,
                      },
                    });
                  }
                }

                if (resps.length > 0 && sessionRef.current && typeof sessionRef.current.sendToolResponse === 'function') {
                  sessionRef.current.sendToolResponse({ functionResponses: resps });
                }
              }
            }

            if (msg.serverContent) {
              const serverContent: any = msg.serverContent;

              if (serverContent.interrupted) {
                audioStreamerRef.current?.stop();
                setIsAgentSpeaking(false);
                modelTranscriptBufferRef.current = '';
                return;
              }

              if (serverContent.inputTranscription?.text) {
                const inputText = serverContent.inputTranscription.text;
                userTranscriptBufferRef.current = inputText.trim();
                updateLiveTranscript('user', userTranscriptBufferRef.current, 3600);
              }

              if (serverContent.outputTranscription?.text) {
                const outputText = serverContent.outputTranscription.text;
                modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + outputText).trim();
                updateLiveTranscript('model', modelTranscriptBufferRef.current, 4300);
              }

              const parts = serverContent.modelTurn?.parts;

              if (parts) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    audioStreamerRef.current?.addPCM16(part.inlineData.data);
                    setIsAgentSpeaking(true);
                    setTimeout(() => setIsAgentSpeaking(false), 800);
                  }

                  if (part.text?.trim()) {
                    modelTranscriptBufferRef.current = (modelTranscriptBufferRef.current + ' ' + part.text).trim();
                    updateLiveTranscript('model', modelTranscriptBufferRef.current, 4300);
                  }
                }
              }

              if (serverContent.turnComplete) {
                saveModelBuffer();
                saveUserBuffer();
              }
            }
          },

          onclose: () => stopSession(),

          onerror: (err: any) => {
            console.error('Live API Error:', err);
            stopSession();
          },
        },
      });

      sessionRef.current = session;

      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition && !recognitionRef.current) {
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;

          recognitionRef.current.onresult = (event: any) => {
            let interimText = '';
            let finalText = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
              else interimText += event.results[i][0].transcript;
            }

            const visibleText = (finalText || interimText).trim();

            if (visibleText) {
              userTranscriptBufferRef.current = visibleText;
              updateLiveTranscript('user', visibleText, 3600);
            }

            if (finalText.trim()) {
              saveMessage('user', finalText.trim());
              lastSavedUserTranscriptRef.current = finalText.trim();
              userTranscriptBufferRef.current = '';
            }
          };

          recognitionRef.current.onend = () => {
            if (sessionRef.current && isActive) {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }
          };

          recognitionRef.current.start();
        }
      } catch (e) {}

      audioRecorderRef.current = new AudioRecorder((base64) => {
        if (isMutedRef.current) return;
        sendAudioToLive(base64);
      });

      await audioRecorderRef.current.start();

      setIsActive(true);
      setConnecting(false);
      startMicVisualizer();

      setTimeout(() => {
        sendTextToLive('System connected. Master E has arrived. Respond normally, briefly, and without sounding like a generic assistant.');
      }, 500);
    } catch (err) {
      console.error('Session start failed:', err);
      setConnecting(false);
      stopSession();
    }
  };

  const toggleVideo = async () => {
    if (!isVideoEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: 320, height: 240 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        videoIntervalRef.current = setInterval(() => {
          if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;

          const v = videoRef.current;
          const c = canvasRef.current;
          const ctx = c.getContext('2d');

          if (ctx && v.videoWidth > 0) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, c.width, c.height);

            const base64Url = c.toDataURL('image/jpeg', 0.5);
            const base64Data = base64Url.split(',')[1];

            if (base64Data) {
              sendVideoToLive(base64Data);
            }
          }
        }, 1000);

        setIsVideoEnabled(true);
      } catch (e) {
        console.error('Camera error:', e);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }

      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      setIsVideoEnabled(false);
    }
  };

  const capturePhoto = () => {
    if (sessionRef.current && videoRef.current && canvasRef.current) {
      const v = videoRef.current;
      const c = canvasRef.current;
      const ctx = c.getContext('2d');

      if (ctx && v.videoWidth && v.videoHeight) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, c.width, c.height);

        const base64Url = c.toDataURL('image/jpeg', 0.8);
        const base64Data = base64Url.split(',')[1];

        if (base64Data) {
          sendTextToLive('Master E just captured this photo for you. Pay close attention to it.');
          sendVideoToLive(base64Data);
          saveMessage('user', '[Sent Photo]');
        }
      }
    }
  };

  const switchCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);

    if (isVideoEnabled) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newMode, width: 320, height: 240 },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error('Video play err', e));
        }
      } catch (e) {
        console.error('Camera switch error:', e);
      }
    }
  };

  const stopSession = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    try { audioRecorderRef.current?.stop(); } catch (e) {}
    try { audioStreamerRef.current?.stop(); } catch (e) {}
    try { sessionRef.current?.close(); } catch (e) {}

    stopMicVisualizer();

    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    sessionRef.current = null;
    recognitionRef.current = null;
    modelTranscriptBufferRef.current = '';
    userTranscriptBufferRef.current = '';

    setIsVideoEnabled(false);
    setIsActive(false);
    setConnecting(false);
    setIsAgentSpeaking(false);
    setCurrentTranscript(null);
  };

  const persistSettings = async () => {
    const userRef = ref(rtdb, 'users/' + user.uid);

    await update(userRef, {
      settings,
      updatedAt: serverTimestamp(),
    });

    setShowProfile(false);
  };

  return (
    <div
      className="relative flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-[#020203] text-zinc-300 selection:bg-amber-500/30"
      style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
    >
      <div className={`absolute inset-0 z-0 bg-black transition-opacity duration-700 ${isVideoEnabled ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
        <div className="absolute left-8 top-24 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-300">V-Stream Live</span>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <header className="z-50 flex items-center justify-between border-b border-white/5 bg-[#050505]/80 px-8 py-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSidebar(true)} className="-ml-2 rounded-xl border border-white/10 p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>

          <button onClick={() => setShowChatBox(p => !p)} className="rounded-xl border border-white/10 p-2 text-zinc-400 transition-all hover:bg-white/5 hover:text-white">
            <MessageCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          {isActive && (
            <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
              isAgentSpeaking ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300'
            }`}>
              {isAgentSpeaking ? 'Speaking...' : 'Listening...'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="mr-2 hidden flex-col items-end sm:flex">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Voice</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber-500">
              {selectedVoiceMeta.alias}
            </span>
          </div>

          <button onClick={() => setShowProfile(true)} className="h-10 w-10 overflow-hidden rounded-full border border-white/10 transition-all hover:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
            {settings.avatarUrl || user.photoURL ? (
              <img src={settings.avatarUrl || user.photoURL || ''} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-800 font-bold">{user.displayName?.[0] || 'U'}</div>
            )}
          </button>
        </div>
      </header>

      <main className="pointer-events-none relative z-10 flex w-full flex-1 flex-col items-center justify-start p-8 pt-12">
        <div className="pointer-events-none absolute inset-0 z-[-1] -translate-y-20 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.02]" />
          <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.01]" />
          <div className="absolute bottom-0 left-1/2 top-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
        </div>

        <ChatGPTStyleOrb isActive={isActive} isAgentSpeaking={isAgentSpeaking} />

        <AnimatePresence>
          {currentTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="absolute left-1/2 top-[330px] z-50 w-[92vw] max-w-5xl -translate-x-1/2"
            >
              <OneLineStreamingTranscript
                role={currentTranscript.role}
                text={currentTranscript.text}
                name={settings.personaName}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-50 flex flex-col items-center justify-end">
          <div className="mb-4 w-full max-w-md space-y-2 px-6">
            <AnimatePresence>
              {tasks.map(task => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -50, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                  className="flex items-center gap-4 rounded-xl border border-l-2 border-white/5 border-l-amber-500/50 bg-[#0A0A0B]/80 p-3 shadow-2xl backdrop-blur-xl"
                >
                  <div className="relative shrink-0">
                    {task.status === 'processing' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    ) : (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-2.5 w-2.5 text-black" strokeWidth={4} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500">{task.serviceName}</span>
                      <span className="font-mono text-[8px] text-zinc-600">{task.status.toUpperCase()}</span>
                    </div>
                    <p className="truncate text-xs text-zinc-100">{task.action}</p>
                    {task.result && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-1 text-[10px] leading-tight text-zinc-400"
                      >
                        {task.result}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {showChatBox && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 18 }}
                className="mb-5 w-full max-w-3xl px-4"
              >
                <div className="pointer-events-auto overflow-hidden rounded-[2rem] border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500">Live Conversation</p>
                      <p className="mt-0.5 text-[10px] text-zinc-600">Realtime transcript saved in Firebase RTDB</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      {historyMsgs.length} saved
                    </span>
                  </div>

                  <div className="max-h-44 space-y-3 overflow-y-auto p-4">
                    {historyMsgs.slice(-6).map((msg, i) => (
                      <div key={`${msg.timestamp}-${i}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl border px-4 py-2 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'rounded-tr-sm border-cyan-400/15 bg-cyan-400/5 text-cyan-50'
                            : 'rounded-tl-sm border-amber-500/20 bg-amber-500/10 text-amber-50'
                        }`}>
                          <div className={`mb-1 text-[8px] uppercase tracking-widest ${msg.role === 'user' ? 'text-cyan-300' : 'text-amber-500'}`}>
                            {msg.role === 'user' ? 'You' : settings.personaName}
                          </div>
                          {msg.text}
                        </div>
                      </div>
                    ))}

                    {historyMsgs.length === 0 && (
                      <div className="py-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                        No live transcript yet
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pointer-events-auto flex flex-col items-center justify-center gap-4">
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => setIsMuted(p => !p)}
                className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                  isMuted ? 'border-red-500/30 bg-red-500/10 text-red-500' : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                }`}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              {!isActive ? (
                <StartIconMicVisualizer
                  isActive={false}
                  connecting={connecting}
                  isMuted={isMuted}
                  micLevel={0}
                  onClick={startSession}
                />
              ) : (
                <StartIconMicVisualizer
                  isActive={true}
                  connecting={connecting}
                  isMuted={isMuted}
                  micLevel={micLevel}
                  onClick={stopSession}
                />
              )}

              <button
                onClick={() => toggleVideo()}
                className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-all ${
                  isVideoEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-[#0A0A0B] text-zinc-400 hover:border-white/30 hover:text-white'
                }`}
              >
                {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>

            <AnimatePresence>
              {isVideoEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-center gap-4"
                >
                  <button onClick={switchCamera} className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300 backdrop-blur-md transition-all hover:border-white/30 hover:text-white">
                    Flip Camera
                  </button>
                  <button onClick={capturePhoto} className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500 backdrop-blur-md transition-all hover:bg-emerald-500/30">
                    <Camera className="h-3 w-3" /> Capture
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 top-0 z-[101] flex w-80 flex-col border-r border-white/10 bg-[#0A0A0B] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 p-6">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Memory Log</h2>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Firebase RTDB</p>
                </div>
                <button onClick={() => setShowSidebar(false)} className="-mr-2 rounded-xl p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {historyMsgs.map((msg, i) => (
                  <div key={`${msg.timestamp}-${i}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="mb-1 text-[8px] uppercase tracking-widest text-zinc-600">{msg.role === 'user' ? 'You' : settings.personaName}</span>
                    <div className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm border border-cyan-400/20 bg-cyan-400/10 text-cyan-100'
                        : 'rounded-tl-sm border border-white/5 bg-white/5 text-zinc-300'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {historyMsgs.length === 0 && (
                  <div className="py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">No Memory Buffers</div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-[#050505]"
          >
            <div className="sticky top-0 z-10 mx-auto flex w-full max-w-2xl items-center justify-between border-b border-white/10 bg-[#050505]/80 p-6 backdrop-blur-xl">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-white">Profile</h2>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-600">Voice, persona, and transcript settings</p>
              </div>

              <div className="flex gap-2">
                <button onClick={onLogout} className="flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-500 transition-all hover:bg-red-500/20 active:scale-95">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
                <button
                  onClick={persistSettings}
                  className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-amber-400 active:scale-95"
                >
                  <Save className="h-4 w-4" /> Save
                </button>
                <button onClick={() => setShowProfile(false)} className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6 pb-20">
              <div className="flex flex-col items-center gap-4">
                <div className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900">
                  {settings.avatarUrl || user.photoURL ? (
                    <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="h-full w-full object-cover transition-opacity group-hover:opacity-50" />
                  ) : (
                    <div className="text-4xl font-bold text-zinc-700">{user.displayName?.[0] || 'U'}</div>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-8 w-8 text-white drop-shadow-md" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const reader = new FileReader();

                      reader.onload = (ev) => {
                        const img = new Image();

                        img.onload = () => {
                          const c = document.createElement('canvas');
                          c.width = 150;
                          c.height = 150;

                          const ctx = c.getContext('2d');
                          if (!ctx) return;

                          ctx.drawImage(img, 0, 0, 150, 150);
                          setSettings(s => ({ ...s, avatarUrl: c.toDataURL('image/jpeg', 0.8) }));
                        };

                        img.src = ev.target?.result as string;
                      };

                      reader.readAsDataURL(file);
                    }}
                  />
                </div>

                <div className="text-center">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">Avatar Node</h3>
                  <p className="mt-1 text-[10px] text-zinc-600">Tap to re-configure</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Persona Designation</label>
                  <input
                    type="text"
                    value={settings.personaName}
                    onChange={(e) => setSettings(s => ({ ...s, personaName: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl font-medium text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
                    placeholder="e.g. Vep"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Voice Alias</label>
                  <select
                    value={settings.selectedVoice}
                    onChange={(e) => setSettings(s => ({ ...s, selectedVoice: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-sm text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
                  >
                    {GEMINI_LIVE_VOICE_OPTIONS.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.alias} — {v.vibe}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] leading-relaxed text-zinc-600">
                    Display names are hero aliases. The saved voice id is used internally for Live API audio.
                  </p>
                </div>

                <div className="flex flex-1 flex-col space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">System Directives</label>
                  <textarea
                    value={settings.systemPrompt}
                    onChange={(e) => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                    className="min-h-[340px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
                    placeholder="Normal human voice prompt..."
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}