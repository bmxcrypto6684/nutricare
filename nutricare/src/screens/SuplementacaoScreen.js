/**
 * NutriCare — Suplementação Screen
 * Exibe recomendações de suplementos baseadas no perfil do usuário
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';
import { gerarSuplementos } from '../services/aiService';

export default function SuplementacaoScreen({ route, navigation }) {
  const { userData, plano } = route.params;
  const suplementos = gerarSuplementos(userData);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suplementação</Text>
        <Text style={styles.headerSub}>
          {suplementos.length > 0
            ? 'Recomendações com base no seu perfil'
            : 'Sua alimentação pode suprir todas as necessidades'}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suplementos.length > 0 ? (
          <>
            <Text style={styles.disclaimer}>
              Consulte um médico ou nutricionista antes de iniciar qualquer suplementação.
            </Text>

            {suplementos.map((sup, idx) => (
              <View key={idx} style={styles.supplementCard}>
                <View style={styles.supplementIconBox}>
                  <Text style={styles.supplementIcon}>{sup.icon}</Text>
                </View>
                <View style={styles.supplementInfo}>
                  <Text style={styles.supplementName}>{sup.name}</Text>
                  <Text style={styles.supplementReason}>{sup.reason}</Text>
                  <View style={styles.dosageBadge}>
                    <Text style={styles.dosageText}>{sup.dosage}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>Sem necessidade no momento</Text>
            <Text style={styles.emptyText}>
              Sua alimentação pode suprir todas as necessidades nutricionais.
              Foco em variedade e qualidade dos alimentos!
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="🥗 Ver plano alimentar"
            variant="primary"
            onPress={() => navigation.navigate('PlanoAlimentar', { userData, plano })}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  disclaimer: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 18,
  },
  supplementCard: {
    flexDirection: 'row',
    gap: 16,
    padding: 18,
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  supplementIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplementIcon: {
    fontSize: 24,
  },
  supplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  supplementReason: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  dosageBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: Colors.primaryBg,
    borderRadius: 12,
  },
  dosageText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    marginTop: 24,
  },
});
