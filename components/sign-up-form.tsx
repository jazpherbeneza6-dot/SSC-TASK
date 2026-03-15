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
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from '@/FirebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';

export function SignupForm() {
  const router = useRouter();
  const lastnameRef = React.useRef<TextInput>(null);
  const positionRef = React.useRef<TextInput>(null);
  const emailRef = React.useRef<TextInput>(null);
  const passwordRef = React.useRef<TextInput>(null);
  const confirmRef = React.useRef<TextInput>(null);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [firstname, setFirstname] = useState<string>('');
  const [lastname, setLastname] = useState<string>('');
  const [position, setPosition] = useState<string>('');
  const [loading, setLoading] = useState(false);

  function getFirebaseErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in or use a different email.';
      case 'auth/invalid-email':
        return 'Invalid email address format.';
      case 'auth/operation-not-allowed':
        return 'Email/password accounts are not enabled. Please contact support.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many requests. Please try again later.';
      default:
        return `An error occurred: ${errorCode}. Please try again.`;
    }
  }

  async function onSubmit() {
    // Validate all fields
    if (!firstname?.trim()) {
      Alert.alert('Required Field', 'Please enter your first name.');
      return;
    }

    if (!lastname?.trim()) {
      Alert.alert('Required Field', 'Please enter your last name.');
      return;
    }

    if (!position?.trim()) {
      Alert.alert('Required Field', 'Please enter your position.');
      return;
    }

    if (!email?.trim()) {
      Alert.alert('Required Field', 'Please enter your email.');
      return;
    }

    const emailTrimmed = email.trim().toLowerCase();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Required Field', 'Please enter a password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    if (!confirm) {
      Alert.alert('Required Field', 'Please confirm your password.');
      return;
    }

    if (password !== confirm) {
      Alert.alert('Password Mismatch', 'Passwords do not match. Please try again.');
      return;
    }

    try {
      setLoading(true);
      
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, emailTrimmed, password);
      
      if (userCredential.user) {
        console.log('User created:', userCredential.user.uid);
        
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            firstname: firstname.trim(),
            lastname: lastname.trim(),
            email: emailTrimmed,
            role: 'member',
            position: position.trim(),
            photo_url: null,
            created_at: new Date().toISOString(),
          });
          
          Alert.alert(
            'Success',
            'Account created successfully! You can now sign in.',
            [
              {
                text: 'OK',
                onPress: () => router.push('/signin'),
              },
            ]
          );
        } catch (firestoreError: any) {
          console.error('Firestore error:', firestoreError);
          Alert.alert(
            'Account Created',
            'Your account was created but there was an error saving your profile. Please contact support.',
            [
              {
                text: 'OK',
                onPress: () => router.push('/signin'),
              },
            ]
          );
        }
      }
    } catch (error: any) {
      console.error('Sign up error:', error);

      if (error && typeof error === 'object' && 'code' in error) {
        const errorMessage = getFirebaseErrorMessage(error.code);
        Alert.alert('Sign Up Failed', errorMessage);
      } else {
        Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="gap-6 bg-background">
      <Card className="bg-background border-border/0 sm:border-border shadow-none sm:shadow-sm sm:shadow-black/5">
        <CardHeader>
          <CardTitle className="text-center text-xl sm:text-left">Create Member Account</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Please fill up required fields below to create your member account.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <View className="gap-6">
            <View className="flex-1 flex-row justify-between">
              <View className="gap-1.5 w-[48%]">
                <Label htmlFor="firstname">First Name</Label>
                <Input
                  id="firstname"
                  placeholder="Hanna"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onChangeText={setFirstname}
                  value={firstname}
                  editable={!loading}
                  onSubmitEditing={() => lastnameRef.current?.focus()}
                />
              </View>
              <View className="gap-1.5 w-[48%]">
                <Label htmlFor="lastname">Last Name</Label>
                <Input
                  ref={lastnameRef}
                  id="lastname"
                  placeholder="Ayeza"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onChangeText={setLastname}
                  value={lastname}
                  editable={!loading}
                  onSubmitEditing={() => positionRef.current?.focus()}
                />
              </View>
            </View>
            <View className="gap-1.5">
              <Label htmlFor="position">Position</Label>
              <Input
                ref={positionRef}
                id="position"
                placeholder="SSC President"
                autoCapitalize="words"
                returnKeyType="next"
                onChangeText={setPosition}
                value={position}
                editable={!loading}
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </View>
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                ref={emailRef}
                id="email"
                placeholder="butthanna7@gmail.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                returnKeyType="next"
                onChangeText={setEmail}
                value={email}
                editable={!loading}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>
            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">Password</Label>
              </View>
              <Input
                ref={passwordRef}
                id="password"
                autoComplete="new-password"
                secureTextEntry
                returnKeyType="next"
                onChangeText={setPassword}
                value={password}
                editable={!loading}
                onSubmitEditing={() => confirmRef.current?.focus()}
              />
            </View>
            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="confirm_password">Confirm Password</Label>
              </View>
              <Input
                ref={confirmRef}
                id="confirm_password"
                secureTextEntry
                returnKeyType="send"
                onChangeText={setConfirm}
                value={confirm}
                editable={!loading}
                onSubmitEditing={onSubmit}
              />
            </View>
            <Button disabled={loading} className="w-full" onPress={onSubmit}>
              <Text>{loading ? 'Creating Account...' : 'Create Account'}</Text>
            </Button>
          </View>
          <Text className="text-center text-sm">
            Have an member account?{' '}
            <Pressable
              onPress={() => {
                router.push('/signin');
              }}
              disabled={loading}>
              <Text className="text-sm underline underline-offset-4">Sign in</Text>
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