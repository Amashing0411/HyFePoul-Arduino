import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

import SplashScreen from '../screens/SplashScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FeedingScreen from '../screens/FeedingScreen';
import WaterScreen from '../screens/WaterScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ClaimDeviceScreen from '../screens/ClaimDeviceScreen';
import { useAuth } from '../context/AuthContext';

export type RootStackParamList = {
  Splash: undefined;
  AuthStack: undefined;
  ClaimStack: undefined;
  MainTabs: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type ClaimStackParamList = {
  ClaimDevice: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Feeding: undefined;
  Water: undefined;
  History: undefined;
  Notifications: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ClaimStack = createNativeStackNavigator<ClaimStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function ClaimNavigator() {
  return (
    <ClaimStack.Navigator screenOptions={{ headerShown: false }}>
      <ClaimStack.Screen name="ClaimDevice" component={ClaimDeviceScreen} />
    </ClaimStack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Feeding') iconName = focused ? 'restaurant' : 'restaurant-outline';
          else if (route.name === 'Water') iconName = focused ? 'water' : 'water-outline';
          else if (route.name === 'History') iconName = focused ? 'time' : 'time-outline';
          else if (route.name === 'Notifications') iconName = focused ? 'notifications' : 'notifications-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.neutral,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        }
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('navDashboard') }} />
      <Tab.Screen name="Feeding" component={FeedingScreen} options={{ title: t('navFeeding') }} />
      <Tab.Screen name="Water" component={WaterScreen} options={{ title: t('navWater') }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: t('navHistory') }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('navNotifications') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('navSettings') }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading, ownedDevices, ownershipError, checkOwnership } = useAuth();
  const { colors, typography } = useTheme();

  if (loading || (user && ownedDevices === null && !ownershipError)) {
    return <SplashScreen />;
  }

  if (user && ownershipError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginBottom: 16 }]}>Connection Error</Text>
        <Text style={[typography.body, { color: '#e74c3c', textAlign: 'center', marginBottom: 24 }]}>{ownershipError}</Text>
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 8 }}
          onPress={() => checkOwnership()}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="AuthStack" component={AuthNavigator} />
      ) : ownedDevices && ownedDevices.length === 0 ? (
        <Stack.Screen name="ClaimStack" component={ClaimNavigator} />
      ) : (
        <Stack.Screen name="MainTabs" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}
