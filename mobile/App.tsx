import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth';
import { RootNavigation } from './src/navigation';
import { ThemeProvider, useTheme } from './src/theme';

function Shell() {
  const { isDark, colors } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgAlt }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
