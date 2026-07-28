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
  open_recruitment_count?: number;
};

export type Recruitment = {
  recruitment_id: number;
  post_name: string;
  activity_name?: string;
  activity_type?: string;
  meeting_type?: string;
  required_members?: number;
  activity_period?: string;
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
