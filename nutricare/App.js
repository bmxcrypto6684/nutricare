/**
 * NutriCare — App Entry Point
 * Stack Navigator com todas as telas do app + Firebase init
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthChange } from './src/services/firebase';

import OnboardingScreen from './src/screens/OnboardingScreen';
import ComoFuncionaScreen from './src/screens/ComoFuncionaScreen';
import AnamneseScreen from './src/screens/AnamneseScreen';
import LoadingScreen from './src/screens/LoadingScreen';
import PlanoAlimentarScreen from './src/screens/PlanoAlimentarScreen';
import EstrategiasScreen from './src/screens/EstrategiasScreen';
import ListaComprasScreen from './src/screens/ListaComprasScreen';
import PlanosScreen from './src/screens/PlanosScreen';
import ContatoScreen from './src/screens/ContatoScreen';
import SuplementacaoScreen from './src/screens/SuplementacaoScreen';
import AcompanhamentoScreen from './src/screens/AcompanhamentoScreen';
import NutricaoGraficosScreen from './src/screens/NutricaoGraficosScreen';
import Colors from './src/utils/colors';

const Stack = createNativeStackNavigator();

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.splashText}>Inicializando NutriCare...</Text>
    </View>
  );
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [, setUser] = useState(null);

  useEffect(() => {
    // Observa autenticação — mantém sessão ativa
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      if (initializing) setInitializing(false);
    });

    return unsubscribe;
  }, []);

  if (initializing) return <SplashScreen />;

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Onboarding"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#FFFFFF' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="ComoFunciona" component={ComoFuncionaScreen} />
        <Stack.Screen name="Anamnese" component={AnamneseScreen} />
        <Stack.Screen name="Loading" component={LoadingScreen} />
        <Stack.Screen name="PlanoAlimentar" component={PlanoAlimentarScreen} />
        <Stack.Screen name="Estrategias" component={EstrategiasScreen} />
        <Stack.Screen name="ListaCompras" component={ListaComprasScreen} />
        <Stack.Screen name="Planos" component={PlanosScreen} />
        <Stack.Screen name="Contato" component={ContatoScreen} />
        <Stack.Screen name="Suplementacao" component={SuplementacaoScreen} />
        <Stack.Screen name="Acompanhamento" component={AcompanhamentoScreen} />
        <Stack.Screen name="NutricaoGraficos" component={NutricaoGraficosScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  splashText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
