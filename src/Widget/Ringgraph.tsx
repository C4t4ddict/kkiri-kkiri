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
  { size: 156, radius: 69, width: 10, color: colors.primary },
  { size: 122, radius: 53, width: 9, color: '#8B6CF6' },
  { size: 90, radius: 38, width: 8, color: colors.primaryLight },
  { size: 60, radius: 23, width: 7, color: '#C4B5FD' },
];

const SEGMENTS = 96;

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
                const activation = Math.min(0.97, threshold / Math.max(ringPercent, 1));
                const opacity = active
                  ? animated.interpolate({
                    inputRange: [0, activation, 1],
                    outputRange: [0, 0, 1],
                    extrapolate: 'clamp',
                  })
                  : 0;
                const angle = (360 / SEGMENTS) * segmentIndex - 90;
                return (
                  <View
                    key={`segment-${segmentIndex}`}
                    style={[
                      styles.trackSegment,
                      {
                        width: ring.width,
                        height: ring.width * 1.25,
                        borderRadius: ring.width,
                        transform: [
                          { rotate: `${angle}deg` },
                          { translateY: -ring.radius },
                        ],
                      },
                    ]}
                  >
                    <Animated.View
                      style={[
                        styles.segment,
                        { backgroundColor: ring.color, opacity },
                      ]}
                    />
                  </View>
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
            {metric.label} {clamp(metric.percent)}% {metric.percent === 100 ? '완료' : '진행중'}
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
    width: 174,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackSegment: {
    position: 'absolute',
    backgroundColor: '#EDE9FE',
  },
  segment: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  metricList: {
    flex: 1,
    marginLeft: 14,
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
