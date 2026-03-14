import { Text } from '@/components/ui/text';
import {
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
  FlatList,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';
import { useAuth } from '@/hooks/useAuth';

type Member = {
  id: string;
  firstname: string;
  lastname?: string;
  photo_url?: string;
  email: string;
  role: 'admin' | 'member';
  joinedAt: any;
};

type UserResult = {
  id: string;
  firstname: string;
  lastname?: string;
  photo_url?: string;
  email: string;
  role: string;
  position?: string;
};

const Avatar = ({ name, size = 40 }: { name: string; size?: number }) => {
  const initial = (name || '?')[0].toUpperCase();
  const colors  = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  const color   = colors[initial.charCodeAt(0) % colors.length];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22' }}
      className="items-center justify-center"
    >
      <Text style={{ color, fontSize: size * 0.4, fontWeight: '700' }}>{initial}</Text>
    </View>
  );
};

export default function InviteMembersScreen() {
  const router = useRouter();
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [roomCode, setRoomCode]       = useState('');
  const [roomName, setRoomName]       = useState('');
  const [members, setMembers]         = useState<Member[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab]     = useState<'invite' | 'members'>('invite');

  // Add user modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [userSearch, setUserSearch]           = useState('');
  const [allUsers, setAllUsers]               = useState<UserResult[]>([]);
  const [loadingUsers, setLoadingUsers]       = useState(false);
  const [addingId, setAddingId]               = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    fetchRoomData();
  }, [roomId]);

  const fetchRoomData = async () => {
    setLoading(true);
    try {
      const roomSnap = await getDoc(doc(db, 'rooms', roomId));
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        setRoomCode(data.roomCode || '');
        setRoomName(data.name    || 'Room');
      }

      const membersSnap = await getDocs(collection(db, 'rooms', roomId, 'members'));
      setMembers(
        membersSnap.docs.map((d) => ({
          id:          d.id,
          firstname: d.data().firstname || 'Unknown',
          lastname: d.data().lastname || 'Unknown',
          photo_url: d.data().photo_url || 'Unknown',
          email:       d.data().email       || '',
          role:        d.data().role        || 'member',
          joinedAt:    d.data().joinedAt,
        }))
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const openAddModal = async () => {
    setUserSearch('');
    setAddModalVisible(true);

    if (allUsers.length > 0) return;

    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const currentMemberIds = new Set(members.map((m) => m.id));

      const list: UserResult[] = [];
      snap.docs.forEach((d) => {
        if (d.id === user?.uid)         return; 
        if (currentMemberIds.has(d.id)) return;

        const data      = d.data();
        const firstname = (data.firstname || '').trim();
        const lastname  = (data.lastname  || '').trim();
        const fullName  =
          `${firstname} ${lastname}`.trim() ||
          (data.firstname || '').trim()   ||
          'Unknown';

        list.push({
          id:          d.id,
          firstname: firstname,
          lastname: lastname,
          photo_url: data.photo_url,
          email:       data.email    || '',
          role:        data.role     || 'member',
          position:    data.position || undefined,
        });
      });

      setAllUsers(list);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load users.');
    }
    setLoadingUsers(false);
  };


  const filteredUserResults = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return allUsers;
    return allUsers.filter(
      (u) =>
        u.firstname.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)       ||
        (u.position || '').toLowerCase().includes(term)
    );
  }, [userSearch, allUsers]);

  const handleAddUser = async (u: UserResult) => {
    setAddingId(u.id);
    try {
      await setDoc(doc(db, 'rooms', roomId, 'members', u.id), {
        uid:         u.id,
        firstname: u.firstname,
        lastname: u.lastname,
        photo_url: u.photo_url,
        email:       u.email,
        role:        'member',
        position:    u.position ?? null,
        joinedAt:    serverTimestamp(),
      });

      setAllUsers((prev) => prev.filter((r) => r.id !== u.id));
      await fetchRoomData();
      Alert.alert('Added!', `${u.firstname} has been added to the room.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add user.');
    }
    setAddingId(null);
  };

  const handleRemoveMember = (member: Member) => {
    if (member.id === user?.uid) {
      Alert.alert('Error', 'You cannot remove yourself.');
      return;
    }
    Alert.alert(
      'Remove Member',
      `Remove ${member.firstname} from this room?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'rooms', roomId, 'members', member.id));
              setAllUsers((prev) => [
                ...prev,
                {
                  id:          member.id,
                  firstname: member.firstname,
                  email:       member.email,
                  role:        member.role,
                },
              ]);
              fetchRoomData();
            } catch (e) {
              Alert.alert('Error', 'Failed to remove member.');
            }
          },
        },
      ]
    );
  };

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join "${roomName}" on our app!\n\nRoom Code: ${roomCode}\n\nOpen the app, go to Join Room, and enter the code above.`,
        title:   `Invite to ${roomName}`,
      });
    } catch (e) {
      Alert.alert('Error', 'Could not share invite.');
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      `${m.firstname} ${m.lastname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const TabButton = ({ tab, label }: { tab: 'invite' | 'members'; label: string }) => (
    <TouchableOpacity
      onPress={() => setActiveTab(tab)}
      activeOpacity={0.7}
      className={`flex-1 py-2 items-center rounded-xl ${
        activeTab === tab ? 'bg-primary' : 'bg-transparent'
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          activeTab === tab ? 'text-white' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-background mt-5">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-safe pb-4 border-b border-border bg-background">
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-800 dark:text-white">Members</Text>
          <Text className="text-xs text-gray-400">{roomName}</Text>
        </View>
        <View className="bg-card border border-border px-3 py-1 rounded-full">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Tab Switcher */}
      <View className="mx-5 mt-4 mb-3 bg-card border border-border rounded-xl flex-row p-1">
        <TabButton tab="invite" label="Invite" />
        <TabButton tab="members" label={`Members (${members.length})`} />
      </View>

      {/* ── Invite Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'invite' ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 gap-4"
          showsVerticalScrollIndicator={false}
        >
          {/* Room Code Card */}
          <View className="bg-card border border-border rounded-2xl p-5 items-center gap-3">
            <View className="bg-primary/10 rounded-full p-4">
              <Ionicons name="key-outline" size={28} color="#6366f1" />
            </View>
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Share this code to invite members
            </Text>
            <View className="bg-background border-2 border-primary/30 rounded-2xl px-8 py-4 items-center">
              <Text className="text-3xl font-black tracking-widest text-primary">
                {roomCode || '------'}
              </Text>
            </View>
            <Text className="text-xs text-gray-400 text-center">
              Members enter this code in the app to join your room
            </Text>
            <TouchableOpacity
              onPress={handleShareInvite}
              activeOpacity={0.7}
              className="w-full bg-primary rounded-xl py-3 flex-row items-center justify-center gap-2 mt-1"
            >
              <Ionicons name="share-social-outline" size={16} color="white" />
              <Text className="text-sm font-semibold text-white">Share Invite</Text>
            </TouchableOpacity>
          </View>

          {/* Add directly */}
          <View className="bg-card border border-border rounded-2xl p-4 gap-3">
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="person-add-outline" size={18} color="#6366f1" />
              <Text className="text-sm font-bold text-gray-800 dark:text-white">Add Directly</Text>
            </View>
            <Text className="text-xs text-gray-400">
              Search registered users and add them without needing a room code.
            </Text>
            <TouchableOpacity
              onPress={openAddModal}
              activeOpacity={0.7}
              className="bg-primary/10 border border-primary/20 rounded-xl py-3 flex-row items-center justify-center gap-2"
            >
              <Ionicons name="search-outline" size={16} color="#6366f1" />
              <Text className="text-sm font-semibold text-primary">Search Users</Text>
            </TouchableOpacity>
          </View>

          {/* How it works */}
          <View className="bg-card border border-border rounded-2xl p-4 gap-3">
            <Text className="text-sm font-bold text-gray-800 dark:text-white">How it works</Text>
            {[
              'Share the room code or add users directly',
              'Member opens the app and taps "Join Room"',
              'They enter the room code to join',
              'They appear in your Members list instantly',
            ].map((text, i) => (
              <View key={i} className="flex-row items-center gap-3">
                <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-xs font-bold text-primary">{i + 1}</Text>
                </View>
                <Text className="text-sm text-gray-600 dark:text-gray-400 flex-1">{text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        /* ── Members Tab ───────────────────────────────────────────────────── */
        <View className="flex-1">
          <View className="px-5 mb-3">
            <View className="flex-row items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5">
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search members…"
                className="flex-1 text-sm text-gray-800 dark:text-white"
                placeholderTextColor="#9ca3af"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Ionicons name="people-outline" size={40} color="#9ca3af" />
                <Text className="text-sm text-gray-400 mt-2">No members found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View className="bg-card border border-border rounded-2xl p-4 mb-2.5 flex-row items-center gap-3">
                <Avatar name={item.firstname} size={44} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-800 dark:text-white mb-0.5">
                    {item.firstname} {item.lastname}
                  </Text>
                  <Text className="text-xs text-gray-400">{item.email}</Text>
                </View>
                {item.id !== user?.uid && (
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(item)}
                    activeOpacity={0.7}
                    className="bg-red-50 dark:bg-red-950 rounded-lg p-2"
                  >
                    <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      )}

      {/* ── Add User Modal ──────────────────────────────────────────────────── */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-5 pb-10" style={{ maxHeight: '80%' }}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-bold text-gray-800 dark:text-white">Add User</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Live search input */}
            <View className="flex-row items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5 mb-4">
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Type a name or email…"
                className="flex-1 text-sm text-gray-800 dark:text-white"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              {userSearch.length > 0 && (
                <TouchableOpacity onPress={() => setUserSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>

            {/* Results */}
            {loadingUsers ? (
              <View className="items-center py-8">
                <Text className="text-sm text-gray-400">Loading users…</Text>
              </View>
            ) : filteredUserResults.length === 0 ? (
              <View className="items-center py-8">
                <Ionicons name="person-outline" size={36} color="#9ca3af" />
                <Text className="text-sm text-gray-400 mt-2 text-center">
                  {userSearch.length > 0
                    ? 'No users match that search'
                    : 'No available users to add'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredUserResults}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isAdding = addingId === item.id;
                  return (
                    <View className="flex-row items-center gap-3 py-3 border-b border-border">
                      <Avatar name={item.firstname} size={42} />
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-800 dark:text-white">
                          {item.firstname} {item.lastname}
                        </Text>
                        <Text className="text-xs text-gray-400">{item.email}</Text>
                        {item.position ? (
                          <Text className="text-xs text-gray-400 capitalize">{item.position}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleAddUser(item)}
                        disabled={isAdding}
                        activeOpacity={0.7}
                        className={`bg-primary rounded-xl px-3 py-2 ${isAdding ? 'opacity-50' : ''}`}
                      >
                        <Text className="text-white text-xs font-semibold">
                          {isAdding ? 'Adding…' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}