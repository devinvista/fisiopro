import * as React from "react";
import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ISpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message?: string;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: ISpeechRecognitionErrorEvent) => void) | null;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}

interface ISpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [i: number]: ISpeechRecognitionResult };
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

type VoiceTextareaProps = React.ComponentProps<"textarea">;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Permissão de microfone negada. Habilite o microfone nas configurações do navegador.",
  "service-not-allowed": "Permissão de microfone negada pelo sistema.",
  "audio-capture": "Microfone não detectado.",
  "no-speech": "Nenhuma fala detectada.",
  network: "Falha de rede ao processar a fala.",
  aborted: "",
};

function joinTranscript(base: string, chunk: string): string {
  if (!chunk) return base;
  const trimmedChunk = chunk.replace(/^\s+/, "");
  if (!base) return trimmedChunk;
  const needsSpace = !/[\s\n]$/.test(base);
  return needsSpace ? `${base} ${trimmedChunk}` : `${base}${trimmedChunk}`;
}

const VoiceTextarea = React.forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  ({ className, onChange, value, name, ...props }, ref) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [interim, setInterim] = useState("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const recognitionRef = useRef<ISpeechRecognition | null>(null);
    const baseValueRef = useRef<string>("");
    const interimRef = useRef<string>("");
    const startingRef = useRef<boolean>(false);

    useEffect(() => {
      const API = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      setIsSupported(!!API);
    }, []);

    // Cleanup on unmount: abort any active recognition to release the mic.
    useEffect(() => {
      return () => {
        try {
          recognitionRef.current?.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      };
    }, []);

    const fireChange = useCallback(
      (newValue: string) => {
        if (!onChange) return;
        const target = {
          value: newValue,
          name: name ?? "",
        } as HTMLTextAreaElement;
        onChange({
          target,
          currentTarget: target,
          nativeEvent: new Event("change"),
          bubbles: true,
          cancelable: false,
          defaultPrevented: false,
          eventPhase: 0,
          isTrusted: false,
          preventDefault: () => {},
          isDefaultPrevented: () => false,
          stopPropagation: () => {},
          isPropagationStopped: () => false,
          stopImmediatePropagation: () => {},
          persist: () => {},
          type: "change",
          timeStamp: Date.now(),
        } as React.ChangeEvent<HTMLTextAreaElement>);
      },
      [onChange, name],
    );

    const stopRecording = useCallback(() => {
      const rec = recognitionRef.current;
      if (!rec) return;
      // Commit any pending interim text before stopping.
      if (interimRef.current) {
        const next = joinTranscript(baseValueRef.current, interimRef.current);
        baseValueRef.current = next;
        interimRef.current = "";
        setInterim("");
        fireChange(next);
      }
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }, [fireChange]);

    const startRecording = useCallback(() => {
      if (startingRef.current || isRecording) return;
      const API = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!API) return;

      startingRef.current = true;
      setErrorMsg(null);

      const recognition = new API();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      baseValueRef.current = (value as string) ?? "";
      interimRef.current = "";

      recognition.onstart = () => {
        startingRef.current = false;
        setIsRecording(true);
        setInterim("");
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        let finalChunk = "";
        let interimChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += text;
          } else {
            interimChunk += text;
          }
        }

        if (finalChunk) {
          const next = joinTranscript(baseValueRef.current, finalChunk);
          baseValueRef.current = next;
          interimRef.current = "";
          setInterim("");
          fireChange(next);
        } else {
          interimRef.current = interimChunk;
          setInterim(interimChunk);
        }
      };

      recognition.onerror = (e) => {
        startingRef.current = false;
        const msg = ERROR_MESSAGES[e.error];
        if (msg) setErrorMsg(msg);
        setIsRecording(false);
        setInterim("");
        interimRef.current = "";
      };

      recognition.onend = () => {
        startingRef.current = false;
        setIsRecording(false);
        setInterim("");
        interimRef.current = "";
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        startingRef.current = false;
      }
    }, [value, fireChange, isRecording]);

    const toggle = useCallback(() => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }, [isRecording, startRecording, stopRecording]);

    const displayValue =
      isRecording && interim
        ? joinTranscript((value as string) ?? "", interim)
        : value;

    if (!isSupported) {
      return (
        <textarea
          ref={ref}
          name={name}
          className={cn(
            "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          onChange={onChange}
          value={value}
          {...props}
        />
      );
    }

    return (
      <div className="relative group/voice">
        <textarea
          ref={ref}
          name={name}
          className={cn(
            "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pr-9",
            isRecording &&
              "border-red-300 bg-red-50/20 focus-visible:ring-red-300",
            className,
          )}
          onChange={onChange}
          value={displayValue}
          readOnly={isRecording}
          {...props}
        />

        <button
          type="button"
          onClick={toggle}
          title={isRecording ? "Parar ditado" : "Ditado por voz (pt-BR)"}
          aria-label={isRecording ? "Parar ditado por voz" : "Iniciar ditado por voz"}
          aria-pressed={isRecording}
          className={cn(
            "absolute bottom-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded transition-all duration-150",
            isRecording
              ? "bg-red-500 text-white shadow-sm"
              : "text-slate-300 hover:text-slate-500 hover:bg-slate-100 opacity-0 group-hover/voice:opacity-100 focus:opacity-100",
          )}
        >
          {isRecording ? (
            <Square className="h-3 w-3 fill-white" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </button>

        {isRecording && (
          <div className="absolute bottom-2 right-9 flex items-center gap-0.5 pointer-events-none">
            <span className="w-0.5 h-3 bg-red-400 rounded-full" style={{ animation: "voice-bar 0.8s ease-in-out infinite" }} />
            <span className="w-0.5 h-3 bg-red-400 rounded-full" style={{ animation: "voice-bar 0.8s ease-in-out 0.15s infinite" }} />
            <span className="w-0.5 h-3 bg-red-400 rounded-full" style={{ animation: "voice-bar 0.8s ease-in-out 0.3s infinite" }} />
            <span className="w-0.5 h-3 bg-red-400 rounded-full" style={{ animation: "voice-bar 0.8s ease-in-out 0.45s infinite" }} />
          </div>
        )}

        {errorMsg && !isRecording && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    );
  },
);

VoiceTextarea.displayName = "VoiceTextarea";

export { VoiceTextarea };
