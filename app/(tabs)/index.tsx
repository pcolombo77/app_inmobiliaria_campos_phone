import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, SafeAreaView, Animated, Modal, FlatList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { transcribeAudioWithAssemblyAI } from '../../src/lib/assemblyai';
import { extraerDatosDelTexto } from '../../src/lib/extractor';
import { saveProducerData, updateOpportunityData, deleteOpportunityData, saveDataWithSelectedPerson } from '../../src/lib/database';
import { getCurrentUser, getUserProfile, signOut } from '../../src/lib/supabase';
import { analyzeIntent, searchOpportunities, findMatchesForReference, findOpportunityMatches, findPersonOpportunities, findPersonOpportunitiesByNames, findSalesByPersonName, findCompatibleBuyersForSales, MatchResult, IntentFilters, ReferenceResult, SearchOpportunity } from '../../src/lib/assistant';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNavigation } from '@react-navigation/native';

function tieneDatosUtiles(data: any): boolean {
  if (data.accion === 'eliminar' && data.numero_oportunidad) {
    return true;
  }
  
  if (data.accion === 'modificar' && data.numero_oportunidad) {
    const { oportunidad } = data || {};
    return oportunidad && (
      (oportunidad.tipo && oportunidad.tipo.trim() !== '') ||
      (oportunidad.monto && oportunidad.monto > 0) ||
      (oportunidad.zona && oportunidad.zona.trim() !== '') ||
      (oportunidad.requisitos && oportunidad.requisitos.trim() !== '')
    );
  }
  
  const { persona, campo, oportunidad } = data || {};
  
  const personaValida = persona && (
    (persona.nombre_apellido && persona.nombre_apellido.trim() !== '') ||
    (persona.telefono && persona.telefono.trim() !== '') ||
    (persona.rol && persona.rol.trim() !== '') ||
    (persona.ubicacion && persona.ubicacion.trim() !== '')
  );
  
  const campoValido = campo && (
    (campo.ubicacion_exacta && campo.ubicacion_exacta.trim() !== '') ||
    (campo.superficie_ha && campo.superficie_ha > 0) ||
    (campo.tipo && campo.tipo.trim() !== '') ||
    (campo.precio && campo.precio > 0)
  );
  
  const oportunidadValida = oportunidad && (
    (oportunidad.tipo && oportunidad.tipo.trim() !== '') ||
    (oportunidad.monto && oportunidad.monto > 0) ||
    (oportunidad.zona && oportunidad.zona.trim() !== '') ||
    (oportunidad.requisitos && oportunidad.requisitos.trim() !== '')
  );
  
  return personaValida || campoValido || oportunidadValida;
}

export default function InicioScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<object | null>(null);
  const [hasUsefulData, setHasUsefulData] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [currentReference, setCurrentReference] = useState<any>(null);
  const [showDisambigModal, setShowDisambigModal] = useState(false);
  const [disambiguationOpps, setDisambiguationOpps] = useState<any[]>([]);
  const [disambiguationPersonName, setDisambiguationPersonName] = useState('');
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navigation = useNavigation<any>();
  const silenceStartTimeRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadUserProfile();
  }, []);

  async function loadUserProfile() {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        const userProfile = await getUserProfile(currentUser.id);
        setProfile(userProfile);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function handleDisambigSelect(opp: SearchOpportunity) {
    setShowDisambigModal(false);
    setIsSearching(true);
    
    try {
      const matches = await findOpportunityMatches(opp);
      setIsSearching(false);
      
      if (matches.length > 0) {
        const matchIds = matches.map((m: MatchResult) => m.opportunity.id);
        navigation.navigate('directorio' as any, { 
          matchedIds: matchIds, 
          referenceOpp: opp,
          matchedOpportunities: matches.map((m: MatchResult) => m.opportunity)
        });
      } else {
        Alert.alert('Sin cruces', `Encontré el campo pero no hay candidatos compatibles en este momento.`);
      }
    } catch (error) {
      setIsSearching(false);
      console.error('Error finding matches:', error);
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Sesión', style: 'destructive', onPress: async () => {
          try {
            await signOut();
          } catch (error) {
            console.error('Error signing out:', error);
          }
        }},
      ]
    );
  }

