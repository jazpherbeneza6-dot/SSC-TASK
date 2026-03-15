import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollView, View, TouchableOpacity, RefreshControl, TextInput, Modal } from 'react-native';
import { Alert } from '@/utils/alerts';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const AdminRoomCard = ({
  id,
  name,
  description,
  roomCode,
  memberCount,
  taskCount,
  completedTaskCount,
  onPress,
  onEdit,
  onDelete,
}: {
  id: string;
  name: string;
  description: string;
  roomCode: string;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const completionPercentage = taskCount > 0 ? (completedTaskCount / taskCount) * 100 : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-card rounded-2xl p-4 mb-3 border border-border"
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-800 dark:text-white mb-1">{name}</Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={2}>
            {description || 'No description'}
          </Text>
        </View>
        <View className="flex-row gap-2 ml-2">
          <TouchableOpacity
            onPress={onEdit}
            activeOpacity={0.7}
            className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2"
          >
            <Ionicons name="create-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.7}
            className="bg-red-50 dark:bg-red-950 rounded-lg p-2"
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-row items-center gap-4 mb-2">
        <View className="flex-row items-center gap-1">
          <Ionicons name="people-outline" size={14} color="#6b7280" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">{memberCount ?? 0} members</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="code-outline" size={14} color="#6b7280" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">{roomCode}</Text>
        </View>
      </View>

      {taskCount > 0 && (
        <View className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <View
            className="bg-primary rounded-full h-1.5"
            style={{ width: `${completionPercentage}%` }}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

export default function AdminRoomsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);

  // Create room modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit room modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  // Delete confirmation modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<any>(null);

  const fetchRooms = async () => {
    if (!user?.uid) return;
    try {
      const roomsSnap = await getDocs(
        query(collection(db, 'rooms'), where('createdBy', '==', user.uid))
      );

      const fetchedRooms = await Promise.all(
        roomsSnap.docs.map(async (roomDoc) => {
          const membersSnap = await getDocs(collection(db, 'rooms', roomDoc.id, 'members'));
          const tasksSnap = await getDocs(collection(db, 'rooms', roomDoc.id, 'tasks'));

          return {
            id: roomDoc.id,
            ...roomDoc.data(),
            memberCount: membersSnap.size,
            taskCount: tasksSnap.size,
            completedTaskCount: tasksSnap.docs.filter((t) => t.data().completed === true).length,
          };
        })
      );

      setRooms(fetchedRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRooms();
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }
    setCreating(true);
    try {
      const roomCode = generateRoomCode();
      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: roomName.trim(),
        description: roomDescription.trim(),
        roomCode,
        createdBy: user!.uid,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'rooms', roomRef.id, 'members'), {
        uid: user!.uid,
        displayName: `${user!.firstname} ${user!.lastname}`,
        firstname: user!.firstname,
        lastname: user!.lastname,
        photo_url: user!.photo_url,
        email: user!.email,
        role: 'admin',
        joinedAt: serverTimestamp(),
      });

      Alert.alert('Room Created!', `Room code: ${roomCode}`, [
        {
          text: 'OK',
          onPress: () => {
            setCreateModalVisible(false);
            setRoomName('');
            setRoomDescription('');
            fetchRooms();
          },
        },
      ]);
    } catch (error) {
      console.error('Error creating room:', error);
      Alert.alert('Error', 'Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleEditRoom = (room: any) => {
    setEditingRoom(room);
    setEditName(room.name);
    setEditDescription(room.description || '');
    setEditModalVisible(true);
  };

  const handleUpdateRoom = async () => {
    if (!editName.trim() || !editingRoom) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'rooms', editingRoom.id), {
        name: editName.trim(),
        description: editDescription.trim(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Room updated successfully!', [
        {
          text: 'OK',
          onPress: () => {
            setEditModalVisible(false);
            setEditingRoom(null);
            setEditName('');
            setEditDescription('');
            fetchRooms();
          },
        },
      ]);
    } catch (error) {
      console.error('Error updating room:', error);
      Alert.alert('Error', 'Failed to update room. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteRoom = (room: any) => {
    setDeletingRoom(room);
    setDeleteModalVisible(true);
  };

  const confirmDeleteRoom = async () => {
    if (!deletingRoom) return;
    try {
      await deleteDoc(doc(db, 'rooms', deletingRoom.id));
      Alert.alert('Success', 'Room deleted successfully', [
        {
          text: 'OK',
          onPress: () => {
            setDeleteModalVisible(false);
            setDeletingRoom(null);
            fetchRooms();
          },
        },
      ]);
    } catch (error) {
      console.error('Error deleting room:', error);
      Alert.alert('Error', 'Failed to delete room. Please try again.');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background p-5 mt-5">
        <Skeleton className="h-8 w-32 rounded-xl mb-4" />
        <Skeleton className="h-32 w-full rounded-2xl mb-3" />
        <Skeleton className="h-32 w-full rounded-2xl mb-3" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Banner */}
        <View className="bg-red-500 dark:bg-red-950 pt-14 pb-6 px-5">
          <View className="flex-row justify-between items-start">
            <View>
              <Text className="text-red-200 text-xs mb-0.5">Manage your spaces 🗂️</Text>
              <Text className="text-white text-xl font-bold">{user?.firstname ?? 'Admin'}</Text>
              <Text className="text-red-200 text-xs mt-0.5 capitalize">
                {user?.role} • {user?.position}
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/settings')}>
              <View className="bg-white/20 rounded-full p-2">
                <Ionicons name="settings-outline" size={22} color="white" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Room list */}
        <View className="px-5 mt-5">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-base font-bold text-gray-800 dark:text-white">My Rooms</Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rooms you created</Text>
            </View>
            <TouchableOpacity
              onPress={() => setCreateModalVisible(true)}
              activeOpacity={0.7}
              className="bg-primary rounded-full pl-2 pr-3 py-1.5 flex-row items-center gap-1"
            >
              <Ionicons name="add" size={18} color="white" />
              <Text className="text-sm font-medium text-white">Create</Text>
            </TouchableOpacity>
          </View>

          {rooms.length > 0 ? (
            rooms.map((room) => (
              <AdminRoomCard
                key={room.id}
                {...room}
                onPress={() => router.push(`/rooms/${room.id}` as any)}
                onEdit={() => handleEditRoom(room)}
                onDelete={() => handleDeleteRoom(room)}
              />
            ))
          ) : (
            <View className="bg-card rounded-2xl p-8 border border-border items-center">
              <Ionicons name="folder-open-outline" size={48} color="#9ca3af" />
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-3">
                No rooms yet
              </Text>
              <Text className="text-xs text-gray-400 text-center mt-1">
                Create your first room to get started
              </Text>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(true)}
                activeOpacity={0.7}
                className="bg-primary rounded-xl px-4 py-2 mt-4"
              >
                <Text className="text-sm font-medium text-white">Create Room</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Create Room Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-background rounded-2xl p-5 w-full max-w-md">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-800 dark:text-white">Create Room</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Name *
                </Text>
                <TextInput
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="Enter room name"
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </Text>
                <TextInput
                  value={roomDescription}
                  onChangeText={setRoomDescription}
                  placeholder="Enter description (optional)"
                  multiline
                  numberOfLines={3}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  style={{ textAlignVertical: 'top' }}
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <TouchableOpacity
                onPress={handleCreateRoom}
                disabled={creating}
                activeOpacity={0.7}
                className={`bg-primary rounded-xl py-3 items-center ${creating ? 'opacity-50' : ''}`}
              >
                <Text className="text-white font-medium">
                  {creating ? 'Creating...' : 'Create Room'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Room Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-background rounded-2xl p-5 w-full max-w-md">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-800 dark:text-white">Edit Room</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Name *
                </Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter room name"
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Enter description (optional)"
                  multiline
                  numberOfLines={3}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  style={{ textAlignVertical: 'top' }}
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <TouchableOpacity
                onPress={handleUpdateRoom}
                disabled={updating}
                activeOpacity={0.7}
                className={`bg-primary rounded-xl py-3 items-center ${updating ? 'opacity-50' : ''}`}
              >
                <Text className="text-white font-medium">
                  {updating ? 'Updating...' : 'Update Room'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-background rounded-2xl p-5 w-full max-w-md">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="bg-red-100 dark:bg-red-950 rounded-full p-3">
                <Ionicons name="warning" size={24} color="#ef4444" />
              </View>
              <Text className="text-lg font-bold text-gray-800 dark:text-white flex-1">
                Delete Room?
              </Text>
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete "{deletingRoom?.name}"? This will permanently delete:
            </Text>
            <View className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 mb-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="close-circle" size={16} color="#ef4444" />
                <Text className="text-xs text-red-600 dark:text-red-400">All tasks in this room</Text>
              </View>
              <View className="flex-row items-center gap-2 mb-1">
                <Ionicons name="close-circle" size={16} color="#ef4444" />
                <Text className="text-xs text-red-600 dark:text-red-400">All member associations</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Ionicons name="close-circle" size={16} color="#ef4444" />
                <Text className="text-xs text-red-600 dark:text-red-400">All room data</Text>
              </View>
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              This action cannot be undone.
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
                onPress={confirmDeleteRoom}
                activeOpacity={0.7}
                className="flex-1 bg-red-500 rounded-xl py-3 items-center"
              >
                <Text className="text-white font-medium">Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}