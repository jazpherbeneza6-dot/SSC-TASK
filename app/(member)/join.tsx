import { Text } from '@/components/ui/text';
import {
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '@/utils/alerts';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';

export default function JoinRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining]   = useState(false);
  const [preview, setPreview]   = useState<any>(null);
  const [checking, setChecking] = useState(false);

  // ── Look up room by code ─────────────────────────────────────────────────

  const handleLookup = async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert('Error', 'Please enter a valid room code.');
      return;
    }

    setChecking(true);
    setPreview(null);

    try {
      // Find room by code
      const q    = query(collection(db, 'rooms'), where('roomCode', '==', code));
      const snap = await getDocs(q);

      if (snap.empty) {
        Alert.alert('Not Found', 'No room found with that code. Check with your admin.');
        setChecking(false);
        return;
      }

      const roomDoc = snap.docs[0];

      // Check if already a member in the subcollection
      const memberRef  = doc(db, 'rooms', roomDoc.id, 'members', user!.uid);
      const memberSnap = await getDoc(memberRef);

      if (memberSnap.exists()) {
        Alert.alert('Already Joined', 'You are already a member of this room.', [
          { text: 'View Room', onPress: () => router.push(`/(member)/rooms/${roomDoc.id}` as any) },
          { text: 'OK', style: 'cancel' },
        ]);
        setChecking(false);
        return;
      }

      setPreview({ id: roomDoc.id, ...roomDoc.data() });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not look up room. Try again.');
    }

    setChecking(false);
  };

  // ── Join room ────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (!preview || !user) return;
    setJoining(true);

    try {
      const memberRef = doc(db, 'rooms', preview.id, 'members', user.uid);
      await setDoc(memberRef, {
        uid:         user.uid,
        displayName: `${user.firstname} ${user.lastname}`,
        firstname: user.firstname,
        lastname: user.lastname,
        photo_url: user.photo_url,
        email:       user.email ?? null,
        role:        user.role ?? 'member',
        position:    user.position ?? null,
        joinedAt:    serverTimestamp(),
      });

      Alert.alert('Joined!', `Welcome to "${preview.name}"!`, [
        {
          text: 'View Room',
          onPress: () => router.replace(`/(member)/rooms/${preview.id}` as any),
        },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to join room. Please try again.');
    }

    setJoining(false);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-safe pb-4 border-b border-border bg-background">
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-800 dark:text-white flex-1">Join a Room</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Illustration */}
        <View className="items-center py-8">
          <View className="bg-primary/10 rounded-3xl p-6 mb-4">
            <Ionicons name="key-outline" size={52} color="#6366f1" />
          </View>
          <Text className="text-lg font-bold text-gray-800 dark:text-white text-center">
            Enter Room Code
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 px-4">
            Ask your room admin for the code to join their room
          </Text>
        </View>

        {/* Code input */}
        <View className="bg-card border border-border rounded-2xl p-4 gap-3 mb-4">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider">Room Code</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={roomCode}
              onChangeText={(t) => {
                setRoomCode(t.toUpperCase());
                setPreview(null);
              }}
              placeholder="e.g. ABC123"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-lg font-black tracking-widest text-gray-800 dark:text-white text-center"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <TouchableOpacity
            onPress={handleLookup}
            disabled={checking || roomCode.trim().length < 4}
            activeOpacity={0.7}
            className={`bg-gray-100 dark:bg-gray-800 rounded-xl py-3 items-center flex-row justify-center gap-2 ${
              checking || roomCode.trim().length < 4 ? 'opacity-50' : ''
            }`}
          >
            <Ionicons name="search-outline" size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {checking ? 'Looking up…' : 'Look Up Room'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Room preview */}
        {preview && (
          <View className="bg-card border-2 border-primary/30 rounded-2xl p-4 mb-4 gap-3">
            <View className="flex-row items-center gap-2 mb-1">
              <View className="bg-primary/10 rounded-xl p-2">
                <Ionicons name="folder-outline" size={20} color="#6366f1" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-gray-800 dark:text-white">
                  {preview.name}
                </Text>
                <Text className="text-xs text-gray-400">
                  Code: {preview.roomCode}
                </Text>
              </View>
              <View className="bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-md">
                <Text className="text-xs font-semibold text-green-600 dark:text-green-400">Found!</Text>
              </View>
            </View>

            {preview.description ? (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {preview.description}
              </Text>
            ) : null}

            <View className="flex-row items-center gap-1 bg-primary/5 rounded-xl px-3 py-2">
              <Ionicons name="information-circle-outline" size={14} color="#6366f1" />
              <Text className="text-xs text-primary flex-1">
                You'll join instantly and can view and update your assigned tasks.
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.7}
              className={`bg-primary rounded-xl py-3.5 items-center flex-row justify-center gap-2 ${joining ? 'opacity-50' : ''}`}
            >
              <Ionicons name="enter-outline" size={18} color="white" />
              <Text className="text-white font-bold text-sm">
                {joining ? 'Joining…' : `Join "${preview.name}"`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works */}
        <View className="gap-3">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider">How it works</Text>
          {[
            { icon: 'chatbubble-ellipses-outline', text: 'Get the room code from your admin' },
            { icon: 'keypad-outline',              text: 'Enter the code above and tap Look Up' },
            { icon: 'enter-outline',               text: 'Confirm and join the room instantly' },
            { icon: 'clipboard-outline',           text: 'View and complete your assigned tasks' },
          ].map((step, i) => (
            <View key={i} className="flex-row items-center gap-3">
              <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center">
                <Text className="text-xs font-black text-primary">{i + 1}</Text>
              </View>
              <View className="bg-card border border-border rounded-xl px-3 py-2 flex-1 flex-row items-center gap-2">
                <Ionicons name={step.icon as any} size={15} color="#6b7280" />
                <Text className="text-xs text-gray-600 dark:text-gray-400 flex-1">{step.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}