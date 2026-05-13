/**
 * NutriCare - Estratégias Screen
 * Dicas personalizadas geradas pela IA
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';

export default function EstrategiasScreen({ route, navigation }) {
  const { userData, plano } = route.params;
  const estrategias = plano?.estrategias || [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Estratégias</Text>
        <Text style={styles.headerSub}>
          Dicas personalizadas para o seu dia a dia
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Estratégias da IA */}
        {estrategias.length > 0 ? (
          estrategias.map((est, i) => (
            <View key={i} style={styles.tipCard}>
              <View style={styles.tipIconBox}>
                <Text style={styles.tipIcon}>
                  {['📦', '🍽️', '🥤', '🔄', '🧘', '😴', '🚶'][i % 7]}
                </Text>
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>
                  {['Organização semanal', 'Comer com atenção', 'Hidratação',
                    'Consistência > Perfeição', 'Fome emocional',
                    'Higiene do sono', 'Comece leve'][i % 7]}
                </Text>
                <Text style={styles.tipText}>{est}</Text>
              </View>
            </View>
          ))
        ) : (
          // Fallback com dicas genéricas personalizadas
          <>
            <TipCard
              icon="📦"
              title="Organização semanal"
              text="Reserve 1h no domingo para planejar marmitas. É o segredo de quem mantém uma alimentação saudável."
            />
            <TipCard
              icon="🍽️"
              title="Coma com atenção"
              text="Sem TV ou celular. Mastigue bem cada garfada — uma refeição deve durar 15-20 minutos."
            />
            <TipCard
              icon="🥤"
              title="Hidratação"
              text="Tome 35ml de água por kg de peso. Deixe uma garrafa sempre à vista."
            />
            <TipCard
              icon="🔄"
              title="Consistência > Perfeição"
              text="80% de acerto já traz resultados. Não se cobre perfeição."
            />
            {userData?.sleep === 'ruim' && (
              <TipCard
                icon="😴"
                title="Higiene do sono"
                text="Desligue telas 1h antes de dormir. Sono de qualidade regula hormônios da fome."
              />
            )}
            {userData?.activity === 'sedentario' && (
              <TipCard
                icon="🚶"
                title="Comece leve"
                text="20 min de caminhada diária já ativam o metabolismo. O importante é começar."
              />
            )}
          </>
        )}

        {/* Ações */}
        <View style={styles.actions}>
          <Button
            title="🥗 Ver plano alimentar"
            variant="primary"
            onPress={() => navigation.navigate('PlanoAlimentar', { userData, plano })}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="💊 Suplementação"
            variant="outline"
            onPress={() => navigation.navigate('Suplementacao', { userData, plano })}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="📊 Acompanhamento"
            variant="outline"
            onPress={() => navigation.navigate('Acompanhamento', { userData, plano })}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TipCard({ icon, title, text }) {
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIconBox}>
        <Text style={styles.tipIcon}>{icon}</Text>
      </View>
      <View style={styles.tipContent}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 16, color: Colors.textMuted, fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  tipCard: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  tipIconBox: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipIcon: { fontSize: 22 },
  tipContent: { flex: 1 },
  tipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actions: { marginTop: 20 },
});
