/**
 * Linked Students Screen — Parent Role Ward Management
 * 
 * Allows parents to link/unlink their student wards registered at VIT-AP
 * per PRD.md §4.3 & Design.md §5.3.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';

export default function LinkedStudentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState(
    user.linkedStudents || [
      { id: 'std_1', name: 'Rahul K.', regNo: '24BCE7012', mentorId: 'fac_dr_verma' },
    ]
  );

  const [newRegNo, setNewRegNo] = useState('');
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (!newRegNo) return;
    setStudents((prev) => [
      ...prev,
      { id: `std_${Date.now()}`, name: newName || 'Student', regNo: newRegNo, mentorId: 'fac_dr_verma' },
    ]);
    setNewRegNo('');
    setNewName('');
  };

  const handleRemove = (id: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <View style={styles.container}>
      <NeuHeader title="Linked Student Wards" showLogo={false} />

      <View style={styles.addSection}>
        <Text style={styles.sectionTitle}>LINK A STUDENT WARD</Text>
        <NeuInput
          label="STUDENT REGISTRATION NUMBER"
          value={newRegNo}
          onChangeText={setNewRegNo}
          placeholder="e.g. 24BCE7033"
        />
        <NeuInput
          label="STUDENT NAME"
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Ananya S."
        />
        <NeuButton title="+ Link Student Ward" variant="navy" size="md" onPress={handleAdd} />
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>YOUR LINKED WARDS ({students.length})</Text>
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.studentCard, neuOutset(4, 8, Colors.neuSurface)]}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>🎓</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.studentName}>{item.name}</Text>
                <Text style={styles.regNo}>Reg No: {item.regNo}</Text>
                <Text style={styles.mentorText}>Assigned Mentor: Dr. Anil Verma</Text>
              </View>
              <Pressable onPress={() => handleRemove(item.id)} style={styles.removeBtn}>
                <Text style={styles.removeText}>Unlink</Text>
              </Pressable>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  addSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  listSection: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.purple100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  studentName: {
    ...Typography.headlineSm,
    fontSize: 16,
    color: Colors.navy900,
    fontWeight: '800',
  },
  regNo: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: '700',
  },
  mentorText: {
    ...Typography.tiny,
    color: Colors.blue500,
  },
  removeBtn: {
    padding: Spacing.xs,
  },
  removeText: {
    ...Typography.tiny,
    color: Colors.red600,
    fontWeight: '700',
  },
});
