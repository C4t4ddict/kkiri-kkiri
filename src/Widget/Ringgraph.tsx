import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../config/colors';

type RingMetric = {
  label: string;
  percent: number;
};

type Props = {
  percent: number;
  metrics: RingMetric[];
};

const rings = [
  { size: 150, radius: 67, width: 9, color: '#FF2D70' },
  { size: 118, radius: 51, width: 8, color: '#7CFF00' },
  { size: 86, radius: 36, width: 7, color: '#25DDF4' },
  { size: 56, radius: 21, width: 6, color: colors.primaryLight },
];

const SEGMENTS = 144;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export default function Ringgraph({ percent, metrics }: Props) {
  const animated = useRef(new Animated.Value(0)).current;
  const safePercent = clamp(percent);
  const safeMetrics = useMemo(() => metrics.slice(0, 4), [metrics]);

  const runAnimation = useCallback(() => {
    animated.stopAnimation();
    animated.setValue(0);
    Animated.timing(animated, {
      toValue: 1,
      duration: 900,
      useNativeDriver: true,
    }).start();
  }, [animated]);

  useEffect(() => {
    runAnimation();
  }, [runAnimation, safePercent]);

  useFocusEffect(
    useCallback(() => {
      runAnimation();
    }, [runAnimation])
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.graphArea}>
        {rings.map((ring, ringIndex) => {
          const ringPercent = clamp(safeMetrics[ringIndex]?.percent ?? safePercent);
          return (
            <View
              key={`ring-${ring.size}`}
              pointerEvents="none"
              style={[styles.ringLayer, { width: ring.size, height: ring.size, borderRadius: ring.size / 2 }]}
            >
              {Array.from({ length: SEGMENTS }).map((_, segmentIndex) => {
                const threshold = ((segmentIndex + 1) / SEGMENTS) * 100;
                const active = threshold <= ringPercent;
                const activation = Math.min(0.95, threshold / Math.max(ringPercent, 1));
                const opacity = active
                  ? animated.interpolate({
                    inputRange: [0, activation, 1],
                    outputRange: [0.15, 0.15, 1],
                    extrapolate: 'clamp',
                  })
                  : 0.15;
                const angle = (360 / SEGMENTS) * segmentIndex - 90;
                return (
                  <Animated.View
                    key={`segment-${segmentIndex}`}
                    style={[
                      styles.segment,
                      {
                        width: ring.width,
                        height: ring.width * 1.25,
                        borderRadius: ring.width,
                        backgroundColor: ring.color,
                        opacity,
                        transform: [
                          { rotate: `${angle}deg` },
                          { translateY: -ring.radius },
                        ],
                      },
                    ]}
                  />
                );
              })}
            </View>
          );
        })}
      </View>

      <View style={styles.metricList}>
        {safeMetrics.map((metric, index) => (
          <Text
            key={metric.label}
            style={[
              styles.metricText,
              { color: rings[index]?.color ?? colors.primary },
              index > 1 && styles.metricTextSoft,
            ]}
          >
            {metric.label} {clamp(metric.percent)}% {index === 0 ? '진행중' : '완료'}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  graphArea: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 9,
    borderColor: '#F0EAFE',
  },
  segment: {
    position: 'absolute',
  },
  metricList: {
    flex: 1,
    marginLeft: 18,
    gap: 10,
  },
  metricText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  metricTextSoft: {
    opacity: 0.78,
  },
});
