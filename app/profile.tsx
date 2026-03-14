import { Text } from '@/components/ui/text';
import {
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db } from '@/FirebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import type { AuthUser } from '@/context/AuthContext';
import { uploadImage } from '@/utils/upload';
import { Image } from 'expo-image'

type FieldProps = {
  label: string;
  children: React.ReactNode;
  error?: string;
};
const Field = ({ label, children, error }: FieldProps) => (
  <View className="gap-1.5">
    <Text className="text-[12px] font-semibold uppercase tracking-widest text-gray-400">{label}</Text>
    {children}
    {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
  </View>
);

type InputProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
};
const StyledInput = ({
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'words',
  editable = true,
}: InputProps) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    autoCapitalize={autoCapitalize}
    editable={editable}
    placeholderTextColor="#9ca3af"
    className={`bg-card border border-border rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white ${
      !editable ? 'opacity-50' : ''
    }`}
  />
);

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { darkMode } = useTheme();

  const [firstname, setFirstname]         = useState(user?.firstname ?? '');
  const [lastname, setLastname]           = useState(user?.lastname ?? '');
  const [position, setPosition]           = useState(user?.position ?? '');
  const [photoUri, setPhotoUri]           = useState<string | null>(user?.photo_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [errors, setErrors]               = useState<{ firstname?: string; lastname?: string; position?: string }>({});

  function validate() {
    const e: typeof errors = {};
    if (!firstname.trim()) e.firstname = 'First name is required.';
    if (!lastname.trim())  e.lastname  = 'Last name is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!validate()) return;
    if (!user?.uid) return;

    setSaving(true);
    try {
      let photo_url = user.photo_url ?? null;

      // If a new local image was picked, upload it via utils/upload
      if (photoUri && photoUri !== user.photo_url) {
        setUploadingPhoto(true);
        const uploadData = await uploadImage(photoUri);
        setUploadingPhoto(false);

        if (!uploadData?.url) {
          Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
          setSaving(false);
          return;
        }

        photo_url = uploadData.url;
        setPhotoUri(photo_url); // swap local uri → remote url
      }

      const updates = {
        firstname: firstname.trim(),
        lastname:  lastname.trim(),
        position:  position.trim(),
        photo_url,
      };

      // Save to Firestore
      await updateDoc(doc(db, 'users', user.uid), updates);

      // Update local auth context so UI reflects immediately
      setUser({ ...user, ...updates } as AuthUser);

      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (err: any) {
      console.error('Profile update error:', err);
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
      setUploadingPhoto(false);
    }
  }

  const isDirty =
    firstname !== user?.firstname ||
    lastname  !== user?.lastname  ||
    position  !== user?.position  ||
    photoUri  !== user?.photo_url;

  const initials =
    ((firstname.charAt(0) || user?.firstname?.charAt(0)) ?? 'U').toUpperCase();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-12"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View className="bg-card pt-14 pb-6 px-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  if (isDirty) {
                    Alert.alert('Discard changes?', 'You have unsaved changes.', [
                      { text: 'Keep editing', style: 'cancel' },
                      { text: 'Discard', style: 'destructive', onPress: () => router.canGoBack() ? router.back() : router.replace('/') },
                    ]);
                  } else {
                    router.canGoBack() ? router.back() : router.replace('/');
                  }
                }}
                className="w-9 h-9 rounded-full items-center justify-center"
              >
                <Ionicons name="arrow-back" size={18} color={darkMode ? '#ffffff' : '#151515'} />
              </TouchableOpacity>
              <Text className="text-gray-800 dark:text-white text-xl font-bold">Edit Profile</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSave}
              disabled={saving || !isDirty}
              className={`px-4 py-2 rounded-full ${isDirty ? 'bg-primary' : 'bg-background'}`}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className={`text-sm font-semibold ${isDirty ? 'text-white' : 'text-gray-400'}`}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-5 mt-6 gap-6">
          {/* ── Avatar picker ── */}
          <View className="items-center gap-3">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePickPhoto}  // ← tapping opens picker
              disabled={uploadingPhoto}
              className="relative"
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{
              width: 80,
              height: 80,
              borderRadius: 80
            }}
                  contentFit="cover"
                />
              ) : (
                <View className="w-24 h-24 rounded-full bg-primary items-center justify-center">
                  <Text className="text-white text-3xl font-bold">{initials}</Text>
                </View>
              )}

              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary border-2 border-background items-center justify-center">
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#ffffff" />
                )}
              </View>
            </TouchableOpacity>

            <Text className="text-xs text-gray-400 text-center">
              Tap the photo to change it
            </Text>

            {photoUri ? (
              <TouchableOpacity onPress={() => setPhotoUri(null)} activeOpacity={0.7}>
                <Text className="text-xs text-red-500 font-medium">Remove photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── Account info (read-only) ── */}
          <View className="bg-card rounded-2xl border border-border p-4 gap-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="information-circle-outline" size={16} color="#9ca3af" />
              <Text className="text-xs text-gray-400 font-medium">Account Info</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Email</Text>
              <Text className="text-sm text-gray-800 dark:text-white font-medium">
                {user?.email ?? '—'}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Role</Text>
              <View className="bg-primary/10 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs text-primary font-semibold capitalize">
                  {user?.role ?? '—'}
                </Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Sign-up method</Text>
              <Text className="text-sm text-gray-800 dark:text-white font-medium capitalize">
                {user?.signup_method ?? '—'}
              </Text>
            </View>
          </View>

          {/* ── Editable fields ── */}
          <View className="bg-card rounded-2xl border border-border p-4 gap-4">
            <Field label="First Name" error={errors.firstname}>
              <StyledInput
                value={firstname}
                onChangeText={(v) => {
                  setFirstname(v);
                  if (errors.firstname) setErrors((e) => ({ ...e, firstname: undefined }));
                }}
                placeholder="e.g. Juan"
              />
            </Field>

            <Field label="Last Name" error={errors.lastname}>
              <StyledInput
                value={lastname}
                onChangeText={(v) => {
                  setLastname(v);
                  if (errors.lastname) setErrors((e) => ({ ...e, lastname: undefined }));
                }}
                placeholder="e.g. Dela Cruz"
              />
            </Field>

            <Field label="Position" error={errors.position}>
              <StyledInput
                value={position}
                onChangeText={(v) => {
                  setPosition(v);
                  if (errors.position) setErrors((e) => ({ ...e, position: undefined }));
                }}
                placeholder="e.g. President"
              />
            </Field>
          </View>

          {/* ── Danger zone ── */}
          <View className="rounded-2xl border border-border overflow-hidden mb-10">
            <View className="px-4 py-3 border-b border-border">
              <Text className="text-xs font-semibold uppercase tracking-widest text-red-400">
                Danger Zone
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                Alert.alert(
                  'Delete Account',
                  'This action is permanent and cannot be undone. Please contact your administrator.',
                  [{ text: 'OK', style: 'cancel' }]
                )
              }
              className="flex-row items-center px-4 py-3.5 gap-3"
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-red-50 dark:bg-red-950">
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-red-500">Delete Account</Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  Contact an admin to remove your account
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}