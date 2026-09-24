import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { MockDataProvider } from './src/context/MockDataContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { AuthProvider } from './src/context/AuthContext';
import { FirebaseDataProvider } from './src/context/FirebaseDataContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <FirebaseDataProvider>
              <MockDataProvider>
              <NavigationContainer>
                <AppNavigator />
              </NavigationContainer>
            </MockDataProvider>
            </FirebaseDataProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
