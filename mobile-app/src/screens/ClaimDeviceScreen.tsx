import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rtdbService } from '../services/rtdbService';

export default function ClaimDeviceScreen() {
  const [deviceId, setDeviceId] = useState('');
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { user, checkOwnership, signOut } = useAuth();
  const { colors, typography } = useTheme();

  const handleClaim = async () => {
    if (!deviceId.trim() || !pin.trim()) {
      setErrorMsg('Please enter both Device ID and Setup PIN.');
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      if (!user) {
        setErrorMsg('You must be logged in to claim a device.');
        setIsSubmitting(false);
        return;
      }
      
      const cleanDeviceId = deviceId.trim();
      const cleanPin = pin.trim();

      // Step 1: Create claim request
      await rtdbService.createClaimRequest(cleanDeviceId, user.uid, cleanPin);
      
      // Step 2: Establish ownership
      await rtdbService.establishOwnership(cleanDeviceId, user.uid);
      
      // If successful, re-query ownership to route to MainTabs
      await checkOwnership();
    } catch (error: any) {
      console.error('Claim error:', error);
      const msg = error.message || '';
      if (msg.includes('permission_denied') || msg.includes('Permission denied')) {
        setErrorMsg('Claim denied. Invalid Device ID, incorrect Setup PIN, or device already claimed.');
      } else {
        setErrorMsg('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContainer}>
          <Text style={[typography.h1, { color: colors.text, textAlign: 'center', marginBottom: 8 }]}>Claim Device</Text>
          <Text style={[typography.bodySecondary, { color: colors.neutral, textAlign: 'center', marginBottom: 32 }]}>
            Enter your Device ID and Setup PIN to link the system to your account.
          </Text>
          
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          
          <Text style={[typography.caption, { color: colors.text, marginBottom: 4, marginLeft: 4 }]}>Device ID</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="e.g. HYFE-12345"
            placeholderTextColor={colors.neutral}
            autoCapitalize="characters"
            value={deviceId}
            onChangeText={setDeviceId}
          />
          
          <Text style={[typography.caption, { color: colors.text, marginBottom: 4, marginLeft: 4 }]}>Setup PIN</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="6-digit PIN"
            placeholderTextColor={colors.neutral}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
          />
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: colors.primary }]} 
            onPress={handleClaim}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Claim Device</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={signOut}
            disabled={isSubmitting}
          >
            <Text style={[typography.body, { color: '#e74c3c' }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
    padding: 12,
  },
});
