/**
 * NutriCare - Plano Alimentar Screen
 * Exibe o plano gerado pela IA com cards de refeição e ações
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
import { MealCard } from '../components/Card';

export default function PlanoAlimentarScreen({ route, navigation }) {
  const { userData, plano } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Seu Plano Alimentar</Text>
        <Text style={styles.headerSub}>
          Personalizado para {userData?.objective === 'emagrecimento' ? 'emagrecimento' : userData?.objective === 'massa' ? 'ganho de massa' : 'saúde'}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Café da Manhã */}
        {plano?.cafe?.map((item, i) => (
          <MealCard
            key={`cafe-${i}`}
            icon="🌅"
            name="Café da Manhã"
            time="07:00 - 08:00"
            description={item}
            subs="Troque: pão por tapioca • leite por bebida vegetal • ovos por tofu mexido"
          />
        ))}

        {/* Lanche da Manhã */}
        {plano?.lanches?.filter((_, i) => i % 2 === 0).map((item, i) => (
          <MealCard
            key={`lanche1-${i}`}
            icon="🍎"
            name="Lanche da Manhã"
            time="10:00"
            description={item}
            subs="Substitua a fruta da estação por outra de sua preferência"
          />
        ))}

        {/* Almoço */}
        {plano?.almoco?.map((item, i) => (
          <MealCard
            key={`almoco-${i}`}
            icon="🍚"
            name="Almoço"
            time="12:00 - 13:00"
            description={item}
            subs="Troque arroz por quinoa • Frango por peixe ou tofu • Feijão por lentilha"
          />
        ))}

        {/* Lanche da Tarde */}
        {plano?.lanches?.filter((_, i) => i % 2 !== 0).map((item, i) => (
          <MealCard
            key={`lanche2-${i}`}
            icon="🥤"
            name="Lanche da Tarde"
            time="15:30"
            description={item}
            subs="Substitua o iogurte por kefir ou versão vegetal"
          />
        ))}

        {/* Jantar */}
        {plano?.jantar?.map((item, i) => (
          <MealCard
            key={`jantar-${i}`}
            icon="🌙"
            name="Jantar"
            time="19:00 - 20:00"
            description={item}
            subs="Troque a proteína animal por cogumelos ou tofu • Use temperos naturais"
          />
        ))}

        {/* Ações */}
        <View style={styles.actions}>
          <Button
            title="📊 Gráficos nutricionais"
            variant="secondary"
            onPress={() => navigation.navigate('NutricaoGraficos', { userData })}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="🛒 Lista de compras"
            variant="primary"
            onPress={() => navigation.navigate('ListaCompras', { userData, plano })}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="💡 Ver estratégias"
            variant="outline"
            onPress={() => navigation.navigate('Estrategias', { userData, plano })}
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
            style={{ marginBottom: 10 }}
          />
          <Button
            title="💰 Ver planos"
            variant="outline"
            onPress={() => navigation.navigate('Planos')}
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
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
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
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  actions: {
    marginTop: 20,
    gap: 4,
  },
});
