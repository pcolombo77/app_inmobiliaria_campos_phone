import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type RootStackParamList = {
  mapa: { campo?: any };
};

interface LocationCoords {
  latitude: number;
  longitude: number;
}

export default function MapaScreen() {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const loadFields = useCallback(async () => {
    try {
      const { data: oportunidades } = await supabase
        .from('oportunidades')
        .select('id, id_campo, tipo')
        .eq('tipo', 'Venta');

      const CampoIds = oportunidades?.map(o => o.id_campo).filter(Boolean) || [];
      
      const { data: campos } = await supabase
        .from('campos')
        .select('*')
        .in('id', CampoIds)
        .order('created_at', { ascending: false });

      const fieldsWithPersonas = await Promise.all(
        (campos || []).map(async (campo: any) => {
          let personas = null;
          if (campo.id_persona) {
            const { data: p } = await supabase
              .from('personas')
              .select('*')
              .eq('id', campo.id_persona)
              .maybeSingle();
            personas = p;
          }
          return { ...campo, personas };
        })
      );

      setFields(fieldsWithPersonas);
    } catch (error) {
      console.error('Error loading fields:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Cargando campos...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mapa</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {fields.length} {fields.length === 1 ? 'campo registrado' : 'campos registrados'}
        </Text>
      </View>

      <ScrollView style={styles.listContainer}>
        <Text style={[styles.listTitle, { color: colors.text }]}>
          {fields.length} campos en el sistema
        </Text>
        {fields.map((field, index) => (
          <View 
            key={field.id || index} 
            style={[styles.listItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.listItemIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="leaf" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.listItemContent}>
              <Text style={[styles.listItemTitle, { color: colors.text }]}>
                {field.tipo || 'Campo'}
              </Text>
              {field.superficie_ha && (
                <Text style={[styles.listItemText, { color: colors.textSecondary }]}>
                  {field.superficie_ha} ha
                </Text>
              )}
              {field.ubicacion_exacta && (
                <Text style={[styles.listItemText, { color: colors.textSecondary }]}>
                  {field.ubicacion_exacta}
                </Text>
              )}
              {field.personas?.nombre_apellido && (
                <Text style={[styles.listItemText, { color: colors.primary }]}>
                  {field.personas.nombre_apellido}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
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
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
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
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  listItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  listItemText: {
    fontSize: 14,
    marginTop: 2,
  },
});