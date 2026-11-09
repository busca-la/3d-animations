import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines, Check, CircleHelp, CloudOff, Download, FileAudio, Film, Headphones,
  Mic2, Play, Sparkles, Volume2, WandSparkles, RefreshCcw, HardDrive, Info,
} from 'lucide-react';
import { downloadBlob, formatBytes, formatDate } from './vault';
import { PORTUGUESE_VOICES, audioDurationFromWav, generateNarration } from './voiceEngine';

const STARTER_TEXT = 'Um cliente passou pela sua loja. E você nem percebeu. Do outro lado, uma hamburgueria estava cheia. Antes mesmo de experimentar, ele já tinha escolhido. Não era só o hambúrguer. Era a percepção.';
const SAMPLES = [
  { label: 'Storytelling', value: STARTER_TEXT },
  { label: 'Vídeo de marketing', value: 'Você tem poucos segundos para chamar atenção. Um bom produto é importante. Mas a forma como você apresenta esse produto pode mudar completamente a decisão do cliente.' },
  { label: 'Abertura de vídeo', value: 'Parece uma rua comum. Mas existe um detalhe que quase ninguém percebeu. E quando você descobrir qual é, vai enxergar essa cidade de outra forma.' },
];

function filenameFor(text) {
  const prefix = text.trim().slice(0, 34).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return 'vp-narracao-' + (prefix || 'voz') + '-' + new Date().toISOString().slice(0, 10) + '.wav';
}

function Waveform({ blob }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!blob || !canvasRef.current) return undefined;
    let active = true;
    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bytes = await blob.arrayBuffer();
      if (!active || !canvasRef.current) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(200, Math.round((box.width || 380) * ratio));
      const height = Math.round(106 * ratio);
      canvas.width = width; canvas.height = height;
      context.clearRect(0, 0, width, height);
      const data = new DataView(bytes);
      if (data.byteLength < 44) return;
      const channels = data.getUint16(22, true) || 1;
      const bits = data.getUint16(34, true);
      if (bits !== 16) return;
      let offset = 12;
      while (offset + 8 < data.byteLength) {
        const key = String.fromCharCode(...new Uint8Array(bytes.slice(offset, offset + 4)));
        const length = data.getUint32(offset + 4, true);
        offset += 8;
        if (key === 'data') break;
        offset += length + (length % 2);
      }
      const samples = Math.floor((data.byteLength - offset) / 2 / channels);
      if (samples < 1) return;
      const bars = Math.max(40, Math.floor(width / (4 * ratio)));
      const stride = samples / bars;
      const spacing = width / bars;
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#927bdb');
      gradient.addColorStop(1, '#bdb1f1');
      context.fillStyle = gradient;
      for (let n = 0; n < bars; n++) {
        const start = Math.floor(n * stride);
        const end = Math.min(samples, Math.ceil((n + 1) * stride));
        let peak = 0;
        const step = Math.max(1, Math.floor((end - start) / 32));
        for (let sample = start; sample < end; sample += step) {
          const index = offset + sample * channels * 2;
          if (index + 2 > data.byteLength) break;
          peak = Math.max(peak, Math.abs(data.getInt16(index, true) / 32768));
        }
        const h = Math.max(2 * ratio, Math.min(height - 12 * ratio, peak * height * .9));
        context.fillRect(Math.round(n * spacing + 1), Math.round((height - h) / 2), Math.max(1.6 * ratio, spacing * .54), Math.round(h));
      }
    }
    draw().catch(() => {});
    return () => { active = false; };
  }, [blob]);
  return <canvas aria-label="Forma de onda da narração" ref={canvasRef} className="voice-waveform"/>;
}

