/**
 * My Vehicles Screen — Saved Vehicles Management
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { VehicleCard } from '@/components/ui/VehicleCard';
import { NeuButton } from '@/components/ui/NeuButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApp } from '@/context/AppContext';

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { vehicles, setDefaultVehicle, removeVehicle } = useApp();

  return (
    <View style={styles.container}>
      <NeuHeader title="My Vehicles" showLogo={false} />

      <View style={styles.topBtnRow}>
        <NeuButton
          title="+ Add New Vehicle"
          variant="navy"
          size="md"
          fullWidth
          onPress={() => router.push('/(main)/vehicles/add')}
        />
      </View>

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <VehicleCard
            id={item.id}
            plateNumber={item.plateNumber}
            vehicleType={item.vehicleType}
            model={item.model}
            color={item.color}
            isDefault={item.isDefault}
            onSetDefault={() => setDefaultVehicle(item.id)}
            onDelete={() => removeVehicle(item.id)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Saved Vehicles"
            subtitle="Add your vehicle to enable automatic license plate gate recognition."
            actionLabel="Add Vehicle"
            onAction={() => router.push('/(main)/vehicles/add')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  topBtnRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
});
