/**
 * NutriCare - ProgressBar Component
 * Barra de progresso animada para a anamnese multi-step
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '../utils/colors';

export default function ProgressBar({ current, total }) {
  const progress = total > 0 ? current / total : 0;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.label}>
        Passo {Math.min(current + 1, total)} de {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  track: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'right',
  },
});
