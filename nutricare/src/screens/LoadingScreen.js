/**
 * NutriCare - Loading / Analysis Screen
 * Simula análise dos dados e geração do plano com IA
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../utils/colors';
import { gerarPlanoSincrono } from '../services/aiService';

const STEPS = [
  'Analisando seus hábitos alimentares...',
  'Identificando padrões nutricionais...',
  'Calculando necessidades calóricas...',
  'Cruzando dados com seu objetivo...',
  'Gerando plano personalizado...',
];

export default function LoadingScreen({ route, navigation }) {
  const { userData } = route.params;
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Anima os passos da análise
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= STEPS.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
      setProgress((prev) => Math.min(prev + 0.22, 1));
    }, 500);

    // Processa os dados e navega para o plano
    const timer = setTimeout(() => {
      clearInterval(stepInterval);
      setProgress(1);

      // Gera o plano usando a IA local (síncrona)
      const plano = gerarPlanoSincrono(userData);

      setTimeout(() => {
        navigation.replace('PlanoAlimentar', { userData, plano });
      }, 300);
    }, 2000);

    return () => {
      clearInterval(stepInterval);
      clearTimeout(timer);
    };
  }, []);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F0FFF4', '#DCFCE7']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Spinner */}
          <View style={styles.spinnerArea}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>

          {/* Status */}
          <Text style={styles.title}>Analisando seu perfil...</Text>
          <Text style={styles.stepText}>{STEPS[currentStep]}</Text>

          {/* Barra de progresso */}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>

          {/* Steps visuais */}
          <View style={styles.stepsList}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepDot,
                    i < currentStep && styles.stepDone,
                    i === currentStep && styles.stepActive,
                  ]}
                />
                <Text
                  style={[
                    styles.stepLabel,
                    i <= currentStep && styles.stepLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {s}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  spinnerArea: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  stepText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  track: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 32,
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  stepsList: {
    width: '100%',
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.borderLight,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  stepActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  stepDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  stepLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
  },
  stepLabelActive: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
});
