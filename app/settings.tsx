import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ScrollView,
  View,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/hooks/useTheme';
import { Image } from 'expo-image'
const SectionHeader = ({ title }: { title: string }) => (
  <View className="mb-3">
    <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400">
      {title}
    </Text>
  </View>
);

type SettingRowProps = {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  isLast?: boolean;
};

const SettingRow = ({
  iconName,
  iconBg,
  iconColor,
  label,
  sublabel,
  onPress,
  right,
  showChevron = true,
  danger = false,
  isLast = false,
}: SettingRowProps) => (
  <>
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="flex-row items-center px-4 py-3.5 gap-3"
    >
      <View className={`w-9 h-9 rounded-xl items-center justify-center ${iconBg}`}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>

      <View className="flex-1">
        <Text
          className={`text-sm font-medium ${danger ? 'text-red-500' : 'text-gray-800 dark:text-white'
            }`}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text className="text-xs text-gray-400 mt-0.5">{sublabel}</Text>
        ) : null}
      </View>

      {right ? (
        <View>{right}</View>
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      ) : null}
    </TouchableOpacity>

    {!isLast && <View className="ml-16 border-b border-border" />}
  </>
);

export default function SettingsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const { user, setUser } = useAuth();

  const { darkMode, toggleTheme } = useTheme();

  const [notifications, setNotifications] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest'>('idle');

  function handleCheckUpdate() {
    if (updateStatus !== 'idle') return;
    setUpdateStatus('checking');
    setTimeout(() => setUpdateStatus('latest'), 2000);
    setTimeout(() => setUpdateStatus('idle'), 5500);
  }

  const handleSignout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
            setUser(null);
            router.replace('/');
          } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  if (!user)
    return (
      <View className="flex-1 bg-background p-5 gap-4 mt-safe">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </View>
    );

  const updateRight =
    updateStatus === 'checking' ? (
      <ActivityIndicator size="small" color="#10b981" />
    ) : updateStatus === 'latest' ? (
      <Text className="text-xs font-semibold text-emerald-500">Up to date ✓</Text>
    ) : (
      <TouchableOpacity
        onPress={handleCheckUpdate}
        className="bg-primary px-3 py-1.5 rounded-xl"
        activeOpacity={0.7}
      >
        <Text className="text-white text-xs font-semibold">Check</Text>
      </TouchableOpacity>
    );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-10"
      showsVerticalScrollIndicator={false}
    >
      <View className="bg-card pt-14 pb-6 px-5">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            className="bg-card/20 w-9 h-9 rounded-full items-center justify-center"
          >
            <Ionicons name="arrow-back" size={18} color={darkMode ? '#ffffff' : '#151515'} />
          </TouchableOpacity>
          <Text className="text-gray-800 dark:text-white text-xl font-bold">Settings</Text>
        </View>
      </View>

      <View className="px-5 mt-5 gap-6">
        <TouchableOpacity
          activeOpacity={0.85}
          className="bg-card rounded-2xl p-4 border border-border flex-row items-center gap-4"
        >

          {user?.photo_url ? (
            <Image 
            source={{ uri: user?.photo_url }}
            style={{
              width: 60,
              height: 60,
              borderRadius: 80
            }}
            contentFit="cover"
            />
          ) : (
            <View className="w-14 h-14 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-xl font-bold">
                {user?.firstname?.charAt(0).toUpperCase() ?? 'U'}
              </Text>
            </View>
          )}
          
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-800 dark:text-white">
              {(user?.firstname ?? '') + ' ' + (user?.lastname ?? '') || 'Officer'}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">{user?.position || 'SSC Member'}</Text>
            <Text className="text-xs text-primary mt-1 font-medium capitalize">{user.role}</Text>
          </View>
        </TouchableOpacity>

        {/* Account */}
        <View>
          <SectionHeader title="Account" />
          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            <SettingRow
              iconName="person-outline"
              iconBg="bg-violet-100 dark:bg-violet-950"
              iconColor="#7c3aed"
              label="Edit Profile"
              sublabel="Name, position, photo"
              onPress={() => router.push('/profile')}
            />
            <SettingRow
              iconName="lock-closed-outline"
              iconBg="bg-blue-100 dark:bg-blue-950"
              iconColor="#2563eb"
              label="Privacy & Security"
              sublabel="Password, account access"
              onPress={() => {}}
            /> 
            <SettingRow
              iconName="globe-outline"
              iconBg="bg-cyan-100 dark:bg-cyan-950"
              iconColor="#0891b2"
              label="Language"
              sublabel="English (US)"
              onPress={() => {}}
              isLast 
            />
          </View>
        </View>

        {/* Preferences */}
        <View>
          <SectionHeader title="Preferences" />
          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            <SettingRow
              iconName="moon-outline"
              iconBg="bg-indigo-100 dark:bg-indigo-950"
              iconColor="#4f46e5"
              label="Dark Mode"
              sublabel={darkMode ? 'Currently dark' : 'Currently light'}
              onPress={toggleTheme}
              showChevron={false}
              right={
                <Switch
                  value={darkMode}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#e5e7eb', true: '#6366f1' }}
                  thumbColor="#ffffff"
                />
              }
            />
            <SettingRow
              iconName="notifications-outline"
              iconBg="bg-red-100 dark:bg-red-950"
              iconColor="#ef4444"
              label="Push Notifications"
              sublabel={notifications ? 'All alerts enabled' : 'Notifications off'}
              onPress={() => setNotifications((v) => !v)}
              showChevron={false}
              isLast
              right={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: '#e5e7eb', true: '#0ea5e9' }}
                  thumbColor="#ffffff"
                />
              }
            />
          </View>
        </View>

        {/* App */}
        <View>
          <SectionHeader title="App" />
          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            <SettingRow
              iconName="refresh-outline"
              iconBg="bg-emerald-100 dark:bg-emerald-950"
              iconColor="#10b981"
              label="Check for Updates"
              sublabel={
                updateStatus === 'checking'
                  ? 'Checking...'
                  : updateStatus === 'latest'
                  ? "You're up to date"
                    : 'Version 1.0.0'}
              onPress={handleCheckUpdate}
              showChevron={false}
              right={updateRight}
            />
            <SettingRow
              iconName="star-outline"
              iconBg="bg-amber-100 dark:bg-amber-950"
              iconColor="#f59e0b"
              label="Rate the App"
              sublabel="Leave us a review"
              onPress={() => {}}
            /> 
            <SettingRow
              iconName="chatbubble-outline"
              iconBg="bg-teal-100 dark:bg-teal-950"
              iconColor="#0d9488"
              label="Send Feedback"
              sublabel="Help us improve"
              onPress={() => {}}
              isLast 
            />
          </View>
        </View>

        {/* About */}
        <View>
          <SectionHeader title="About" />
          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            <SettingRow
              iconName="information-circle-outline"
              iconBg="bg-sky-100 dark:bg-sky-950"
              iconColor="#0ea5e9"
              label="About App"
              sublabel="Licenses, credits"
              onPress={() => {}}
            /> 
            <View className="ml-16 border-b border-border" />
            <View className="px-4 py-3.5 gap-2">
              {[
                ['Version', '1.0.0 (Build 1)'],
                ['Platform', 'Android'],
                ['Last Updated', 'Feb 2026'],
              ].map(([k, v], i) => (
                <View key={i} className="flex-row justify-between">
                  <Text className="text-sm text-gray-800 dark:text-white">{k}</Text>
                  <Text className="text-sm text-gray-400">{v}</Text>
                </View>
              ))}
            </View>
            <View className="ml-4 border-b border-border" />
            <SettingRow
              iconName="document-text-outline"
              iconBg="bg-purple-100 dark:bg-purple-950"
              iconColor="#9333ea"
              label="Terms & Privacy"
              onPress={() => {}}
              isLast 
            />
          </View>
        </View>

        {/* Sign Out */}
        <View className="bg-card rounded-2xl border border-border overflow-hidden mb-2">
          <SettingRow
            iconName="log-out-outline"
            iconBg="bg-red-50 dark:bg-red-950"
            iconColor="#ef4444"
            label="Sign Out"
            danger
            showChevron={false}
            onPress={handleSignout}
            isLast
          />
        </View>

        <View className="items-center gap-1 mb-4">
          <Text className="text-xs text-gray-400">Made with 💙 by ICT12A.</Text>
          <Text className="text-xs text-gray-400">v1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}