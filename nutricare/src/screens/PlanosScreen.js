/**
 * NutriCare — Planos Screen
 * Exibe os planos Básico (grátis) e Premium com tabela comparativa
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

const PLANS = [
  {
    badge: 'Básico',
    value: 'Grátis',
    recommended: false,
    features: [
      { text: 'Consulta única online', included: true },
      { text: 'Plano alimentar personalizado', included: true },
      { text: 'Recomendações gerais', included: true },
      { text: 'Acompanhamento contínuo', included: false },
      { text: 'Ajustes periódicos', included: false },
    ],
    action: 'ir_anamnese',
  },
  {
    badge: 'Recomendado',
    value: 'Premium',
    recommended: true,
    features: [
      { text: 'Consulta completa', included: true },
      { text: 'Plano alimentar personalizado', included: true },
      { text: 'Retorno para ajustes', included: true },
      { text: 'Acompanhamento contínuo', included: true },
      { text: 'Suporte por chat', included: true },
    ],
    action: 'falar_contato',
  },
];

export default function PlanosScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Voltar</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Nossos planos</Text>
        <Text style={styles.subtitle}>
          Escolha a opção ideal para sua jornada nutricional.
        </Text>

        <View style={styles.plansContainer}>
          {PLANS.map((plan, idx) => (
            <View
              key={idx}
              style={[styles.planCard, plan.recommended && styles.planCardRecommended]}
            >
              <View
                style={[
                  styles.planBadge,
                  plan.recommended && styles.planBadgeRecommended,
                ]}
              >
                <Text
                  style={[
                    styles.planBadgeText,
                    plan.recommended && styles.planBadgeTextRecommended,
                  ]}
                >
                  {plan.badge}
                </Text>
              </View>

              <Text style={[styles.planValue, plan.recommended && styles.planValueRecommended]}>
                {plan.value}
              </Text>

              <View style={styles.featuresList}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Text style={[styles.featureIcon, f.included ? styles.featureIncluded : styles.featureExcluded]}>
                      {f.included ? '✔' : '✘'}
                    </Text>
                    <Text style={[styles.featureText, !f.included && styles.featureTextExcluded]}>
                      {f.text}
                    </Text>
                  </View>
                ))}
              </View>

              <Button
                title={plan.recommended ? 'Falar com nutricionista' : 'Começar grátis'}
                variant={plan.recommended ? 'primary' : 'outline'}
                onPress={() => {
                  if (plan.action === 'ir_anamnese') {
                    navigation.navigate('Anamnese', { step: 0 });
                  } else {
                    navigation.navigate('Contato');
                  }
                }}
                style={{ marginTop: 8 }}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backBtn: {
    padding: 24,
    paddingBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 28,
    lineHeight: 22,
  },
  plansContainer: {
    gap: 20,
  },
  planCard: {
    padding: 24,
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  planCardRecommended: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: Colors.background,
    borderRadius: 16,
    marginBottom: 16,
  },
  planBadgeRecommended: {
    backgroundColor: Colors.primary,
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  planBadgeTextRecommended: {
    color: Colors.white,
  },
  planValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  planValueRecommended: {
    color: Colors.primaryDark,
  },
  featuresList: {
    gap: 12,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIcon: {
    fontSize: 14,
    fontWeight: '700',
    width: 20,
  },
  featureIncluded: {
    color: Colors.primary,
  },
  featureExcluded: {
    color: Colors.textMuted,
  },
  featureText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  featureTextExcluded: {
    color: Colors.textMuted,
  },
});
