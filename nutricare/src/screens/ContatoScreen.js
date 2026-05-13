/**
 * NutriCare — Contato Screen
 * Informações de contato para o plano Premium
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';

const CONTACT_INFO = [
  { icon: '📧', label: 'Email', value: 'nutricare@consulta.com', action: 'email' },
  { icon: '📱', label: 'WhatsApp', value: '(11) 99999-8888', action: 'whatsapp' },
  { icon: '⏰', label: 'Horário de atendimento', value: 'Segunda a Sexta, 8h às 18h', action: null },
];

export default function ContatoScreen({ navigation }) {
  const handleContact = (action, value) => {
    if (action === 'email') {
      Linking.openURL(`mailto:${value}`).catch(() =>
        Alert.alert('Email', value)
      );
    } else if (action === 'whatsapp') {
      const phone = value.replace(/\D/g, '');
      Linking.openURL(`https://wa.me/55${phone}`).catch(() =>
        Alert.alert('WhatsApp', value)
      );
    }
  };

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
        <Text style={styles.title}>Fale conosco</Text>
        <Text style={styles.subtitle}>
          Entre em contato para saber mais sobre o plano Premium ou tirar suas dúvidas.
        </Text>

        <View style={styles.contactContainer}>
          {CONTACT_INFO.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.contactCard}
              onPress={() => item.action && handleContact(item.action, item.value)}
              activeOpacity={item.action ? 0.7 : 1}
            >
              <View style={styles.contactIconBox}>
                <Text style={styles.contactIcon}>{item.icon}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>{item.label}</Text>
                <Text style={styles.contactValue}>{item.value}</Text>
              </View>
              {item.action && (
                <Text style={styles.contactArrow}>→</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>💚</Text>
          <Text style={styles.infoText}>
            Após a contratação do plano Premium, você receberá um email com instruções para agendar sua consulta personalizada.
          </Text>
        </View>

        <Button
          title="Voltar aos planos"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={{ marginTop: 24 }}
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
  contactContainer: {
    gap: 12,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  contactIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactIcon: {
    fontSize: 22,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  contactArrow: {
    fontSize: 18,
    color: Colors.primary,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 18,
    backgroundColor: Colors.primaryBg,
    borderRadius: 14,
    marginTop: 20,
  },
  infoIcon: {
    fontSize: 22,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
