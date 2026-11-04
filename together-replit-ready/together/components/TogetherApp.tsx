"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  ArrowDownToLine, ArrowLeft, Check, CircleHelp, Copy, Headphones,
  Link2, Maximize, Mic, MicOff, MonitorUp, Play, Plus, Send,
  Settings2, ShieldCheck, Sparkles, Volume2, VolumeX, Users, Video,
  Wifi, X
} from "lucide-react";

type ChatMessage = { id: string; user: string; text: string; time: string };
type PlaybackState = { url: string; type: "youtube" | "video"; playing: boolean; position: number; updatedAt: number; revision: number };
type RoomSnapshot = { roomId: string; participants: string[]; playback: PlaybackState; messages: ChatMessage[] };
type Props = { initialRoomId?: string };

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function parseVideoUrl(raw: string): { type: "youtube" | "video"; url: string } | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      let id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
      return { type: "youtube", url: `https://www.youtube.com/watch?v=${id}` };
    }
    const path = u.pathname.toLowerCase();
    if (/\.(mp4|webm|ogg|m3u8)(?:$)/.test(path)) return { type: "video", url: u.toString() };
    return null;
  } catch { return null; }
}

export default function TogetherApp({ initialRoomId }: Props) {
  const [roomId, setRoomId] = useState(initialRoomId || "");
  const [name, setName] = useState("Guest");
  const [joinInput, setJoinInput] = useState(initialRoomId || "");
  const [sourceInput, setSourceInput] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [playback, setPlayback] = useState<PlaybackState>({ url: "", type: "video", playing: false, position: 0, updatedAt: Date.now(), revision: 0 });
  const [muted, setMuted] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("together-name");
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!joined || !roomId) return;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"], reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("room:join", { roomId, name: name.trim() || "Guest" }, (response: { ok: boolean; snapshot?: RoomSnapshot; error?: string }) => {
        if (!response?.ok || !response.snapshot) {
          setError(response?.error || "Could not join room. Is the API server running?");
          setJoined(false);
          return;
        }
        const s = response.snapshot;
        setParticipants(s.participants || []);
        setMessages(s.messages || []);
        setPlayback(s.playback || { url: "", type: "video", playing: false, position: 0, updatedAt: Date.now(), revision: 0 });
      });
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("room:snapshot", (s: RoomSnapshot) => {
      setParticipants(s.participants || []);
      setMessages(s.messages || []);
      setPlayback(s.playback);
    });
    socket.on("room:participants", (p: string[]) => setParticipants(p));
    socket.on("chat:message", (m: ChatMessage) => setMessages((old) => [...old, m].slice(-100)));
    socket.on("playback:state", (s: PlaybackState) => setPlayback(s));
    socket.on("room:error", (e: { message: string }) => setError(e.message));
    return () => {
      socket.emit("room:leave", { roomId });
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [joined, roomId, name]);

  useEffect(() => {
    if (playback.type !== "video" || !playback.url || !videoRef.current) return;
    const video = videoRef.current;
    const target = playback.playing ? playback.position + Math.max(0, (Date.now() - playback.updatedAt) / 1000) : playback.position;
    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 1.8) video.currentTime = target;
    if (playback.playing) void video.play().catch(() => {});
    else video.pause();
  }, [playback]);

  const createRoom = () => {
    const id = makeRoomId();
    history.pushState({}, "", `/room/${id}`);
    setRoomId(id);
    setJoinInput(id);
    window.localStorage.setItem("together-name", name.trim() || "Guest");
    setJoined(true);
    setError("");
  };

  const joinRoom = (e?: FormEvent) => {
    e?.preventDefault();
    const id = joinInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
    if (!id) { setError("Enter a room code first."); return; }
    history.pushState({}, "", `/room/${id}`);
    setRoomId(id);
    window.localStorage.setItem("together-name", name.trim() || "Guest");
    setJoined(true);
    setError("");
  };

  const sendPlayback = (next: Partial<PlaybackState>) => {
    if (!socketRef.current || !roomId) { setError("Connect to a room first."); return; }
    socketRef.current.emit("playback:command", { roomId, ...next });
  };

  const loadSource = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseVideoUrl(sourceInput);
    if (!parsed) {
      setError("For this starter, use a YouTube URL or a direct .mp4, .webm, .ogg, or .m3u8 URL. Other sites may block embedding.");
      return;
    }
    setError("");
    sendPlayback({ ...parsed, playing: false, position: 0, updatedAt: Date.now() });
    setSourceInput("");
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    const position = playback.type === "video" && video ? video.currentTime : playback.position;
    sendPlayback({ playing: !playback.playing, position, updatedAt: Date.now() });
  };

  const sendChat = (e: FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit("chat:send", { roomId, text });
    setMessageInput("");
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      showToast("Invite link copied");
    } catch { showToast(`${window.location.origin}/room/${roomId}`); }
  };

  const startScreenShare = async () => {
    if (!joined) { setError("Join a room before sharing your screen."); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenSharing(true);
      // Browser capture is real, but this starter intentionally does not claim to broadcast it.
      // LiveKit publishing is connected in the next integration step; see README.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stream.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setScreenSharing(false);
        showToast("Screen capture ended. Live broadcast requires LiveKit configuration.");
      }, { once: true });
      setError("Screen capture started locally. To broadcast it to other room members, configure LiveKit and complete the publishing integration described in README.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Screen capture was cancelled or unavailable.";
      setError(message);
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
  };

  const currentUrl = useMemo(() => {
    if (!playback.url || playback.type !== "youtube") return "";
    const parsed = parseVideoUrl(playback.url);
    if (!parsed) return "";
    const id = new URL(parsed.url).searchParams.get("v");
    return id ? `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0` : "";
  }, [playback.url, playback.type]);

  const displayName = name.trim() || "Guest";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Together home">
          <span className="brand-mark"><Video size={17} strokeWidth={2.7} /></span>
          <span>together<span style={{ color: "var(--accent)" }}>.</span></span>
        </a>
        <nav className="topnav">
          <span className="nav-link">Watch together, wherever.</span>
          <span className="status-pill"><span className="dot" /> {socketConnected ? "Connected" : "Ready to connect"}</span>
        </nav>
      </header>

      {!joined ? (
        <>
          <section className="hero">
            <div className="eyebrow"><Sparkles size={13} /> YOUR PRIVATE MOVIE SPACE</div>
            <h1>Good stories are<br />better <span style={{ color: "var(--accent)" }}>together.</span></h1>
            <p>Create a room, invite your people, and make an ordinary night feel like a premiere. Sync supported videos, talk, or share your screen.</p>
            <div className="room-tools">
              <label className="input-wrap"><Users size={16} color="#85858d" /><input aria-label="Your name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
              <button className="btn btn-primary" onClick={createRoom}><Plus size={16} /> Create a room</button>
            </div>
            <form className="room-tools" onSubmit={joinRoom}>
              <label className="input-wrap"><Link2 size={16} color="#85858d" /><input aria-label="Room code" value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder="Enter a room code" /></label>
              <button className="btn" type="submit"><ArrowDownToLine size={15} /> Join room</button>
            </form>
            {error && <div className="error">{error}</div>}
          </section>
          <div className="feature-row">
            <div className="feature"><Video size={19} /><h3>One shared timeline</h3><p>Keep supported video sources in sync while everyone watches from their own device.</p></div>
            <div className="feature"><Headphones size={19} /><h3>Stay in the moment</h3><p>Voice chat and screen sharing are designed to live alongside the movie.</p></div>
            <div className="feature"><ShieldCheck size={19} /><h3>Your room, your people</h3><p>Start with a room link. Add account-based access controls before public launch.</p></div>
          </div>
        </>
      ) : (
        <section style={{ paddingTop: 30 }}>
          <div className="player-topline">
            <div className="room-label">
              <strong>Late night cinema <span style={{ color: "var(--accent)" }}>·</span> Room {roomId}</strong>
              <span>Invite your people and settle in.</span>
            </div>
            <div className="control-group">
              <span className="live-indicator"><span className="dot" /> {socketConnected ? "ROOM LIVE" : "CONNECTING"}</span>
              <button className="btn btn-quiet" onClick={copyInvite}><Copy size={14} /> Invite</button>
              <button className="icon-btn" title="Back to home" onClick={() => { setJoined(false); history.pushState({}, "", "/"); }}><ArrowLeft size={16} /></button>
            </div>
          </div>

          <div className="room-layout">
            <div className="player-column">
              <div className="video-frame">
                {playback.url && playback.type === "video" ? (
                  <video ref={videoRef} src={playback.url} controls playsInline onPlay={() => { if (!playback.playing) sendPlayback({ playing: true, position: videoRef.current?.currentTime || 0, updatedAt: Date.now() }); }} onPause={() => { if (playback.playing) sendPlayback({ playing: false, position: videoRef.current?.currentTime || 0, updatedAt: Date.now() }); }} onSeeked={() => sendPlayback({ position: videoRef.current?.currentTime || 0, updatedAt: Date.now() })} />
                ) : currentUrl ? (
                  <iframe ref={iframeRef} src={currentUrl} title="Shared YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                ) : (
                  <div className="video-empty">
                    <div className="play-orb"><Play size={24} fill="currentColor" /></div>
                    <h2>Make it a movie night.</h2>
                    <p>Paste a YouTube link or a direct video URL below. Both viewers need access to the same source.</p>
                    <button className="btn btn-primary" onClick={() => document.getElementById("source-url")?.focus()}><Plus size={15} /> Add a video</button>
                  </div>
                )}
              </div>
              <div className="player-controls">
                <div className="control-group">
                  <button className={`icon-btn ${playback.playing ? "active" : ""}`} title={playback.playing ? "Pause shared video" : "Play shared video"} onClick={togglePlayback} disabled={!playback.url}><Play size={15} fill="currentColor" /></button>
                  <button className="icon-btn" title="Mute local tab" onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}><Volume2 size={15} /></button>
                  <span style={{ color: "#77777f", fontSize: 11 }}>{playback.playing ? "Playing" : "Paused"}</span>
                </div>
                <div className="control-group">
                  <button className={`icon-btn ${screenSharing ? "active" : ""}`} title="Start screen capture" onClick={screenSharing ? stopScreenShare : startScreenShare}><MonitorUp size={15} /></button>
                  <button className="icon-btn" title="Voice chat requires LiveKit setup" onClick={() => showToast("Voice chat needs LiveKit credentials. See README.")}><Mic size={15} /></button>
                  <button className="icon-btn" title="Fullscreen" onClick={() => document.querySelector(".video-frame")?.requestFullscreen()}><Maximize size={15} /></button>
                </div>
              </div>
              <form className="source-bar" onSubmit={loadSource}>
                <input id="source-url" value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} placeholder="Paste a YouTube or direct video URL…" aria-label="Video URL" />
                <button className="btn btn-primary" type="submit"><Play size={14} /> Load video</button>
              </form>
              {error && <div className="error">{error}</div>}
              <div className="notice"><CircleHelp size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} /> This starter synchronizes room state. YouTube playback commands need the YouTube IFrame Player API integration for exact control. Screen capture is local-only until LiveKit publishing is configured.</div>
            </div>

            <aside className="side-panel">
              <div className="panel-head"><span>In this room</span><span className="count">{participants.length || 1} here</span></div>
              <div className="participants">
                {(participants.length ? participants : [displayName]).map((p, i) => (
                  <div className="participant" key={`${p}-${i}`}>
                    <div className="avatar">{p.slice(0, 1).toUpperCase()}</div>
                    <div style={{ flex: 1 }}>{p}<small>{i === 0 ? "Room member" : "Watching"}</small></div>
                    {i === 0 ? <Mic size={14} color="#77777f" /> : <Wifi size={14} color="var(--accent)" />}
                  </div>
                ))}
              </div>
              <div className="panel-head"><span>Room chat</span><span className="count">{messages.length}</span></div>
              <div className="chat-log">
                {messages.length === 0 && <p style={{ color: "#77777f", fontSize: 11, lineHeight: 1.6 }}>The popcorn is ready. Say hello while everyone joins.</p>}
                {messages.map((m) => (
                  <div className="chat-message" key={m.id}>
                    <div className="chat-avatar">{m.user.slice(0, 1).toUpperCase()}</div>
                    <div className="chat-content"><div className="chat-meta">{m.user}<time>{m.time}</time></div><p>{m.text}</p></div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="chat-compose" onSubmit={sendChat}>
                <input value={messageInput} onChange={(e) => setMessageInput(e.target.value)} placeholder="Send a message…" maxLength={1000} aria-label="Chat message" />
                <button className="icon-btn active" type="submit" aria-label="Send message"><Send size={14} /></button>
              </form>
            </aside>
          </div>
        </section>
      )}

      <footer><span>© {new Date().getFullYear()} Together. Made for nights in.</span><span>Watch in sync · Talk freely · Be together</span></footer>
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
