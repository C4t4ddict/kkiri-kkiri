// src/screens/EvaluationScreen.tsx
import React from 'react';
import { View, Text } from 'react-native';

export default function EvaluationScreen({ user }: any) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{user.name}님의 평가 기록</Text>
    </View>
  );
}