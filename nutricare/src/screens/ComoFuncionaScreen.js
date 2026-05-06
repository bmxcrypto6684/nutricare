/**
 * NutriCare - Como Funciona Screen
 * Explica as 4 etapas do processo
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

const STEPS = [
  {
    num: '1',
    title: 'Anamnese',
    desc: 'Responda perguntas sobre seus objetivos, rotina, alimentação e saúde.',
  },
  {
    num: '2',
    title: 'Avaliação com IA',
    desc: 'Nossa inteligência artificial analisa seus dados e identifica padrões.',
  },
  {
    num: '3',
    title: 'Plano Personalizado',
    desc: 'Receba um plano alimentar completo com refeições, substituições e dicas.',
  },
  {
    num: '4',
    title: 'Acompanhamento',
    desc: 'Agende retornos, tire dúvidas e atualize seu progresso regularmente.',
  },
];

export default function ComoFuncionaScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Voltar</Text>
      </TouchableOpacity>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Como funciona</Text>
        <Text style={styles.subtitle}>
          Você responde algumas perguntas e recebe um plano completo em minutos.
        </Text>

        <View style={styles.stepsContainer}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNumBox}>
                <Text style={styles.stepNum}>{step.num}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Button
          title="Quero começar"
          variant="primary"
          onPress={() => navigation.navigate('Anamnese', { step: 0 })}
          style={{ marginTop: 24 }}
          icon="🚀"
        />
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
    paddingHorizontal: 24,
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
    lineHeight: 22,
    marginBottom: 28,
  },
  stepsContainer: {
    gap: 16,
  },
  step: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 14,
    alignItems: 'flex-start',
  },
  stepNumBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  stepContent: { flex: 1 },
  stepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
