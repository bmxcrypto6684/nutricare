/**
 * NutriCare — NutricaoGraficos Screen
 * Gráficos nutricionais interativos com dados do plano
 * Feito com componentes nativos (sem dependências extras)
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Colors from '../utils/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

const MEAL_COLORS = ['#22C55E', '#F59E0B', '#3B82F6', '#A855F7', '#EF4444'];
const MACRO_COLORS = ['#22C55E', '#F59E0B', '#EF4444'];

function gerarDadosNutricionais(userData) {
  const isLoss = userData?.objective === 'emagrecimento';
  const isGain = userData?.objective === 'massa';

  let totalCal, proteinPct, carbPct, fatPct;
  if (isLoss) {
    totalCal = 1500; proteinPct = 40; carbPct = 30; fatPct = 30;
  } else if (isGain) {
    totalCal = 2800; proteinPct = 30; carbPct = 45; fatPct = 25;
  } else {
    totalCal = 2000; proteinPct = 30; carbPct = 40; fatPct = 30;
  }

  const proteinG = Math.round((totalCal * proteinPct / 100) / 4);
  const carbG = Math.round((totalCal * carbPct / 100) / 4);
  const fatG = Math.round((totalCal * fatPct / 100) / 9);

  const mealDist = isLoss
    ? [
        { name: 'Café da Manhã', calories: 300, icon: '🌅' },
        { name: 'Lanche Manhã', calories: 120, icon: '🍎' },
        { name: 'Almoço', calories: 500, icon: '🍚' },
        { name: 'Lanche Tarde', calories: 130, icon: '🥤' },
        { name: 'Jantar', calories: 450, icon: '🌙' },
      ]
    : isGain
      ? [
          { name: 'Café da Manhã', calories: 550, icon: '🌅' },
          { name: 'Lanche Manhã', calories: 250, icon: '🍎' },
          { name: 'Almoço', calories: 850, icon: '🍚' },
          { name: 'Lanche Tarde', calories: 300, icon: '🥤' },
          { name: 'Jantar', calories: 850, icon: '🌙' },
        ]
      : [
          { name: 'Café da Manhã', calories: 400, icon: '🌅' },
          { name: 'Lanche Manhã', calories: 150, icon: '🍎' },
          { name: 'Almoço', calories: 650, icon: '🍚' },
          { name: 'Lanche Tarde', calories: 200, icon: '🥤' },
          { name: 'Jantar', calories: 600, icon: '🌙' },
        ];

  return { totalCal, proteinPct, carbPct, fatPct, proteinG, carbG, fatG, mealDist };
}

// ====== COMPONENTES DOS GRÁFICOS ======

function BarChart({ data, colors, height = 180 }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.min((SCREEN_WIDTH - 80) / data.length - 12, 50);

  return (
    <View style={styles.barChartContainer}>
      <View style={[styles.barChartArea, { height }]}>
        {data.map((item, i) => {
          const barHeight = (item.value / maxVal) * (height - 20);
          return (
            <View key={i} style={styles.barColumn}>
              <Text style={styles.barValue}>{item.value}</Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(barHeight, 4),
                    width: barWidth,
                    backgroundColor: colors[i % colors.length],
                  },
                ]}
              />
              <Text style={styles.barLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DoughnutChart({ percentages, colors, labels, size = 160 }) {
  // Renderiza uma representação visual tipo doughnut com Views
  const total = percentages.reduce((a, b) => a + b, 0) || 100;
  const sorted = percentages
    .map((p, i) => ({ pct: (p / total) * 100, color: colors[i], label: labels[i] }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <View style={styles.doughnutContainer}>
      {/* Visual do doughnut */}
      <View style={[styles.doughnutVisual, { width: size, height: size }]}>
        <View style={[styles.doughnutRing, { width: size, height: size }]}>
          {sorted.map((item, i) => {
            const rotation = sorted
              .slice(0, i)
              .reduce((sum, s) => sum + (s.pct / 100) * 360, 0);
            const degrees = (item.pct / 100) * 360;
            return (
              <View
                key={i}
                style={[
                  styles.doughnutSegment,
                  {
                    backgroundColor: item.color,
                    transform: [{ rotate: `${rotation}deg` }],
                    opacity: degrees > 0 ? 1 : 0,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={[styles.doughnutHole, { width: size * 0.55, height: size * 0.55 }]}>
          <Text style={styles.doughnutCenterText}>{Math.round(percentages[0])}%</Text>
          <Text style={styles.doughnutCenterLabel}>{labels[0]}</Text>
        </View>
      </View>
      {/* Legenda */}
      <View style={styles.doughnutLegend}>
        {percentages.map((p, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors[i] }]} />
            <Text style={styles.legendLabel}>{labels[i]}</Text>
            <Text style={styles.legendValue}>{p}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MacroProgressBar({ label, pct, grams, color }) {
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroName}>{label}</Text>
        <Text style={styles.macroPct}>{pct}%</Text>
        <Text style={styles.macroGrams}>{grams}g</Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function TimelineItem({ icon, name, calories, pct, color }) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineIcon}>
        <Text style={styles.timelineIconText}>{icon}</Text>
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineName}>{name}</Text>
        <View style={styles.timelineTrack}>
          <View style={[styles.timelineFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <View style={styles.timelineStats}>
          <Text style={styles.timelineStatText}>{calories} kcal</Text>
          <Text style={styles.timelineStatText}>{pct}% do dia</Text>
        </View>
      </View>
    </View>
  );
}

// ====== SCREEN PRINCIPAL ======

export default function NutricaoGraficosScreen({ route, navigation }) {
  const { userData } = route.params;
  const nd = gerarDadosNutricionais(userData);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gráficos Nutricionais</Text>
        <Text style={styles.headerSub}>Análise do seu plano personalizado</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Summary Cards */}
        <Text style={styles.sectionTitle}>Resumo Diário</Text>
        <View style={styles.summaryGrid}>
          <SummaryCard value={nd.totalCal} label="Calorias/dia" />
          <SummaryCard value={`${nd.proteinG}g`} label="Proteínas" />
          <SummaryCard value={`${nd.carbG}g`} label="Carboidratos" />
          <SummaryCard value={`${nd.fatG}g`} label="Gorduras" />
        </View>

        {/* Chart 1: Calorias por Refeição */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>📊 Calorias por Refeição</Text>
          <Text style={styles.chartDesc}>
            Distribuição das {nd.totalCal} kcal ao longo do dia
          </Text>
          <BarChart
            data={nd.mealDist.map((m) => ({ label: m.name.split(' ')[0], value: m.calories }))}
            colors={MEAL_COLORS}
          />
          <View style={styles.mealLegend}>
            {nd.mealDist.map((m, i) => (
              <View key={i} style={styles.mealLegendItem}>
                <View style={[styles.mealDot, { backgroundColor: MEAL_COLORS[i] }]} />
                <Text style={styles.mealLegendLabel}>
                  {m.icon} {m.name}
                </Text>
                <Text style={styles.mealLegendValue}>{m.calories} kcal</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Chart 2: Macronutrientes */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>🥗 Distribuição de Macronutrientes</Text>
          <Text style={styles.chartDesc}>Proporção ideal para seu objetivo</Text>
          <DoughnutChart
            percentages={[nd.proteinPct, nd.carbPct, nd.fatPct]}
            colors={MACRO_COLORS}
            labels={['Proteínas', 'Carboidratos', 'Gorduras']}
          />
          <View style={styles.macroSection}>
            <MacroProgressBar
              label="Proteínas"
              pct={nd.proteinPct}
              grams={nd.proteinG}
              color="#22C55E"
            />
            <MacroProgressBar
              label="Carboidratos"
              pct={nd.carbPct}
              grams={nd.carbG}
              color="#F59E0B"
            />
            <MacroProgressBar
              label="Gorduras"
              pct={nd.fatPct}
              grams={nd.fatG}
              color="#EF4444"
            />
          </View>
        </View>

        {/* Chart 3: Timeline do Dia */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>⏰ Distribuição ao Longo do Dia</Text>
          <Text style={styles.chartDesc}>Como as calorias se distribuem nas refeições</Text>
          {nd.mealDist.map((m, i) => (
            <TimelineItem
              key={i}
              icon={m.icon}
              name={m.name}
              calories={m.calories}
              pct={Math.round((m.calories / nd.totalCal) * 100)}
              color={MEAL_COLORS[i]}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ====== SUBCOMPONENTES ======

function SummaryCard({ value, label }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ====== STYLES ======

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

  // Summary
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    width: '48%',
    flex: 1,
    minWidth: 70,
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart Cards
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  chartDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },

  // Bar Chart
  barChartContainer: {
    alignItems: 'center',
  },
  barChartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 4,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  bar: {
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },

  // Meal legend
  mealLegend: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  mealLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  mealDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    marginRight: 8,
  },
  mealLegendLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  mealLegendValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Doughnut
  doughnutContainer: {
    alignItems: 'center',
  },
  doughnutVisual: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  doughnutRing: {
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  doughnutSegment: {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: '50%',
    height: '100%',
    transformOrigin: '0 50%',
  },
  doughnutHole: {
    borderRadius: 999,
    backgroundColor: Colors.white,
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doughnutCenterText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  doughnutCenterLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  doughnutLegend: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginRight: 4,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Macro progress
  macroSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  macroRow: {
    marginBottom: 14,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  macroDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  macroName: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  macroPct: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 10,
  },
  macroGrams: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  macroTrack: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Timeline
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineIconText: {
    fontSize: 18,
  },
  timelineContent: {
    flex: 1,
  },
  timelineName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  timelineTrack: {
    height: 10,
    backgroundColor: Colors.borderLight,
    borderRadius: 5,
    overflow: 'hidden',
  },
  timelineFill: {
    height: '100%',
    borderRadius: 5,
  },
  timelineStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  timelineStatText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
