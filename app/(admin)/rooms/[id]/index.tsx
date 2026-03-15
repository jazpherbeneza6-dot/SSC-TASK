import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollView, View, TouchableOpacity, RefreshControl, TextInput, Modal } from 'react-native';
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
  query,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/FirebaseConfig';
import { AdminCalendar } from '@/components/AdminCalendar';

type Tab = 'tasks' | 'members' | 'calendar' | 'attendance' | 'daily-record';

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

// ─── Grid Task Card (Folder Style) ────────────────────────────────────────────
// Compact 2-column card for the admin tasks tab

const GridTaskCard = ({
  task,
  onPress,
  fullWidth = false,
}: {
  task: any;
  onPress: (task: any) => void;
  fullWidth?: boolean;
}) => {
  const p   = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const due = getDueLabel(task.dueDate);

  // Overdue + not completed = Incomplete
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
      style={{ width: fullWidth ? '100%' : '48.5%', minHeight: fullWidth ? undefined : 170 }}
      className={`bg-card rounded-2xl mb-3 border border-border overflow-hidden ${task.completed ? 'opacity-55' : ''}`}
    >
      {/* Priority color stripe */}
      <View style={{ height: 4, backgroundColor: p.color }} />

      <View style={{ flex: 1, justifyContent: 'space-between' }} className="p-3">
        {/* Top section */}
        <View className="gap-2">
          {/* Priority badge */}
          <View className="flex-row items-center">
            <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${p.bg}`}>
              <View className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
              <Text className="text-[10px] font-bold uppercase" style={{ color: p.color }}>
                {task.priority}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text
            className={`text-sm font-bold ${
              task.completed
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-800 dark:text-white'
            }`}
            numberOfLines={2}
          >
            {task.title}
          </Text>

          {/* Description */}
          {!!task.description && (
            <Text className="text-xs text-gray-400 dark:text-gray-500" numberOfLines={2}>
              {task.description}
            </Text>
          )}
        </View>

        {/* Bottom meta row — always pinned to bottom */}
        <View className="flex-row flex-wrap items-center gap-1.5 mt-2">
          {due && (
            <View className="flex-row items-center gap-1 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
              <Ionicons name="calendar-outline" size={9} color={due.color} />
              <Text className="text-[10px] font-medium" style={{ color: due.color }}>{due.label}</Text>
            </View>
          )}
          {task.assignees?.length > 0 && (
            <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded-md">
              <Ionicons name="people-outline" size={9} color="#3b82f6" />
              <Text className="text-[10px] text-blue-500 font-bold">{task.assignees.length}</Text>
            </View>
          )}
          {isIncomplete && (
            <View className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded-md">
              <Ionicons name="alert-circle" size={9} color="#ef4444" />
              <Text className="text-[10px] text-red-500 font-bold">Incomplete</Text>
            </View>
          )}
          {task.status === 'pending' && (
            <View className="flex-row items-center gap-1 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-md">
              <Ionicons name="time" size={9} color="#f59e0b" />
              <Text className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Review</Text>
            </View>
          )}
          {task.status === 'rejected' && (
            <View className="flex-row items-center gap-1 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded-md">
              <Ionicons name="close-circle" size={9} color="#ef4444" />
              <Text className="text-[10px] text-red-500 font-bold">Rejected</Text>
            </View>
          )}
          {task.completed && (
            <View className="flex-row items-center gap-1 bg-green-50 dark:bg-green-950/50 px-1.5 py-0.5 rounded-md">
              <Ionicons name="checkmark-circle" size={9} color="#22c55e" />
              <Text className="text-[10px] text-green-600 dark:text-green-400 font-bold">Done</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Member Card ──────────────────────────────────────────────────────────────

const MemberCard = ({ member, isMe }: { member: any; isMe: boolean }) => {
  const initial = (member.displayName || member.email || '?')[0].toUpperCase();
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
            {member.displayName || 'Member'}
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

// ─── Attendance Card (Admin) ──────────────────────────────────────────────────

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
  const initial    = (member.displayName || member.email || '?')[0].toUpperCase();
  const palette    = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
  const color      = palette[initial.charCodeAt(0) % palette.length];
  const isMarking  = markingId === member.id;
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

      {/* Admin sees buttons for ALL members */}
      <View className="flex-row gap-2">
        {(['present', 'late', 'absent'] as const).map((s) => {
          const meta     = ATTENDANCE_META[s];
          const isActive = status === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => !isMarking && onMark(member.id, isActive ? null : s)}
              activeOpacity={0.7}
              disabled={isMarking}
              className={`flex-1 flex-row items-center justify-center gap-1.5 py-1.5 rounded-lg border ${
                isActive ? 'border-transparent' : 'border-border bg-card'
              } ${isMarking ? 'opacity-50' : ''}`}
              style={isActive ? { backgroundColor: meta.color + '20', borderColor: meta.color + '60' } : {}}
            >
              <Ionicons name={meta.icon as any} size={13} color={isActive ? meta.color : '#9ca3af'} />
              <Text className="text-xs font-semibold" style={{ color: isActive ? meta.color : '#9ca3af' }}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
  const values   = Object.values(attendance);
  const present  = values.filter((v) => v === 'present').length;
  const late     = values.filter((v) => v === 'late').length;
  const absent   = values.filter((v) => v === 'absent').length;
  const unmarked = total - values.filter(Boolean).length;

  if (total === 0) return null;

  return (
    <View className="bg-card rounded-xl p-3.5 mb-3 border border-border">
      <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
        Today's Summary
      </Text>
      <View className="flex-row gap-2 mb-2.5">
        {[
          { label: 'Present', value: present,  color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50' },
          { label: 'Late',    value: late,     color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50' },
          { label: 'Absent',  value: absent,   color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50'    },
          { label: 'Pending', value: unmarked, color: '#6b7280', bg: 'bg-gray-100 dark:bg-gray-800'    },
        ].map(({ label, value, color, bg }) => (
          <View key={label} className={`flex-1 items-center py-2 rounded-lg ${bg}`}>
            <Text className="text-lg font-black" style={{ color }}>{value}</Text>
            <Text className="text-xs text-gray-400 font-medium">{label}</Text>
          </View>
        ))}
      </View>
      <View className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex-row">
        {present  > 0 && <View style={{ flex: present,  backgroundColor: '#22c55e' }} />}
        {late     > 0 && <View style={{ flex: late,     backgroundColor: '#f59e0b' }} />}
        {absent   > 0 && <View style={{ flex: absent,   backgroundColor: '#ef4444' }} />}
        {unmarked > 0 && <View style={{ flex: unmarked, backgroundColor: '#e5e7eb' }} />}
      </View>
    </View>
  );
};

// ─── Daily Record Tab (Calendar + Attendance History) ──────────────────────────

const DR_DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DR_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const drToDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DailyRecordTab = ({
  roomId,
  members,
}: {
  roomId: string;
  members: any[];
}) => {
  const today = new Date();

  const [currentYear, setCurrentYear]     = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth]   = useState(today.getMonth());
  const [selectedDate, setSelectedDate]   = useState(drToDateStr(today));
  const [records, setRecords]             = useState<Record<string, AttendanceStatus>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);

  // dates that have any attendance data (dot indicators)
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set());

  const todayStr = drToDateStr(today);

  // Fetch attendance for selected date
  const fetchRecords = async (dateKey: string) => {
    setLoadingRecords(true);
    try {
      const snap = await getDocs(
        collection(db, 'rooms', roomId, 'attendance', dateKey, 'records')
      );
      const map: Record<string, AttendanceStatus> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data().status ?? null;
      });
      setRecords(map);
    } catch (e) {
      console.error('Error fetching daily records:', e);
      setRecords({});
    }
    setLoadingRecords(false);
  };

  // Scan current month for dates that have attendance data
  const scanMonth = async () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const found = new Set<string>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      try {
        const snap = await getDocs(
          collection(db, 'rooms', roomId, 'attendance', dateKey, 'records')
        );
        if (snap.size > 0 && snap.docs.some((d) => d.data().status)) {
          found.add(dateKey);
        }
      } catch (_) {}
    }
    setDatesWithData(found);
  };

  useEffect(() => {
    fetchRecords(selectedDate);
  }, [selectedDate, roomId]);

  useEffect(() => {
    scanMonth();
  }, [currentMonth, currentYear, roomId]);

  // Calendar helpers
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth     = new Date(currentYear, currentMonth + 1, 0).getDate();

  const goToPrev = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const gridCells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Summary for selected date
  const statusValues = Object.values(records);
  const presentCount = statusValues.filter((v) => v === 'present').length;
  const lateCount    = statusValues.filter((v) => v === 'late').length;
  const absentCount  = statusValues.filter((v) => v === 'absent').length;
  const markedTotal  = statusValues.filter(Boolean).length;

  return (
    <View className="gap-3">
      {/* Calendar Card */}
      <View className="bg-card rounded-2xl border border-border overflow-hidden">
        {/* Month navigation */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <TouchableOpacity onPress={goToPrev} activeOpacity={0.7} className="p-1">
            <Ionicons name="chevron-back" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-800 dark:text-white">
            {DR_MONTHS[currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={goToNext} activeOpacity={0.7} className="p-1">
            <Ionicons name="chevron-forward" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View className="flex-row px-2 pb-1">
          {DR_DAYS.map((d) => (
            <View key={d} className="flex-1 items-center">
              <Text className="text-xs font-semibold text-gray-400">{d}</Text>
            </View>
          ))}
        </View>

        {/* Date grid */}
        <View className="flex-row flex-wrap px-2 pb-3">
          {gridCells.map((day, idx) => {
            if (day === null) {
              return <View key={`blank-${idx}`} style={{ width: `${100 / 7}%` }} className="p-0.5" />;
            }
            const dateStr    = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday    = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasData    = datesWithData.has(dateStr);

            return (
              <TouchableOpacity
                key={dateStr}
                onPress={() => setSelectedDate(dateStr)}
                activeOpacity={0.7}
                style={{ width: `${100 / 7}%` }}
                className="p-0.5 items-center"
              >
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center
                    ${isSelected ? 'bg-primary' : isToday ? 'bg-primary/15' : ''}
                  `}
                >
                  <Text
                    className={`text-sm font-medium
                      ${isSelected ? 'text-white' : isToday ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}
                    `}
                  >
                    {day}
                  </Text>
                </View>
                {/* Dot indicator for dates with attendance data */}
                <View className="h-1.5 mt-0.5">
                  {hasData && (
                    <View
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? '#ef4444' : '#6b7280' }}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected date label */}
      <Text className="text-sm font-bold text-gray-800 dark:text-white">
        {new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })}
      </Text>

      {/* Summary bar */}
      {markedTotal > 0 && (
        <View className="bg-card rounded-xl border border-border p-3.5">
          <View className="flex-row gap-2 mb-2.5">
            {[
              { label: 'Present', value: presentCount, color: '#22c55e', bg: 'bg-green-50 dark:bg-green-950/50' },
              { label: 'Late',    value: lateCount,    color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/50' },
              { label: 'Absent',  value: absentCount,  color: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/50'    },
            ].map(({ label, value, color, bg }) => (
              <View key={label} className={`flex-1 items-center py-2 rounded-lg ${bg}`}>
                <Text className="text-lg font-black" style={{ color }}>{value}</Text>
                <Text className="text-xs text-gray-400 font-medium">{label}</Text>
              </View>
            ))}
          </View>
          <View className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex-row">
            {presentCount > 0 && <View style={{ flex: presentCount, backgroundColor: '#22c55e' }} />}
            {lateCount    > 0 && <View style={{ flex: lateCount,    backgroundColor: '#f59e0b' }} />}
            {absentCount  > 0 && <View style={{ flex: absentCount,  backgroundColor: '#ef4444' }} />}
          </View>
        </View>
      )}

      {/* Members attendance list */}
      {loadingRecords ? (
        <View className="bg-card rounded-xl border border-border p-6 items-center">
          <Text className="text-sm text-gray-400">Loading records…</Text>
        </View>
      ) : members.length === 0 ? (
        <View className="bg-card rounded-xl border border-border p-6 items-center">
          <Ionicons name="people-outline" size={36} color="#9ca3af" />
          <Text className="text-sm text-gray-400 mt-2">No members in this room</Text>
        </View>
      ) : markedTotal === 0 ? (
        <View className="bg-card rounded-xl border border-border p-6 items-center">
          <Ionicons name="document-outline" size={36} color="#9ca3af" />
          <Text className="text-sm text-gray-400 mt-2">No attendance records for this date</Text>
        </View>
      ) : (
        <View className="gap-2">
          <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Members · {members.length}
          </Text>
          {members.map((member) => {
            const status   = records[member.id] ?? null;
            const meta     = status ? ATTENDANCE_META[status] : null;
            const initial  = (member.displayName || member.firstname || member.email || '?')[0].toUpperCase();
            const palette  = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
            const color    = palette[initial.charCodeAt(0) % palette.length];

            return (
              <View
                key={member.id}
                className="bg-card rounded-xl border border-border p-3 flex-row items-center gap-3"
              >
                <View
                  style={{ backgroundColor: color + '22', width: 38, height: 38, borderRadius: 19 }}
                  className="items-center justify-center"
                >
                  <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{initial}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-800 dark:text-white">
                    {member.firstname && member.lastname
                      ? `${member.firstname} ${member.lastname}`
                      : member.displayName || 'Member'}
                  </Text>
                  <Text className="text-xs text-gray-400">{member.email}</Text>
                </View>
                {meta ? (
                  <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-lg ${meta.bg}`}>
                    <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                    <Text className="text-xs font-bold" style={{ color: meta.color }}>
                      {meta.label}
                    </Text>
                  </View>
                ) : (
                  <View className="bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                    <Text className="text-xs font-medium text-gray-400">Not marked</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminRoomDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab]   = useState<Tab>('tasks');

  const [room, setRoom]       = useState<any>(null);
  const [tasks, setTasks]     = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [markingId, setMarkingId]   = useState<string | null>(null);

  // Which folder is currently open (null = show folder list)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState('');

  // Add task modal
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [taskTitle, setTaskTitle]               = useState('');
  const [taskDescription, setTaskDescription]   = useState('');
  const [taskPriority, setTaskPriority]         = useState<'low' | 'medium' | 'high'>('medium');
  const [creatingTask, setCreatingTask]         = useState(false);



  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  useEffect(() => {
    if (!id) return;

    // 1. Fetch static data
    const fetchStatic = async () => {
      try {
        const roomSnap = await getDoc(doc(db, 'rooms', id));
        if (roomSnap.exists()) setRoom({ id: roomSnap.id, ...roomSnap.data() });

        const membersSnap = await getDocs(collection(db, 'rooms', id, 'members'));
        setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error fetching admin room static data:', e);
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
        console.error('Admin tasks listener error:', err);
        setLoading(false);
      }
    );

    // 3. Listen to real-time attendance for today
    const attendanceUnsub = onSnapshot(
      collection(db, 'rooms', id, 'attendance', todayKey, 'records'),
      (snap) => {
        const map: Record<string, AttendanceStatus> = {};
        snap.docs.forEach((d) => { map[d.id] = d.data().status ?? null; });
        setAttendance(map);
      }
    );

    return () => {
      tasksUnsub();
      attendanceUnsub();
    };
  }, [id, todayKey]);

  const onRefresh = () => { setRefreshing(false); };

  // Admin cannot toggle tasks — removed handleToggle entirely

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) { Alert.alert('Error', 'Please enter a task title'); return; }
    setCreatingTask(true);
    try {
      await addDoc(collection(db, 'rooms', id, 'tasks'), {
        title:       taskTitle.trim(),
        description: taskDescription.trim(),
        priority:    taskPriority,
        completed:   false,
        assignees:   [],
        createdBy:   user?.uid,
        createdAt:   serverTimestamp(),
      });
      setTaskModalVisible(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('medium');
    } catch (e) {
      Alert.alert('Error', 'Could not create task.');
    } finally {
      setCreatingTask(false);
    }
  };

  // Admin marks attendance for ANY member — no restriction
  const handleMarkAttendance = async (memberId: string, status: AttendanceStatus) => {
    setMarkingId(memberId);
    const prev = attendance[memberId] ?? null;
    setAttendance((a) => ({ ...a, [memberId]: status }));
    try {
      const ref = doc(db, 'rooms', id, 'attendance', todayKey, 'records', memberId);
      if (status === null) {
        await setDoc(ref, { status: null, updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, { status, memberId, markedBy: user?.uid, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      setAttendance((a) => ({ ...a, [memberId]: prev }));
      Alert.alert('Error', 'Could not update attendance.');
    } finally {
      setMarkingId(null);
    }
  };

  // Bulk mark all members at once
  const handleMarkAll = (status: AttendanceStatus) => {
    const label = status ? ATTENDANCE_META[status].label : 'Unmarked';
    Alert.alert(
      `Mark All as ${label}`,
      `This will mark all ${members.length} members as ${label.toLowerCase()}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const newMap: Record<string, AttendanceStatus> = {};
            members.forEach((m) => { newMap[m.id] = status; });
            setAttendance((a) => ({ ...a, ...newMap }));
            try {
              await Promise.all(
                members.map((m) => {
                  const ref = doc(db, 'rooms', id, 'attendance', todayKey, 'records', m.id);
                  if (status === null) return setDoc(ref, { status: null, updatedAt: serverTimestamp() });
                  return setDoc(ref, { status, memberId: m.id, markedBy: user?.uid, updatedAt: serverTimestamp() });
                })
              );
            } catch (e) {
              Alert.alert('Error', 'Could not update all attendance records.');
            }
          },
        },
      ]
    );
  };

  // Sort tasks by priority: high → medium → low
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedTasks = [...tasks].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  );

  const pending   = sortedTasks.filter((t) => !t.completed);
  const completed = sortedTasks.filter((t) =>  t.completed);

  // Group tasks by folder
  const folderGroups = (() => {
    const groups: Record<string, any[]> = {};
    const unfiled: any[] = [];
    sortedTasks.forEach((t) => {
      const f = t.folder && typeof t.folder === 'string' && t.folder.trim() ? t.folder.trim() : null;
      if (f) {
        if (!groups[f]) groups[f] = [];
        groups[f].push(t);
      } else {
        unfiled.push(t);
      }
    });
    return { groups, unfiled, folderNames: Object.keys(groups).sort() };
  })();

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
    { key: 'daily-record', label: 'Daily Record', icon: 'book-outline'          },
  ];

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-red-500 dark:bg-red-950 pt-safe pb-4 px-5 pt-5">
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => router.push(`(admin)/rooms/${id}/invite` as any)} activeOpacity={0.7} className="bg-white/20 rounded-full px-3 py-1">
            <Text className="text-white text-xs font-bold">Invite</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-white text-xl font-bold mb-1">{room.name}</Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          <View className="flex-row items-center gap-1 bg-white/15 px-2 py-0.5 rounded-md">
            <Ionicons name="code-outline" size={11} color="rgba(255,255,255,0.8)" />
            <Text className="text-white/80 text-xs font-mono font-bold">{room.roomCode}</Text>
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
                active ? 'border-b-2 border-red-500' : ''
              }`}
            >
              <Ionicons name={tab.icon as any} size={15} color={active ? '#ef4444' : '#6b7280'} />
              <Text className={`text-xs font-semibold ${active ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {tab.label}
              </Text>
              {tab.key === 'tasks' && tasks.length > 0 && (
                <View className={`rounded-full px-1.5 min-w-[18px] items-center ${active ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-gray-500'}`}>
                    {tasks.length}
                  </Text>
                </View>
              )}
              {tab.key === 'attendance' && members.length > 0 && (
                <View className={`rounded-full px-1.5 min-w-[18px] items-center ${active ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
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
        {/* ── Tasks Tab ── */}
        {activeTab === 'tasks' && (
          <>
            {/* If a folder is selected, show only its tasks */}
            {selectedFolder && folderGroups.groups[selectedFolder] ? (
              <>
                {/* Folder header with back button */}
                <View className="flex-row items-center gap-3 mb-3">
                  <TouchableOpacity
                    onPress={() => { setSelectedFolder(null); setFolderSearch(''); }}
                    activeOpacity={0.7}
                    className="w-8 h-8 rounded-full bg-card border border-border items-center justify-center"
                  >
                    <Ionicons name="arrow-back" size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                    <Ionicons name="folder-open" size={18} color="#6366f1" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-800 dark:text-white">{selectedFolder}</Text>
                    <Text className="text-xs text-gray-400">
                      {folderGroups.groups[selectedFolder].length} task{folderGroups.groups[selectedFolder].length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`(admin)/rooms/${id}/tasks/new` as any)}
                    activeOpacity={0.7}
                    className="bg-primary rounded-full pl-2 pr-3 py-1 flex-row items-center gap-1"
                  >
                    <Ionicons name="add" size={16} color="white" />
                    <Text className="text-xs font-semibold text-white">Add Task</Text>
                  </TouchableOpacity>
                </View>

                {/* Search bar */}
                <View className="flex-row items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5 mb-3">
                  <Ionicons name="search-outline" size={16} color="#9ca3af" />
                  <TextInput
                    value={folderSearch}
                    onChangeText={setFolderSearch}
                    placeholder="Search tasks…"
                    className="flex-1 text-sm text-gray-800 dark:text-white"
                    placeholderTextColor="#9ca3af"
                  />
                  {folderSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setFolderSearch('')}>
                      <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tasks list — single column */}
                <View className="gap-3">
                  {folderGroups.groups[selectedFolder]
                    .filter((task: any) => {
                      if (!folderSearch.trim()) return true;
                      const q = folderSearch.trim().toLowerCase();
                      return (
                        (task.title || '').toLowerCase().includes(q) ||
                        (task.description || '').toLowerCase().includes(q)
                      );
                    })
                    .map((task: any) => (
                    <GridTaskCard
                      key={task.id}
                      task={task}
                      fullWidth
                      onPress={(t) => router.push(`/rooms/${id}/tasks/${t.id}` as any)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
                {/* Default: show folder list + unfiled */}
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    All Tasks · {tasks.length}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push(`(admin)/rooms/${id}/tasks/new` as any)}
                    activeOpacity={0.7}
                    className="bg-primary rounded-full pl-2 pr-3 py-1 flex-row items-center gap-1"
                  >
                    <Ionicons name="add" size={16} color="white" />
                    <Text className="text-xs font-semibold text-white">Add Task</Text>
                  </TouchableOpacity>
                </View>

                {tasks.length === 0 ? (
                  <View className="bg-card border border-border rounded-2xl p-8 items-center">
                    <Ionicons name="clipboard-outline" size={40} color="#9ca3af" />
                    <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-3 font-semibold">
                      No tasks yet
                    </Text>
                    <Text className="text-xs text-gray-400 text-center mt-1">Tap "Add Task" to create one</Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {/* Folder cards */}
                    {folderGroups.folderNames.map((folderName) => {
                      const folderTasks = folderGroups.groups[folderName];
                      const doneCount   = folderTasks.filter((t: any) => t.completed).length;

                      return (
                        <TouchableOpacity
                          key={folderName}
                          onPress={() => setSelectedFolder(folderName)}
                          activeOpacity={0.7}
                          className="bg-card border border-border rounded-2xl flex-row items-center gap-3 px-4 py-3.5"
                        >
                          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                            <Ionicons name="folder" size={20} color="#6366f1" />
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-bold text-gray-800 dark:text-white">{folderName}</Text>
                            <Text className="text-xs text-gray-400">
                              {folderTasks.length} task{folderTasks.length !== 1 ? 's' : ''}
                              {doneCount > 0 ? ` · ${doneCount} done` : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                      );
                    })}

                    {/* Unfiled tasks */}
                    {folderGroups.unfiled.length > 0 && (
                      <View>
                        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                          {folderGroups.folderNames.length > 0 ? 'Unfiled' : 'All Tasks'} · {folderGroups.unfiled.length}
                        </Text>
                        <View className="flex-row flex-wrap justify-between">
                          {folderGroups.unfiled.map((task) => (
                            <GridTaskCard
                              key={task.id}
                              task={task}
                              onPress={(t) => router.push(`/rooms/${id}/tasks/${t.id}` as any)}
                            />
                          ))}
                          {folderGroups.unfiled.length % 2 !== 0 && <View style={{ width: '48.5%' }} />}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── Members Tab ── */}
        {activeTab === 'members' && (
          <>
            {members.length === 0 ? (
              <View className="bg-card border border-border rounded-2xl p-8 items-center">
                <Ionicons name="people-outline" size={40} color="#9ca3af" />
                <Text className="text-sm text-gray-400 text-center mt-3">No members yet</Text>
                <Text className="text-xs text-gray-400 text-center mt-1">
                  Share the room code: {room.roomCode}
                </Text>
              </View>
            ) : (
              members.map((member) => (
                <MemberCard key={member.id} member={member} isMe={member.id === user?.uid} />
              ))
            )}
          </>
        )}

        {/* ── Calendar Tab ── */}
        {activeTab === 'calendar' && id && user?.uid && (
          <AdminCalendar roomId={id} adminUid={user.uid} />
        )}

        {/* ── Attendance Tab ── */}
        {activeTab === 'attendance' && (
          <>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="calendar" size={14} color="#ef4444" />
              <Text className="text-xs font-bold text-red-500">
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

                {/* Bulk mark row */}
                <View className="bg-card border border-border rounded-xl p-3 mb-3">
                  <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Mark All As
                  </Text>
                  <View className="flex-row gap-2">
                    {(['present', 'late', 'absent'] as const).map((s) => {
                      const meta = ATTENDANCE_META[s];
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => handleMarkAll(s)}
                          activeOpacity={0.7}
                          className="flex-1 flex-row items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border bg-card"
                        >
                          <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                          <Text className="text-xs font-semibold" style={{ color: meta.color }}>
                            {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

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

        {/* ── Daily Record Tab ── */}
        {activeTab === 'daily-record' && id && (
          <DailyRecordTab roomId={id} members={members} />
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTaskModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
          <View className="bg-background rounded-2xl p-5 w-full max-w-md">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-800 dark:text-white">Add Task</Text>
              <TouchableOpacity onPress={() => setTaskModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</Text>
                <TextInput
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                  placeholder="Enter task title"
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</Text>
                <TextInput
                  value={taskDescription}
                  onChangeText={setTaskDescription}
                  placeholder="Enter description (optional)"
                  multiline
                  numberOfLines={3}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  style={{ textAlignVertical: 'top' }}
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</Text>
                <View className="flex-row gap-2">
                  {(['low', 'medium', 'high'] as const).map((p) => {
                    const meta   = PRIORITY_META[p];
                    const active = taskPriority === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setTaskPriority(p)}
                        activeOpacity={0.7}
                        className={`flex-1 py-2 rounded-xl border items-center ${
                          active ? 'border-transparent' : 'border-border bg-card'
                        }`}
                        style={active ? { backgroundColor: meta.color + '20', borderColor: meta.color + '60' } : {}}
                      >
                        <Text
                          className="text-xs font-semibold capitalize"
                          style={{ color: active ? meta.color : '#9ca3af' }}
                        >
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleCreateTask}
                disabled={creatingTask}
                activeOpacity={0.7}
                className={`bg-primary rounded-xl py-3 items-center ${creatingTask ? 'opacity-50' : ''}`}
              >
                <Text className="text-white font-medium">
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}