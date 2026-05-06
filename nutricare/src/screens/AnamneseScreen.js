/**
 * NutriCare - Anamnese Screen
 * Multi-step: uma pergunta por tela com barra de progresso
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import Colors from '../utils/colors';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import { QUESTIONS, TOTAL_STEPS } from '../data/questions';

const { width } = Dimensions.get('window');

export default function AnamneseScreen({ route, navigation }) {
  const initialStep = route.params?.step ?? 0;
  const [step, setStep] = useState(initialStep);
  const [answers, setAnswers] = useState({});
  const [textValue, setTextValue] = useState('');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const question = QUESTIONS[step];
  const isLast = step === TOTAL_STEPS - 1;
  const isText = question?.type === 'text';

  // Animação de transição
  const animateTransition = (nextStep) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      setTextValue('');
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleOptionSelect = (value) => {
    const newAnswers = { ...answers, [question.id]: value };
    setAnswers(newAnswers);

    if (isLast) {
      finishAnamnese(newAnswers);
    } else {
      animateTransition(step + 1);
    }
  };

  const handleTextNext = () => {
    if (!textValue.trim()) return;
    const newAnswers = { ...answers, [question.id]: textValue.trim() };
    setAnswers(newAnswers);

    if (isLast) {
      finishAnamnese(newAnswers);
    } else {
      animateTransition(step + 1);
    }
  };

  const finishAnamnese = (finalAnswers) => {
    navigation.replace('Loading', { userData: finalAnswers });
  };

  if (!question) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NutriCare</Text>
      </View>

      <ProgressBar current={step} total={TOTAL_STEPS} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
          {/* Pergunta */}
          <Text style={styles.question}>{question.title}</Text>
          {question.subtitle && (
            <Text style={styles.subtitle}>{question.subtitle}</Text>
          )}

          {/* Inputs */}
          {isText ? (
            <View style={styles.textArea}>
              <TextInput
                style={styles.textInput}
                placeholder={question.placeholder || 'Digite sua resposta...'}
                placeholderTextColor={Colors.textMuted}
                value={textValue}
                onChangeText={setTextValue}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <Button
                title="Continuar"
                variant="primary"
                onPress={handleTextNext}
                disabled={!textValue.trim()}
                style={{ marginTop: 16 }}
              />
            </View>
          ) : (
            /* Opções */
            <View style={styles.optionsContainer}>
              {question.options.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.optionCard}
                  onPress={() => handleOptionSelect(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.3,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: 40,
  },
  question: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  textArea: {
    flex: 1,
    marginTop: 8,
  },
  textInput: {
    minHeight: 140,
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 18,
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  optionsContainer: {
    gap: 12,
    marginTop: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  optionIcon: {
    fontSize: 28,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
});
