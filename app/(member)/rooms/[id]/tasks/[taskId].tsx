import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollView, View, TouchableOpacity, Alert, ActivityIndicator, Modal, Linking } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { uploadFile } from '@/utils/upload';
import { Image } from 'expo-image';
import { NativeVideoPlayer } from '@/components/NativeVideoPlayer';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'low' | 'medium' | 'high';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50',  dot: 'bg-green-500'  },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50',  dot: 'bg-amber-400'  },
  high:   { label: 'High',   color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50',      dot: 'bg-red-500'    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTimestamp = (ts: any): string => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const parseDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null;
  // Handle M/D/YY or M/D/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts.map(Number);
    if (!isNaN(m) && !isNaN(d) && !isNaN(y)) {
      // Adjust 2-digit year
      if (y < 100) y += 2000;
      return new Date(y, m - 1, d);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const getDueStatus = (dueDate: string | null) => {
  const d = parseDate(dueDate);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`, color: '#ef4444', icon: 'alert-circle-outline' };
  if (diff === 0) return { label: 'Due today',    color: '#f59e0b', icon: 'time-outline'     };
  if (diff === 1) return { label: 'Due tomorrow', color: '#f59e0b', icon: 'time-outline'     };
  return           { label: `Due in ${diff} days`, color: '#6b7280', icon: 'calendar-outline' };
};

// ─── Small components ─────────────────────────────────────────────────────────

const InfoRow = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <View className="flex-row items-start gap-3 py-3 border-b border-border last:border-0">
    <View className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 items-center justify-center mt-0.5">
      <Ionicons name={icon as any} size={15} color="#6b7280" />
    </View>
    <View className="flex-1">
      <Text className="text-xs text-gray-400 mb-0.5">{label}</Text>
      {children}
    </View>
  </View>
);

const Avatar = ({ name, size = 32 }: { name: string; size?: number }) => {
  const letter  = (name || '?')[0].toUpperCase();
  const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  const color   = palette[letter.charCodeAt(0) % palette.length];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22' }}
      className="items-center justify-center"
    >
      <Text style={{ color, fontSize: size * 0.38, fontWeight: '700' }}>{letter}</Text>
    </View>
  );
};

// ─── Proof of Completion Modal ────────────────────────────────────────────────

type PickedFile = {
  uri: string;
  type: 'image' | 'video';
  name: string;
  mimeType: string;
  fileSize?: number;
};

type ProofModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (files: PickedFile[]) => Promise<void>;
  uploading: boolean;
};

const ProofModal = ({ visible, onClose, onSubmit, uploading }: ProofModalProps) => {
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);

  const handlePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo/video library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const newFiles: PickedFile[] = result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        name: asset.fileName || `${asset.type || 'file'}-${Date.now()}.${asset.uri.split('.').pop()}`,
        mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileSize: asset.fileSize,
      }));
      setPickedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const newFile: PickedFile = {
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        name: asset.fileName || `${asset.type || 'file'}-${Date.now()}.${asset.uri.split('.').pop()}`,
        mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileSize: asset.fileSize,
      };
      setPickedFiles(prev => [...prev, newFile]);
    }
  };

  const removeFile = (index: number) => {
    setPickedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (pickedFiles.length === 0) return;
    await onSubmit(pickedFiles);
    setPickedFiles([]);
  };

  const handleClose = () => {
    if (!uploading) {
      setPickedFiles([]);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-3xl px-5 pt-5 pb-10">
          {/* Handle */}
          <View className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 self-center mb-5" />

          <Text className="text-base font-bold text-gray-800 dark:text-white mb-1">
            Proof of Completion
          </Text>
          <Text className="text-xs text-gray-400 mb-5">
            Upload a photo as proof before marking this task complete.
          </Text>

          {/* Preview list */}
          {pickedFiles.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-6"
              contentContainerStyle={{ gap: 12 }}
            >
              {pickedFiles.map((file, idx) => (
                <View key={idx} className="w-40 h-40 rounded-2xl overflow-hidden border border-border relative bg-gray-100 dark:bg-gray-800">
                  {file.type === 'video' ? (
                    <View className="flex-1 items-center justify-center">
                      <Ionicons name="videocam" size={40} color="#6366f1" />
                      <Text className="text-[10px] text-gray-500 mt-2 px-2 text-center" numberOfLines={1}>{file.name}</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: file.uri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  )}
                  <TouchableOpacity
                    onPress={() => removeFile(idx)}
                    disabled={uploading}
                    activeOpacity={0.8}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 items-center justify-center"
                  >
                    <Ionicons name="close" size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
              
              {/* Add more button */}
              <TouchableOpacity
                onPress={handlePick}
                disabled={uploading}
                className="w-40 h-40 rounded-2xl border-2 border-dashed border-border items-center justify-center gap-2"
              >
                <Ionicons name="add-circle-outline" size={32} color="#9ca3af" />
                <Text className="text-xs text-gray-400 font-medium">Add more</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Pick buttons (only show if none selected) */}
          {pickedFiles.length === 0 && (
            <View className="flex-row gap-3 mb-6">
              <TouchableOpacity
                onPress={handleCamera}
                activeOpacity={0.8}
                className="flex-1 bg-card border border-border rounded-2xl py-6 items-center gap-2"
              >
                <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                  <Ionicons name="camera-outline" size={26} color="#6366f1" />
                </View>
                <Text className="text-xs font-bold text-gray-600 dark:text-gray-300">Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePick}
                activeOpacity={0.8}
                className="flex-1 bg-card border border-border rounded-2xl py-6 items-center gap-2"
              >
                <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                  <Ionicons name="image-outline" size={26} color="#6366f1" />
                </View>
                <Text className="text-xs font-bold text-gray-600 dark:text-gray-300">Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Actions */}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={pickedFiles.length === 0 || uploading}
            activeOpacity={0.8}
            className={`rounded-2xl py-4 items-center flex-row justify-center gap-2 ${
              pickedFiles.length > 0 && !uploading ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color={pickedFiles.length > 0 ? 'white' : '#9ca3af'} />
            )}
            <Text className={`font-bold text-sm ${pickedFiles.length > 0 && !uploading ? 'text-white' : 'text-gray-400'}`}>
              {uploading ? `Uploading ${pickedFiles.length} files...` : `Submit ${pickedFiles.length} Attachment${pickedFiles.length !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} activeOpacity={0.7} className="items-center py-2">
            <Text className="text-sm text-gray-400 font-medium">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Proof Viewer Modal ───────────────────────────────────────────────────────

const ProofViewerModal = ({ visible, uri, onClose }: { visible: boolean; uri: string; onClose: () => void }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View className="flex-1 bg-black/90 items-center justify-center p-5">
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.8}
        className="absolute top-14 right-5 w-10 h-10 rounded-full bg-white/10 items-center justify-center z-10"
      >
        <Ionicons name="close" size={20} color="white" />
      </TouchableOpacity>
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '70%', borderRadius: 16 }}
        contentFit="contain"
      />
    </View>
  </Modal>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemberTaskDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id: roomId, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();

  const [task, setTask]           = useState<any>(null);
  const [members, setMembers]     = useState<any[]>([]);
  const [roomName, setRoomName]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);

  // Proof state
  const [proofModalVisible, setProofModalVisible]   = useState(false);
  const [viewerVisible, setViewerVisible]           = useState(false);
  const [selectedProofUri, setSelectedProofUri] = useState<string | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  useEffect(() => {
    if (!roomId || !taskId) return;

    // Fetch static data once
    const fetchStatic = async () => {
      try {
        const roomSnap = await getDoc(doc(db, 'rooms', roomId));
        if (roomSnap.exists()) setRoomName(roomSnap.data().name || '');

        const membersSnap = await getDocs(collection(db, 'rooms', roomId, 'members'));
        setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error fetching static task data:', e);
      }
    };
    fetchStatic();

    // Listen to real-time task changes
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId, 'tasks', taskId),
      (docSnap) => {
        if (docSnap.exists()) {
          setTask({ id: docSnap.id, ...docSnap.data() });
        }
        setLoading(false);
      },
      (err) => {
        console.error('Task listener error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId, taskId]);

  const isAssignedToMe = task?.assignees?.includes(user?.uid);

  // ── Called when user taps "Mark as Complete" ─────────────────────────────
  const handleMarkComplete = () => {
    // If already completed → reopen directly (no proof needed)
    if (task.completed) {
      handleReopen();
      return;
    }
    // Require proof before completing
    setProofModalVisible(true);
  };

  // ── Helper to convert URI to Base64 ─────────────────────────────────────────
  const toBase64 = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ── Upload all picked files then mark task complete ──────────────────────────
  const handleProofSubmit = async (files: PickedFile[]) => {
    setUploadingProof(true);
    try {
      const attachmentUrls: string[] = [];
      
      for (const file of files) {
        if (file.type === 'video' || (file.fileSize && file.fileSize > 1000000)) {
          // Videos or large images (>1MB) go to Cloudinary
          const uploadData = await uploadFile(file.uri, file.name, file.mimeType);
          if (uploadData?.url) attachmentUrls.push(uploadData.url);
        } else {
          // Small images: Try Base64 first (usually faster for small files)
          try {
            const base64 = await toBase64(file.uri);
            if (base64.length < 1300000) { // ~1MB limit for Base64 safety
              attachmentUrls.push(base64);
            } else {
              // Fallback to Cloudinary if Base64 ends up too large
              const uploadData = await uploadFile(file.uri, file.name, file.mimeType);
              if (uploadData?.url) attachmentUrls.push(uploadData.url);
            }
          } catch (e) {
            // If Base64 conversion fails (e.g. memory), fallback to Cloudinary
            const uploadData = await uploadFile(file.uri, file.name, file.mimeType);
            if (uploadData?.url) attachmentUrls.push(uploadData.url);
          }
        }
      }

      if (attachmentUrls.length === 0) {
        Alert.alert('Upload failed', 'No files could be processed. Please try again.');
        return;
      }

      const existingAttachments = task?.proof_attachments || [];
      const updatedAttachments = [...existingAttachments, ...attachmentUrls];

      const now = new Date().toISOString();
      const updates = {
        status: 'pending' as const,
        completed: false,
        proof_attachments: updatedAttachments,
        proof_url: updatedAttachments[0], // Keep the first one as primary
        proof_submitted_at: now,
        proof_submitted_by: user?.uid ?? null,
      };

      await updateDoc(doc(db, 'rooms', roomId, 'tasks', taskId), updates);
      setTask((prev: any) => ({ ...prev, ...updates }));
      setProofModalVisible(false);
    } catch (e: any) {
      console.error('Proof submission error:', e);
      const msg = e.response?.data?.error || e.message || 'Failed to submit proof. Please try again.';
      Alert.alert('Submission Error', msg);
    } finally {
      setUploadingProof(false);
    }
  };

  const handleRemoveAttachment = async (index: number) => {
    const attachmentToRemove = task.proof_attachments[index];
    const newAttachments = task.proof_attachments.filter((_: any, i: number) => i !== index);
    
    Alert.alert(
      'Remove Attachment?',
      'Are you sure you want to remove this proof?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            try {
              const updates: any = {
                proof_attachments: newAttachments,
                proof_url: newAttachments.length > 0 ? newAttachments[0] : null,
              };

              // If no attachments left, and it was pending/rejected, maybe we should keep it that way
              // but for now let's just update the list.
              await updateDoc(doc(db, 'rooms', roomId, 'tasks', taskId), updates);
              setTask((prev: any) => ({ ...prev, ...updates }));
            } catch (e) {
              Alert.alert('Error', 'Could not remove attachment.');
            }
          }
        }
      ]
    );
  };

  // ── Reopen task — clear proof fields ─────────────────────────────────────
  const handleReopen = () => {
    Alert.alert(
      'Reopen Task?',
      'This will mark the task as pending and remove the proof of completion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          style: 'destructive',
          onPress: async () => {
            setToggling(true);
            const updates = {
              completed: false,
              proof_url: null,
              proof_attachments: [],
              proof_submitted_at: null,
              proof_submitted_by: null,
            };
            try {
              await updateDoc(doc(db, 'rooms', roomId, 'tasks', taskId), updates);
              setTask((prev: any) => ({ ...prev, ...updates }));
            } catch (e) {
              Alert.alert('Error', 'Could not reopen task.');
            }
            setToggling(false);
          },
        },
      ]
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 bg-background p-5 pt-safe my-5">
        <Skeleton className="h-8 w-48 rounded-xl mb-5" />
        <Skeleton className="h-20 w-full rounded-2xl mb-3" />
        <Skeleton className="h-40 w-full rounded-2xl mb-3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </View>
    );
  }

  if (!task) {
    return (
      <View className="flex-1 bg-background items-center justify-center gap-3 p-5">
        <Ionicons name="alert-circle-outline" size={40} color="#9ca3af" />
        <Text className="text-sm text-gray-400 text-center">Task not found</Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7} className="bg-primary rounded-xl px-5 py-2">
          <Text className="text-white font-medium text-sm">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pCfg           = PRIORITY_CONFIG[task.priority as Priority] ?? PRIORITY_CONFIG.medium;
  const dueStatus      = getDueStatus(task.dueDate);
  const assignedMembers = members.filter((m) => task.assignees?.includes(m.id));
  const hasProof       = !!task.proof_url;

  // Overdue + not completed = Incomplete
  const isIncomplete = !task.completed && task.dueDate && (() => {
    const d = parseDate(task.dueDate);
    if (!d) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-background my-5">

      {/* Proof upload modal */}
      <ProofModal
        visible={proofModalVisible}
        onClose={() => setProofModalVisible(false)}
        onSubmit={handleProofSubmit}
        uploading={uploadingProof}
      />

      {/* Proof photo full-screen viewer */}
      <ProofViewerModal
        visible={viewerVisible}
        uri={selectedProofUri || task.proof_url}
        onClose={() => setViewerVisible(false)}
      />

      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-safe pb-4 border-b border-border bg-background">
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-800 dark:text-white" numberOfLines={1}>
            Task Details
          </Text>
          {roomName ? (
            <Text className="text-xs text-gray-400">{roomName}</Text>
          ) : null}
        </View>
        {!isAssignedToMe && (
          <View className="bg-gray-100 dark:bg-gray-800 rounded-xl px-2.5 py-1 flex-row items-center gap-1">
            <Ionicons name="eye-outline" size={12} color="#9ca3af" />
            <Text className="text-xs text-gray-400">View only</Text>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-16 gap-4"
        showsVerticalScrollIndicator={false}
      >

        {/* Status banner */}
        <TouchableOpacity
          onPress={isAssignedToMe && !isIncomplete && !task.completed && task.status !== 'pending' ? handleMarkComplete : undefined}
          activeOpacity={isAssignedToMe && !isIncomplete && !task.completed && task.status !== 'pending' ? 0.75 : 1}
          className={`flex-row items-center gap-3 rounded-2xl p-4 border ${
            task.status === 'completed'
              ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900'
              : task.status === 'pending'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
              : task.status === 'rejected'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
              : isIncomplete
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
              : isAssignedToMe
              ? 'bg-primary/5 border-primary/20'
              : 'bg-card border-border'
          }`}
        >
          <View
            className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
              task.status === 'completed'
                ? 'bg-green-500 border-green-500'
                : task.status === 'pending'
                ? 'bg-amber-500 border-amber-500'
                : task.status === 'rejected'
                ? 'bg-red-500 border-red-500'
                : isIncomplete
                ? 'bg-red-500 border-red-500'
                : isAssignedToMe
                ? 'border-primary/60'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {task.status === 'completed' && <Ionicons name="checkmark" size={14} color="white" />}
            {task.status === 'pending' && <Ionicons name="time" size={14} color="white" />}
            {(task.status === 'rejected' || (!task.status && isIncomplete)) && <Ionicons name="alert" size={14} color="white" />}
          </View>

          <View className="flex-1">
            <Text
              className={`text-sm font-bold ${
                task.status === 'completed'
                  ? 'text-green-700 dark:text-green-400'
                  : task.status === 'pending'
                  ? 'text-amber-600 dark:text-amber-400'
                  : task.status === 'rejected'
                  ? 'text-red-600 dark:text-red-400'
                  : isIncomplete
                  ? 'text-red-600 dark:text-red-400'
                  : isAssignedToMe
                  ? 'text-primary'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {task.completed
                ? 'Completed'
                : task.status === 'pending'
                ? 'Pending Approval'
                : task.status === 'rejected'
                ? 'Task Rejected'
                : isIncomplete
                ? 'Incomplete'
                : isAssignedToMe
                ? 'Mark as complete'
                : 'Pending'}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {task.completed
                ? isAssignedToMe ? 'Tap to reopen' : 'This task is done'
                : task.status === 'pending'
                ? 'Awaiting admin review'
                : task.status === 'rejected'
                ? 'Please review feedback and re-submit proof'
                : isIncomplete
                ? 'This task is past its due date'
                : isAssignedToMe
                ? 'A photo proof is required to complete this task'
                : 'Waiting to be completed'}
            </Text>
          </View>

          {isAssignedToMe && (
            <Ionicons
              name={task.completed ? 'checkmark-circle' : task.status === 'pending' ? 'time' : (task.status === 'rejected' || isIncomplete) ? 'alert-circle' : 'ellipse-outline'}
              size={22}
              color={task.completed ? '#22c55e' : task.status === 'pending' ? '#f59e0b' : (task.status === 'rejected' || isIncomplete) ? '#ef4444' : '#6366f1'}
            />
          )}
        </TouchableOpacity>

        {/* "Assigned to me" callout */}
        {isAssignedToMe && !task.completed && task.status !== 'pending' && (
          <View className="flex-row items-center gap-2 bg-primary/10 rounded-xl px-3 py-2.5">
            <Ionicons name="camera-outline" size={15} color="#6366f1" />
            <Text className="text-xs font-semibold text-primary flex-1">
              {task.status === 'rejected' ? 'Re-submit proof to try again.' : 'Upload a photo proof to mark this task as complete.'}
            </Text>
          </View>
        )}

        {/* Title & description */}
        <View className="bg-card border border-border rounded-2xl p-4 gap-2">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Task</Text>
          <Text
            className={`text-base font-bold ${
              task.completed
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-800 dark:text-white'
            }`}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text className="text-sm text-gray-600 dark:text-gray-400 leading-5">
              {task.description}
            </Text>
          ) : (
            <Text className="text-sm text-gray-300 dark:text-gray-600 italic">No description</Text>
          )}
        </View>

        {/* ── Proof of Completion Card ── */}
        <View className="bg-card border border-border rounded-2xl overflow-hidden">
          <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
            <Ionicons name="image-outline" size={15} color={hasProof ? '#22c55e' : '#9ca3af'} />
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Proof of Completion
            </Text>
            {hasProof && (
              <View className="ml-auto bg-green-50 dark:bg-green-950/50 rounded-full px-2 py-0.5">
                <Text className="text-xs font-semibold text-green-600 dark:text-green-400">Submitted</Text>
              </View>
            )}
          </View>

          {task.proof_attachments && task.proof_attachments.length > 0 ? (
            <View>
              {/* Attachments list */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="py-4 px-4"
                contentContainerStyle={{ gap: 12 }}
              >
                {task.proof_attachments.map((url: string, idx: number) => {
                  const isVideo = ['mp4', 'mov', 'm4v', '3gp', 'avi'].some(ext => url.toLowerCase().endsWith('.' + ext)) || url.toLowerCase().includes('video');
                  
                  return (
                    <View key={idx} className="w-48 rounded-2xl overflow-hidden border border-border bg-gray-100 dark:bg-gray-800">
                      {isVideo ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => {
                            setSelectedVideoUri(url);
                            setVideoViewerVisible(true);
                          }}
                          className="flex-1 h-32 items-center justify-center p-4"
                        >
                          <Ionicons name="play-circle" size={48} color="#6366f1" />
                          <Text className="text-[10px] text-gray-500 mt-2 text-center" numberOfLines={1}>
                            Tap to play video
                          </Text>
                          <View className="mt-2 bg-primary/10 px-2 py-0.5 rounded-md">
                            <Text className="text-[10px] text-primary font-bold">Video Proof</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => {
                            setSelectedProofUri(url);
                            setViewerVisible(true);
                          }}
                        >
                          <Image
                            source={{ uri: url }}
                            style={{ width: '100%', height: 128 }}
                            contentFit="cover"
                          />
                          <View className="absolute bottom-2 right-2 bg-black/50 rounded-lg px-2 py-1">
                            <Ionicons name="expand-outline" size={10} color="white" />
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Remove button */}
                      {isAssignedToMe && !task.completed && (
                        <TouchableOpacity
                          onPress={() => handleRemoveAttachment(idx)}
                          activeOpacity={0.7}
                          className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full items-center justify-center border-2 border-white shadow-sm"
                        >
                          <Ionicons name="trash" size={12} color="white" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Meta info */}
              <View className="px-4 pb-3 pt-1 gap-1 border-t border-border/50">
                {task.proof_submitted_at ? (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">
                      Submitted on{' '}
                      {new Date(task.proof_submitted_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                ) : null}
                {task.proof_submitted_by ? (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="person-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">
                      By{' '}
                      {task.proof_submitted_by === user?.uid
                        ? 'you'
                        : members.find((m) => m.id === task.proof_submitted_by)?.displayName ?? 'a member'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : task.proof_url ? (
            <View>
              {/* Backward compatibility with single proof_url */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setSelectedProofUri(task.proof_url);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: task.proof_url }}
                  style={{ width: '100%', height: 200 }}
                  contentFit="cover"
                />
                <View className="absolute bottom-2 right-2 bg-black/50 rounded-lg px-2 py-1 flex-row items-center gap-1">
                  <Ionicons name="expand-outline" size={11} color="white" />
                  <Text className="text-white text-xs">Tap to expand</Text>
                </View>
              </TouchableOpacity>
              
              <View className="px-4 py-3 gap-1">
                {task.proof_submitted_at && (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">
                      Submitted on {new Date(task.proof_submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View className="p-8 items-center justify-center">
              <View className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800/50 items-center justify-center mb-3">
                <Ionicons name="camera-outline" size={24} color="#9ca3af" />
              </View>
              <Text className="text-sm text-gray-400 font-medium text-center">No proof submitted yet</Text>
              <Text className="text-xs text-gray-400/60 text-center mt-1">A photo or video will appear here once the task is marked complete.</Text>
            </View>
          )}
        </View>

        {/* Details */}
        <View className="bg-card border border-border rounded-2xl px-4">
          {/* Priority */}
          <InfoRow icon="flag-outline" label="Priority">
            <View className={`self-start flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg mt-0.5 ${pCfg.bg}`}>
              <View className={`w-2 h-2 rounded-full ${pCfg.dot}`} />
              <Text className="text-sm font-semibold" style={{ color: pCfg.color }}>
                {pCfg.label}
              </Text>
            </View>
          </InfoRow>

          {/* Due date */}
          <InfoRow icon="calendar-outline" label="Due Date">
            {task.dueDate ? (
              <View className="mt-0.5">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">{task.dueDate}</Text>
                {dueStatus && (
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Ionicons name={dueStatus.icon as any} size={11} color={dueStatus.color} />
                    <Text className="text-xs font-medium" style={{ color: dueStatus.color }}>
                      {dueStatus.label}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text className="text-sm text-gray-300 dark:text-gray-600 italic mt-0.5">No due date</Text>
            )}
          </InfoRow>

          {/* Created */}
          <InfoRow icon="time-outline" label="Created">
            <Text className="text-sm font-medium text-gray-800 dark:text-white mt-0.5">
              {formatTimestamp(task.createdAt)}
            </Text>
          </InfoRow>

          {/* Assignees */}
          <View className="py-3">
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 items-center justify-center">
                <Ionicons name="people-outline" size={15} color="#6b7280" />
              </View>
              <Text className="text-xs text-gray-400">Assignees</Text>
            </View>
            {assignedMembers.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 ml-11">
                {assignedMembers.map((m) => (
                  <View
                    key={m.id}
                    className={`flex-row items-center gap-2 rounded-xl px-3 py-1.5 border ${
                      m.id === user?.uid
                        ? 'bg-primary/10 border-primary/20'
                        : 'bg-background border-border'
                    }`}
                  >
                    <Avatar name={m.displayName || m.email} size={22} />
                    <Text className={`text-xs font-medium ${m.id === user?.uid ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                      {m.id === user?.uid ? 'You' : (m.displayName || m.email)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-gray-300 dark:text-gray-600 italic ml-11">Unassigned</Text>
            )}
          </View>
        </View>

        {/* Info */}
        <View className="bg-card border border-border rounded-2xl p-4 gap-1">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Info</Text>
          <View className="flex-row justify-between items-center py-1 border-b border-border">
            <Text className="text-xs text-gray-400">Status</Text>
            <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-md ${
              task.status === 'completed'
                ? 'bg-green-50 dark:bg-green-950/50'
                : task.status === 'pending'
                ? 'bg-amber-50 dark:bg-amber-950/50'
                : task.status === 'rejected'
                ? 'bg-red-50 dark:bg-red-950/50'
                : isIncomplete
                ? 'bg-red-50 dark:bg-red-950/50'
                : 'bg-amber-50 dark:bg-amber-950/50'
            }`}>
              <View className={`w-1.5 h-1.5 rounded-full ${
                task.status === 'completed' ? 'bg-green-500' : task.status === 'rejected' || isIncomplete ? 'bg-red-500' : 'bg-amber-400'
              }`} />
              <Text className={`text-xs font-semibold ${
                task.status === 'completed'
                  ? 'text-green-600 dark:text-green-400'
                  : task.status === 'rejected' || isIncomplete
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {task.status === 'completed' ? 'Completed' : task.status === 'pending' ? 'Pending Approval' : task.status === 'rejected' ? 'Rejected' : isIncomplete ? 'Incomplete' : 'Pending'}
              </Text>
            </View>
          </View>
          <View className="flex-row justify-between items-center py-1 border-b border-border">
            <Text className="text-xs text-gray-400">Proof</Text>
            <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-md ${
              hasProof
                ? 'bg-green-50 dark:bg-green-950/50'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <Ionicons
                name={hasProof ? 'checkmark-circle' : 'ellipse-outline'}
                size={11}
                color={hasProof ? '#22c55e' : '#9ca3af'}
              />
              <Text className={`text-xs font-semibold ${hasProof ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                {hasProof ? 'Submitted' : 'Not yet'}
              </Text>
            </View>
          </View>
          <View className="flex-row justify-between items-center py-1">
            <Text className="text-xs text-gray-400">Your role</Text>
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {isAssignedToMe ? 'Assigned to you' : 'View only'}
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* Bottom CTA for assigned tasks */}
      {isAssignedToMe && (
        <View className="px-5 pb-safe pt-3 border-t border-border bg-background">
          <TouchableOpacity
            onPress={handleMarkComplete}
            disabled={toggling || uploadingProof}
            activeOpacity={0.8}
            className={`rounded-2xl py-4 items-center flex-row justify-center gap-2 ${
              task.completed ? 'bg-gray-200 dark:bg-gray-700' : 'bg-primary'
            } ${toggling || uploadingProof ? 'opacity-50' : ''}`}
          >
            <Ionicons
              name={task.completed ? 'arrow-undo-outline' : 'camera-outline'}
              size={20}
              color={task.completed ? '#6b7280' : 'white'}
            />
            <Text className={`font-bold text-sm ${task.completed ? 'text-gray-700 dark:text-gray-300' : 'text-white'}`}>
              {toggling
                ? 'Updating…'
                : task.completed
                ? 'Reopen Task'
                : 'Upload Proof & Complete'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Video Player Modal */}
      <Modal
        visible={videoViewerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setVideoViewerVisible(false)}
      >
        <View className="flex-1 bg-black pt-safe">
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
            <Text className="text-white font-bold">Video Proof</Text>
            <TouchableOpacity 
              onPress={() => setVideoViewerVisible(false)}
              className="w-10 h-10 items-center justify-center rounded-full bg-white/10"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          
          <View className="flex-1 justify-center p-4">
            {selectedVideoUri && <NativeVideoPlayer url={selectedVideoUri} />}
          </View>

          <View className="p-8 items-center">
             <Text className="text-white/40 text-xs text-center">
               Experimental In-App Player
             </Text>
          </View>
        </View>
      </Modal>

    </View>
  );
}