import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import SplashScreen from '../screens/SplashScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FeedingScreen from '../screens/FeedingScreen';
import WaterScreen from '../screens/WaterScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type RootStackParamList = {
  Splash: undefined;
  MainTabs: undefined;
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
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { colors } = useTheme();

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
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Status' }} />
      <Tab.Screen name="Feeding" component={FeedingScreen} />
      <Tab.Screen name="Water" component={WaterScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
    </Stack.Navigator>
  );
}
