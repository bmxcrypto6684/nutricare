/**
 * NutriCare — Lista de Compras Screen
 * Itens categorizados com checkbox para marcar o que precisa comprar
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';
import { gerarListaCompras } from '../services/aiService';

export default function ListaComprasScreen({ route, navigation }) {
  const { userData, plano } = route.params;
  const categorias = gerarListaCompras();
  const [checkedItems, setCheckedItems] = useState({});
  const [expandedCats, setExpandedCats] = useState({});

  const toggleItem = (catName, item) => {
    const key = `${catName}-${item}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategory = (catName) => {
    setExpandedCats((prev) => ({ ...prev, [catName]: !prev[catName] }));
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const totalCount = categorias.reduce((acc, cat) => acc + cat.items.length, 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lista de Compras</Text>
        <Text style={styles.headerSub}>
          {checkedCount}/{totalCount} itens marcados
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categorias.map((cat, idx) => {
          const isExpanded = expandedCats[cat.name];
          const catChecked = cat.items.filter((item) => checkedItems[`${cat.name}-${item}`]);
          const allChecked = catChecked.length === cat.items.length;

          return (
            <View key={idx} style={styles.categoryCard}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(cat.name)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryHeaderLeft}>
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <View>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Text style={styles.categoryCount}>
                      {catChecked.length}/{cat.items.length} itens
                    </Text>
                  </View>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {cat.items.map((item, i) => {
                    const key = `${cat.name}-${item}`;
                    const isChecked = checkedItems[key];

                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.itemRow}
                        onPress={() => toggleItem(cat.name, item)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            isChecked && styles.checkboxChecked,
                          ]}
                        >
                          {isChecked && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={[styles.itemText, isChecked && styles.itemTextChecked]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {allChecked && cat.items.length > 0 && (
                    <View style={styles.completeBadge}>
                      <Text style={styles.completeText}>✅ Tudo nesta categoria!</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Progresso geral */}
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Progresso geral</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {checkedCount === 0
              ? 'Toque nas categorias para abrir e marcar os itens'
              : checkedCount === totalCount
                ? 'Tudo pronto! Hora de ir às compras 🛒'
                : `${checkedCount} de ${totalCount} itens marcados`}
          </Text>
        </View>

        {/* Botão de limpar */}
        {checkedCount > 0 && (
          <Button
            title="🔄 Limpar tudo"
            variant="outline"
            onPress={() => setCheckedItems({})}
            style={{ marginTop: 16 }}
          />
        )}

        <View style={styles.actions}>
          <Button
            title="🥗 Voltar ao plano alimentar"
            variant="primary"
            onPress={() => navigation.navigate('PlanoAlimentar', { userData, plano })}
            style={{ marginTop: 8 }}
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
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 16, color: Colors.textMuted, fontWeight: '500' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  categoryCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIcon: { fontSize: 24 },
  categoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  categoryCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  expandIcon: { fontSize: 14, color: Colors.textMuted },
  itemsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  itemText: {
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  completeBadge: {
    marginTop: 8,
    padding: 10,
    backgroundColor: Colors.primaryBg,
    borderRadius: 8,
    alignItems: 'center',
  },
  completeText: { fontSize: 13, fontWeight: '600', color: Colors.primaryDark },
  progressCard: {
    padding: 18,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginVertical: 8,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  actions: { marginTop: 8 },
});
