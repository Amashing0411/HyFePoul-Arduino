import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
const RESET_REQUEST_CONFIRMATION = 'If an account exists for this email, Firebase has sent a password reset link. Check your inbox and spam folder.';

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { signIn, resetPassword } = useAuth();
  const { colors } = useTheme();

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    setResetInfo('');
    try {
      await signIn(email, password);
    } catch (error: any) {
      const code = error.code;
      if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        setErrorMsg('Invalid email or password.');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Too many attempts. Please try again later.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('Network error. Please check your connection.');
      } else {
        setErrorMsg('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email address first, then tap Forgot password?');
      setResetInfo('');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setResetInfo('');
    try {
      await resetPassword(normalizedEmail);
      setResetInfo(RESET_REQUEST_CONFIRMATION);
    } catch (error: any) {
      const code = error.code;
      if (code === 'auth/user-not-found' || code === 'auth/email-not-found') {
        setResetInfo(RESET_REQUEST_CONFIRMATION);
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Too many reset attempts. Please wait and try again later.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('Network error. Please check your connection and try again.');
      } else {
        setErrorMsg('Could not request a reset email. Please try again later.');
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
      <View style={styles.formContainer}>
        <Text style={[styles.title, { color: colors.text }]}>HyFePoul</Text>
        <Text style={[styles.subtitle, { color: colors.neutral }]}>Sign in to continue</Text>
        
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          placeholder="Email address"
          placeholderTextColor={colors.neutral}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrorMsg('');
            setResetInfo('');
          }}
        />
        
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          placeholder="Password"
          placeholderTextColor={colors.neutral}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.forgotPasswordButton}
          onPress={handlePasswordReset}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
        </TouchableOpacity>

        {resetInfo ? <Text style={styles.resetInfoText}>{resetInfo}</Text> : null}
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]} 
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.linkButton} 
          onPress={() => navigation.navigate('Register')}
          disabled={isSubmitting}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>Don&apos;t have an account? Sign up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
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
  },
  linkText: {
    fontSize: 16,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: -12,
    marginBottom: 8,
  },
  resetInfoText: {
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
});
