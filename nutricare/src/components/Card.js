/**
 * NutriCare - Card Component
 * Container estilizado com sombra e MealCard expansível
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Colors from '../utils/colors';

export default function Card({ children, title, icon, style, padding = 16, bordered = false }) {
  return (
    <View style={[styles.card, { padding }, bordered && styles.bordered, style]}>
      {(title || icon) && (
        <View style={styles.header}>
          {icon && <Text style={styles.icon}>{icon}</Text>}
          {title && <Text style={styles.title}>{title}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

export function MealCard({ icon, name, time, description, subs }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <View style={styles.mealHeaderLeft}>
          <View style={styles.mealIcon}>
            <Text style={styles.mealIconText}>{icon}</Text>
          </View>
          <View>
            <Text style={styles.mealName}>{name}</Text>
            <Text style={styles.mealTime}>{time}</Text>
          </View>
        </View>
      </View>

      <View style={styles.mealBody}>
        <Text style={styles.mealDescription}>{description}</Text>
        {subs && (
          <TouchableOpacity style={styles.subsToggle} onPress={() => setExpanded(!expanded)}>
            <Text style={styles.subsToggleText}>
              {expanded ? '🔼 Ocultar' : '🔄 Ver substituições'}
            </Text>
          </TouchableOpacity>
        )}
        {expanded && subs && (
          <View style={styles.subsBox}>
            <Text style={styles.subsLabel}>Substituições inteligentes</Text>
            <Text style={styles.subsText}>{subs}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  bordered: {
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  icon: { fontSize: 20 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  mealCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  mealHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealIcon: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealIconText: { fontSize: 20 },
  mealName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  mealTime: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  mealBody: { paddingHorizontal: 16, paddingBottom: 16 },
  mealDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  subsToggle: { marginTop: 12, paddingVertical: 8 },
  subsToggleText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  subsBox: {
    marginTop: 8,
    padding: 14,
    backgroundColor: Colors.primaryBg,
    borderRadius: 10,
  },
  subsLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.primaryDark,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  subsText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
});
