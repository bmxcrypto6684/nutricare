/**
 * NutriCare - Onboarding Screen
 * Tela inicial com nome do app e CTA principal
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '../utils/colors';
import Button from '../components/Button';

export default function OnboardingScreen({ navigation }) {
  return (
    <LinearGradient
      colors={['#22C55E', '#16A34A', '#15803D']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Logo Area */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🥗</Text>
            </View>
            <Text style={styles.appName}>NutriCare</Text>
            <Text style={styles.tagline}>
              Sua nutrição personalizada com inteligência artificial
            </Text>
          </View>

          {/* CTA Area */}
          <View style={styles.ctaArea}>
            <Button
              title="Iniciar consulta"
              variant="secondary"
              onPress={() => navigation.navigate('Anamnese', { step: 0 })}
              style={styles.primaryBtn}
              icon="🚀"
            />

            <Button
              title="Como funciona"
              variant="outline"
              onPress={() => navigation.navigate('ComoFunciona')}
              textStyle={{ color: Colors.white }}
              style={styles.outlineBtn}
            />

            <Button
              title="Ver planos"
              variant="outline"
              onPress={() => navigation.navigate('Planos')}
              textStyle={{ color: Colors.white }}
              style={styles.outlineBtn}
            />
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Ao continuar, você concorda com nossos Termos de Uso.
        </Text>
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
    paddingHorizontal: 32,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoEmoji: { fontSize: 40 },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 24,
  },
  ctaArea: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 18,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  outlineBtn: {
    borderColor: 'rgba(255,255,255,0.4)',
    borderWidth: 2,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
});
