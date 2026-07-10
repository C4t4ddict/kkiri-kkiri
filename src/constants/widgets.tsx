// 레지스트리 + 위젯 컴포넌트
import React from 'react';
import IssueTracker from '../Widget/IssueTracker';
import NoticeBoard from '../Widget/NoticeBoard';
import Heatmap from '../Widget/Heatmap';

export type WidgetId = 'issue' | 'notice' | 'calendar' | 'heatmap';
export type WidgetPref = { id: WidgetId; visible: boolean; order: number };
export type WidgetComponentProps = { teamId?: number | null };

export const DEFAULT_WIDGET_PREFS: WidgetPref[] = [
  { id: 'issue', visible: true, order: 10 },
  { id: 'notice', visible: true, order: 20 },
  { id: 'calendar', visible: false, order: 30 },
  { id: 'heatmap', visible: true, order: 40 },
];

const HiddenWidget: React.FC<WidgetComponentProps> = () => null;

// 레지스트리: 이제 각 위젯이 teamId prop을 받을 수 있게 타입 지정
export const WIDGET_COMPONENTS: Record<WidgetId, React.FC<WidgetComponentProps>> = {
  issue: IssueTracker,
  notice: NoticeBoard,
  calendar: HiddenWidget,
  heatmap: Heatmap,
};
