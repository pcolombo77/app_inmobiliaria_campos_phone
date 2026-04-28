import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GEMINI_API_KEY = Constants.expoConfig?.extra?.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

async function uriToBase64(uri) {
  const { File } = require('expo-file-system');
  const file = new File(uri);
  const result = await file.base64();
  return result;
}

export async function transcribeAudio(audioUri) {
  console.log('Iniciando transcripción para:', audioUri);
  console.log('API Key disponible:', GEMINI_API_KEY ? 'Sí' : 'NO');
  console.log('Plataforma:', Platform.OS);
  
  if (!GEMINI_API_KEY) {
    throw new Error('API key de Gemini no configurada');
  }

  try {
    const base64Audio = await uriToBase64(audioUri);

    console.log('Audio convertido a base64, tamaño:', base64Audio.length);

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: "Transcribe el siguiente audio exactamente como se escucha. Es un productor agropecuario hablando.",
            },
            {
              inline_data: {
                mime_type: "audio/m4a",
                data: base64Audio,
              },
            },
          ],
        },
      ],
    };

    console.log('Enviando petición a Gemini...');
    
    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Respuesta de API, status:', geminiResponse.status);

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error('Error de API:', errorData);
      throw new Error(`Error de API: ${geminiResponse.status} - ${errorData}`);
    }

    const data = await geminiResponse.json();
    console.log('Respuesta completa:', JSON.stringify(data));
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else if (data.promptFeedback?.blockReason) {
      throw new Error('Audio bloqueado: ' + data.promptFeedback.blockReason);
    } else {
      console.error('Estructura de respuesta inesperada:', data);
      throw new Error('No se recibió transcripción en la respuesta');
    }
  } catch (error) {
    console.error('Error en transcripción:', error);
    throw error;
  }
}