export default function VoiceStudio({ assets = [], onGenerated, onUseInFilm, storageAvailable = true, remoteCommand = null }) {
  const [text, setText] = useState(STARTER_TEXT);
  const [voiceId, setVoiceId] = useState('pt_BR-faber-medium');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ phase: 'idle', progress: null, text: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [output, setOutput] = useState(null);
  const [outputUrl, setOutputUrl] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState(null);
  const playerRef = useRef(null);
  const latestRef = useRef(0);
  const lastRemoteRef = useRef('');
  const generatingRef = useRef(false);

  const saved = useMemo(() => assets.filter(asset => asset.generatedBy === 'vp-native-piper' && asset.blob).sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  ), [assets]);

  useEffect(() => {
    if (!output?.blob) { setOutputUrl(''); return undefined; }
    const next = URL.createObjectURL(output.blob);
    setOutputUrl(next);
    audioDurationFromWav(output.blob).then(setEstimatedDuration);
    return () => URL.revokeObjectURL(next);
  }, [output?.blob]);

  const activeVoice = PORTUGUESE_VOICES.find(voice => voice.id === voiceId);
  const canGenerate = !generating && text.trim().length >= 4 && text.length <= 3500;

  async function performGeneration({ script, speaker, commandId = '' }) {
    if (generatingRef.current) {
      if (commandId) window.dispatchEvent(new CustomEvent('vp3d-remote-command-done', {
        detail: { id: commandId, status: 'failed', reason: 'Outra narração está sendo gerada.' },
      }));
      return;
    }
    generatingRef.current = true;
    const inputText = String(script || '').trim();
    const selectedVoice = String(speaker || 'pt_BR-faber-medium');
    const localRequest = ++latestRef.current;
    if (commandId) { setText(inputText); setVoiceId(selectedVoice); }
    setGenerating(true); setError(''); setMessage('');
    setOutput(null); setEstimatedDuration(null);
    setProgress({ phase: 'loading', progress: null, text: 'Inicializando modelo brasileiro…' });
    const acknowledge = (status, reason = '') => {
      if (!commandId) return;
      window.dispatchEvent(new CustomEvent('vp3d-remote-command-done', {
        detail: { id: commandId, status, reason },
      }));
    };
    try {
      const wav = await generateNarration({
        text: inputText, voiceId: selectedVoice, onProgress: update => {
          if (localRequest === latestRef.current) setProgress(update);
        },
      });
      const name = filenameFor(inputText);
      let savedAsset = null;
      if (storageAvailable) {
        try {
          savedAsset = await onGenerated?.({ blob: wav, filename: name, text: inputText, voiceId: selectedVoice });
        } catch (saveError) {
          setMessage('Áudio gerado, mas a biblioteca local não respondeu. Use Baixar WAV para guardar o resultado.');
        }
      } else {
        setMessage('Modo de recuperação: o áudio não foi salvo na biblioteca. Baixe o WAV para guardar.');
      }
      setOutput({ blob: wav, filename: name, savedAsset, text: inputText, voiceId: selectedVoice });
      setProgress({ phase: 'complete', progress: 100, text: 'Narração pronta para ouvir e baixar.' });
      // MCP só confirma após salvar de verdade na biblioteca, não apenas gerar o WAV.
      if (savedAsset?.id) acknowledge('applied');
      else acknowledge('failed', 'Narração gerada, mas não foi salva na biblioteca local. Abra o site e baixe o WAV.');
    } catch (generationError) {
      const reason = generationError.message || 'Não foi possível gerar esta narração.';
      setError(reason); setProgress({ phase: 'error', progress: null, text: 'Falha ao gerar' });
      acknowledge('failed', reason);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (!canGenerate) return;
    return performGeneration({ script: text, speaker: voiceId });
  }

  useEffect(() => {
    if (!remoteCommand?.id || remoteCommand.id === lastRemoteRef.current) return;
    lastRemoteRef.current = remoteCommand.id;
    performGeneration({
      script: remoteCommand.payload?.text,
      speaker: remoteCommand.payload?.voiceId,
      commandId: remoteCommand.id,
    });
  }, [remoteCommand?.id]);

  function loadSaved(asset) {
    if (generating) return;
    setError(''); setMessage('');
    setText(asset.narrationText || STARTER_TEXT);
    if (PORTUGUESE_VOICES.some(v => v.id === asset.narrationVoice)) setVoiceId(asset.narrationVoice);
    setOutput({ blob: asset.blob, filename: asset.name, savedAsset: asset, text: asset.narrationText, voiceId: asset.narrationVoice });
    setProgress({ phase: 'complete', progress: 100, text: 'Narração salva carregada.' });
  }

  return <div className="voice-page">
    <header className="voice-header">
      <div>
        <div className="section-kicker">VITOR PRODUCTIONS / VOICE ENGINE</div>
        <h1>Estúdio de <span className="studio-heading-accent">narração</span></h1>
        <p>Transforme textos em vozes brasileiras usando inteligência artificial dentro do nosso software.</p>
      </div>
      <span className="voice-local-badge"><CloudOff size={14}/> IA local · Sem ElevenLabs</span>
    </header>

    <div className="voice-grid">
      <main className="voice-editor">
        <div className="voice-editor-heading">
          <span className="voice-icon"><WandSparkles size={23}/></span>
          <div><h2>Seu texto</h2><small>Escreva o roteiro que a voz deve narrar.</small></div>
          <span className="voice-lang">Português BR</span>
        </div>
        <div className="voice-presets">
          {SAMPLES.map(sample => <button disabled={generating} key={sample.label} onClick={() => setText(sample.value)} className="voice-preset">{sample.label}</button>)}
        </div>
        <label className="voice-text-label" htmlFor="vp-script">Roteiro da narração</label>
        <textarea id="vp-script" className="voice-textarea" value={text} disabled={generating} onChange={event => setText(event.target.value)} maxLength={3500} spellCheck lang="pt-BR" rows={9} placeholder="Escreva aqui a narração que deseja criar..."/>
        <div className="voice-text-meta"><span><Check size={13}/> Português brasileiro</span><span>{text.length.toLocaleString('pt-BR')} / 3.500 caracteres</span></div>

        <section className="voice-selection">
          <div className="voice-section-heading"><h2>Voz da narração</h2><small>Modelos brasileiros · sem assinatura</small></div>
          <div className="voice-options">
            {PORTUGUESE_VOICES.map(voice => <button type="button" key={voice.id} disabled={generating}
              onClick={() => setVoiceId(voice.id)} aria-pressed={voiceId === voice.id}
              className={'voice-choice' + (voiceId === voice.id ? ' is-active' : '')}>
              <span className="voice-choice-icon"><Mic2 size={18}/></span>
              <span className="voice-choice-text"><strong>{voice.name}</strong><small>{voice.description}</small><em>{voice.quality}</em></span>
              <span className="voice-choice-radio">{voiceId === voice.id && <Check size={12}/>}</span>
            </button>)}
          </div>
        </section>

        <div className="voice-action-area">
          <button className="voice-generate" onClick={handleGenerate} disabled={!canGenerate}>
            <Sparkles size={19} /> {generating ? 'GERANDO NARRAÇÃO...' : 'GERAR NARRAÇÃO COM IA'}
          </button>
          <p>O modelo {activeVoice?.name} ({activeVoice?.modelSize}) é baixado na primeira geração e depois reutilizado neste dispositivo. Seu texto não é enviado ao ElevenLabs.</p>
        </div>
        {generating && <div className="voice-progress" role="status">
          <div className="voice-progress-top"><span><AudioLines size={16}/> {progress.text}</span><strong>{progress.progress === null ? 'IA trabalhando' : progress.progress + '%'}</strong></div>
          <div className="voice-progress-track"><div className={progress.progress === null ? 'voice-progress-indeterminate' : ''} style={progress.progress === null ? {} : {width: progress.progress + '%'}}/></div>
          <small>Não feche esta aba enquanto o modelo estiver gerando o áudio.</small>
        </div>}
        {error && <p className="voice-error" role="alert">{error}</p>}
        {message && <p className="voice-warning" role="status">{message}</p>}
      </main>

      <aside className="voice-sidebar">
        <section className="voice-output-panel">
          <div className="voice-section-heading"><h2>Resultado</h2><span className={output ? 'voice-ready-indicator' : 'voice-empty-indicator'}>{output ? 'Pronto' : 'Aguardando'}</span></div>
          {output ? <>
            <div className="voice-preview-art"><AudioLines size={30}/><span>NARRAÇÃO BRASILEIRA</span><Waveform blob={output.blob}/></div>
            <div className="voice-result-name"><strong>{output.filename}</strong><small>{formatBytes(output.blob.size)} {estimatedDuration ? ' · ' + estimatedDuration.toFixed(1).replace('.', ',') + ' s' : ''}</small></div>
            <audio controls playsInline ref={playerRef} src={outputUrl} className="voice-player" aria-label="Ouvir narração gerada"/>
            <button className="voice-download-button" onClick={() => downloadBlob(output.blob, output.filename)}><Download size={18}/> Baixar áudio WAV</button>
            {output.savedAsset?.id && <button className="voice-attach-button" onClick={() => onUseInFilm?.(output.savedAsset.id)}><Film size={17}/> Usar no filme 3D</button>}
            <p className="voice-safe-note"><Check size={13}/> {output.savedAsset ? 'Salvo na biblioteca de áudio deste navegador.' : 'Arquivo disponível para download. Não foi salvo na biblioteca.'}</p>
          </> : <>
            <div className="voice-empty-art"><Headphones size={43}/><strong>Seu áudio aparecerá aqui</strong><p>Gere um texto para ouvir, salvar e adicionar à animação 3D.</p></div>
          </>}
        </section>

        <section className="voice-history-panel">
          <div className="voice-section-heading"><h2>Biblioteca de vozes</h2><span className="voice-history-count">{saved.length}</span></div>
          {saved.length ? <div className="voice-history-list">
            {saved.slice(0, 8).map(asset => <button className="voice-history-item" key={asset.id} disabled={generating} onClick={() => loadSaved(asset)}>
              <span className="voice-history-icon"><FileAudio size={17}/></span><span><strong>{asset.name}</strong><small>{formatDate(asset.createdAt)} · {asset.narrationVoice === 'pt_BR-faber-medium' ? 'Faber' : 'Edresson'}</small></span><Play size={14}/>
            </button>)}
          </div> : <p className="voice-history-empty">Suas narrações salvas aparecerão aqui.</p>}
        </section>

        <div className="voice-info-note"><Info size={18}/><p>Esta primeira versão usa o modelo aberto <strong>Piper</strong>, com vozes em português brasileiro. A voz não é idêntica à de serviços comerciais. O próximo idioma será o espanhol.</p></div>
      </aside>
    </div>
  </div>;
}
