import Constants from 'expo-constants';

import { supabase } from './supabase';

const MISTRAL_API_KEY = Constants.expoConfig?.extra?.MISTRAL_API_KEY || process.env.EXPO_PUBLIC_MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

const INTENT_SYSTEM_PROMPT = `You are the routing brain of an Agribusiness Real Estate CRM. Classify the user's text into ONE of these intents:
- ADD: dictating NEW data (adding person, field, or opportunity). ALWAYS use ADD when the user wants to CREATE/REGISTER/ADD a new person (vendedor/comprador), field, or opportunity. Examples: "alta de vendedor", "nuevo comprador", "registrar campo", "agregar oportunidad"
- QUERY: searching/listing records. Examples: "mostrar todos los campos", "listar compradores", "qué vendedores tenemos"
- MATCH: ONLY when the user explicitly asks to CROSS-MATCH an existing opportunity with a buyer/seller. MUST mention an existing field/reference person. Examples: "buscame comprador para el campo de Juan", "cruzar el campo de Pedro", "encontrar vendedor para el campo de Carlos"

CRITICAL:
- "es un alta de vendedor" = ADD (creating new vendor)
- "nuevo vendedor Juan Pérez" = ADD
- "buscame comprador para el campo de López" = MATCH (crossing)
- "busco comprador para el campo" = MATCH

Return valid JSON only:
If ADD: { "intent": "ADD" }
If QUERY: { "intent": "QUERY", "filters": {...} }
If MATCH: { "intent": "MATCH", "reference": { "person_name": "name" } }`;

export interface IntentFilters {
  location?: string | null;
  type?: string | null;
  max_price_per_ha?: number | null;
  max_budget?: number | null;
  superficie_min?: number | null;
  superficie_max?: number | null;
  person_name?: string | null;
  person_names?: string[] | null;
}

export interface IntentResult {
  intent: 'ADD' | 'QUERY';
  filters: IntentFilters;
}

