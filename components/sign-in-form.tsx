import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import React, { useState } from 'react';
import { Pressable, type TextInput, View } from 'react-native';
import { Alert } from '@/utils/alerts';
import { auth } from '@/FirebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'expo-router';

export function SignInForm() {
  const router = useRouter();
  const passwordInputRef = React.useRef<TextInput>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);

  function onEmailSubmitEditing() {
    passwordInputRef.current?.focus();
  }

  function getFirebaseErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'Invalid email address format.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/email-already-in-use':
        return 'This email is already registered.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use a stronger password.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled.';
      case 'auth/requires-recent-login':
        return 'Please log in again to continue.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  async function onSubmit() {
    // Validate inputs
    if (!email || !password) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('User signed in:', userCredential.user.uid);
    } catch (error: any) {
      console.error('Sign in error:', error);
      
      // Check if error has a code property (Firebase errors have this)
      if (error && typeof error === 'object' && 'code' in error) {
        Alert.alert('Sign In Failed', getFirebaseErrorMessage(error.code));
      } else {
        Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="gap-6">
      <Card className="border-border/0 sm:border-border shadow-none sm:shadow-sm sm:shadow-black/5 bg-background">
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-left">Sign in to SSC Task Tracker</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Welcome back! Please sign in your member or admin account.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <View className="gap-6">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="butthanna7@gmail.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onSubmitEditing={onEmailSubmitEditing}
                onChangeText={setEmail}
                value={email}
                returnKeyType="next"
                submitBehavior="submit"
                editable={!loading}
              />
            </View>
            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">Password</Label>
                <Button
                  variant="link"
                  size="sm"
                  className="web:h-fit ml-auto h-4 px-1 py-0 sm:h-4"
                  onPress={() => {
                    router.push('/forgot');
                  }}
                  disabled={loading}>
                  <Text className="font-normal leading-4">Forgot your password?</Text>
                </Button>
              </View>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                returnKeyType="send"
                onSubmitEditing={onSubmit}
                onChangeText={setPassword}
                value={password}
                editable={!loading}
              />
            </View>
            <Button disabled={loading} className="w-full" onPress={onSubmit}>
              <Text>{loading ? 'Signing in...' : 'Continue'}</Text>
            </Button>
          </View>
          <Text className="text-center text-sm">
            Don&apos;t have an member account?{' '}
            <Pressable
              onPress={() => {
                router.push('/signup');
              }}
              disabled={loading}>
              <Text className="text-sm underline underline-offset-4">Sign up</Text>
            </Pressable>
          </Text>
          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="text-muted-foreground px-4 text-sm">or</Text>
            <Separator className="flex-1" />
          </View>
          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}