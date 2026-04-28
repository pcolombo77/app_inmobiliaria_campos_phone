import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, SafeAreaView, TouchableOpacity, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

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

interface Opportunity {
  id: string;
  numero: number;
  tipo: string;
  price_per_ha?: number;
  total_budget?: number;
  moneda?: string;
  zona?: string;
  requisitos?: string;
  estado?: string;
  rating?: number;
  availability?: string;
  created_at: string;
  id_persona?: string;
  id_campo?: string;
  user_id?: string;
  personas?: any;
  campos?: any;
  profiles?: any;
}

const AVAILABILITY_OPTIONS = ['Disponible', 'Reservado', 'Vendido'];

const updateOpportunity = useCallback(async (id: string, updates: Partial<Opportunity>): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('oportunidades')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating opportunity:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error:', error);
    return false;
  }
}, []);

export default function DirectorioScreen() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isSearchResults, setIsSearchResults] = useState(false);
  const [isMatchedResults, setIsMatchedResults] = useState(false);
  const [referenceOpp, setReferenceOpp] = useState<any>(null);
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const fetchOpportunities = useCallback(async () => {
    console.log('Fetching oportunidades...');
    try {
      const { data, error } = await supabase
        .from('oportunidades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching oportunidades:', error);
        setOpportunities([]);
        setLoading(false);
        return;
      }

      console.log('Fetched oportunidades count:', data?.length || 0);

      const withRelations = await Promise.all((data || []).map(async (opp: any) => {
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

      console.log('Opportunities with relations:', withRelations.length);
      setOpportunities(withRelations || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching:', error);
      setOpportunities([]);
      setLoading(false);
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleRatingChange = useCallback(async (id: string, newRating: number) => {
    const success = await updateOpportunity(id, { rating: newRating });
    if (success) {
      setOpportunities(prev => prev.map(opp => 
        opp.id === id ? { ...opp, rating: newRating } : opp
      ));
    }
  }, []);

  const handleStatusChange = useCallback(async (id: string, newAvailability: string) => {
    const success = await updateOpportunity(id, { availability: newAvailability });
    if (success) {
      setOpportunities(prev => prev.map(opp => 
        opp.id === id ? { ...opp, availability: newAvailability } : opp
      ));
    }
  }, []);

  const handleViewOnMap = useCallback((item: Opportunity) => {
    if (item.campos?.ubicacion_exacta) {
      navigation.navigate('Map', { 
        initialLocation: item.campos.ubicacion_exacta,
        oportunidad: item 
      });
    }
  }, [navigation]);

  const clearMatchedFilter = useCallback(() => {
    setIsMatchedResults(false);
setReferenceOpp(null);
    fetchOpportunities();
  }, [fetchOpportunities]);
  
  useEffect(() => {
    console.log('Directory useEffect triggered:', {
      hasMatchedIds: !!route.params?.matchedIds,
      hasMatchedOpp: !!route.params?.matchedOpportunities,
      hasSearchResults: !!route.params?.searchResults,
      searchResultsLength: route.params?.searchResults?.length,
      personFilter: route.params?.personFilter
    });
    
    if (route.params?.matchedIds && route.params?.matchedOpportunities) {
      console.log('Setting matched opportunities:', route.params.matchedOpportunities.length);
      setOpportunities(route.params.matchedOpportunities);
      setReferenceOpp(route.params.referenceOpp);
      setLoading(false);
      setIsMatchedResults(true);
    } else if (route.params?.searchResults && route.params.searchResults.length > 0) {
      console.log('Setting filtered results:', route.params.searchResults.length);
      setOpportunities(route.params.searchResults);
      setLoading(false);
      setIsSearchResults(true);
    } else {
      console.log('No params, loading all opportunities');
      fetchOpportunities();
    }
  }, [route.params, fetchOpportunities]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (isSearchResults || isMatchedResults) {
      if (route.params?.matchedOpportunities) {
        setOpportunities(route.params.matchedOpportunities);
      } else if (route.params?.searchResults) {
        setOpportunities(route.params.searchResults);
      }
      setRefreshing(false);
      return;
    }
    fetchOpportunities();
  }, [isSearchResults, isMatchedResults, route.params, fetchOpportunities]);

  const formatPrice = (price?: number, moneda?: string) => {
    if (!price) return null;
    return `${moneda || 'USD'} ${price.toLocaleString()}`;
  };

  const getPriceDisplay = (item: Opportunity) => {
    if (item.tipo === 'Venta' && item.price_per_ha) {
      return `${formatPrice(item.price_per_ha, item.moneda)}/ha`;
    }
    if (item.tipo === 'Compra' && item.total_budget) {
      return `Presupuesto: ${formatPrice(item.total_budget, item.moneda)}`;
    }
    if (item.campos?.precio) {
      return formatPrice(item.campos.precio, item.moneda);
    }
    return null;
  };

  const getTotalValue = (item: Opportunity) => {
    if (item.tipo === 'Venta' && item.price_per_ha && item.campos?.superficie_ha) {
      const total = item.price_per_ha * item.campos.superficie_ha;
      return formatPrice(total, item.moneda);
    }
    return null;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const renderItem = ({ item }: { item: Opportunity }) => {
    const person = item.personas;
    const field = item.campos;
    const profile = item.profiles;
    const userColor = profile?.hex_color || colors.primary;
    const badgeBg = hexToRgba(userColor, 0.15);
    const isExpanded = expandedIds.has(item.id);
    const rating = item.rating || 0;
    const availability = item.availability || 'Disponible';

    const renderStars = (currentRating: number, editable: boolean = false, onChange?: (r: number) => void) => {
      const stars = [];
      for (let i = 1; i <= 5; i++) {
        const starName = i <= currentRating ? 'star' : 'star-outline';
        if (editable) {
          stars.push(
            <TouchableOpacity key={i} onPress={() => onChange?.(i)}>
              <Ionicons name={starName as any} size={20} color={userColor} />
            </TouchableOpacity>
          );
        } else {
          stars.push(
            <Ionicons key={i} name={starName as any} size={16} color={userColor} />
          );
        }
      }
      return <View style={styles.starsRow}>{stars}</View>;
    };

    return (
      <Pressable onPress={() => toggleExpanded(item.id)} style={styles.card}>
        <View style={[styles.colorBorder, { backgroundColor: userColor }]} />
        <View style={styles.cardContent}>
          {!isExpanded ? (
            <>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryInfo}>
                  <View style={styles.summaryTypeRow}>
                    {item.tipo && (
                      <View style={[styles.summaryTypeBadge, { backgroundColor: item.tipo === 'Venta' ? colors.error + '20' : userColor + '20' }]}>
                        <Text style={[styles.summaryTypeText, { color: item.tipo === 'Venta' ? colors.error : userColor }]}>
                          {item.tipo}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.fieldName, { color: '#000000' }]}>
                    {item.tipo === 'Compra'
                      ? (item.total_budget ? `Busca en ${item.zona || 'Argentina'}: ${formatPrice(item.total_budget, item.moneda)}` : 'Busca campo')
                      : (person?.nombre_apellido && field?.ubicacion_exacta ? `${person.nombre_apellido} - ${field.ubicacion_exacta}` : field?.ubicacion_exacta || person?.nombre_apellido || 'Sin campo')}
                  </Text>
                  <View style={styles.summaryRow}>
                    {field?.superficie_ha && (
                      <Text style={[styles.summaryHa, { color: colors.textSecondary }]}>
                        {field.superficie_ha} ha
                      </Text>
                    )}
                    {renderStars(rating)}
                  </View>
                </View>
                <View style={styles.summaryPrice}>
                  <Text style={[styles.price, { color: userColor }]}>
                    {getPriceDisplay(item)}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <View style={[
                    styles.typeBadge, 
                    { backgroundColor: item.tipo === 'Venta' ? colors.error + '20' : userColor + '20' }
                  ]}>
                    <Ionicons 
                      name={item.tipo === 'Venta' ? 'trending-down' : 'trending-up'} 
                      size={14} 
                      color={item.tipo === 'Venta' ? colors.error : userColor} 
                    />
                    <Text style={[
                      styles.typeText, 
                      { color: item.tipo === 'Venta' ? colors.error : userColor }
                    ]}>
                      {item.tipo}
                    </Text>
                  </View>
                  <Text style={[styles.opportunityNumber, { color: colors.textLight }]}>#{item.numero}</Text>
                </View>
                {item.estado && (
                  <View style={[styles.estadoBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.estadoText, { color: userColor }]}>{item.estado}</Text>
                  </View>
                )}
              </View>

              <View style={styles.mainInfo}>
                <Text style={[styles.personName, { color: '#000000' }]}>
                  {person?.nombre_apellido ? person.nombre_apellido : 'Sin nombre'}
                </Text>
                {person?.telefono && (
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.actionButtonSmall, { backgroundColor: '#25D366' }]}
                      onPress={() => {
                        const phone = person.telefono.replace(/[-\s]/g, '');
                        const url = `whatsapp://send?phone=${phone}`;
                        Linking.openURL(url).catch(() => {
                          const webUrl = `https://wa.me/${phone.replace('+', '')}`;
                          Linking.openURL(webUrl);
                        });
                      }}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonTextSmall}>WhatsApp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButtonSmall, { backgroundColor: userColor }]}
                      onPress={() => {
                        const phone = person.telefono.replace(/[-\s]/g, '');
                        const url = `tel:${phone}`;
                        Linking.openURL(url);
                      }}
                    >
                      <Ionicons name="call" size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonTextSmall}>Llamar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: userColor }]}>
                    {getPriceDisplay(item)}
                  </Text>
                  {field?.superficie_ha && (
                    <Text style={[styles.hectares, { color: colors.textSecondary }]}>
                      {field.superficie_ha} ha
                    </Text>
                  )}
                </View>
                {getTotalValue(item) && (
                  <Text style={[styles.totalValue, { color: colors.textSecondary }]}>
                    Valor total: {getTotalValue(item)}
                  </Text>
                )}
                <View style={styles.quickActionsRow}>
                  <View style={styles.ratingSection}>
                    {renderStars(rating, true, (newRating) => handleRatingChange(item.id, newRating))}
                  </View>
                  {item.tipo === 'Venta' && (
                    <View style={styles.statusButtons}>
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.statusButtonMini,
                            { borderColor: userColor },
                            availability === option && { backgroundColor: userColor }
                          ]}
                          onPress={() => handleStatusChange(item.id, option)}
                        >
                          <Text style={[
                            styles.statusButtonTextMini,
                            { color: availability === option ? '#FFFFFF' : userColor }
                          ]}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.contactSection}>
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={16} color={userColor} />
                  <Text style={[styles.contactText, { color: '#000000' }]}>
                    {person?.telefono || 'Sin teléfono'}
                  </Text>
                </View>
                {person?.email && (
                  <TouchableOpacity 
                    style={styles.contactRow}
                    onPress={() => {
                      const emailUrl = `mailto:${person.email}`;
                      Linking.openURL(emailUrl).catch(err => console.error('Failed to open email:', err));
                    }}
                  >
                    <Ionicons name="mail-outline" size={16} color={userColor} />
                    <Text style={[styles.contactText, { color: userColor }]}>
                      {person.email}
                    </Text>
                  </TouchableOpacity>
                )}
                {person?.ubicacion && (
                  <View style={styles.contactRow}>
                    <Ionicons name="location-outline" size={16} color={userColor} />
                    <Text style={[styles.contactText, { color: '#000000' }]}>
                      {person.ubicacion}
                    </Text>
                  </View>
                )}
              </View>

              {field && (field.superficie_ha || field.ubicacion_exacta || field.tipo || field.precio) ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.fieldSection}>
                    <View style={styles.fieldHeader}>
                      <Ionicons name="leaf" size={16} color={userColor} />
                      <Text style={[styles.fieldTitle, { color: userColor }]}>Información del Campo</Text>
                    </View>
                    <View style={styles.fieldDetails}>
                      {field.superficie_ha && (
                        <View style={styles.fieldDetail}>
                          <Text style={[styles.fieldLabel, { color: '#666666' }]}>Superficie</Text>
                          <Text style={[styles.fieldValue, { color: '#000000' }]}>
                            {typeof field.superficie_ha === 'string' ? field.superficie_ha : field.superficie_ha} ha
                          </Text>
                        </View>
                      )}
                      {field.tipo && (
                        <View style={styles.fieldDetail}>
                          <Text style={[styles.fieldLabel, { color: '#666666' }]}>Tipo</Text>
                          <Text style={[styles.fieldValue, { color: '#000000' }]}>
                            {field.tipo}
                          </Text>
                        </View>
                      )}
                      {field.ubicacion_exacta && (
                        <View style={styles.fieldDetail}>
                          <Text style={[styles.fieldLabel, { color: '#666666' }]}>Ubicación</Text>
                          <Text style={[styles.fieldValue, { color: '#000000' }]} numberOfLines={1}>
                            {field.ubicacion_exacta}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </>
              ) : null}

              {field && (
                <TouchableOpacity 
                  style={[styles.mapButton, { backgroundColor: userColor }]}
                  onPress={() => handleViewOnMap(item)}
                >
                  <Ionicons name="map" size={18} color="#FFFFFF" />
                  <Text style={styles.mapButtonText}>Ver en Mapa</Text>
                </TouchableOpacity>
              )}

              {item.requisitos && (
                <View style={styles.requisitosContainer}>
                  <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.requisitosText, { color: colors.textSecondary }]}>
                    {item.requisitos}
                  </Text>
                </View>
              )}

              {item.zona && (
                <View style={styles.zoneContainer}>
                  <Ionicons name="map-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.zoneText, { color: colors.textSecondary }]}>
                    Zona: {item.zona}
                  </Text>
                </View>
              )}

              <Text style={[styles.dateText, { color: colors.textLight }]}>
                {formatDate(item.created_at)}
              </Text>
              {item.profiles?.full_name && (
                <View style={styles.userInfoContainer}>
                  <Ionicons name="person-outline" size={12} color={colors.textLight} />
                  <Text style={[styles.userInfoText, { color: colors.textLight }]}>
                    {item.profiles.full_name}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={64} color={colors.textLight} />
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay oportunidades</Text>
      <Text style={[styles.emptySubtext, { color: colors.textLight }]}>
        Graba un audio desde la pantalla de inicio
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {isSearchResults && (
          <View style={[styles.filterBanner, { backgroundColor: colors.primary + '15' }]}>
            <View style={styles.filterBannerContent}>
              <Ionicons name="filter" size={14} color={colors.primary} />
              <Text style={[styles.filterBannerText, { color: colors.primary, marginLeft: 6 }]}>
                Filtrado por búsqueda
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                setIsSearchResults(false);
                fetchOpportunities();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
        {isMatchedResults && referenceOpp && (
          <View style={[styles.filterBanner, { backgroundColor: colors.primary + '15' }]}>
            <View style={styles.filterBannerContent}>
              <Ionicons name="git-compare" size={14} color={colors.primary} />
              <Text style={[styles.filterBannerText, { color: colors.primary, marginLeft: 6 }]}>
                Cruces para: {referenceOpp.tipo} en {referenceOpp.campos?.ubicacion_exacta || referenceOpp.zona || 'referencia'}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={clearMatchedFilter}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isSearchResults || isMatchedResults ? 'Resultados' : 'Directorio'}
          </Text>
        </View>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {opportunities.length} {opportunities.length === 1 ? 'oportunidad' : 'oportunidades'}
        </Text>
      </View>
      
      <FlatList
        data={opportunities}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
matchedBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchedBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  filterBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  filterBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  colorBorder: {
    width: 6,
    borderRadius: 16,
  },
  cardContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  opportunityNumber: {
    fontSize: 12,
  },
  estadoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  estadoText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mainInfo: {
    marginBottom: 8,
  },
  personName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  hectares: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 13,
    marginTop: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  summaryTypeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  summaryTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  summaryTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryPrice: {
    alignItems: 'flex-end',
  },
  summaryHa: {
    fontSize: 14,
  },
  fieldName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusSection: {
    marginTop: 12,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusButtonMini: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusButtonTextMini: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  contactSection: {
    gap: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
  },
  actionButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextSmall: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 14,
  },
  fieldSection: {
    gap: 8,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  fieldDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  fieldDetail: {
    minWidth: 80,
  },
  fieldLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  requisitosContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  requisitosText: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
  },
  zoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  zoneText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  dateText: {
    fontSize: 11,
    marginTop: 12,
    textAlign: 'right',
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  userInfoText: {
    fontSize: 11,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});