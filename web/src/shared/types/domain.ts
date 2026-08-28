export type User = {
  id: number;
  email: string;
  name: string;
  department?: string;
  studentId?: string;
  profile_picture?: string;
  is_admin?: boolean;
};

export type ActivityItem = {
  activity_id: number;
  title: string;
  category?: string;
  topic_category?: string;
  organizer?: string;
  main_image_url?: string;
  application_period_end?: string;
  application_period_start?: string;
  operation_period_start?: string;
  operation_period_end?: string;
  details?: string;
  target_audience?: string;
  location?: string;
  contact?: string;
  prize_summary?: string;
  prize_details?: string;
  official_url?: string;
  source_url?: string;
  open_recruitment_count?: number;
};

export type CurriculumNode = {
  node_id: number;
  stable_key: string;
  parent_node_id?: number | null;
  level: 'MONTHLY' | 'WEEKLY' | 'DAILY';
  title: string;
  description?: string;
  relative_start_day: number;
  relative_end_day: number;
  estimated_minutes: number;
  is_required: boolean;
  assignment_mode: 'ALL_MEMBERS' | 'ASSIGNED_MEMBERS' | 'TEAM_ONCE';
};

export type Curriculum = {
  curriculum_id: number;
  organization_id: number;
  organization_name: string;
  organization_logo_url?: string;
  organization_website_url?: string;
  brand_color?: string;
  is_verified?: boolean;
  title: string;
  slug: string;
  role_title?: string;
  summary: string;
  description?: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration_weeks: number;
  weekly_hours: number;
  cover_image_url?: string;
  version_id?: number;
  version_number?: number;
  goal_count: number;
  participant_count: number;
  nodes?: CurriculumNode[];
};

export type CurriculumPlan = {
  start_date: string;
  end_date: string;
  available_weekdays: number[];
  total_minutes: number;
  total_hours: number;
  level_counts: { 월간: number; 주간: number; 일일: number };
  goals: Array<{
    curriculum_node_id: number;
    stable_key: string;
    title: string;
    description?: string;
    scope_type: '월간' | '주간' | '일일';
    scope_start_date: string;
    scope_end_date: string;
    estimated_minutes: number;
  }>;
};

export type TeamSummary = {
  team_id: number;
  team_name: string;
  part?: string;
  role?: string;
  due_date?: string;
  activity_status?: string;
  source_type?: 'COMPETITION' | 'ENTERPRISE_CURRICULUM' | 'USER_CREATED';
  source_id?: number;
  source_version_id?: number;
  participation_mode?: 'PERSONAL' | 'TEAM';
  visibility?: 'PRIVATE' | 'RECRUITING' | 'CLOSED';
};

export type Todo = {
  todo_id: number;
  title: string;
  status: '미진행' | '진행중' | '완료';
  scope_type: '월간' | '주간' | '일일';
  scope_start_date: string;
  scope_end_date: string;
  curriculum_node_id?: number;
  assignment_mode?: 'ALL_MEMBERS' | 'ASSIGNED_MEMBERS' | 'TEAM_ONCE';
};

export type TeamNotice = {
  notice_id: number;
  title: string;
  content: string;
  author_name?: string;
  created_at: string;
};

export type Recruitment = {
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  activity_type?: string;
  meeting_type?: string;
  required_members?: number;
  activity_period?: string;
  curriculum_id?: number;
  activity_organizer?: string;
};

export type Application = {
  application_id: number;
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  application_status: string;
  offer_status?: string | null;
};

export type ApplicationTimelineStep = {
  key: string;
  label: string;
  state: 'completed' | 'current' | 'upcoming' | 'skipped';
  occurred_at?: string | null;
};

export type ApplicationDetail = Application & {
  memo: string;
  offer_id?: number | null;
  timeline: ApplicationTimelineStep[];
};

export type ApplicationTemplate = {
  template_id: number;
  title: string;
  content: string;
  is_default: number | boolean;
};
