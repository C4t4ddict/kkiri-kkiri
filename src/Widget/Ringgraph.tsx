import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type RingMetric = {
  label: string;
  percent: number;
  suffix?: string;
};

type Props = {
  percent: number;
  metrics: RingMetric[];
};

const SIZE = 178;
const CENTER = SIZE / 2;
const rings = [
  { radius: 78, width: 13, start: '#45247E', end: '#6842AE', track: '#E8E0F7' },
  { radius: 60, width: 12, start: '#7651BE', end: '#9574D6', track: '#EEE8FA' },
  { radius: 43, width: 11, start: '#A78BFA', end: '#BFAEF4', track: '#F1ECFB' },
  { radius: 27, width: 10, start: '#C7B7EE', end: '#DDD3F6', track: '#F4F0FB' },
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export default function Ringgraph({ percent, metrics }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const circleRefs = useRef<Array<Circle | null>>([]);
  const isFocused = useIsFocused();
  const visualMetrics = useMemo(
    () => rings.map((_, index) => metrics[index] ?? {
      label: index === 0 ? '전체' : '목표',
      percent,
      suffix: '완료',
    }),
    [metrics, percent]
  );
  const animationKey = visualMetrics.map((metric) => clamp(metric.percent)).join('-');

  useEffect(() => {
    const listenerId = progress.addListener(({ value }) => {
      visualMetrics.forEach((metric, index) => {
        const circumference = 2 * Math.PI * rings[index].radius;
        const progressLength = circumference * (clamp(metric.percent) / 100) * value;
        circleRefs.current[index]?.setNativeProps({
          strokeDashoffset: circumference - progressLength,
        });
      });
    });
    return () => progress.removeListener(listenerId);
  }, [progress, visualMetrics]);

  useEffect(() => {
    if (!isFocused) return;

    progress.stopAnimation();
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(120),
      Animated.timing(progress, {
        toValue: 1,
        duration: 1450,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
    ]);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [animationKey, isFocused, progress]);

  return (
    <View style={styles.wrap}>
      <View style={styles.graphArea}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Defs>
            {rings.map((ring, index) => (
              <LinearGradient
                key={`gradient-${index}`}
                id={`ring-gradient-${index}`}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                <Stop offset="0" stopColor={ring.start} />
                <Stop offset="1" stopColor={ring.end} />
              </LinearGradient>
            ))}
          </Defs>
          {rings.map((ring, index) => {
            const circumference = 2 * Math.PI * ring.radius;
            return (
              <React.Fragment key={`ring-${ring.radius}`}>
                <Circle
                  cx={CENTER}
                  cy={CENTER}
                  r={ring.radius}
                  fill="none"
                  stroke={ring.track}
                  strokeWidth={ring.width}
                />
                <Circle
                  ref={(node) => { circleRefs.current[index] = node; }}
                  cx={CENTER}
                  cy={CENTER}
                  r={ring.radius}
                  fill="none"
                  stroke={`url(#ring-gradient-${index})`}
                  strokeWidth={ring.width}
                  strokeLinecap="round"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={circumference}
                  rotation="-90"
                  origin={`${CENTER}, ${CENTER}`}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </View>

      <View style={styles.metricList}>
        {visualMetrics.map((metric, index) => (
          <View key={`${metric.label}-${index}`} style={styles.metricRow}>
            <View style={[styles.metricDot, { backgroundColor: rings[index].start }]} />
            <Text style={[styles.metricText, { color: rings[index].start }]} numberOfLines={1}>
              {metric.label} {clamp(metric.percent)}% {metric.suffix || '완료'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  graphArea: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricList: {
    flex: 1,
    marginLeft: 8,
    gap: 13,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },
  metricText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
});