async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Permiso denegado',
          'Se necesita acceso al micrófono para grabar audio.'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.LOW_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.LOW_QUALITY.android,
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoding: 3,
            isMeteringEnabled: true,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.LOW_QUALITY.ios,
            extension: '.m4a',
            isMeteringEnabled: true,
          },
          web: {
            ...Audio.RecordingOptionsPresets.LOW_QUALITY.web,
          },
        },
        (status) => {
          if (status.isRecordingInProgress) {
            const metering = status.metering;
            const isMobile = Platform.OS !== 'web';
            
            if (metering !== undefined && isMobile) {
              console.log('Metering:', metering);
              if (metering > -40) {
                silenceStartTimeRef.current = null;
              } else if (silenceStartTimeRef.current === null) {
                silenceStartTimeRef.current = Date.now();
                console.log('Silence started at:', silenceStartTimeRef.current);
              } else {
                const elapsed = Date.now() - silenceStartTimeRef.current;
                console.log('Silence elapsed:', elapsed, 'ms');
                if (elapsed > 3500) {
                  console.log('Stopping recording due to silence');
                  recording.stopAndUnloadAsync().then(() => {
                    const uri = recording.getURI();
                    setRecording(null);
                    setIsRecording(false);
                    silenceStartTimeRef.current = null;
                    console.log('URI del audio:', uri);
                    if (uri) {
                      setAudioUri(uri);
                      setIsTranscribing(true);
                      setError(null);
                      setExtractedData(null);
                      setShowSuccess(false);
                      processAudioTranscription(uri);
                    }
                  }).catch(err => console.error('Error stopping:', err));
                }
              }
            }
          }
        }
      );

      silenceStartTimeRef.current = null;
      setRecording(recording);
      setIsRecording(true);
      
      if (Platform.OS === 'web') {
        recordingTimerRef.current = setTimeout(() => {
          if (recording) {
            console.log('Stopping recording due to max duration (60s)');
            recording.stopAndUnloadAsync().then(() => {
              const uri = recording.getURI();
              setRecording(null);
              setIsRecording(false);
              console.log('URI del audio:', uri);
              if (uri) {
                setAudioUri(uri);
                setIsTranscribing(true);
                setError(null);
                setExtractedData(null);
                setShowSuccess(false);
                processAudioTranscription(uri);
              }
            }).catch(err => console.error('Error stopping:', err));
          }
        }, 60000);
      }
      
      setAudioUri(null);
      setTranscription(null);
      setExtractedData(null);
      setHasUsefulData(false);
      setShowSuccess(false);
      setError(null);
    } catch (error) {
      console.error('Error al iniciar grabación:', error);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      setIsRecording(false);
      silenceStartTimeRef.current = null;
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      setRecording(null);
      console.log('URI del audio:', uri);

      if (uri) {
        setAudioUri(uri);
        setIsTranscribing(true);
        setError(null);
        setExtractedData(null);
        setShowSuccess(false);
        processAudioTranscription(uri);
      }
    } catch (error) {
      console.error('Error al detener grabación:', error);
      setIsRecording(false);
    }
  }

  async function processAudioTranscription(uri: string) {
    try {
      const text = await transcribeAudioWithAssemblyAI(uri);
      
      if (!text || text.trim() === '') {
        setIsTranscribing(false);
        Alert.alert('Audio vacío', 'No se detectó ninguna voz en la grabación. Por favor, intenta grabar nuevamente.');
        setAudioUri(null);
        setTranscription(null);
        return;
      }
      
      setTranscription(text);
      
      setIsTranscribing(false);
      setIsAnalyzing(true);
      
      const intentResult = await analyzeIntent(text);
      console.log('Intent result:', intentResult);
      
      if (intentResult.intent === 'MATCH') {
        setIsAnalyzing(false);
        setIsSearching(true);
        
        const target = intentResult.target;
        const personName = target.person_name;
        
        if (!personName) {
          setIsSearching(false);
          setIsExtracting(true);
          const data = await extraerDatosDelTexto(text);
          setExtractedData(data);
          setHasUsefulData(tieneDatosUtiles(data));
          setIsExtracting(false);
          return;
        }
        
        const ventas = await findSalesByPersonName(personName);
        
        if (ventas.length === 0) {
          setIsSearching(false);
          setIsExtracting(true);
          const data = await extraerDatosDelTexto(text);
          setExtractedData(data);
          setHasUsefulData(tieneDatosUtiles(data));
          setIsExtracting(false);
          return;
        }
        
        const matches = await findCompatibleBuyersForSales(ventas);
        
        setIsSearching(false);
        
        if (matches.length > 0) {
          navigation.navigate('directorio' as any, { 
            matchedIds: matches.map((m: MatchResult) => m.opportunity.id), 
            matchedOpportunities: matches.map((m: MatchResult) => m.opportunity)
          });
        } else {
          Alert.alert('Sin resultados', 'No se encontraron compradores compatibles para las ventas de ' + personName);
        }
      } else if (intentResult.intent === 'QUERY') {
        setIsAnalyzing(false);
        setIsSearching(true);
        
        const personNames = intentResult.filters?.person_names;
        const personName = intentResult.filters?.person_name;
        
        if (personNames && Array.isArray(personNames) && personNames.length > 0) {
          const personResult = await findPersonOpportunitiesByNames(personNames);
          setIsSearching(false);
          
          if (personResult.type === 'success' && personResult.opportunities?.length > 0) {
            navigation.navigate('directorio' as any, { 
              searchResults: personResult.opportunities,
              personFilter: true
            });
          } else {
            Alert.alert('Sin resultados', personResult.error || 'No encontré oportunidades');
          }
        } else if (personName) {
          const personResult = await findPersonOpportunities(personName);
          setIsSearching(false);
          
          if (personResult.type === 'success' && personResult.opportunities?.length > 0) {
            navigation.navigate('directorio' as any, { 
              searchResults: personResult.opportunities,
              personFilter: true
            });
          } else {
            Alert.alert('Sin resultados', personResult.error || 'No encontré oportunidades');
          }
        } else {
          const searchResults = await searchOpportunities(intentResult.filters);
          setIsSearching(false);
          
          if (searchResults.length > 0) {
            navigation.navigate('directorio' as any, { searchResults });
          } else {
            Alert.alert('Sin resultados', 'No encontré campos con esos requisitos');
          }
        }
      } else {
        setIsAnalyzing(false);
        setIsExtracting(true);
        
        const data = await extraerDatosDelTexto(text);
        setExtractedData(data);
        
        const useful = tieneDatosUtiles(data);
        setHasUsefulData(useful);
        
        setIsExtracting(false);
        
        if (!useful) {
          setError('No es posible extraer datos útiles del audio');
        }
      }
    } catch (transcribeError: any) {
      console.error('Error en transcripción:', transcribeError);
      setIsTranscribing(false);
      setIsAnalyzing(false);
      setIsExtracting(false);
      setIsSearching(false);
      setError(transcribeError.message || 'Error desconocido');
      Alert.alert('Error', transcribeError.message || 'No se pudo transcribir el audio');
    }
  }

  async function handlePress() {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  const isDisabled = isTranscribing || isExtracting || isSaving;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerContainer}>
          <View style={styles.userInfo}>
            {profile?.hex_color && (
              <View style={[styles.userAvatar, { backgroundColor: profile.hex_color }]}>
                <Text style={styles.userInitial}>
                  {profile.full_name?.charAt(0) || 'U'}
                </Text>
              </View>
            )}
            <View>
              <Text style={[styles.title, { color: colors.text }]}>AgroGestión</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {profile?.full_name || 'Usuario'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.buttonContainer}>
          {(isRecording || (!extractedData && !showSuccess && !isTranscribing && !isExtracting && !isSaving)) && (
            <>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                  { shadowColor: colors.shadow }
                ]}
                onPress={handlePress}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.recordButtonInner,
                  isRecording && styles.recordButtonInnerActive,
                  { backgroundColor: isRecording ? colors.error : colors.primary }
                ]}>
                  <Ionicons 
                    name={isRecording ? 'stop' : 'mic'} 
                    size={36} 
                    color="#FFFFFF" 
                  />
                </View>
              </TouchableOpacity>
              
              <Text style={[styles.buttonLabel, { color: colors.textSecondary }]}>
                {isRecording ? 'Toca para detener' : 'Toca para grabar'}
              </Text>
            </>
          )}
        </View>

        {isRecording && (
          <View style={[styles.recordingIndicator, { backgroundColor: colors.error }]}>
            <View style={[styles.recordingDot, { backgroundColor: '#fff' }]} />
            <Text style={styles.recordingText}>Grabando...</Text>
          </View>
        )}

        {(isTranscribing || isAnalyzing || isSearching || isExtracting || isSaving) && (
          <View style={[styles.statusContainer, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.text }]}>
              {isTranscribing && 'Transcribiendo audio...'}
              {isAnalyzing && 'Analizando tu solicitud...'}
              {isSearching && 'Analizando cruces comerciales...'}
              {isExtracting && 'Extrayendo datos...'}
              {isSaving && 'Guardando en base de datos...'}
            </Text>
          </View>
        )}

        {showSuccess && (
          <View style={[styles.successContainer, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={[styles.successText, { color: colors.success }]}>¡Datos guardados exitosamente!</Text>
            <TouchableOpacity
              style={[styles.newRecordingButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setAudioUri(null);
                setTranscription(null);
                setExtractedData(null);
                setHasUsefulData(false);
                setShowSuccess(false);
                setError(null);
              }}
            >
              <Text style={styles.newRecordingButtonText}>Nueva grabación</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
            <Ionicons name="alert-circle" size={24} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>Error: {error}</Text>
          </View>
        )}

        {transcription && !showSuccess && (
          <View style={[styles.transcriptionContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.transcriptionTitle, { color: colors.primary }]}>Transcripción</Text>
            <Text style={[styles.transcriptionText, { color: colors.text }]}>{transcription}</Text>
          </View>
        )}

        {extractedData && hasUsefulData && !showSuccess && (
          <View style={[styles.dataCard, { backgroundColor: '#000000', shadowColor: colors.shadow }]}>
            <View style={[styles.dataCardBorder, { backgroundColor: colors.primary }]} />
            <View style={styles.dataCardContent}>
              <Text style={[styles.dataCardTitle, { color: colors.primary }]}>Datos Extraídos</Text>
              
              {(extractedData as any).persona && (
                <View style={styles.dataSection}>
                  <View style={styles.dataSectionHeader}>
                    <Ionicons name="person" size={16} color={colors.primary} />
                    <Text style={[styles.dataSectionTitle, { color: '#4CAF50' }]}>Persona</Text>
                  </View>
                  {(extractedData as any).persona.nombre_apellido && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📛 {(extractedData as any).persona.nombre_apellido}</Text>
                  )}
                  {(extractedData as any).persona.telefono && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📱 {(extractedData as any).persona.telefono}</Text>
                  )}
                  {(extractedData as any).persona.rol && (
                    <Text style={[styles.dataText, { color: colors.text }]}>👤 Rol: {(extractedData as any).persona.rol}</Text>
                  )}
                  {(extractedData as any).persona.ubicacion && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📍 {(extractedData as any).persona.ubicacion}</Text>
                  )}
                </View>
              )}

              {(extractedData as any).campo && (
                <View style={styles.dataSection}>
                  <View style={styles.dataSectionHeader}>
                    <Ionicons name="leaf" size={16} color={colors.primary} />
                    <Text style={[styles.dataSectionTitle, { color: '#4CAF50' }]}>Campo</Text>
                  </View>
                  {(extractedData as any).campo.superficie_ha && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📏 {(extractedData as any).campo.superficie_ha} ha</Text>
                  )}
                  {(extractedData as any).campo.tipo && (
                    <Text style={[styles.dataText, { color: colors.text }]}>🌾 Tipo: {(extractedData as any).campo.tipo}</Text>
                  )}
                  {(extractedData as any).campo.ubicacion_exacta && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📍 {(extractedData as any).campo.ubicacion_exacta}</Text>
                  )}
                  {(extractedData as any).campo.precio && (
                    <Text style={[styles.dataText, { color: colors.success }]}>💰 ${(extractedData as any).campo.precio.toLocaleString()}</Text>
                  )}
                </View>
              )}

              {(extractedData as any).oportunidad && (
                <View style={styles.dataSection}>
                  <View style={styles.dataSectionHeader}>
                    <Ionicons name="briefcase" size={16} color={colors.primary} />
                    <Text style={[styles.dataSectionTitle, { color: '#4CAF50' }]}>Oportunidad</Text>
                  </View>
                  {(extractedData as any).oportunidad.tipo && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📋 Tipo: {(extractedData as any).oportunidad.tipo}</Text>
                  )}
                  {(extractedData as any).oportunidad.monto && (
                    <Text style={[styles.dataText, { color: colors.success }]}>💵 {(extractedData as any).oportunidad.moneda || 'USD'} {(extractedData as any).oportunidad.monto.toLocaleString()}</Text>
                  )}
                  {(extractedData as any).oportunidad.zona && (
                    <Text style={[styles.dataText, { color: colors.text }]}>🗺️ Zona: {(extractedData as any).oportunidad.zona}</Text>
                  )}
                  {(extractedData as any).oportunidad.requisitos && (
                    <Text style={[styles.dataText, { color: colors.text }]}>📝 Requisitos: {(extractedData as any).oportunidad.requisitos}</Text>
                  )}
                </View>
              )}

              <View style={styles.dataCardButtons}>
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                  onPress={() => {
                    setAudioUri(null);
                    setTranscription(null);
                    setExtractedData(null);
                    setHasUsefulData(false);
                    setShowSuccess(false);
                    setError(null);
                  }}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    setIsSaving(true);
                    try {
                      const result = await saveProducerData(extractedData);
                      
                      if (result.status === 'SUCCESS') {
                        setShowSuccess(true);
                      } else if (result.status === 'NEEDS_SELECTION') {
                        setCandidates(result.candidates);
                        setSelectedCandidateId(null);
                        setShowSelectionModal(true);
                      } else if (result.status === 'ERROR_NO_PHONE') {
                        Alert.alert(
                          'Error',
                          'No se mencionó el teléfono y el productor no existe. Por favor grabe de nuevo incluyendo el número.'
                        );
                      }
                    } catch (saveError: any) {
                      setError(saveError.message || 'Error al guardar');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Confirmar y Guardar</Text>
                  )}
                </TouchableOpacity>
              </View>
              </View>
            </View>
          )}
        </ScrollView>

        <Modal
          visible={showSelectionModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSelectionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Se encontraron coincidencias. ¿Es alguno de estos productores?
              </Text>
              
              <FlatList
                data={candidates}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.candidateItem,
                      { borderColor: colors.border },
                      selectedCandidateId === item.id && { backgroundColor: colors.primary + '20' }
                    ]}
                    onPress={() => setSelectedCandidateId(item.id)}
                  >
                    <View style={styles.candidateInfo}>
                      <Text style={[styles.candidateName, { color: colors.text }]}>
                        {item.nombre_apellido}
                      </Text>
                      {item.telefono && (
                        <Text style={[styles.candidatePhone, { color: colors.textSecondary }]}>
                          📱 {item.telefono}
                        </Text>
                      )}
                      {item.ubicacion && (
                        <Text style={[styles.candidateLocation, { color: colors.textSecondary }]}>
                          📍 {item.ubicacion}
                        </Text>
                      )}
                    </View>
                    {selectedCandidateId === item.id && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                style={styles.candidateList}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                  onPress={() => setShowSelectionModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.modalConfirmButton,
                    { backgroundColor: selectedCandidateId ? colors.primary : colors.textLight }
                  ]}
                  disabled={!selectedCandidateId}
                  onPress={async () => {
                    if (selectedCandidateId) {
                      setShowSelectionModal(false);
                      setIsSaving(true);
                      try {
                        const result = await saveDataWithSelectedPerson(selectedCandidateId, extractedData);
                        if (result.status === 'SUCCESS') {
                          setShowSuccess(true);
                        }
                      } catch (saveError: any) {
                        setError(saveError.message || 'Error al guardar');
                      } finally {
                        setIsSaving(false);
                      }
                    }
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showSearchModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSearchModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Resultados de búsqueda ({searchResults.length})
              </Text>
              
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const person = item.personas;
                  const field = item.campos;
                  const profile = item.profiles;
                  const userColor = profile?.hex_color || colors.primary;
                  
                  return (
                    <View style={[styles.searchResultCard, { borderLeftColor: userColor }]}>
                      <View style={styles.searchResultHeader}>
                        <Text style={styles.searchResultTitle}>
                          {field?.ubicacion_exacta || 'Sin ubicación'}
                        </Text>
                        {field?.superficie_ha && (
                          <Text style={styles.searchResultHa}>{field.superficie_ha} ha</Text>
                        )}
                      </View>
                      {item.price_per_ha && (
                        <Text style={[styles.searchResultPrice, { color: userColor }]}>
                          USD {item.price_per_ha.toLocaleString()}/ha
                        </Text>
                      )}
                      {person?.nombre_apellido && (
                        <Text style={styles.searchResultPerson}>{person.nombre_apellido}</Text>
                      )}
                      <TouchableOpacity
                        style={[styles.viewOnMapButton, { backgroundColor: userColor }]}
                        onPress={() => {
                          setShowSearchModal(false);
                          navigation.navigate('mapa', { campo: field });
                        }}
                      >
                        <Text style={styles.viewOnMapText}>Ver en Mapa</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.noResultsText}>No encontré campos con esos requisitos</Text>
                }
              />
              
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: colors.border, marginTop: 16 }]}
                onPress={() => setShowMatchModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showMatchModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowMatchModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Cruces Comerciales
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Para: {currentReference?.campos?.ubicacion_exacta || currentReference?.zona || 'campo de referencia'}
              </Text>
              
              <FlatList
                data={matchResults}
                keyExtractor={(item, index) => `${item.opportunity.id}-${index}`}
                renderItem={({ item }) => {
                  const opp = item.opportunity;
                  const person = opp.personas;
                  const userColor = opp.profiles?.hex_color || colors.primary;
                  
                  return (
                    <View style={[styles.matchCard, { borderLeftColor: userColor }]}>
                      <Text style={styles.matchName}>{person?.nombre_apellido || 'Sin nombre'}</Text>
                      <Text style={styles.matchInfo}>{person?.ubicacion || 'Sin ubicación'}</Text>
                      <Text style={styles.matchInfo}>{matchResults.find(m => m.opportunity.id === opp.id)?.matchReason || 'Compatible'}</Text>
                      {person?.telefono && (
                        <Text style={styles.matchPhone}>{person.telefono}</Text>
                      )}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.noResultsText}>No hay cruces compatibles</Text>
                }
              />
              
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: colors.border, marginTop: 16 }]}
                onPress={() => setShowMatchModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showDisambigModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowDisambigModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Seleccioná la referencia
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary, marginBottom: 16 }]}>
                {disambiguationPersonName} tiene múltiples oportunidades. ¿Cuál querés usar?
              </Text>
              
              <FlatList
                data={disambiguationOpps}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const location = item.campos?.ubicacion_exacta || item.zona || 'Sin ubicación';
                  const superficie = item.campos?.superficie_ha ? `${item.campos.superficie_ha}ha` : '';
                  const tipo = item.tipo;
                  
                  return (
                    <TouchableOpacity
                      style={[styles.disambigItem, { backgroundColor: colors.card }]}
                      onPress={() => handleDisambigSelect(item)}
                    >
                      <View style={styles.disambigItemContent}>
                        <Text style={[styles.disambigType, { color: tipo === 'Venta' ? colors.error : colors.primary }]}>
                          {tipo}
                        </Text>
                        <Text style={[styles.disambigLocation, { color: colors.text }]}>
                          {location}
                        </Text>
                        {superficie && (
                          <Text style={[styles.disambigHa, { color: colors.textSecondary }]}>
                            {superficie}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.noResultsText}>No hay oportunidades</Text>
                }
              />
              
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: colors.border, marginTop: 16 }]}
                onPress={() => setShowDisambigModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 100,
    alignItems: 'center',
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  signOutButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 4,
    borderColor: '#2E7D32',
  },
  recordButtonActive: {
    borderColor: '#E53935',
    transform: [{ scale: 1.05 }],
  },
  recordButtonInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonInnerActive: {
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  buttonLabel: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginBottom: 20,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  statusText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  successContainer: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
    borderWidth: 2,
  },
  successText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  newRecordingButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  newRecordingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    borderWidth: 1,
  },
  errorText: {
    marginLeft: 12,
    fontSize: 14,
    flex: 1,
  },
  infoContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
    borderWidth: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoText: {
    fontSize: 15,
    lineHeight: 22,
  },
  infoCode: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  transcriptionContainer: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  transcriptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  transcriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  dataCard: {
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    flexDirection: 'row',
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dataCardBorder: {
    width: 6,
  },
  dataCardContent: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000000',
  },
  dataCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#FFFFFF',
  },
  dataSection: {
    marginBottom: 16,
  },
  dataSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dataSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  dataText: {
    fontSize: 14,
    marginBottom: 4,
    paddingLeft: 4,
    color: '#FFFFFF',
  },
  dataCardButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  candidateList: {
    maxHeight: 300,
  },
  candidateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  candidatePhone: {
    fontSize: 14,
    marginBottom: 2,
  },
  candidateLocation: {
    fontSize: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    borderWidth: 1,
  },
  modalConfirmButton: {
    paddingVertical: 14,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchResultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchResultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  searchResultHa: {
    fontSize: 14,
    color: '#666666',
  },
  searchResultPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  searchResultPerson: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  viewOnMapButton: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewOnMapText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  noResultsText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666666',
    marginTop: 20,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  matchName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  matchInfo: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
  matchPhone: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 8,
    fontWeight: '500',
  },
  disambigItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  disambigItemContent: {
    flex: 1,
  },
  disambigType: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  disambigLocation: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  disambigHa: {
    fontSize: 14,
    color: '#666666',
    marginTop: 2,
  },
});

function hexToRgba(hex: string, alpha: number): string {
  try {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return 'rgba(255,255,255,1)';
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255,255,255,1)';
    return `rgba(${r},${g},${b},${alpha})`;
  } catch (e) {
    return 'rgba(255,255,255,1)';
  }
}