import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { MockDataProvider } from './src/context/MockDataContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <MockDataProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </MockDataProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
