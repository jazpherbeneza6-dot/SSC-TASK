import { Text } from '@/components/ui/text';
import {
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/FirebaseConfig';

type Priority = 'low' | 'medium' | 'high';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; icon: string }> = {
  low: { label: 'Low', color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950', icon: 'arrow-down-circle-outline' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950', icon: 'remove-circle-outline' },
  high: { label: 'High', color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950', icon: 'arrow-up-circle-outline' },
};

const SectionLabel = ({ children }: { children: string }) => (
  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{children}</Text>
);

const StyledInput = ({
  value,
  onChangeText,
  placeholder,
  multiline,
  numberOfLines,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
}) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    multiline={multiline}
    numberOfLines={numberOfLines}
    className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white text-sm"
    style={multiline ? { textAlignVertical: 'top', minHeight: 80 } : undefined}
    placeholderTextColor="#9ca3af"
  />
);

export default function CreateTaskScreen() {
  const router = useRouter();
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Folder
  const [folder, setFolder] = useState('');
  const [existingFolders, setExistingFolders] = useState<string[]>([]);

  // Assignee picker
  const [members, setMembers] = useState<any[]>([]);
  const [assigneeModalVisible, setAssigneeModalVisible] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  useEffect(() => {
    if (!roomId) return;
    fetchMembers();
    fetchFolders();
  }, [roomId]);

  const fetchFolders = async () => {
    try {
      const snap = await getDocs(collection(db, 'rooms', roomId, 'tasks'));
      const names = new Set<string>();
      snap.docs.forEach((d) => {
        const f = d.data().folder;
        if (f && typeof f === 'string' && f.trim()) names.add(f.trim());
      });
      setExistingFolders(Array.from(names).sort());
    } catch (_) {}
  };

  const fetchMembers = async () => {
    try {
      const membersRef = collection(db, 'rooms', roomId, 'members');
      const snap = await getDocs(membersRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMembers(list);
      console.log(list);
    } catch (e) {
      console.error('Error fetching members:', e);
    }
  };

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return;
    }

    setCreating(true);
    try {
      await addDoc(collection(db, 'rooms', roomId, 'tasks'), {
        title: title.trim(),
        description: description.trim(),
        priority,
        folder: folder.trim() || null,
        dueDate: dueDate.trim() || null,
        assignees: selectedAssignees,
        completed: false,
        createdBy: user!.uid,
        createdAt: serverTimestamp(),
      });

      router.canGoBack() ? router.back() : router.replace('/');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to create task. Please try again.');
    }
    setCreating(false);
  };

  const selectedMemberNames = members
    .filter((m) => selectedAssignees.includes(m.id))
    .map((m) => m.firstname + ' ' + m.lastname || m.email || 'Member');

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-safe pb-4 border-b border-border bg-background mt-4">
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-800 dark:text-white flex-1">Create Task</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          activeOpacity={0.7}
          className={`bg-primary rounded-full px-4 py-1.5 ${creating ? 'opacity-50' : ''}`}
        >
          <Text className="text-sm font-semibold text-white">
            {creating ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-5 gap-4 pb-10"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View>
          <SectionLabel>Task Title *</SectionLabel>
          <StyledInput value={title} onChangeText={setTitle} placeholder="e.g. Design landing page" />
        </View>

        {/* Description */}
        <View>
          <SectionLabel>Description</SectionLabel>
          <StyledInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add details about this task…"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Folder */}
        <View>
          <SectionLabel>Folder</SectionLabel>
          <View className="flex-row items-center bg-card border border-border rounded-xl px-4 py-3 gap-2">
            <Ionicons name="folder-outline" size={16} color="#9ca3af" />
            <TextInput
              value={folder}
              onChangeText={setFolder}
              placeholder="Type folder name (optional)"
              className="flex-1 text-sm text-gray-800 dark:text-white"
              placeholderTextColor="#9ca3af"
            />
            {folder.length > 0 && (
              <TouchableOpacity onPress={() => setFolder('')}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          {existingFolders.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-2"
              contentContainerStyle={{ gap: 8 }}
            >
              {existingFolders.map((f) => {
                const active = folder === f;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFolder(active ? '' : f)}
                    activeOpacity={0.7}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                      active ? 'bg-primary border-primary' : 'bg-card border-border'
                    }`}
                  >
                    <Ionicons name="folder" size={12} color={active ? 'white' : '#6b7280'} />
                    <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {f}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Priority */}
        <View>
          <SectionLabel>Priority</SectionLabel>
          <View className="flex-row gap-2">
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              const active = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 ${
                    active ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  }`}
                >
                  <Ionicons
                    name={cfg.icon as any}
                    size={15}
                    color={active ? cfg.color : '#9ca3af'}
                  />
                  <Text
                    className={`text-sm font-semibold ${
                      active ? 'text-primary' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Due Date */}
        <View>
          <SectionLabel>Due Date</SectionLabel>
          <View className="flex-row items-center bg-card border border-border rounded-xl px-4 py-3 gap-2">
            <Ionicons name="calendar-outline" size={16} color="#9ca3af" />
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="MM/DD/YYYY (optional)"
              className="flex-1 text-sm text-gray-800 dark:text-white"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* Assignees */}
        <View>
          <SectionLabel>Assign To</SectionLabel>
          <TouchableOpacity
            onPress={() => setAssigneeModalVisible(true)}
            activeOpacity={0.7}
            className="bg-card border border-border rounded-xl px-4 py-3 flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2 flex-1">
              <Ionicons name="person-add-outline" size={16} color="#9ca3af" />
              {selectedMemberNames.length > 0 ? (
                <Text className="text-sm text-gray-800 dark:text-white" numberOfLines={1}>
                  {selectedMemberNames.join(', ')}
                </Text>
              ) : (
                <Text className="text-sm text-gray-400">Select assignees (optional)</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Summary card */}
        {title.trim().length > 0 && (
          <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4 gap-1.5">
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="sparkles-outline" size={15} color="#6366f1" />
              <Text className="text-xs font-semibold text-primary">Task Preview</Text>
            </View>
            <Text className="text-sm font-bold text-gray-800 dark:text-white">{title}</Text>
            {description.trim().length > 0 && (
              <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={2}>
                {description}
              </Text>
            )}
            <View className="flex-row items-center gap-3 mt-1">
              <View
                className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md ${PRIORITY_CONFIG[priority].bg}`}
              >
                <Ionicons
                  name={PRIORITY_CONFIG[priority].icon as any}
                  size={12}
                  color={PRIORITY_CONFIG[priority].color}
                />
                <Text className="text-xs font-semibold" style={{ color: PRIORITY_CONFIG[priority].color }}>
                  {PRIORITY_CONFIG[priority].label}
                </Text>
              </View>
              {dueDate.trim().length > 0 && (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="calendar-outline" size={12} color="#6b7280" />
                  <Text className="text-xs text-gray-500">{dueDate}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Assignee Picker Modal */}
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
                <Text className="text-sm text-gray-400 mt-2">No members found</Text>
              </View>
            ) : (
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const selected = selectedAssignees.includes(item.id);
                  return (
                    <TouchableOpacity
                      onPress={() => toggleAssignee(item.id)}
                      activeOpacity={0.7}
                      className={`flex-row items-center gap-3 py-3 px-2 rounded-xl mb-1 ${
                        selected ? 'bg-primary/10' : ''
                      }`}
                    >
                      <View className="w-9 h-9 rounded-full bg-primary/20 items-center justify-center">
                        <Text className="text-sm font-bold text-primary">
                          {(item.firstname || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-gray-800 dark:text-white">
                          {item.firstname + ' ' + item.lastname || 'Member'}
                        </Text>
                        <Text className="text-xs text-gray-400">{item.email || item.role}</Text>
                      </View>
                      <View
                        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                          selected ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {selected && <Ionicons name="checkmark" size={12} color="white" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 320 }}
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
    </View>
  );
}