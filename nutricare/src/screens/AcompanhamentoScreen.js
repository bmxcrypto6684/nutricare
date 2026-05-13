/**
 * NutriCare — Acompanhamento Screen
 * Opções de acompanhamento pós-consulta
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';

const FOLLOW_UP_OPTIONS = [
  {
    icon: '🔄',
    title: 'Atualizar progresso',
    desc: 'Registre seu progresso e veja sua evolução',
    action: 'progresso',
  },
  {
    icon: '📅',
    title: 'Agendar retorno',
    desc: 'Marque uma consulta de retorno com nutricionista',
    action: 'agendar',
  },
  {
    icon: '💬',
    title: 'Tirar dúvidas',
    desc: 'Entre em contato para esclarecer suas questões',
    action: 'duvidas',
  },
  {
    icon: '💰',
    title: 'Ver planos',
    desc: 'Conheça nossos planos de acompanhamento',
    action: 'planos',
  },
];

export default function AcompanhamentoScreen({ route, navigation }) {
  const { userData, plano } = route.params;

  const handleAction = (action) => {
    switch (action) {
      case 'progresso':
        Alert.alert(
          'Atualizar Progresso',
          'Em breve você poderá registrar seu progresso diretamente pelo app! Por enquanto, anote suas refeições e pesos em um diário.'
        );
        break;
      case 'agendar':
        Alert.alert(
          'Agendar Retorno',
          'Seu retorno foi solicitado! Em breve você receberá instruções por email para escolher o melhor horário.'
        );
        break;
      case 'duvidas':
        Alert.alert(
          'Tirar Dúvidas',
          'Um nutricionista entrará em contato em até 24h úteis para responder suas perguntas.'
        );
        break;
      case 'planos':
        navigation.navigate('Planos');
        break;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Acompanhamento</Text>
        <Text style={styles.headerSub}>
          Seu progresso depende de ajustes contínuos. Estamos aqui para ajudar!
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FOLLOW_UP_OPTIONS.map((opt, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.optionCard}
            onPress={() => handleAction(opt.action)}
            activeOpacity={0.7}
          >
            <View style={styles.optionIconBox}>
              <Text style={styles.optionIcon}>{opt.icon}</Text>
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>{opt.title}</Text>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
            </View>
            <Text style={styles.optionArrow}>→</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.motivationBox}>
          <Text style={styles.motivationIcon}>💪</Text>
          <View style={styles.motivationContent}>
            <Text style={styles.motivationTitle}>Continue assim!</Text>
            <Text style={styles.motivationText}>
              Pequenas mudanças consistentes trazem grandes resultados. Você está no caminho certo!
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="🥗 Ver plano alimentar"
            variant="primary"
            onPress={() => navigation.navigate('PlanoAlimentar', { userData, plano })}
            style={{ marginBottom: 10 }}
          />
          <Button
            title="💊 Ver suplementação"
            variant="outline"
            onPress={() => navigation.navigate('Suplementacao', { userData, plano })}
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
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  optionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIcon: {
    fontSize: 22,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  optionArrow: {
    fontSize: 18,
    color: Colors.primary,
    fontWeight: '700',
  },
  motivationBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 18,
    backgroundColor: Colors.primaryBg,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  motivationIcon: {
    fontSize: 28,
  },
  motivationContent: {
    flex: 1,
  },
  motivationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 4,
  },
  motivationText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  actions: {},
});
