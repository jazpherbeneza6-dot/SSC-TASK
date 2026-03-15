import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Alert } from '@/utils/alerts';
import { auth } from '@/FirebaseConfig';
import { sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { Mail, CheckCircle } from 'lucide-react-native';

export default function EmailVerification() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUserEmail(currentUser.email || '');
      
      if (currentUser.emailVerified) {
        router.replace('/');
      } else {
        sendVerificationEmail();
      }
    } else {
      router.replace('/signin');
    }
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  async function sendVerificationEmail() {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      Alert.alert('Error', 'No user logged in. Please sign in again.');
      router.replace('/signin');
      return;
    }

    try {
      setLoading(true);
      await sendEmailVerification(currentUser);
      setEmailSent(true);
      setResendCooldown(60); // 60 seconds cooldown
      Alert.alert(
        'Email Sent',
        'Verification email has been sent to your inbox. Please check your email.'
      );
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      
      let errorMessage = 'Failed to send verification email. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please wait a few minutes before trying again.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function checkVerificationStatus() {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      Alert.alert('Error', 'No user logged in.');
      return;
    }

    try {
      setLoading(true);
      // Reload user to get updated email verification status
      await currentUser.reload();
      
      if (currentUser.emailVerified) {
        Alert.alert(
          'Success',
          'Your email has been verified!',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/'),
            },
          ]
        );
      } else {
        Alert.alert(
          'Not Verified Yet',
          'Please check your email and click the verification link. It may take a few moments to appear.'
        );
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      Alert.alert('Error', 'Failed to check verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await auth.signOut();
              router.replace('/signin');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  }

  return (
    <View className="flex-1 items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="items-center gap-4">
          <View className="bg-primary/10 p-4 rounded-full">
            {emailSent ? (
              <CheckCircle className="text-primary" size={48} />
            ) : (
              <Mail className="text-primary" size={48} />
            )}
          </View>
          <CardTitle className="text-center text-2xl">
            Verify Your Email
          </CardTitle>
          <CardDescription className="text-center">
            {emailSent
              ? `We've sent a verification email to:`
              : 'Please verify your email address to continue'}
          </CardDescription>
          {userEmail && (
            <Text className="text-center font-semibold text-base">
              {userEmail}
            </Text>
          )}
        </CardHeader>
        <CardContent className="gap-4">
          <View className="bg-muted p-4 rounded-lg gap-2">
            <Text className="text-sm text-muted-foreground text-center">
              Click the verification link in your email to activate your account.
              Don't forget to check your spam folder!
            </Text>
          </View>

          <Button
            className="w-full"
            onPress={checkVerificationStatus}
            disabled={loading}>
            <Text>{loading ? 'Checking...' : 'I\'ve Verified My Email'}</Text>
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onPress={sendVerificationEmail}
            disabled={loading || resendCooldown > 0}>
            <Text>
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : loading
                ? 'Sending...'
                : 'Resend Verification Email'}
            </Text>
          </Button>

          <View className="flex-row items-center justify-center gap-2 mt-4">
            <Text className="text-sm text-muted-foreground">
              Wrong email address?
            </Text>
            <Button
              variant="link"
              size="sm"
              className="h-fit p-0"
              onPress={handleSignOut}
              disabled={loading}>
              <Text className="text-sm underline">Sign out</Text>
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}