export async function analyzeIntent(transcript: string): Promise<IntentResult> {
  console.log('Analyzing intent for transcript:', transcript.substring(0, 100));

function removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  
  const transcriptLower = transcript.toLowerCase();
  const transcriptNoAccents = removeAccents(transcriptLower);
  
  const addPersonKeywords = [
    'nuevo vendedor', 'nueva vendedora', 'nueva compradora',
    'agregar persona', 'agregar contacto', 'nueva persona', 'nuevo contacto',
    'crear vendedor', 'crear comprador',
    'dar de alta nuevo', 'dar de alta vendedor', 'dar de alta comprador',
    'tengo un nuevo', 'tenemos un nuevo', 'tengo una nueva', 'tenemos una nueva',
  ];
  
  const hasAddKeyword = addPersonKeywords.some(kw => transcriptLower.includes(kw) || transcriptNoAccents.includes(kw));
  
  if (hasAddKeyword) {
    console.log('Local ADD detected via keywords');
    return { intent: 'ADD', filters: {} };
  }
  
  const matchKeywords = [
    'buscame comprador', 'busque comprador', 'busco comprador para',
    'buscame vendedor', 'busque vendedor para', 'busco vendedor para',
    'encontrame comprador', 'encontreme comprador', 'encontrar comprador',
    'encontrame vendedor', 'encontreme vendedor', 'encontrar vendedor',
    'a quien le puedo vender', 'a quien le puedo comprar',
    'quien me puede comprar', 'quien me puede vender',
    'buscar comprador', 'buscar vendedor para',
    'cruzar', 'cross', 'match comercial',
    'buscame un comprador', 'buscame un vendedor',
    'buscame alguien que compre', 'buscame alguien que venda',
    'tiene comprador', 'tiene vendedor',
    'necesito comprador', 'necesito vendedor',
    'quien me compra', 'quien me vende',
    'quien compra', 'quien vende',
    'para quien puedo vender', 'buscar a quien le pueda',
  ];
  
  const hasMatchKeyword = matchKeywords.some(kw => transcriptLower.includes(kw) || transcriptNoAccents.includes(kw));
  
  if (hasMatchKeyword) {
    console.log('Local MATCH detected via keywords, skipping Mistral');
    console.log('Transcript:', transcript);
    console.log('Match keywords found');
    const namePatterns = [
      /(?:de|del|para|el campo|los campos|from)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/,
      /(?:campo|campos|terreno|propiedad)\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/,
      /(?: Sr\.?|Sra\.?|Srta\.?)\s+([A-ZÁÉÍÓÚÑ])/,
    ];
    
    let personName = null;
    for (const pattern of namePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        personName = match[1];
        break;
      }
    }
    console.log('Detected person name:', personName);
    return {
      intent: 'MATCH',
      target: { person_name: personName },
    };
  }

  if (!MISTRAL_API_KEY) {
    console.warn('No Mistral API key, defaulting to ADD intent');
    return { intent: 'ADD', filters: {} };
  }

  try {
    const requestBody = {
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: `Analiza este texto en español y devuelve solo JSON:\n\n${transcript}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    console.log('Sending request to Mistral...');
    console.log('System prompt:', INTENT_SYSTEM_PROMPT);

    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Intent analysis failed:', response.status);
      return { intent: 'ADD', filters: {} };
    }

    const data = await response.json();
    const jsonText = data.choices?.[0]?.message?.content;

    console.log('Mistral raw response:', jsonText);

    if (!jsonText) {
      console.warn('No intent result, defaulting to ADD');
      return { intent: 'ADD', filters: {} };
    }

    const result = JSON.parse(jsonText);
    console.log('Raw intent result:', result);
    console.log('Intent result:', JSON.stringify(result, null, 2));

    if (result.intent === 'MATCH') {
      console.log('Returning MATCH with reference:', result.reference);
      return {
        intent: 'MATCH',
        target: result.reference || { location: null, person_name: null, type: null },
      };
    }

    if (result.intent === 'QUERY') {
      console.log('Returning QUERY with filters:', result.filters);
      return {
        intent: 'QUERY',
        filters: result.filters || {},
      };
    }

    return { intent: 'ADD', filters: {} };

  } catch (error) {
    console.error('Error analyzing intent:', error);
    return { intent: 'ADD', filters: {} };
  }
}

export interface MatchTarget {
  location?: string | null;
  person_name?: string | null;
  type?: 'Compra' | 'Venta' | null;
}

export interface MatchResult {
  opportunity: SearchOpportunity;
  matches: SearchOpportunity[];
  matchReason: string;
}

export interface ReferenceResult {
  type: 'single' | 'multiple' | 'error';
  opportunity?: SearchOpportunity;
  opportunities?: SearchOpportunity[];
  personName?: string;
  error?: string;
}

export interface SearchOpportunity {
  id: string;
  numero: number;
  tipo: string;
  monto?: number;
  price_per_ha?: number;
  total_budget?: number;
  moneda?: string;
  zona?: string;
  estado?: string;
  created_at: string;
  id_persona?: string;
  id_campo?: string;
  user_id?: string;
  personas?: any;
  campos?: any;
  profiles?: any;
}

export async function searchOpportunities(filters: IntentFilters): Promise<SearchOpportunity[]> {
  console.log('Searching opportunities with filters:', JSON.stringify(filters));

  try {
    console.log('Fetching oportunidades from database...');
    
    const { data: oportunidades, error } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('tipo', 'Venta')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching oportunidades:', error);
      return [];
    }

    console.log('Found oportunidades in DB:', oportunidades?.length || 0);
    console.log('Oportunidades data:', JSON.stringify(oportunidades, null, 2));

    if (!oportunidades || oportunidades.length === 0) {
      console.log('No oportunidades found in database');
      return [];
    }

    const results: SearchOpportunity[] = [];

    for (const opp of oportunidades) {
      let persona = null;
      let campo = null;
      let profile = null;

      if (opp.id_persona) {
        const { data: p } = await supabase
          .from('personas')
          .select('id, nombre_apellido, telefono, rol, ubicacion')
          .eq('id', opp.id_persona)
          .maybeSingle();
        persona = p;
      }

      if (opp.id_campo) {
        const { data: c } = await supabase
          .from('campos')
          .select('id, ubicacion_exacta, superficie_ha, tipo, precio')
          .eq('id', opp.id_campo)
          .maybeSingle();
        campo = c;
      }

      if (opp.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, hex_color, full_name')
          .eq('id', opp.user_id)
          .maybeSingle();
        profile = prof;
      }

      results.push({
        ...opp,
        personas: persona,
        campos: campo,
        profiles: profile,
      });
    }

    console.log('Results with relations:', results.length);
    
    let filtered = results;

    if (filters.location && filters.location.length > 0) {
      const searchTerm = filters.location.toLowerCase().trim();
      console.log('=== LOCATION FILTER ===');
      console.log('Search term:', searchTerm);
      
      filtered = filtered.filter(item => {
        const zonaValue = item.zona || '';
        const campoValue = item.campos?.ubicacion_exacta || '';
        
        const zonaMatch = zonaValue.toLowerCase().includes(searchTerm);
        const campoMatch = campoValue.toLowerCase().includes(searchTerm);
        
        const match = zonaMatch || campoMatch;
        console.log(`Item id=${item.id}: zona="${zonaValue}" campo="${campoValue}" match=${match}`);
        
        return match;
      });
      
      console.log('=== FILTERED COUNT:', filtered.length);
    }

    if (filters.type) {
      const typeFilter = filters.type.toLowerCase();
      filtered = filtered.filter(item => 
        item.campos?.tipo?.toLowerCase() === typeFilter
      );
    }

    console.log('Final filtered results:', filtered.length);
    return filtered;

  } catch (error) {
    console.error('Error searching:', error);
    return [];
  }
}

export async function findMatchesForReference(target: MatchTarget): Promise<SearchOpportunity | null> {
  console.log('Finding reference opportunity for target:', target);

  try {
    if (!target.person_name) {
      console.log('No person name provided, cannot find reference');
      return null;
    }

    const firstName = target.person_name.split(' ')[0];
    console.log('Searching for person with first name:', firstName);

    const { data: persons, error: personError } = await supabase
      .from('personas')
      .select('id, nombre_apellido')
      .ilike('nombre_apellido', `%${firstName}%`);

    if (personError) {
      console.error('Error searching persons:', personError);
      return null;
    }

    if (!persons || persons.length === 0) {
      console.log('No person found with name:', firstName);
      return null;
    }

    const personId = persons[0].id;
    console.log('Found person ID:', personId, 'Name:', persons[0].nombre_apellido);

    const { data: opps, error: oppError } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('id_persona', personId)
      .order('created_at', { ascending: false });

    if (oppError) {
      console.error('Error searching opportunities:', oppError);
      return { type: 'error', error: 'Error searching opportunities' };
    }

    if (!opps || opps.length === 0) {
      console.log('No opportunities found for person:', personId);
      return { type: 'error', error: 'No opportunities found' };
    }

    if (opps.length === 1) {
      const refOpp = opps[0];
      console.log('Single opportunity found:', refOpp.id);
      const enriched = await enrichOpportunity(refOpp);
      return { type: 'single', opportunity: enriched };
    }

console.log('Multiple opportunities found:', opps.length);
    const enriched = await Promise.all(opps.map(enrichOpportunity));
    return { type: 'multiple', opportunities: enriched, personName: persons[0].nombre_apellido };

  } catch (error) {
    console.error('Error finding reference:', error);
    return { type: 'error', error: 'Database error' };
  }
}

async function enrichOpportunity(refOpp: any): Promise<SearchOpportunity> {
  let persona = null;
  let campo = null;
  let profile = null;

  if (refOpp.id_persona) {
    const { data: p } = await supabase.from('personas').select('*').eq('id', refOpp.id_persona).maybeSingle();
    persona = p;
  }
  if (refOpp.id_campo) {
    const { data: c } = await supabase.from('campos').select('*').eq('id', refOpp.id_campo).maybeSingle();
    campo = c;
  }
  if (refOpp.user_id) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', refOpp.user_id).maybeSingle();
    profile = prof;
  }

  return {
    ...refOpp,
    personas: persona,
    campos: campo,
    profiles: profile,
  };
}

export async function findPersonOpportunitiesByNames(personNames: string[]): Promise<{ type: 'success' | 'error'; opportunities?: SearchOpportunity[]; error?: string }> {
  console.log('Finding opportunities for persons:', personNames);
  
  if (!personNames || !Array.isArray(personNames) || personNames.length === 0) {
    return { type: 'error', error: 'Nombres de personas no proporcionados' };
  }
  
  try {
    const normalizedSearches = personNames.map(name => 
      name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    console.log('Searching for persons (normalized):', normalizedSearches);
    
    const { data: allPersons, error: personError } = await supabase
      .from('personas')
      .select('id, nombre_apellido');
    
    if (personError || !allPersons) {
      return { type: 'error', error: 'Error buscando personas' };
    }
    
    const normalizedPersons = (allPersons || []).map(p => ({
      id: p.id,
      nombre_apellido: p.nombre_apellido,
      normalized: (p.nombre_apellido || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    }));
    
    const persons = normalizedPersons.filter(p => 
      normalizedSearches.some(search => p.normalized.includes(search))
    );
    console.log('Found persons:', persons.map(p => p.nombre_apellido));
    
    if (persons.length === 0) {
      return { type: 'error', error: 'No encontré personas con esos nombres' };
    }
    
    const personIds = persons.map(p => p.id);
    
    const { data: opps, error: oppError } = await supabase
      .from('oportunidades')
      .select('*')
      .in('id_persona', personIds)
      .order('created_at', { ascending: false });
    
    if (oppError) {
      return { type: 'error', error: 'Error buscando oportunidades' };
    }
    
    if (!opps || opps.length === 0) {
      return { type: 'error', error: 'No hay oportunidades para esas personas' };
    }
    
    const enriched = await Promise.all(opps.map(async (opp: any) => {
      let persona = null;
      let campo = null;
      let profile = null;
      
      if (opp.id_persona) {
        const { data: p } = await supabase.from('personas').select('*').eq('id', opp.id_persona).maybeSingle();
        persona = p;
      }
      if (opp.id_campo) {
        const { data: c } = await supabase.from('campos').select('*').eq('id', opp.id_campo).maybeSingle();
        campo = c;
      }
      if (opp.user_id) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', opp.user_id).maybeSingle();
        profile = prof;
      }
      
      return { ...opp, personas: persona, campos: campo, profiles: profile };
    }));
    
    return { type: 'success', opportunities: enriched };
    
  } catch (error) {
    console.error('Error finding person opportunities:', error);
    return { type: 'error', error: 'Error buscando oportunidades' };
  }
}

export async function findPersonOpportunities(personName: string): Promise<{ type: 'success' | 'error'; opportunities?: SearchOpportunity[]; error?: string }> {
  console.log('Finding opportunities for person:', personName);
  
  if (!personName || typeof personName !== 'string') {
    return { type: 'error', error: 'Nombre de persona no proporcionado' };
  }
  
  try {
    const firstName = personName.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    console.log('Searching for person (normalized):', firstName);
    
    const { data: allPersons, error: personError } = await supabase
      .from('personas')
      .select('id, nombre_apellido');
    
    const normalizedPersons = (allPersons || []).map(p => ({
      id: p.id,
      nombre_apellido: p.nombre_apellido,
      normalized: (p.nombre_apellido || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    }));
    
    console.log('All persons (normalized):', normalizedPersons.map(p => ({ original: p.nombre_apellido, normalized: p.normalized })));
    
    const persons = normalizedPersons.filter(p => p.normalized.includes(firstName));
    console.log('Found persons matching (includes):', persons.map(p => ({ original: p.nombre_apellido })));
    
    if (persons.length === 0) {
      console.log('No persons found with name:', firstName);
      return { type: 'error', error: 'No encontré personas con ese nombre' };
    }
    
    const personIds = persons.map(p => p.id);
    console.log('Found person IDs:', personIds);
    
    const { data: opps, error: oppError } = await supabase
      .from('oportunidades')
      .select('*')
      .in('id_persona', personIds)
      .order('created_at', { ascending: false });
    
    if (oppError) {
      console.log('Error fetching opportunities:', oppError);
      return { type: 'error', error: 'Error buscando oportunidades' };
    }
    
    if (!opps || opps.length === 0) {
      console.log('No opportunities found for person:', personId);
      return { type: 'error', error: 'Esta persona no tiene oportunidades registradas' };
    }
    
    const enriched = await Promise.all(opps.map(async (opp: any) => {
      let persona = null;
      let campo = null;
      let profile = null;
      
      if (opp.id_persona) {
        const { data: p } = await supabase.from('personas').select('*').eq('id', opp.id_persona).maybeSingle();
        persona = p;
      }
      if (opp.id_campo) {
        const { data: c } = await supabase.from('campos').select('*').eq('id', opp.id_campo).maybeSingle();
        campo = c;
      }
      if (opp.user_id) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', opp.user_id).maybeSingle();
        profile = prof;
      }
      
      return { ...opp, personas: persona, campos: campo, profiles: profile };
    }));
    
    console.log('Enriched opportunities:', enriched.length, enriched.map(o => ({ numero: o.numero, tipo: o.tipo, zona: o.zona })));
    return { type: 'success', opportunities: enriched };
    
  } catch (error) {
    console.error('Error finding person opportunities:', error);
    return { type: 'error', error: 'Error buscando oportunidades' };
  }
}

function parseRequisitos(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d[\d.,]*)/);
  if (!match) return null;
  const cleaned = match[1].replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

export async function findOpportunityMatches(referenceOpp: SearchOpportunity): Promise<MatchResult[]> {
  console.log('=== FIND MATCHES START ===');
  console.log('Reference opportunity:', JSON.stringify(referenceOpp, null, 2));

  const isLookingForBuyer = referenceOpp.tipo === 'Venta';
  const oppositeType = isLookingForBuyer ? 'Compra' : 'Venta';

  const refSuperficie = referenceOpp.campos?.superficie_ha || 1;
  const refPricePerHa = isLookingForBuyer ? referenceOpp.price_per_ha : (referenceOpp.total_budget ? referenceOpp.total_budget / refSuperficie : null);
  
  console.log('Price calculation:', {
    tipo: referenceOpp.tipo,
    isLookingForBuyer,
    price_per_ha: referenceOpp.price_per_ha,
    total_budget: referenceOpp.total_budget,
    superficie_ha: referenceOpp.campos?.superficie_ha,
    refSuperficie,
    refPricePerHa
  });
  
  const priceMargin = refPricePerHa ? refPricePerHa * 0.2 : 0;
  const minPricePerHa = priceMargin ? refPricePerHa - priceMargin : null;
  const maxPricePerHa = priceMargin ? refPricePerHa + priceMargin : null;

  let locationFilter = referenceOpp.zona || referenceOpp.campos?.ubicacion_exacta || '';
  const locTerm = locationFilter.split(',')[0].toLowerCase();
  const hasLocationFilter = !!locTerm;

  try {
    let query = supabase
      .from('oportunidades')
      .select('*')
      .eq('tipo', oppositeType);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);

    if (error || !data) {
      console.log('No opportunities found for matching');
      return [];
    }

    let matches = data;

    const enrichedMatches = await Promise.all(matches.map(async (item: any) => {
      let campo = null;
      if (item.id_campo) {
        const { data: c } = await supabase.from('campos').select('*').eq('id', item.id_campo).maybeSingle();
        campo = c;
      }
      return { ...item, campos: campo };
    }));

    console.log('After location filter (all candidates):', enrichedMatches.length, 'candidates');
    console.log('Price filter params:', { refPricePerHa, minPricePerHa, maxPricePerHa });
    console.log('Location filter:', { locTerm });

    matches = enrichedMatches;

    matches = matches.filter(item => {
      const itemLoc = (item.zona || item.campos?.ubicacion_exacta || '').toLowerCase();
      
      const oppBudget = item.total_budget || item.monto || parseRequisitos(item.requisitos);
      const oppSuperficie = item.campos?.superficie_ha || 100;
      const oppPricePerHa = oppBudget ? oppBudget / oppSuperficie : null;
      
      let priceMatch = true;
      if (minPricePerHa && maxPricePerHa && oppPricePerHa) {
        priceMatch = oppPricePerHa >= minPricePerHa && oppPricePerHa <= maxPricePerHa;
      }
      
      console.log('Match check:', {
        id: item.id,
        numero: item.numero,
        tipo: item.tipo,
        location: item.zona,
        campoUbicacion: item.campos?.ubicacion_exacta,
        itemLoc,
        locTerm,
        total_budget: item.total_budget,
        monto: item.monto,
        requisitos: item.requisitos,
        parsed: oppBudget,
        superficie: oppSuperficie,
        pricePerHa: oppPricePerHa,
        priceMatch,
        pass: priceMatch
      });
      
      return priceMatch;
    });

    console.log('Found potential matches:', matches.length);

    const results: MatchResult[] = [];

    for (const opp of matches.slice(0, 10)) {
      let persona = null;
      let campo = null;
      let profile = null;

      if (opp.id_persona) {
        const { data: p } = await supabase.from('personas').select('*').eq('id', opp.id_persona).maybeSingle();
        persona = p;
      }
      if (opp.id_campo) {
        const { data: c } = await supabase.from('campos').select('*').eq('id', opp.id_campo).maybeSingle();
        campo = c;
      }
      if (opp.user_id) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', opp.user_id).maybeSingle();
        profile = prof;
      }

      const reason = isLookingForBuyer 
        ? `Presupuesto: USD ${(opp.total_budget || opp.monto || parseRequisitos(opp.requisitos))?.toLocaleString()} (compatible con $${refPricePerHa?.toLocaleString()}/ha)`
        : `Precio: USD ${opp.price_per_ha?.toLocaleString()}/ha`;

      results.push({
        opportunity: { ...opp, personas: persona, campos: campo, profiles: profile },
        matches: [],
        matchReason: reason,
      });
    }

    return results;

  } catch (error) {
    console.error('Error finding matches:', error);
    return [];
  }
}

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function findSalesByPersonName(personName: string): Promise<any[]> {
  const normalizedSearch = removeAccents(personName.toLowerCase());
  
  const { data: personas, error } = await supabase
    .from('personas')
    .select('id, nombre_apellido')
    .or(`nombre_apellido.ilike.%${personName}%,nombre_apellido.ilike.%${normalizedSearch}%`);
  
  if (error || !personas || personas.length === 0) {
    console.log('No se encontraron personas con:', personName);
    return [];
  }
  
  console.log('Personas encontradas:', personas);
  
  const personIds = personas.map(p => p.id);
  
  const { data: ventas, error: ventasError } = await supabase
    .from('oportunidades')
    .select('*')
    .eq('tipo', 'Venta')
    .in('id_persona', personIds);
  
  if (ventasError || !ventas) {
    console.log('Error o sin ventas');
    return [];
  }
  
  console.log('Ventas encontradas:', ventas.length);
  return ventas;
}

export async function findCompatibleBuyersForSales(sales: any[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  for (const venta of sales) {
    let ventaCampo = null;
    if (venta.id_campo) {
      const { data: c } = await supabase.from('campos').select('*').eq('id', venta.id_campo).maybeSingle();
      ventaCampo = c;
    }
    
    const superficieHa = ventaCampo?.superficie_ha || 100;
    const precioHa = venta.price_per_ha || 0;
    const valorTotal = precioHa * superficieHa;
    
    let ventaPersona = null;
    if (venta.id_persona) {
      const { data: p } = await supabase.from('personas').select('*').eq('id', venta.id_persona).maybeSingle();
      ventaPersona = p;
    }
    
    let ventaProfile = null;
    if (venta.user_id) {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', venta.user_id).maybeSingle();
      ventaProfile = prof;
    }
    
    const { data: compras, error } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('tipo', 'Compra');
    
    if (error || !compras) continue;
    
    for (const compra of compras) {
      let compraCampo = null;
      if (compra.id_campo) {
        const { data: c } = await supabase.from('campos').select('*').eq('id', compra.id_campo).maybeSingle();
        compraCampo = c;
      }
      
      let compraPersona = null;
      if (compra.id_persona) {
        const { data: p } = await supabase.from('personas').select('*').eq('id', compra.id_persona).maybeSingle();
        compraPersona = p;
      }
      
      let compraProfile = null;
      if (compra.user_id) {
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', compra.user_id).maybeSingle();
        compraProfile = prof;
      }
      
      const compraSuperficie = compraCampo?.superficie_ha || 100;
      const compraPrecioHa = compra.price_per_ha || 0;
      const compraPresupuesto = compra.total_budget || compra.monto || parseRequisitos(compra.requisitos) || 0;
      
      const esCompatible = compraPresupuesto >= valorTotal;
      const superficieCompatible = compraSuperficie >= superficieHa;
      
      if (esCompatible) {
        results.push({
          opportunity: {
            ...compra,
            campos: compraCampo,
            personas: compraPersona,
            profiles: compraProfile,
            ventaRef: {
              ...venta,
              campos: ventaCampo,
              personas: ventaPersona,
              profiles: ventaProfile
            }
          },
          matches: [{
            type: 'sale_match',
            reason: `Presupuesto USD ${compraPresupuesto.toLocaleString()} >= Valor venta USD ${valorTotal.toLocaleString()}`
          }]
        });
      }
    }
  }
  
  return results;
}
