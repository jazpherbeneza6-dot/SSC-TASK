import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollView, View, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Alert } from '@/utils/alerts';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  orderBy,
  query,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';
import { AdminCalendar } from '@/components/AdminCalendar';

type Tab = 'tasks' | 'members' | 'calendar' | 'attendance';

type AttendanceStatus = 'present' | 'absent' | 'late' | null;

const PRIORITY_META: Record<string, { color: string; bg: string; dot: string }> = {
  low:    { color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50',  dot: 'bg-green-500'  },
  medium: { color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50',  dot: 'bg-amber-400'  },
  high:   { color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50',      dot: 'bg-red-500'    },
};

const ATTENDANCE_META: Record<
  string,
  { label: string; color: string; bg: string; icon: string }
> = {
  present: { label: 'Present', color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50', icon: 'checkmark-circle' },
  absent:  { label: 'Absent',  color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50',     icon: 'close-circle'     },
  late:    { label: 'Late',    color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50', icon: 'time'             },
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

const getDueLabel = (dueDate: string | null) => {
  const d = parseDate(dueDate);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, color: '#ef4444' };
  if (diff === 0) return { label: 'Due today',                   color: '#f59e0b' };
  if (diff === 1) return { label: 'Due tomorrow',                color: '#f59e0b' };
  return           { label: `Due in ${diff}d`,                  color: '#6b7280' };
};

// ─── Task Card ────────────────────────────────────────────────────────────────

const TaskCard = ({
  task,
  isAssignedToMe,
  onToggle,
  onPress,
}: {
  task: any;
  isAssignedToMe: boolean;
  onToggle: (task: any) => void;
  onPress: (task: any) => void;
}) => {
  const p   = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const due = getDueLabel(task.dueDate);

  // Check if task is overdue and not completed = incomplete
  const isIncomplete = !task.completed && task.dueDate && (() => {
    const d = parseDate(task.dueDate);
    if (!d) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  })();

  return (
    <TouchableOpacity
      onPress={() => onPress(task)}
      activeOpacity={0.75}
      className={`bg-card rounded-xl p-3.5 mb-2 border ${
        isAssignedToMe ? 'border-primary/30' : 'border-border'
      } ${task.completed ? 'opacity-55' : ''}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className={`text-sm font-bold flex-1 ${
                task.completed
                  ? 'line-through text-gray-400 dark:text-gray-500'
                  : 'text-gray-800 dark:text-white'
              }`}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            {isAssignedToMe && !task.completed && (
              <View className="bg-primary/10 px-1.5 py-0.5 rounded-md">
                <Text className="text-xs font-bold text-primary">Mine</Text>
              </View>
            )}
          </View>

          {!!task.description && (
            <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {task.description}
            </Text>
          )}

          <View className="flex-row flex-wrap items-center gap-1.5 mt-0.5">
            <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md ${p.bg}`}>
              <View className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
              <Text className="text-xs font-semibold capitalize" style={{ color: p.color }}>
                {task.priority}
              </Text>
            </View>
            {due && (
              <View className="flex-row items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
                <Ionicons name="calendar-outline" size={10} color={due.color} />
                <Text className="text-xs font-medium" style={{ color: due.color }}>{due.label}</Text>
              </View>
            )}
            {task.assignees?.length > 0 && (
              <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                <Ionicons name="people-outline" size={10} color="#3b82f6" />
                <Text className="text-xs text-blue-500 font-medium">{task.assignees.length}</Text>
              </View>
            )}
            {isIncomplete && (
              <View className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-md">
                <Ionicons name="alert-circle" size={10} color="#ef4444" />
                <Text className="text-xs font-bold text-red-500">Incomplete</Text>
              </View>
            )}
            {task.status === 'pending' && (
              <View className="flex-row items-center gap-1 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md">
                <Ionicons name="time" size={10} color="#f59e0b" />
                <Text className="text-xs font-bold text-amber-600">Pending Approval</Text>
              </View>
            )}
            {task.status === 'rejected' && (
              <View className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-md">
                <Ionicons name="close-circle" size={10} color="#ef4444" />
                <Text className="text-xs font-bold text-red-500">Rejected</Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={15} color="#d1d5db" className="mt-1" />
      </View>
    </TouchableOpacity>
  );
};

// ─── Member Card ──────────────────────────────────────────────────────────────

const MemberCard = ({ member, isMe }: { member: any; isMe: boolean }) => {
  const initial = (member.firstname || member.email || '?')[0].toUpperCase();
  const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
  const color   = palette[initial.charCodeAt(0) % palette.length];

  return (
    <View className="bg-card rounded-xl p-3.5 mb-2 border border-border flex-row items-center gap-3">
      <View
        style={{ backgroundColor: color + '22', width: 42, height: 42, borderRadius: 21 }}
        className="items-center justify-center"
      >
        <Text style={{ color, fontSize: 16, fontWeight: '700' }}>{initial}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-gray-800 dark:text-white">
            {member.firstname || 'Member'}
          </Text>
          {isMe && (
            <View className="bg-primary/10 px-1.5 py-0.5 rounded-md">
              <Text className="text-xs font-bold text-primary">You</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-400">{member.email}</Text>
      </View>
      <View
        className={`px-2 py-0.5 rounded-md ${
          member.role === 'admin'
            ? 'bg-red-50 dark:bg-red-950'
            : 'bg-blue-50 dark:bg-blue-950'
        }`}
      >
        <Text
          className={`text-xs font-semibold ${
            member.role === 'admin'
              ? 'text-red-600 dark:text-red-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        >
          {member.role === 'admin' ? 'Admin' : 'Member'}
        </Text>
      </View>
    </View>
  );
};

// ─── Attendance Card ──────────────────────────────────────────────────────────

const AttendanceCard = ({
  member,
  isMe,
  status,
  onMark,
  markingId,
}: {
  member: any;
  isMe: boolean;
  status: AttendanceStatus;
  onMark: (memberId: string, status: AttendanceStatus) => void;
  markingId: string | null;
}) => {
  const initial = (member.firstname || member.email || '?')[0].toUpperCase();
  const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
  const color   = palette[initial.charCodeAt(0) % palette.length];
  const isMarking = markingId === member.id;

  const statusMeta = status ? ATTENDANCE_META[status] : null;

  return (
    <View className="bg-card rounded-xl p-3.5 mb-2 border border-border">
      <View className="flex-row items-center gap-3 mb-3">
        <View
          style={{ backgroundColor: color + '22', width: 42, height: 42, borderRadius: 21 }}
          className="items-center justify-center"
        >
          <Text style={{ color, fontSize: 16, fontWeight: '700' }}>{initial}</Text>
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-semibold text-gray-800 dark:text-white">
              {member.firstname + ' ' + member.lastname || 'Member'}
            </Text>
            {isMe && (
              <View className="bg-primary/10 px-1.5 py-0.5 rounded-md">
                <Text className="text-xs font-bold text-primary">You</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-gray-400">{member.email}</Text>
        </View>

        {statusMeta ? (
          <View className={`flex-row items-center gap-1 px-2 py-1 rounded-lg ${statusMeta.bg}`}>
            <Ionicons name={statusMeta.icon as any} size={13} color={statusMeta.color} />
            <Text className="text-xs font-bold" style={{ color: statusMeta.color }}>
              {statusMeta.label}
            </Text>
          </View>
        ) : (
          <View className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
            <Text className="text-xs font-medium text-gray-400">Not marked</Text>
          </View>
        )}
      </View>

      {!isMe ? (
        <View className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="lock-closed-outline" size={12} color="#9ca3af" />
          <Text className="text-xs text-gray-400 font-medium">
            Only this member can mark their own attendance
          </Text>
        </View>
      ) : status ? (
        <View className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="checkmark-circle-outline" size={12} color="#22c55e" />
          <Text className="text-xs text-green-600 font-medium">
            Your attendance is marked as {statusMeta?.label}.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => !isMarking && onMark(member.id, 'present')}
          activeOpacity={0.7}
          disabled={isMarking}
          className={`bg-primary rounded-xl py-2.5 items-center flex-row justify-center gap-2 ${isMarking ? 'opacity-50' : ''}`}
        >
          {isMarking ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="hand-right-outline" size={16} color="white" />
              <Text className="text-sm font-bold text-white">Mark Presence</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Attendance Summary Bar ───────────────────────────────────────────────────

const AttendanceSummary = ({
  attendance,
  total,
}: {
  attendance: Record<string, AttendanceStatus>;
  total: number;
}) => {
  const values  = Object.values(attendance);
  const present = values.filter((v) => v === 'present').length;
  const late    = values.filter((v) => v === 'late').length;
  const absent  = values.filter((v) => v === 'absent').length;
  const unmarked = total - values.filter(Boolean).length;

  if (total === 0) return null;

  return (
    <View className="bg-card rounded-xl p-3.5 mb-3 border border-border">
      <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
        Today's Summary
      </Text>
      <View className="flex-row gap-2 mb-2.5">
        {[
          { label: 'Present', value: present, color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50' },
          { label: 'Late',    value: late,    color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50' },
          { label: 'Absent',  value: absent,  color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50'    },
          { label: 'Pending', value: unmarked, color: '#6b7280', bg: 'bg-gray-100 dark:bg-gray-800'   },
        ].map(({ label, value, color, bg }) => (
          <View key={label} className={`flex-1 items-center py-2 rounded-lg ${bg}`}>
            <Text className="text-lg font-black" style={{ color }}>{value}</Text>
            <Text className="text-xs text-gray-400 font-medium">{label}</Text>
          </View>
        ))}
      </View>

      <View className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex-row">
        {present > 0 && <View style={{ flex: present, backgroundColor: '#22c55e' }} />}
        {late > 0    && <View style={{ flex: late,    backgroundColor: '#f59e0b' }} />}
        {absent > 0  && <View style={{ flex: absent,  backgroundColor: '#ef4444' }} />}
        {unmarked > 0 && <View style={{ flex: unmarked, backgroundColor: '#e5e7eb' }} />}
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemberRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab]   = useState<Tab>('tasks');
  const [filterMine, setFilterMine] = useState(false);

  const [room, setRoom]       = useState<any>(null);
  const [tasks, setTasks]     = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [markingId, setMarkingId]   = useState<string | null>(null);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    if (!id) return;

    // 1. Fetch static or less frequent data
    const fetchStatic = async () => {
      try {
        const roomSnap = await getDoc(doc(db, 'rooms', id));
        if (roomSnap.exists()) setRoom({ id: roomSnap.id, ...roomSnap.data() });

        const membersSnap = await getDocs(collection(db, 'rooms', id, 'members'));
        setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error fetching member room static data:', e);
      }
    };
    fetchStatic();

    // 2. Listen to real-time tasks
    const tasksUnsub = onSnapshot(
      query(collection(db, 'rooms', id, 'tasks'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('Member tasks listener error:', err);
        setLoading(false);
      }
    );

    // 3. Listen to real-time attendance for today
    const attendanceUnsub = onSnapshot(
      collection(db, 'rooms', id, 'attendance', todayKey, 'records'),
      (snap) => {
        const attendanceMap: Record<string, AttendanceStatus> = {};
        snap.docs.forEach((d) => {
          attendanceMap[d.id] = d.data().status ?? null;
        });
        setAttendance(attendanceMap);
      }
    );

    return () => {
      tasksUnsub();
      attendanceUnsub();
    };
  }, [id, todayKey]);

  const onRefresh = () => {
    // With onSnapshot, we don't strictly need a manual refresh,
    // but we can set refreshing to true to show the indicator while we "wait" 
    // for any potential updates, or just let it be.
    setRefreshing(false); 
  };

  const handleToggle = async (task: any) => {
    const next = !task.completed;
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: next } : t));
    try {
      await updateDoc(doc(db, 'rooms', id, 'tasks', task.id), { completed: next });
    } catch (e) {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: task.completed } : t));
      Alert.alert('Error', 'Could not update task.');
    }
  };

  const handleMarkAttendance = async (memberId: string, status: AttendanceStatus) => {
    if (memberId !== user?.uid) return;
    setMarkingId(memberId);
    const prev = attendance[memberId] ?? null;
    setAttendance((a) => ({ ...a, [memberId]: status }));
    try {
      const recordRef = doc(db, 'rooms', id, 'attendance', todayKey, 'records', memberId);
      if (status === null) {
        await setDoc(recordRef, { status: null, updatedAt: serverTimestamp() });
      } else {
        await setDoc(recordRef, { status, memberId, markedBy: user?.uid, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      setAttendance((a) => ({ ...a, [memberId]: prev }));
      Alert.alert('Error', 'Could not update attendance.');
    } finally {
      setMarkingId(null);
    }
  };

  const myTasks      = tasks.filter((t) => t.assignees?.includes(user?.uid));
  const displayTasks = filterMine ? myTasks : tasks;
  
  const rejected     = displayTasks.filter((t) => t.status === 'rejected');
  const reviewing    = displayTasks.filter((t) => t.status === 'pending');
  const completed    = displayTasks.filter((t) => t.status === 'completed' || (t.completed && !t.status));
  
  const remaining    = displayTasks.filter((t) => 
    t.status !== 'rejected' && 
    t.status !== 'pending' && 
    t.status !== 'completed' && 
    !t.completed
  );

  const myPendingCount = myTasks.filter((t) => t.status !== 'completed' && !t.completed).length;
  const myRejectedCount = myTasks.filter((t) => t.status === 'rejected').length;

  // Check if a task is overdue
  const isOverdue = (t: any) => {
    const d = parseDate(t.dueDate);
    if (!d) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < now.getTime();
  };

  const myIncompleteCount = myTasks.filter((t) => 
    !t.completed && t.status !== 'completed' && t.status !== 'pending' && t.status !== 'rejected' && isOverdue(t)
  ).length;
  
  const incomplete   = remaining.filter((t) => isOverdue(t));
  const pending      = remaining.filter((t) => !isOverdue(t));

  if (loading || !room) {
    return (
      <View className="flex-1 bg-background p-5 mt-safe">
        <Skeleton className="h-28 w-full rounded-2xl mb-3" />
        <Skeleton className="h-16 w-full rounded-xl mb-3" />
        <Skeleton className="h-20 w-full rounded-xl mb-2" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </View>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'tasks',      label: 'Tasks',      icon: 'clipboard-outline'      },
    { key: 'members',    label: 'Members',    icon: 'people-outline'         },
    { key: 'calendar',   label: 'Calendar',   icon: 'calendar-outline'       },
    { key: 'attendance', label: 'Attendance', icon: 'checkmark-done-outline' },
  ];

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-primary pt-safe pb-4 px-5">
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          {myRejectedCount > 0 ? (
            <View className="bg-red-500 rounded-full px-3 py-1">
              <Text className="text-white text-xs font-bold">
                {myRejectedCount} rejected
              </Text>
            </View>
          ) : myIncompleteCount > 0 ? (
            <View className="bg-red-500/80 rounded-full px-3 py-1">
              <Text className="text-white text-xs font-bold">
                {myIncompleteCount} incomplete
              </Text>
            </View>
          ) : myPendingCount > 0 ? (
            <View className="bg-white/20 rounded-full px-3 py-1">
              <Text className="text-white text-xs font-bold">
                {myPendingCount} tasks for you
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-white text-xl font-bold mb-1">{room.name}</Text>
        <View className="flex-row items-center gap-2">
          <View className="bg-white/20 px-2 py-0.5 rounded-md">
            <Text className="text-white/90 text-xs font-medium">Member</Text>
          </View>
          <Text className="text-white/70 text-xs">
            {members.length} members · {tasks.length} tasks
          </Text>
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-none bg-background border-b border-border"
        contentContainerClassName="flex-row"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
              className={`flex-row items-center gap-1.5 px-4 py-3 ${
                active ? 'border-b-2 border-primary' : ''
              }`}
            >
              <Ionicons name={tab.icon as any} size={15} color={active ? '#6366f1' : '#6b7280'} />
              <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}`}>
                {tab.label}
              </Text>
              {tab.key === 'tasks' && tasks.length > 0 && (
                <View className={`rounded-full px-1.5 min-w-[18px] items-center ${active ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-500'}`}>
                    {tasks.length}
                  </Text>
                </View>
              )}
              {tab.key === 'attendance' && members.length > 0 && (
                <View className={`rounded-full px-1.5 min-w-[18px] items-center ${active ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-500'}`}>
                    {Object.values(attendance).filter(Boolean).length}/{members.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-10"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'tasks' && (
          <>
            {myTasks.length > 0 && (
              <View className="flex-row gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setFilterMine(false)}
                  activeOpacity={0.7}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
                    !filterMine ? 'bg-primary' : 'bg-card border border-border'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${!filterMine ? 'text-white' : 'text-gray-500'}`}>
                    All Tasks
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilterMine(true)}
                  activeOpacity={0.7}
                  className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
                    filterMine ? 'bg-primary' : 'bg-card border border-border'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${filterMine ? 'text-white' : 'text-gray-500'}`}>
                    Assigned to Me
                  </Text>
                  <View className={`rounded-full px-1.5 ${filterMine ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <Text className={`text-xs font-bold ${filterMine ? 'text-white' : 'text-gray-500'}`}>
                      {myTasks.length}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {displayTasks.length === 0 ? (
              <View className="bg-card border border-border rounded-2xl p-8 items-center">
                <Ionicons name="clipboard-outline" size={40} color="#9ca3af" />
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-3 font-semibold">
                  {filterMine ? 'No tasks assigned to you' : 'No tasks yet'}
                </Text>
                <Text className="text-xs text-gray-400 text-center mt-1">
                  {filterMine ? 'Your admin will assign tasks to you' : 'Check back later'}
                </Text>
              </View>
            ) : (
              <>
                {rejected.length > 0 && (
                  <View className="mb-4">
                    <View className="flex-row items-center gap-2 mb-2">
                      <Ionicons name="close-circle" size={14} color="#ef4444" />
                      <Text className="text-xs font-bold text-red-500 uppercase tracking-wider">
                        Rejected · {rejected.length}
                      </Text>
                    </View>
                    {rejected.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAssignedToMe={task.assignees?.includes(user?.uid)}
                        onToggle={handleToggle}
                        onPress={(t) => router.push(`/(member)/rooms/${id}/tasks/${t.id}` as any)}
                      />
                    ))}
                  </View>
                )}

                {reviewing.length > 0 && (
                  <View className="mb-4">
                    <View className="flex-row items-center gap-2 mb-2">
                      <Ionicons name="time" size={14} color="#f59e0b" />
                      <Text className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                        Awaiting Review · {reviewing.length}
                      </Text>
                    </View>
                    {reviewing.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAssignedToMe={task.assignees?.includes(user?.uid)}
                        onToggle={handleToggle}
                        onPress={(t) => router.push(`/(member)/rooms/${id}/tasks/${t.id}` as any)}
                      />
                    ))}
                  </View>
                )}

                {incomplete.length > 0 && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">
                      Incomplete · {incomplete.length}
                    </Text>
                    {incomplete.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAssignedToMe={task.assignees?.includes(user?.uid)}
                        onToggle={handleToggle}
                        onPress={(t) => router.push(`/(member)/rooms/${id}/tasks/${t.id}` as any)}
                      />
                    ))}
                  </View>
                )}

                {pending.length > 0 && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Tasks to do · {pending.length}
                    </Text>
                    {pending.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAssignedToMe={task.assignees?.includes(user?.uid)}
                        onToggle={handleToggle}
                        onPress={(t) => router.push(`/(member)/rooms/${id}/tasks/${t.id}` as any)}
                      />
                    ))}
                  </View>
                )}
                {completed.length > 0 && (
                  <View>
                    <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Completed · {completed.length}
                    </Text>
                    {completed.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAssignedToMe={task.assignees?.includes(user?.uid)}
                        onToggle={handleToggle}
                        onPress={(t) => router.push(`/(member)/rooms/${id}/tasks/${t.id}` as any)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'members' && (
          <>
            {members.length === 0 ? (
              <View className="bg-card border border-border rounded-2xl p-8 items-center">
                <Ionicons name="people-outline" size={40} color="#9ca3af" />
                <Text className="text-sm text-gray-400 text-center mt-3">No members found</Text>
              </View>
            ) : (
              members.map((member) => (
                <MemberCard key={member.id} member={member} isMe={member.id === user?.uid} />
              ))
            )}
          </>
        )}

        {activeTab === 'calendar' && id && user?.uid && (
          <AdminCalendar roomId={id} adminUid={user.uid} readOnly />
        )}

        {activeTab === 'attendance' && (
          <>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="calendar" size={14} color="#6366f1" />
              <Text className="text-xs font-bold text-primary">
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>

            {members.length === 0 ? (
              <View className="bg-card border border-border rounded-2xl p-8 items-center">
                <Ionicons name="people-outline" size={40} color="#9ca3af" />
                <Text className="text-sm text-gray-400 text-center mt-3">No members found</Text>
              </View>
            ) : (
              <>
                <AttendanceSummary attendance={attendance} total={members.length} />

                <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Members · {members.length}
                </Text>

                {members.map((member) => (
                  <AttendanceCard
                    key={member.id}
                    member={member}
                    isMe={member.id === user?.uid}
                    status={attendance[member.id] ?? null}
                    onMark={handleMarkAttendance}
                    markingId={markingId}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}