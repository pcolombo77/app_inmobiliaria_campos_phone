import Constants from 'expo-constants';

const MISTRAL_API_KEY = Constants.expoConfig?.extra?.MISTRAL_API_KEY || process.env.EXPO_PUBLIC_MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

const SYSTEM_PROMPT = `Eres un asistente de una inmobiliaria agropecuaria. Tu tarea es analizar el texto transcrito de un productor y extraer los datos en formato JSON. No respondas con texto libre, solo devuelve un objeto JSON válido con esta estructura:

Si es una NUEVA oportunidad (crear):
{
  "accion": "crear",
  "persona": { "nombre_apellido": "", "telefono": "", "email": "", "rol": "Comprador|Vendedor|Ambos", "ubicacion": "" },
  "campo": { "ubicacion_exacta": "", "superficie_ha": null, "tipo": "agrícola|ganadero|mixto", "precio": null },
  "oportunidad": { 
    "tipo": "Compra|Venta", 
    "price_per_ha": null, 
    "total_budget": null, 
    "moneda": "USD", 
    "zona": "", 
    "requisitos": "", 
    "estado": "Ingresada|En Evaluación|Ejecutada|Descartada" 
  }
}

INSTRUCCIONES PARA EXTRAER EMAIL:
- Extrae cualquier dirección de email mencionada en el texto.
- Si el usuario lo deletrea (ej: "juan arroba gmail punto com"), conviértelo al formato estándar (juan@gmail.com).
- Otros ejemplos: "pepito en hotmail.com" -> "pepito@hotmail.com", "marcos Outlook" -> buscar email en contexto.
- Si no hay email, deja el campo vacío "".

REGLAS OBLIGATORIAS PARA EXTRACCIÓN DE PRECIOS:
- Si el tipo es "Venta": El precio DEBE guardarse en "price_per_ha" (precio por hectárea). Si el usuario menciona un precio total, calcúlalo dividiendo por la superficie en hectáreas si la conoces, o guarda solo el valor que mencionó.
- Si el tipo es "Compra": El presupuesto total DEBE guardarse en "total_budget".
- Si el usuario menciona AMBOS precios (por hectare y total), guarda el precio por hectárea en "price_per_ha".
- NO confundas nunca precio por hectárea con presupuesto total.

Ejemplos:
- "Vendo a 2000 la hectárea" -> price_per_ha: 2000
- "Vendo el campo en 2 millones" -> price_per_ha: null (indica que necesitas calcular o que es precio total)
- "Tengo 500 mil para comprar" -> total_budget: 500000

Si es una MODIFICACION de una oportunidad existente:
{
  "accion": "modificar",
  "numero_oportunidad": NÚMERO_DE_OPORTUNIDAD,
  "oportunidad": { 
    "tipo": "Compra|Venta", 
    "price_per_ha": null, 
    "total_budget": null, 
    "moneda": "USD", 
    "zona": "", 
    "requisitos": "", 
    "estado": "Ingresada|En Evaluación|Ejecutada|Descartada" 
  }
}

Si es una ELIMINACION de una oportunidad existente:
{
  "accion": "eliminar",
  "numero_oportunidad": NÚMERO_DE_OPORTUNIDAD
}

Analiza el texto y determina la acción:
- Si menciona "modificar", "editar", "cambiar" seguido de un número -> acción: "modificar"
- Si menciona "eliminar", "borrar", " حذف" seguido de un número -> acción: "eliminar"
- Si no, es una nueva oportunidad (acción: "crear")`;

export async function extraerDatosDelTexto(textoTranscrito) {
  console.log('Iniciando extracción de datos con Mistral...');
  console.log('API Key disponible:', MISTRAL_API_KEY ? 'Sí' : 'NO');

  if (!MISTRAL_API_KEY) {
    throw new Error('API key de Mistral no configurada');
  }

  if (!textoTranscrito || textoTranscrito.trim() === '') {
    throw new Error('No hay texto para analizar');
  }

  try {
    console.log('Texto a analizar:', textoTranscrito.substring(0, 200) + '...');

    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analiza este texto y extrae los datos en JSON:\n\n${textoTranscrito}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    console.log('Enviando petición a Mistral...');

    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Respuesta de API, status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error de API:', errorData);
      throw new Error(`Error de API: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Respuesta completa:', JSON.stringify(data));

    if (data.choices && data.choices[0]?.message?.content) {
      const jsonText = data.choices[0].message.content;
      console.log('JSON recibido:', jsonText);

      try {
        const jsonData = JSON.parse(jsonText);
        console.log('Datos extraídos:', JSON.stringify(jsonData, null, 2));
        return jsonData;
      } catch (parseError) {
        console.error('Error al parsear JSON:', parseError);
        throw new Error('La respuesta no es un JSON válido');
      }
    } else {
      console.error('Estructura de respuesta inesperada:', data);
      throw new Error('No se recibió datos en la respuesta');
    }
  } catch (error) {
    console.error('Error en extracción:', error);
    throw error;
  }
}