// 레지스트리 + 위젯 컴포넌트
import React from 'react';
import IssueTracker from '../Widget/IssueTracker';
import NoticeBoard from '../Widget/NoticeBoard';
import Heatmap from '../Widget/Heatmap';
import ActivityCalendar from '../Widget/ActivityCalendar';
import LearningRoadmap from '../Widget/LearningRoadmap';

export type WidgetId = 'ring' | 'roadmap' | 'issue' | 'notice' | 'calendar' | 'heatmap';
export type WidgetPref = { id: WidgetId; visible: boolean; order: number };
export type WidgetComponentProps = { teamId?: number | null; refreshKey?: number };

export const DEFAULT_WIDGET_PREFS: WidgetPref[] = [
  { id: 'ring', visible: true, order: 10 },
  { id: 'roadmap', visible: true, order: 15 },
  { id: 'issue', visible: true, order: 20 },
  { id: 'notice', visible: true, order: 30 },
  { id: 'calendar', visible: true, order: 40 },
  { id: 'heatmap', visible: true, order: 50 },
];

// 레지스트리: 이제 각 위젯이 teamId prop을 받을 수 있게 타입 지정
export const WIDGET_COMPONENTS: Partial<Record<WidgetId, React.FC<WidgetComponentProps>>> = {
  roadmap: LearningRoadmap,
  issue: IssueTracker,
  notice: NoticeBoard,
  calendar: ActivityCalendar,
  heatmap: Heatmap,
};
