import { Text } from '@/components/ui/text';
import { View, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Alert } from '@/utils/alerts';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/FirebaseConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  date: string;        // "YYYY-MM-DD"
  startTime: string;   // "HH:MM"
  endTime: string;     // "HH:MM"
  color: string;
  roomId: string;
  createdBy: string;
  createdAt: any;
};

const EVENT_COLORS = [
  { label: 'Red',    value: '#ef4444' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Pink',   value: '#ec4899' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDisplayTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ─── Event Form Modal ─────────────────────────────────────────────────────────

const EventFormModal = ({
  visible,
  onClose,
  onSave,
  initialDate,
  editingEvent,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<CalendarEvent, 'id' | 'createdAt'>) => Promise<void>;
  initialDate: string;
  editingEvent: CalendarEvent | null;
}) => {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate]               = useState(initialDate);
  const [startTime, setStartTime]     = useState('09:00');
  const [endTime, setEndTime]         = useState('10:00');
  const [color, setColor]             = useState(EVENT_COLORS[0].value);
  const [saving, setSaving]           = useState(false);

  // Populate when editing
  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title);
      setDescription(editingEvent.description || '');
      setDate(editingEvent.date);
      setStartTime(editingEvent.startTime);
      setEndTime(editingEvent.endTime);
      setColor(editingEvent.color);
    } else {
      setTitle('');
      setDescription('');
      setDate(initialDate);
      setStartTime('09:00');
      setEndTime('10:00');
      setColor(EVENT_COLORS[0].value);
    }
  }, [editingEvent, initialDate, visible]);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title'); return; }
    if (!date)         { Alert.alert('Error', 'Please select a date'); return; }
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim(), date, startTime, endTime, color } as any);
    setSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-3xl p-5 max-h-[90%]">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-5">
            <Text className="text-lg font-bold text-gray-800 dark:text-white">
              {editingEvent ? 'Edit Event' : 'New Event'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="gap-4">
              {/* Title */}
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Event title"
                  placeholderTextColor="#9ca3af"
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                />
              </View>

              {/* Description */}
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional description"
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={3}
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>

              {/* Date */}
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                />
              </View>

              {/* Times */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</Text>
                  <TextInput
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="HH:MM"
                    placeholderTextColor="#9ca3af"
                    className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</Text>
                  <TextInput
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="HH:MM"
                    placeholderTextColor="#9ca3af"
                    className="bg-card border border-border rounded-xl px-4 py-3 text-gray-800 dark:text-white"
                  />
                </View>
              </View>

              {/* Color */}
              <View>
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Event Color</Text>
                <View className="flex-row gap-2 flex-wrap">
                  {EVENT_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setColor(c.value)}
                      activeOpacity={0.7}
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: c.value }}
                    >
                      {color === c.value && (
                        <Ionicons name="checkmark" size={18} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Save */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.7}
                className={`bg-primary rounded-xl py-3.5 items-center mt-2 ${saving ? 'opacity-50' : ''}`}
              >
                <Text className="text-white font-semibold">
                  {saving ? 'Saving…' : editingEvent ? 'Update Event' : 'Create Event'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Event Detail Modal ───────────────────────────────────────────────────────

const EventDetailModal = ({
  event,
  onClose,
  onEdit,
  onDelete,
  readOnly,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly: boolean;
}) => {
  if (!event) return null;
  return (
    <Modal visible={!!event} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center p-5">
        <View className="bg-background rounded-2xl p-5 w-full max-w-md">
          {/* Color bar */}
          <View className="h-1.5 rounded-full mb-4" style={{ backgroundColor: event.color }} />

          <View className="flex-row justify-between items-start mb-4">
            <Text className="text-lg font-bold text-gray-800 dark:text-white flex-1 mr-2">
              {event.title}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View className="gap-3 mb-5">
            <View className="flex-row items-center gap-2">
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text className="text-sm text-gray-600 dark:text-gray-400">{event.date}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {formatDisplayTime(event.startTime)} – {formatDisplayTime(event.endTime)}
              </Text>
            </View>
            {event.description ? (
              <View className="flex-row items-start gap-2">
                <Ionicons name="document-text-outline" size={16} color="#6b7280" style={{ marginTop: 2 }} />
                <Text className="text-sm text-gray-600 dark:text-gray-400 flex-1">{event.description}</Text>
              </View>
            ) : null}
          </View>

          {!readOnly && (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={onEdit}
                activeOpacity={0.7}
                className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl py-3 flex-row items-center justify-center gap-1"
              >
                <Ionicons name="create-outline" size={16} color="#6b7280" />
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                activeOpacity={0.7}
                className="flex-1 bg-red-50 dark:bg-red-950 rounded-xl py-3 flex-row items-center justify-center gap-1"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text className="text-sm font-medium text-red-600 dark:text-red-400">Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ─── Main AdminCalendar Component ─────────────────────────────────────────────

export const AdminCalendar = ({
  roomId,
  adminUid,
  readOnly = false,
}: {
  roomId: string;
  adminUid: string;
  readOnly?: boolean;
}) => {
  const today = new Date();

  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(toDateStr(today));
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [loading, setLoading]           = useState(true);

  const [formVisible, setFormVisible]   = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent]   = useState<CalendarEvent | null>(null);

  // ── Fetch events from Firestore ──────────────────────────────────────────

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'roomEvents'),
        where('roomId', '==', roomId),
      );
      const snap = await getDocs(q);
      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent));
      // Sort by date client-side — no composite index needed
      fetched.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(fetched);
    } catch (e) {
      console.error('Error fetching events:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, [roomId]);

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const handleSaveEvent = async (data: Omit<CalendarEvent, 'id' | 'createdAt'>) => {
    if (readOnly) return;
    try {
      if (editingEvent) {
        await updateDoc(doc(db, 'roomEvents', editingEvent.id), {
          ...data,
          updatedAt: Timestamp.now(),
        });
      } else {
        await addDoc(collection(db, 'roomEvents'), {
          ...data,
          roomId,
          createdBy: adminUid,
          createdAt: Timestamp.now(),
        });
      }
      setFormVisible(false);
      setEditingEvent(null);
      fetchEvents();
    } catch (e) {
      console.error('Error saving event:', e);
      Alert.alert('Error', 'Failed to save event.');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (readOnly) return;
    Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'roomEvents', eventId));
            setDetailEvent(null);
            fetchEvents();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete event.');
          }
        },
      },
    ]);
  };

  // ── Calendar grid ────────────────────────────────────────────────────────

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth     = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayStr        = toDateStr(today);

  const goToPrev = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  // Events keyed by date string
  const eventsByDate = events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  const selectedDateEvents = eventsByDate[selectedDate] || [];

  // Build grid cells: nulls = leading blanks
  const gridCells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View className="gap-3">
      {/* ── Calendar Card ───────────────────────────────────────────────── */}
      <View className="bg-card rounded-2xl border border-border overflow-hidden">

        {/* Month navigation */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <TouchableOpacity onPress={goToPrev} activeOpacity={0.7} className="p-1">
            <Ionicons name="chevron-back" size={22} color="#6b7280" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-800 dark:text-white">
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={goToNext} activeOpacity={0.7} className="p-1">
            <Ionicons name="chevron-forward" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View className="flex-row px-2 pb-1">
          {DAYS.map((d) => (
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
            const dateStr   = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday   = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const dayEvents = eventsByDate[dateStr] || [];

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
                {/* Dot indicators */}
                <View className="flex-row gap-0.5 mt-0.5 h-1.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <View
                      key={ev.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: ev.color }}
                    />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Selected-day events + Add button (hidden in readOnly) ──────── */}
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-gray-800 dark:text-white">
          {new Date(selectedDate + 'T00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          })}
        </Text>
        {!readOnly && (
          <TouchableOpacity
            onPress={() => { setEditingEvent(null); setFormVisible(true); }}
            activeOpacity={0.7}
            className="bg-primary rounded-full pl-2 pr-3 py-1.5 flex-row items-center gap-1"
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-xs font-semibold text-white">Add Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Event list for selected day */}
      {selectedDateEvents.length === 0 ? (
        <View className="bg-card rounded-xl border border-border p-5 items-center">
          <Ionicons name="calendar-outline" size={32} color="#9ca3af" />
          <Text className="text-sm text-gray-400 mt-2">No events on this day</Text>
          {!readOnly && (
            <Text className="text-xs text-gray-400 mt-0.5">Tap "Add Event" to create one</Text>
          )}
        </View>
      ) : (
        <View className="gap-2">
          {selectedDateEvents.map((ev) => (
            <TouchableOpacity
              key={ev.id}
              onPress={() => setDetailEvent(ev)}
              activeOpacity={0.7}
              className="bg-card rounded-xl border border-border p-3 flex-row items-center gap-3"
            >
              {/* Color strip */}
              <View className="w-1 self-stretch rounded-full" style={{ backgroundColor: ev.color }} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-gray-800 dark:text-white" numberOfLines={1}>
                  {ev.title}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatDisplayTime(ev.startTime)} – {formatDisplayTime(ev.endTime)}
                </Text>
                {ev.description ? (
                  <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>{ev.description}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Upcoming events strip (next 5) ─────────────────────────────── */}
      {(() => {
        const upcoming = events
          .filter((ev) => ev.date >= todayStr && ev.date !== selectedDate)
          .slice(0, 5);
        if (!upcoming.length) return null;
        return (
          <View className="bg-card rounded-2xl border border-border p-4">
            <Text className="text-sm font-bold text-gray-800 dark:text-white mb-3">
              Upcoming Events
            </Text>
            <View className="gap-2">
              {upcoming.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  onPress={() => {
                    setSelectedDate(ev.date);
                    setDetailEvent(ev);
                  }}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-3"
                >
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: ev.color }}
                  />
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-gray-700 dark:text-gray-300" numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {new Date(ev.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}{formatDisplayTime(ev.startTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })()}

      {/* ── Modals (hidden in readOnly mode for form) ─────────────────── */}
      {!readOnly && (
        <EventFormModal
          visible={formVisible}
          onClose={() => { setFormVisible(false); setEditingEvent(null); }}
          onSave={handleSaveEvent}
          initialDate={selectedDate}
          editingEvent={editingEvent}
        />
      )}

      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={() => {
          if (readOnly) return;
          setEditingEvent(detailEvent);
          setDetailEvent(null);
          setFormVisible(true);
        }}
        onDelete={() => detailEvent && handleDeleteEvent(detailEvent.id)}
        readOnly={readOnly}
      />
    </View>
  );
};