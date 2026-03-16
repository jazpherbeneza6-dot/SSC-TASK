import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Linking,
} from 'react-native';
import { Alert } from '@/utils/alerts';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';
import { Image } from 'expo-image';
import { NativeVideoPlayer } from '@/components/NativeVideoPlayer';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'low' | 'medium' | 'high';

type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  assignees: string[];
  completed: boolean;
  createdBy: string;
  createdAt: any;
  // Proof fields
  proof_url: string | null;
  proof_attachments?: string[];
  proof_submitted_at: string | null;
  proof_submitted_by: string | null;
  status?: 'pending' | 'completed' | 'rejected';
};

type Member = {
  id: string;
  displayName: string;
  email: string;
  role: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; darkBg: string; dot: string }> = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'bg-green-50',  darkBg: 'dark:bg-green-950', dot: 'bg-green-500' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'bg-amber-50',  darkBg: 'dark:bg-amber-950', dot: 'bg-amber-400' },
  high:   { label: 'High',   color: '#ef4444', bg: 'bg-red-50',    darkBg: 'dark:bg-red-950',   dot: 'bg-red-500'   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTimestamp = (ts: any): string => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getDueStatus = (dueDate: string | null): { label: string; color: string; icon: string } | null => {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`, color: '#ef4444', icon: 'alert-circle-outline' };
  if (diff === 0) return { label: 'Due today',    color: '#f59e0b', icon: 'time-outline' };
  if (diff === 1) return { label: 'Due tomorrow', color: '#f59e0b', icon: 'time-outline' };
  return { label: `Due in ${diff} days`, color: '#6b7280', icon: 'calendar-outline' };
};

// ─── Small reusable pieces ────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: string }) => (
  <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{children}</Text>
);

const InfoRow = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <View className="flex-row items-start gap-3 py-3 border-b border-border">
    <View className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 items-center justify-center mt-0.5">
      <Ionicons name={icon as any} size={15} color="#6b7280" />
    </View>
    <View className="flex-1">
      <Text className="text-xs text-gray-400 mb-0.5">{label}</Text>
      {children}
    </View>
  </View>
);

const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => {
  const letter = (name || '?')[0].toUpperCase();
  const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  const color = palette[letter.charCodeAt(0) % palette.length];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22' }}
      className="items-center justify-center"
    >
      <Text style={{ color, fontSize: size * 0.38, fontWeight: '700' }}>{letter}</Text>
    </View>
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

export default function TaskDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();

  const [task, setTask]       = useState<Task | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Edit mode
  const [editing,         setEditing]         = useState(false);
  const [editTitle,       setEditTitle]       = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority,    setEditPriority]    = useState<Priority>('medium');
  const [editDueDate,     setEditDueDate]     = useState('');
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const [date,           setDate]           = useState(new Date());
  const [pickerMonth,    setPickerMonth]    = useState(new Date().getMonth());
  const [pickerYear,     setPickerYear]     = useState(new Date().getFullYear());

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Assignee modal
  const [assigneeModalVisible,  setAssigneeModalVisible]  = useState(false);
  const [selectedAssignees,     setSelectedAssignees]     = useState<string[]>([]);

  // Delete modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // Proof viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedProofUri, setSelectedProofUri] = useState<string | null>(null);

  // Video viewer
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !taskId) return;

    // Fetch static data (members)
    const fetchStatic = async () => {
      try {
        const membersSnap = await getDocs(collection(db, 'rooms', id, 'members'));
        setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
      } catch (e) {
        console.error('Error fetching admin task static data:', e);
      }
    };
    fetchStatic();

    // Listen to real-time task changes
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', id, 'tasks', taskId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Task;
          setTask(data);
          // Only set initial edit values if not already editing to avoid overwriting user input
          setEditTitle(prev => prev || data.title);
          setEditDescription(prev => prev || data.description || '');
          setEditPriority(prev => prev || data.priority || 'medium');
          setEditDueDate(prev => prev || data.dueDate || '');
          setSelectedAssignees(prev => prev.length > 0 ? prev : (data.assignees || []));
        }
        setLoading(false);
      },
      (err) => {
        console.error('Admin task listener error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id, taskId]);

  // ── Toggle complete ───────────────────────────────────────────────────────

  const handleToggleComplete = async () => {
    if (!task) return;
    const next = !task.completed;
    setTask({ ...task, completed: next });
    try {
      await updateDoc(doc(db, 'rooms', id, 'tasks', taskId), { completed: next });
    } catch (e) {
      setTask({ ...task, completed: task.completed });
      Alert.alert('Error', 'Could not update task.');
    }
  };

  // ── Save edits ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Error', 'Task title is required.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        title:       editTitle.trim(),
        description: editDescription.trim(),
        priority:    editPriority,
        dueDate:     editDueDate.trim() || null,
        assignees:   selectedAssignees,
        updatedAt:   serverTimestamp(),
      };
      await updateDoc(doc(db, 'rooms', id, 'tasks', taskId), updates);
      setTask((prev) => prev ? { ...prev, ...updates } : prev);
      setEditing(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save changes.');
    }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'rooms', id, 'tasks', taskId));
      router.canGoBack() ? router.back() : router.replace('/');
    } catch (e) {
      Alert.alert('Error', 'Failed to delete task.');
    }
  };

  // ── Approval Logic ─────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const updates = {
        status: 'completed' as const,
        completed: true,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'rooms', id, 'tasks', taskId), updates);
      setTask((prev) => prev ? { ...prev, ...updates } : prev);
      Alert.alert('Success', 'Task accepted and marked as completed.');
    } catch (e) {
      Alert.alert('Error', 'Failed to accept task.');
    }
    setSaving(false);
  };

  const handleReject = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const updates = {
        status: 'rejected' as const,
        completed: false,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'rooms', id, 'tasks', taskId), updates);
      setTask((prev) => prev ? { ...prev, ...updates } : prev);
      Alert.alert('Task Rejected', 'The member will be notified to re-submit proof.');
    } catch (e) {
      Alert.alert('Error', 'Failed to reject task.');
    }
    setSaving(false);
  };

  const handleRemoveAttachment = async (index: number) => {
    if (!task) return;
    const newAttachments = (task.proof_attachments || []).filter((_: any, i: number) => i !== index);
    
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
              await updateDoc(doc(db, 'rooms', id, 'tasks', taskId), updates);
              setTask((prev) => prev ? ({ ...prev, ...updates }) : prev);
            } catch (e) {
              Alert.alert('Error', 'Could not remove attachment.');
            }
          }
        }
      ]
    );
  };

  // ── Assignee helpers ──────────────────────────────────────────────────────

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
      setEditDueDate(toDateStr(selectedDate));
    }
  };

  const assignedMembers = members.filter((m) => task?.assignees?.includes(m.id));

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 bg-background p-5 pt-safe">
        <Skeleton className="h-8 w-48 rounded-xl mb-5" />
        <Skeleton className="h-24 w-full rounded-2xl mb-3" />
        <Skeleton className="h-40 w-full rounded-2xl mb-3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </View>
    );
  }

  if (!task) {
    return (
      <View className="flex-1 bg-background items-center justify-center gap-3">
        <Ionicons name="alert-circle-outline" size={40} color="#9ca3af" />
        <Text className="text-sm text-gray-400">Task not found</Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7} className="bg-primary rounded-xl px-5 py-2">
          <Text className="text-white font-medium text-sm">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pCfg      = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const dueStatus = getDueStatus(task.dueDate);
  const hasProof  = !!task.proof_url || (task.proof_attachments && task.proof_attachments.length > 0);

  const submittedByName = task.proof_submitted_by
    ? members.find((m) => m.id === task.proof_submitted_by)?.displayName
      ?? members.find((m) => m.id === task.proof_submitted_by)?.email
      ?? 'Unknown member'
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-background">

      {/* Proof photo full-screen viewer */}
      <ProofViewerModal
        visible={viewerVisible}
        uri={selectedProofUri || task.proof_url || ''}
        onClose={() => setViewerVisible(false)}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View className="flex-row items-center gap-3 px-5 pt-safe pb-4 border-b border-border bg-background mt-5">
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-800 dark:text-white flex-1" numberOfLines={1}>
          Task Details
        </Text>
        <View className="flex-row gap-2">
          {editing ? (
            <>
              <TouchableOpacity
                onPress={() => setEditing(false)}
                activeOpacity={0.7}
                className="bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1.5"
              >
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-400">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.7}
                className={`bg-primary rounded-full px-4 py-1.5 ${saving ? 'opacity-50' : ''}`}
              >
                <Text className="text-sm font-semibold text-white">{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setEditing(true)}
                activeOpacity={0.7}
                className="bg-gray-100 dark:bg-gray-800 rounded-xl p-2"
              >
                <Ionicons name="create-outline" size={18} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(true)}
                activeOpacity={0.7}
                className="bg-red-50 dark:bg-red-950 rounded-xl p-2"
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>



      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 pb-12 gap-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Status banner (Admin) */}
        <View
          className={`flex-row items-center gap-3 rounded-2xl p-4 border ${
            task.status === 'completed'
              ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900'
              : task.status === 'pending'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900'
              : task.status === 'rejected'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
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
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {task.status === 'completed' && <Ionicons name="checkmark" size={14} color="white" />}
            {task.status === 'pending' && <Ionicons name="time" size={14} color="white" />}
            {task.status === 'rejected' && <Ionicons name="close" size={14} color="white" />}
            {!task.status && <View className="w-2 h-2 rounded-full bg-gray-400" />}
          </View>

          <View className="flex-1">
            <Text
              className={`text-sm font-bold ${
                task.status === 'completed'
                  ? 'text-green-700 dark:text-green-400'
                  : task.status === 'pending'
                  ? 'text-amber-600 dark:text-amber-400'
                  : task.status === 'rejected'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {task.completed
                ? 'Completed'
                : task.status === 'pending'
                ? 'Pending Approval'
                : task.status === 'rejected'
                ? 'Rejected'
                : 'Status: Pending'}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {task.completed
                ? 'Task is approved and done'
                : task.status === 'pending'
                ? 'Needs your review'
                : task.status === 'rejected'
                ? 'Waiting for re-submission'
                : 'Waiting for member to submit'}
            </Text>
          </View>

          {task.status === 'pending' && (
             <Ionicons name="eye-outline" size={20} color="#f59e0b" />
          )}
        </View>

        {/* ── Task card ───────────────────────────────────────────────── */}
        <View className="bg-card border border-border rounded-2xl p-4 gap-3">
          <SectionLabel>Task</SectionLabel>

          {editing ? (
            <>
              <View>
                <Text className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Title *</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Task title"
                  className="bg-background border border-border rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Add more details…"
                  multiline
                  numberOfLines={4}
                  className="bg-background border border-border rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-white"
                  style={{ textAlignVertical: 'top', minHeight: 90 }}
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </>
          ) : (
            <>
              <Text className={`text-base font-bold ${task.completed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>
                {task.title}
              </Text>
              {task.description ? (
                <Text className="text-sm text-gray-600 dark:text-gray-400 leading-5">
                  {task.description}
                </Text>
              ) : (
                <Text className="text-sm text-gray-300 dark:text-gray-600 italic">No description</Text>
              )}
            </>
          )}
        </View>

        {/* ── Proof of Completion (read-only) ─────────────────────────── */}
        <View className="bg-card border border-border rounded-2xl overflow-hidden">
          <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
            <Ionicons name="image-outline" size={15} color={hasProof ? '#22c55e' : '#9ca3af'} />
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Proof of Completion
            </Text>
            {/* Read-only badge */}
            <View className="ml-auto flex-row items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
              <Ionicons name="eye-outline" size={11} color="#9ca3af" />
              <Text className="text-xs text-gray-400">View only</Text>
            </View>
            {hasProof && (
              <View className="bg-green-50 dark:bg-green-950/50 rounded-full px-2 py-0.5 ml-1">
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
                  const isVideo = ['mp4', 'mov', 'm4v', '3gp', 'avi', 'mkv'].some(ext => url.toLowerCase().endsWith('.' + ext)) || url.toLowerCase().includes('video');
                  
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

                    </View>
                  );
                })}
              </ScrollView>

              {/* Meta info */}
              <View className="px-4 pb-3 pt-1 gap-1.5 border-t border-border/50">
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
                {submittedByName ? (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="person-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">By {submittedByName}</Text>
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
                  source={{ uri: task.proof_url! }}
                  style={{ width: '100%', height: 220 }}
                  contentFit="cover"
                />
                <View className="absolute bottom-2 right-2 bg-black/50 rounded-lg px-2 py-1 flex-row items-center gap-1">
                  <Ionicons name="expand-outline" size={11} color="white" />
                  <Text className="text-white text-xs">Tap to expand</Text>
                </View>
              </TouchableOpacity>

              <View className="px-4 py-3 gap-1.5">
                {task.proof_submitted_at && (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="time-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">
                      Submitted on {new Date(task.proof_submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                )}
                {submittedByName ? (
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name="person-outline" size={12} color="#9ca3af" />
                    <Text className="text-xs text-gray-400">By {submittedByName}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="px-4 py-6 items-center gap-2">
              <View className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 items-center justify-center">
                <Ionicons name="camera-outline" size={22} color="#9ca3af" />
              </View>
              <Text className="text-sm text-gray-400 text-center">No proof submitted yet</Text>
              <Text className="text-xs text-gray-300 dark:text-gray-600 text-center">
                A photo or video will appear here once the assigned member marks the task complete.
              </Text>
            </View>
          )}
        </View>

        {/* ── Approval Actions ───────────────────────────────────────── */}
        {task.status === 'pending' && !editing && (
          <View className="bg-card border border-amber-200 dark:border-amber-900 rounded-2xl p-4 gap-3 bg-amber-50/20 dark:bg-amber-950/10 mb-4">
            <Text className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Review Submission
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleReject}
                disabled={saving}
                activeOpacity={0.8}
                className="flex-1 bg-red-500 py-4 rounded-xl items-center justify-center flex-row gap-2"
              >
                <Ionicons name="close-circle-outline" size={18} color="white" />
                <Text className="text-white font-bold text-sm">Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAccept}
                disabled={saving}
                activeOpacity={0.8}
                className="flex-2 bg-green-500 py-4 rounded-xl items-center justify-center flex-row gap-2 px-8"
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="white" />
                <Text className="text-white font-bold text-sm">Accept Proof</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Details card ────────────────────────────────────────────── */}
        <View className="bg-card border border-border rounded-2xl px-4">
          <SectionLabel> </SectionLabel>

          {/* Priority */}
          <InfoRow icon="flag-outline" label="Priority">
            {editing ? (
              <View className="flex-row gap-2 mt-1">
                {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  const active = editPriority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setEditPriority(p)}
                      activeOpacity={0.7}
                      className={`flex-1 flex-row items-center justify-center gap-1 py-2 rounded-xl border-2 ${
                        active ? 'border-primary bg-primary/10' : 'border-border bg-background'
                      }`}
                    >
                      <View className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-gray-500'}`}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View className={`self-start flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg mt-0.5 ${pCfg.bg} ${pCfg.darkBg}`}>
                <View className={`w-2 h-2 rounded-full ${pCfg.dot}`} />
                <Text className="text-sm font-semibold" style={{ color: pCfg.color }}>
                  {pCfg.label}
                </Text>
              </View>
            )}
          </InfoRow>

          {/* Due date */}
          <InfoRow icon="calendar-outline" label="Due Date">
            {editing ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                  className="bg-background border border-border rounded-xl px-3 py-2 mt-1 flex-row items-center justify-between"
                >
                  <Text className={`text-sm ${editDueDate ? 'text-gray-800 dark:text-white' : 'text-gray-400'}`}>
                    {editDueDate || 'MM/DD/YYYY'}
                  </Text>
                  {editDueDate.length > 0 && (
                    <TouchableOpacity onPress={() => setEditDueDate('')}>
                      <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {showDatePicker && Platform.OS !== 'web' && (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                )}

                {/* Web Date Picker Fallback - Interactive Calendar */}
                <Modal
                  visible={showDatePicker && Platform.OS === 'web'}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <View className="flex-1 bg-black/50 justify-center items-center p-5">
                    <View className="bg-background rounded-2xl overflow-hidden w-full max-w-sm border border-border">
                      {/* Picker Header */}
                      <View className="bg-primary p-4 flex-row justify-between items-center">
                        <View>
                          <Text className="text-white/70 text-xs font-bold uppercase">Select Due Date</Text>
                          <Text className="text-white text-lg font-bold">
                            {new Date(pickerYear, pickerMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => setShowDatePicker(false)}
                          style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                        >
                          <Ionicons name="close-circle" size={28} color="white" />
                        </TouchableOpacity>
                      </View>

                      <View className="p-4 gap-4">
                        {/* Month Switcher */}
                        <View className="flex-row justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
                          <TouchableOpacity 
                            onPress={() => {
                              if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
                              else setPickerMonth(m => m - 1);
                            }}
                            className="p-2"
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                          >
                            <Ionicons name="chevron-back" size={20} color="#6366f1" />
                          </TouchableOpacity>
                          <Text className="font-bold text-gray-700 dark:text-gray-200">
                            {new Date(pickerYear, pickerMonth).toLocaleDateString('en-US', { month: 'short' })}
                          </Text>
                          <TouchableOpacity 
                            onPress={() => {
                              if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
                              else setPickerMonth(m => m + 1);
                            }}
                            className="p-2"
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                          >
                            <Ionicons name="chevron-forward" size={20} color="#6366f1" />
                          </TouchableOpacity>
                        </View>

                        {/* Calendar Grid */}
                        <View>
                          <View className="flex-row mb-1">
                            {['S','M','T','W','T','F','S'].map((d, i) => (
                              <Text key={i} className="flex-1 text-center text-[10px] font-bold text-gray-400">{d}</Text>
                            ))}
                          </View>
                          <View className="flex-row flex-wrap">
                            {(() => {
                              const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
                              const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
                              const cells = [];
                              for(let i=0; i<firstDay; i++) cells.push(<View key={`b-${i}`} style={{ width: '14.28%' }} className="h-9" />);
                              for(let d=1; d<=daysInMonth; d++) {
                                const isSelected = editDueDate === `${pickerYear}-${String(pickerMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                                const isToday = toDateStr(new Date()) === `${pickerYear}-${String(pickerMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                                cells.push(
                                  <TouchableOpacity 
                                    key={d} 
                                    onPress={() => {
                                      const selected = `${pickerYear}-${String(pickerMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                                      setEditDueDate(selected);
                                      setDate(new Date(pickerYear, pickerMonth, d));
                                      setShowDatePicker(false);
                                    }}
                                    style={[{ width: '14.28%' }, Platform.OS === 'web' ? { cursor: 'pointer' } : {}] as any}
                                    className="h-9 items-center justify-center"
                                  >
                                    <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? 'bg-primary' : isToday ? 'bg-primary/10' : ''}`}>
                                      <Text className={`text-xs font-bold ${isSelected ? 'text-white' : isToday ? 'text-primary' : 'text-gray-700 dark:text-gray-200'}`}>
                                        {d}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                );
                              }
                              return cells;
                            })()}
                          </View>
                        </View>

                        {/* Quick Options */}
                        <View className="flex-row gap-2 border-t border-border pt-4">
                          <TouchableOpacity 
                            onPress={() => {
                              const today = new Date();
                              setEditDueDate(toDateStr(today));
                              setDate(today);
                              setShowDatePicker(false);
                            }}
                            className="flex-1 bg-gray-100 dark:bg-gray-800 py-2.5 rounded-xl items-center"
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                          >
                            <Text className="text-xs font-bold text-gray-600 dark:text-gray-400">Today</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => {
                              const tomorrow = new Date();
                              tomorrow.setDate(tomorrow.getDate() + 1);
                              setEditDueDate(toDateStr(tomorrow));
                              setDate(tomorrow);
                              setShowDatePicker(false);
                            }}
                            className="flex-1 bg-gray-100 dark:bg-gray-800 py-2.5 rounded-xl items-center"
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                          >
                            <Text className="text-xs font-bold text-gray-600 dark:text-gray-400">Tomorrow</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </Modal>
              </>
            ) : task.dueDate ? (
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
              {editing && (
                <TouchableOpacity
                  onPress={() => setAssigneeModalVisible(true)}
                  activeOpacity={0.7}
                  className="ml-auto bg-primary/10 rounded-lg px-2.5 py-1"
                >
                  <Text className="text-xs font-semibold text-primary">Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {assignedMembers.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 ml-11">
                {assignedMembers.map((m) => (
                  <View key={m.id} className="flex-row items-center gap-2 bg-background border border-border rounded-xl px-3 py-1.5">
                    <Avatar name={m.displayName || m.email} size={22} />
                    <Text className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {m.displayName || m.email}
                    </Text>
                    {editing && (
                      <TouchableOpacity onPress={() => toggleAssignee(m.id)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                        <Ionicons name="close-circle" size={14} color="#9ca3af" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-gray-300 dark:text-gray-600 italic ml-11">
                {editing ? 'Tap Edit to assign members' : 'Unassigned'}
              </Text>
            )}
          </View>
        </View>

        {/* ── Info card ───────────────────────────────────────────────── */}
        <View className="bg-card border border-border rounded-2xl p-4 gap-2">
          <SectionLabel>Info</SectionLabel>
          <View className="flex-row justify-between items-center py-1">
            <Text className="text-xs text-gray-400">Task ID</Text>
            <Text className="text-xs font-mono text-gray-500 dark:text-gray-400">{task.id.slice(0, 12)}…</Text>
          </View>
          <View className="flex-row justify-between items-center py-1 border-t border-border">
            <Text className="text-xs text-gray-400">Status</Text>
            <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-md ${
              task.status === 'completed'
                ? 'bg-green-50 dark:bg-green-950/50'
                : task.status === 'pending'
                ? 'bg-amber-50 dark:bg-amber-950/50'
                : task.status === 'rejected'
                ? 'bg-red-50 dark:bg-red-950/50'
                : 'bg-amber-50 dark:bg-amber-950/50'
            }`}>
              <View className={`w-1.5 h-1.5 rounded-full ${
                task.status === 'completed' ? 'bg-green-500' : task.status === 'rejected' ? 'bg-red-500' : 'bg-amber-400'
              }`} />
              <Text className={`text-xs font-semibold ${
                task.completed
                  ? 'text-green-600 dark:text-green-400'
                  : task.status === 'pending'
                  ? 'text-amber-600 dark:text-amber-400'
                  : task.status === 'rejected'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>
                {task.completed
                  ? 'Completed'
                  : task.status === 'pending'
                  ? 'Pending Approval'
                  : task.status === 'rejected'
                  ? 'Rejected'
                  : 'To Do'}
              </Text>
            </View>
          </View>
          <View className="flex-row justify-between items-center py-1 border-t border-border">
            <Text className="text-xs text-gray-400">Proof</Text>
            <View className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-md ${
              hasProof ? 'bg-green-50 dark:bg-green-950/50' : 'bg-gray-100 dark:bg-gray-800'
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
        </View>

      </ScrollView>

      {/* ── Assignee Picker Modal ─────────────────────────────────────── */}
      <Modal
        visible={assigneeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssigneeModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-5 pb-10">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-bold text-gray-800 dark:text-white">Select Assignees</Text>
              <TouchableOpacity onPress={() => setAssigneeModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {members.length === 0 ? (
              <View className="items-center py-8">
                <Ionicons name="people-outline" size={36} color="#9ca3af" />
                <Text className="text-sm text-gray-400 mt-2">No members in this room</Text>
              </View>
            ) : (
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 340 }}
                renderItem={({ item }) => {
                  const selected = selectedAssignees.includes(item.id);
                  return (
                    <TouchableOpacity
                      onPress={() => toggleAssignee(item.id)}
                      activeOpacity={0.7}
                      className={`flex-row items-center gap-3 py-3 px-2 rounded-xl mb-1 ${selected ? 'bg-primary/10' : ''}`}
                    >
                      <Avatar name={item.displayName || item.email} size={38} />
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-800 dark:text-white">
                          {item.displayName || 'Member'}
                        </Text>
                        <Text className="text-xs text-gray-400">{item.email}</Text>
                      </View>
                      <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                        selected ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {selected && <Ionicons name="checkmark" size={12} color="white" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              onPress={() => setAssigneeModalVisible(false)}
              activeOpacity={0.7}
              className="bg-primary rounded-xl py-3 items-center mt-3"
            >
              <Text className="text-white font-semibold">
                Done {selectedAssignees.length > 0 ? `(${selectedAssignees.length} selected)` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-background rounded-2xl p-5 w-full max-w-md">
            <View className="flex-row items-center gap-3 mb-3">
              <View className="bg-red-100 dark:bg-red-950 rounded-full p-3">
                <Ionicons name="trash-outline" size={22} color="#ef4444" />
              </View>
              <Text className="text-base font-bold text-gray-800 dark:text-white flex-1">
                Delete Task?
              </Text>
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              "{task.title}" will be permanently deleted. This cannot be undone.
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setDeleteModalVisible(false)}
                activeOpacity={0.7}
                className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-xl py-3 items-center"
              >
                <Text className="text-gray-800 dark:text-white font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                activeOpacity={0.7}
                className="flex-1 bg-red-500 rounded-xl py-3 items-center"
              >
                <Text className="text-white font-medium">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        visible={videoViewerVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setVideoViewerVisible(false)}
      >
        <View className="flex-1 bg-black pt-safe">
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
            <Text className="text-white font-bold">Video Proof Viewer</Text>
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