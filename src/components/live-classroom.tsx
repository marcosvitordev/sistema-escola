'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Maximize, Mic, MicOff, MonitorUp, Radio, Square, Volume2, VolumeX } from 'lucide-react';
import type { Room, LocalTrack, RemoteTrack } from 'livekit-client';

type Live = { id: string; startedAt: string; host: { name: string } };
type State = { configured: boolean; live: Live | null };
type SDK = typeof import('livekit-client');
async function liveRequest<T>(classId: string, action: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/live/classes/${classId}/${action}`, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'Não foi possível conectar.'), { status: response.status }); return result;
}
export function LiveClassroom({ classId, name, manage }: { classId: string; name: string; manage: boolean }) {
  const [sdk, setSdk] = useState<SDK | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [mic, setMic] = useState(false);
  const [hasTabAudio, setHasTabAudio] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [message, setMessage] = useState('');
  const [canShare, setCanShare] = useState(false);
  const player = useRef<HTMLVideoElement>(null), audio = useRef<HTMLDivElement>(null), frame = useRef<HTMLDivElement>(null);
  const room = useRef<Room | null>(null), tracks = useRef<LocalTrack[]>([]), activeId = useRef(''), isHost = useRef(false), ending = useRef(false), mounted = useRef(true);
  const joining = useRef(false), mutedAudio = useRef(false), heartbeatFailures = useRef(0);
  function disconnect() {
    isHost.current = false;
    tracks.current.forEach(track => { track.mediaStreamTrack.onended = null; track.stop(); track.detach().forEach(element => { if (element !== player.current) element.remove(); }); }); tracks.current = [];
    const current = room.current; room.current = null; void current?.disconnect(true);
    if (player.current) player.current.srcObject = null;
    audio.current?.replaceChildren(); activeId.current = '';
    mutedAudio.current = false;
    if (mounted.current) { setConnected(false); setPresenting(false); setHasVideo(false); setMic(false); setViewers(0); setMuted(false); setAudioBlocked(false); }
  }
  async function load() {
    const next = await liveRequest<State>(classId, 'status');
    if (!mounted.current) return;
    setState(next);
    if (!joining.current && activeId.current && next.live?.id !== activeId.current) { disconnect(); setMessage('A transmissão foi encerrada.'); }
  }
  useEffect(() => {
    mounted.current = true; let pending = false;
    setCanShare(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
    import('livekit-client').then(module => { if (mounted.current) setSdk(module); }).catch(() => { if (mounted.current) setError('Não foi possível carregar o vídeo. Reabra a página.'); });
    const refresh = async () => {
      if (pending) return; pending = true;
      try { await load(); }
      catch (cause) { if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Falha de conexão.'); if (cause && typeof cause === 'object' && 'status' in cause && [401, 403, 404].includes(Number(cause.status))) disconnect(); } }
      finally { pending = false; }
    };
    void refresh(); const interval = setInterval(() => { void refresh(); }, 5000);
    const heartbeat = setInterval(() => {
      if (isHost.current && activeId.current) void liveRequest(classId, 'heartbeat', { id: activeId.current }).then(() => { heartbeatFailures.current = 0; }).catch(cause => { heartbeatFailures.current++; if (heartbeatFailures.current >= 4 || (cause && typeof cause === 'object' && 'status' in cause && [401, 403, 404, 409].includes(Number(cause.status)))) { disconnect(); if (mounted.current) setError('Sua sessão de transmissão terminou. Entre novamente para continuar.'); } });
    }, 15_000);
    return () => { mounted.current = false; clearInterval(interval); clearInterval(heartbeat); disconnect(); };
    // The page is mounted per class; refs own the media lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  function attachTrack(track: RemoteTrack) {
    if (track.kind === 'video' && player.current) { track.attach(player.current); setHasVideo(true); }
    if (track.kind === 'audio' && audio.current) { const element = track.attach(); element.autoplay = true; element.muted = mutedAudio.current; audio.current.append(element); }
  }
  function createRoom(module: SDK) {
    const next = new module.Room({ adaptiveStream: true, dynacast: true, publishDefaults: { videoCodec: 'vp8', screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 24 } } }); room.current = next;
    next.on(module.RoomEvent.TrackSubscribed, attachTrack);
    next.on(module.RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(element => { if (element === player.current) setHasVideo(false); else element.remove(); }); });
    const count = () => setViewers(next.remoteParticipants.size);
    next.on(module.RoomEvent.ParticipantConnected, count).on(module.RoomEvent.ParticipantDisconnected, count);
    next.on(module.RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!next.canPlaybackAudio));
    next.on(module.RoomEvent.Reconnecting, () => setMessage('Reconectando à transmissão…'));
    next.on(module.RoomEvent.Reconnected, () => setMessage('Conexão restabelecida.'));
    next.on(module.RoomEvent.Disconnected, () => {
      if (room.current !== next) return;
      disconnect(); if (mounted.current) { setMessage('A transmissão terminou ou a conexão foi interrompida.'); void load().catch(() => {}); }
    });
    return next;
  }
  async function stop() {
    if (ending.current) return; ending.current = true;
    const id = activeId.current || state?.live?.id;
    disconnect(); setBusy(true); setError('');
    try { if (id) await liveRequest(classId, 'end', { id }); setMessage('Transmissão encerrada.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a turma.'); }
    finally { ending.current = false; if (mounted.current) setBusy(false); }
  }
  async function start() {
    if (!sdk || busy) return;
    joining.current = true; heartbeatFailures.current = 0; setBusy(true); setError(''); setMessage(''); let id = '';
    try {
      // Capture must be requested directly from this user click, before network calls.
      const captured = await sdk.createLocalScreenTracks({ audio: true, video: { displaySurface: 'browser' }, resolution: { width: 1920, height: 1080, frameRate: 24 }, surfaceSwitching: 'include', contentHint: 'motion' });
      tracks.current = captured;
      if (!mounted.current) { captured.forEach(track => track.stop()); return; }
      const data = await liveRequest<{ id: string; token: string; url: string }>(classId, 'start', {}); id = data.id; activeId.current = id; isHost.current = true;
      if (!mounted.current) { await liveRequest(classId, 'end', { id }); return; }
      const next = createRoom(sdk); await next.connect(data.url, data.token);
      for (const track of captured) await next.localParticipant.publishTrack(track, { source: track.kind === 'video' ? sdk.Track.Source.ScreenShare : sdk.Track.Source.ScreenShareAudio });
      if (!mounted.current || room.current !== next || captured.some(track => track.mediaStreamTrack.readyState === 'ended')) throw new Error('A transmissão foi interrompida.');
      const video = captured.find(track => track.kind === 'video'); if (video && player.current) { video.attach(player.current); video.mediaStreamTrack.onended = () => { void stop(); }; }
      setHasTabAudio(captured.some(track => track.kind === 'audio')); setHasVideo(true); setConnected(true); setPresenting(true); setViewers(next.remoteParticipants.size); await load();
    } catch (cause) {
      disconnect(); if (id) await liveRequest(classId, 'end', { id }).catch(() => {});
      if (mounted.current) setError(cause instanceof Error && cause.name === 'NotAllowedError' ? 'Compartilhamento cancelado. Quando quiser, tente novamente e escolha uma aba.' : cause instanceof Error && 'status' in cause ? cause.message : 'Não foi possível conectar a transmissão. Confira a internet e tente novamente.');
    } finally { joining.current = false; if (mounted.current) setBusy(false); }
  }
  async function join() {
    if (!sdk || !state?.live || busy || connected) return;
    joining.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const data = await liveRequest<{ id: string; token: string; url: string }>(classId, 'join', { id: state.live.id }); activeId.current = data.id;
      if (!mounted.current) return;
      const next = createRoom(sdk); await next.startAudio(); await next.connect(data.url, data.token); if (!mounted.current || room.current !== next) throw new Error('A conexão foi interrompida.'); setConnected(true); setAudioBlocked(!next.canPlaybackAudio);
    } catch (cause) { disconnect(); setError(cause instanceof Error && 'status' in cause ? cause.message : 'Não foi possível assistir à transmissão. Confira a internet e tente novamente.'); }
    finally { joining.current = false; if (mounted.current) setBusy(false); }
  }
  async function toggleMic() {
    const current = room.current; if (!current || !presenting) return;
    try { await current.localParticipant.setMicrophoneEnabled(!mic); setMic(!mic); }
    catch { setError('O navegador não permitiu usar o microfone. Confira a permissão e tente novamente.'); }
  }
  async function toggleAudio() {
    try {
      if (audioBlocked) { await room.current?.startAudio(); setAudioBlocked(!room.current?.canPlaybackAudio); return; }
      mutedAudio.current = !muted; audio.current?.querySelectorAll('audio').forEach(element => { element.muted = !muted; }); setMuted(!muted);
    } catch { setError('Clique em Ativar áudio para permitir o som no navegador.'); }
  }
  return <main className="live-page"><Link className="editor-back" href={manage ? `/turmas/${classId}` : '/'}><ArrowLeft size={18} />{manage ? 'Voltar à turma' : 'Meu início'}</Link><header className="live-heading"><div><span className="eyebrow">AULA AO VIVO</span><h1>{name}</h1><p>{manage ? 'Compartilhe sua tela, uma janela ou uma aba com vídeo.' : 'Acompanhe a explicação do seu professor em tempo real.'}</p></div><span className={`pill ${state?.live ? 'live-on' : ''}`}><Radio size={15} />{state?.live ? 'Ao vivo' : 'Aguardando professor'}</span></header>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {state && !state.configured && <p className="notice">A transmissão ao vivo ainda está sendo configurada.</p>}
    <div className="live-player" ref={frame}><video ref={player} autoPlay playsInline muted={presenting} aria-label={presenting ? 'Prévia da sua transmissão' : 'Transmissão do professor'} />{!hasVideo && <div className="live-placeholder"><MonitorUp size={44} /><h2>{busy ? 'Conectando…' : connected ? 'Aguardando a imagem do professor' : state?.live ? 'A aula está ao vivo' : 'A aula ainda não começou'}</h2><p>{manage ? 'Somente você escolhe o que será compartilhado.' : state?.live ? 'Clique em Assistir ao vivo para entrar.' : 'Deixe esta página aberta. O botão para assistir aparecerá quando o professor começar.'}</p></div>}</div><div ref={audio} className="live-audio" />
    <div className="live-actions">{manage ? presenting ? <><button className="secondary" onClick={() => { void toggleMic(); }}>{mic ? <Mic size={17} /> : <MicOff size={17} />}{mic ? 'Desligar microfone' : 'Ligar microfone'}</button><button disabled={busy} onClick={() => { void stop(); }}><Square size={17} />Encerrar transmissão</button><span>{viewers} {viewers === 1 ? 'pessoa assistindo' : 'pessoas assistindo'}</span></> : state?.live ? <><button disabled={busy} onClick={() => { void stop(); }}><Square size={17} />Encerrar transmissão atual</button>{connected ? <button className="secondary" onClick={() => disconnect()}>Sair da transmissão</button> : <button className="secondary" disabled={busy || !sdk} onClick={() => { void join(); }}>Assistir à transmissão</button>}</> : <button disabled={busy || !sdk || !state?.configured || !canShare} onClick={() => { void start(); }}><MonitorUp size={18} />{busy ? 'Preparando…' : 'Compartilhar tela ou vídeo'}</button> : connected ? <><button className="secondary" onClick={() => { void toggleAudio(); }}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}{audioBlocked ? 'Ativar áudio' : muted ? 'Ouvir áudio' : 'Silenciar áudio'}</button><button className="secondary" onClick={() => disconnect()}>Sair da transmissão</button></> : <button disabled={busy || !sdk || !state?.configured || !state?.live} onClick={() => { void join(); }}><Radio size={18} />{busy ? 'Conectando…' : 'Assistir ao vivo'}</button>}{hasVideo && <button className="secondary" onClick={() => { void frame.current?.requestFullscreen?.().catch(() => setError('Não foi possível abrir em tela cheia.')); }}><Maximize size={17} />Tela cheia</button>}</div>
    {manage && <section className="live-guide card"><h2>Para mostrar um vídeo com som</h2><ol><li>Abra o vídeo em outra aba do Chrome ou Edge.</li><li>Clique em <strong>Compartilhar tela ou vídeo</strong>, escolha <strong>Aba do navegador</strong> e selecione a aba do vídeo.</li><li>Marque <strong>Compartilhar áudio da aba</strong> e confirme. Depois, dê play no vídeo.</li></ol><p>Os alunos entram pelo botão Aula ao vivo no início deles. Você pode ligar o microfone para explicar e encerrar a transmissão a qualquer momento.</p>{!canShare && sdk && <p>Para compartilhar uma aba, use um computador com Chrome ou Edge. Os alunos podem assistir pelo celular.</p>}{presenting && <p className={hasTabAudio ? 'notice' : 'error'}>{hasTabAudio ? 'Áudio da aba incluído na transmissão.' : 'Esta transmissão está sem áudio da aba. Para enviar o som do vídeo, compartilhe novamente e marque Compartilhar áudio da aba.'}</p>}</section>}
  </main>;
}
