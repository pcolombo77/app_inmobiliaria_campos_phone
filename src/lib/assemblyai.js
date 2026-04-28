import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

const ASSEMBLYAI_API_KEY = Constants.expoConfig?.extra?.ASSEMBLYAI_API_KEY || process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_URL = 'https://api.assemblyai.com/v2';

async function uploadAudioToAssemblyAI(audioUri) {
  if (audioUri.startsWith('blob:')) {
    console.log('Web: descargando blob para subir');
    const response = await fetch(audioUri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const uploadResponse = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: uint8Array,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Error al subir audio: ${uploadResponse.status} - ${errorText}`);
    }
    
    const { upload_url } = await uploadResponse.json();
    return upload_url;
  } else if (audioUri.startsWith('file://') || audioUri.startsWith('/')) {
    console.log('Native: leyendo archivo local');
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('El archivo de audio no existe');
    }
    
    const base64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const uploadResponse = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Error al subir audio: ${uploadResponse.status} - ${errorText}`);
    }
    
    const { upload_url } = await uploadResponse.json();
    return upload_url;
  } else {
    return audioUri;
  }
}

export async function transcribeAudioWithAssemblyAI(audioUri) {
  console.log('Iniciando transcripción con AssemblyAI para:', audioUri);
  console.log('API Key disponible:', ASSEMBLYAI_API_KEY ? 'Sí' : 'NO');

  if (!ASSEMBLYAI_API_KEY) {
    throw new Error('API key de AssemblyAI no configurada');
  }

  try {
    console.log('Subiendo audio...');
    const uploadUrl = await uploadAudioToAssemblyAI(audioUri);
    console.log('Audio subido, URL:', uploadUrl);

    console.log('Iniciando transcripción...');
    const transcriptResponse = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        language_code: 'es',
        speech_models: ['universal'],
      }),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      throw new Error(`Error al iniciar transcripción: ${transcriptResponse.status} - ${errorText}`);
    }

    const { id: transcriptId } = await transcriptResponse.json();
    console.log('Transcripción iniciada, ID:', transcriptId);

    let transcriptResult = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (!transcriptResult && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      const statusResponse = await fetch(`${ASSEMBLYAI_API_URL}/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLYAI_API_KEY,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Error al obtener estado: ${statusResponse.status} - ${errorText}`);
      }

      const statusData = await statusResponse.json();
      console.log('Estado:', statusData.status, '- Intento:', attempts);

      if (statusData.status === 'completed') {
        transcriptResult = statusData.text;
        if (!transcriptResult || transcriptResult.trim() === '') {
          throw new Error('No se detectó ninguna voz en el audio');
        }
      } else if (statusData.status === 'error') {
        throw new Error(`Error en transcripción: ${statusData.error}`);
      }
    }

    if (!transcriptResult) {
      throw new Error('Tiempo de espera agotado para la transcripción');
    }

    console.log('Transcripción completada:', transcriptResult);
    return transcriptResult;

  } catch (error) {
    console.error('Error en transcripción AssemblyAI:', error);
    throw error;
  }
}