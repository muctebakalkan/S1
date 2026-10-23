import { Stack } from 'expo-router';

export default function MechanicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#070B10' },
      }}
    />
  );
}
