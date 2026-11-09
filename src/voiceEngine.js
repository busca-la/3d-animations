// Síntese de fala neural 100% local, sem ElevenLabs e sem credenciais.
// Modelo aberto Piper/VITS. Os pesos ONNX são baixados pelo navegador e
// guardados no armazenamento privado do próprio navegador.
export const PORTUGUESE_VOICES = [
  {
    id: 'pt_BR-faber-medium',
    name: 'Faber',
    gender: 'Masculina',
    description: 'Voz brasileira clara para vídeos e histórias',
    quality: 'Média · natural',
    modelSize: '~63 MB',
  },
  {
    id: 'pt_BR-edresson-low',
    name: 'Edresson',
    gender: 'Masculina',
    description: 'Tom mais leve para narrações curtas',
    quality: 'Leve · alternativa',
    modelSize: '~63 MB',
  },
];

let loadedVoice = null;
let generationLock = false;

export async function generateNarration({ text, voiceId, onProgress }) {
  if (generationLock) throw new Error('Uma narração já está sendo gerada. Aguarde finalizar.');
  const cleanText = String(text || '').trim();
  if (!cleanText || cleanText.length < 4) throw new Error('Escreva pelo menos quatro caracteres.');
  if (cleanText.length > 3500) throw new Error('Use até 3.500 caracteres por narração.');
  if (!PORTUGUESE_VOICES.some(voice => voice.id === voiceId)) {
    throw new Error('Escolha uma das vozes brasileiras disponíveis.');
  }
  generationLock = true;
  try {
    onProgress?.({ phase: 'loading', text: 'Preparando o motor de voz…', progress: null });
    const { predict, TtsSession, INFERENCE_PROGRESS_URL } = await import('@mintplex-labs/piper-tts-web');
    // Esta versão do Piper reutiliza um singleton de ONNX. Na troca de voz,
    // reinicializar a sessão é obrigatório: cada voz usa pesos próprios.
    if (loadedVoice !== voiceId) {
      TtsSession._instance = null;
      loadedVoice = null;
    }
    const sound = await predict({ text: cleanText, voiceId }, info => {
      if (info?.url === INFERENCE_PROGRESS_URL || String(info?.url).startsWith('tts://')) {
        const loaded = Number(info.loaded) || 0;
        const total = Number(info.total) || 0;
        onProgress?.({
          phase: 'speaking',
          text: total ? 'Sintetizando trecho ' + Math.min(loaded + 1, total) + ' de ' + total + '…' : 'Criando a fala…',
          progress: total ? Math.round(loaded / total * 100) : null,
        });
        return;
      }
      if (Number(info?.total) > 0) {
        const percent = Math.max(0, Math.min(100, Math.round(Number(info.loaded) / Number(info.total) * 100)));
        onProgress?.({ phase: 'download', progress: percent, text: 'Baixando modelo de voz · ' + percent + '%' });
      }
    });
    if (!(sound instanceof Blob) || sound.size < 1000) throw new Error('O motor retornou um áudio vazio.');
    const bytes = await sound.slice(0, 12).arrayBuffer();
    const magic = new TextDecoder().decode(bytes.slice(0, 4));
    if (magic !== 'RIFF') throw new Error('O arquivo de voz não é um WAV válido.');
    loadedVoice = voiceId;
    onProgress?.({ phase: 'complete', text: 'Narração criada.', progress: 100 });
    return new Blob([sound], { type: 'audio/wav' });
  } catch (error) {
    loadedVoice = null;
    const message = error?.message || String(error);
    if (/storage|quota|opfs|filesystem|NotAllowedError/i.test(message)) {
      throw new Error('O navegador não conseguiu guardar o modelo localmente. Verifique o espaço e abra o site em uma aba normal. ' + message);
    }
    if (/fetch|network|failed to|load|CORS|ERR_/i.test(message)) {
      throw new Error('Não foi possível baixar ou carregar o modelo de voz. Verifique sua internet e tente novamente. ' + message);
    }
    throw error;
  } finally {
    generationLock = false;
  }
}

export function audioDurationFromWav(blob) {
  // Leitura rápida do cabeçalho WAV PCM (não bloqueia o botão de download).
  return blob.slice(0, 44).arrayBuffer().then(array => {
    const view = new DataView(array);
    if (view.byteLength < 44) return null;
    const sampleRate = view.getUint32(24, true);
    const channels = view.getUint16(22, true);
    const bits = view.getUint16(34, true);
    const dataBytes = view.getUint32(40, true);
    return sampleRate && channels && bits ? dataBytes / (sampleRate * channels * bits / 8) : null;
  }).catch(() => null);
}
