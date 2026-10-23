import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CreatePartScreen } from './create-part';

export default function MechanicEditPartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CreatePartScreen role="mechanic" editingId={id ? String(id) : undefined} />;
}
