// src/types.ts
export interface User {
  id: number;
  user_id?: number;
  email: string;
  name: string;
  department?: string;
  studentId?: string;
  birth?: string;
  profile_picture?: string;
  authToken?: string;
  is_admin?: boolean;
  email_verified?: boolean;
  emailVerified?: boolean;
  account_type?: 'STUDENT' | 'GENERAL';
  accountType?: 'STUDENT' | 'GENERAL';
  school_domain?: string | null;
  schoolDomain?: string | null;
  school_name?: string | null;
  schoolName?: string | null;
  school_email?: string | null;
  schoolEmail?: string | null;
  school_email_verified?: boolean;
  schoolEmailVerified?: boolean;
  school_access_enabled?: boolean;
  schoolAccessEnabled?: boolean;
  school_verified_at?: string | null;
  friend_code?: string | null;
  friendCode?: string | null;
}

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  MainTabs: { screen?: string; params?: any };
  InfoDetail: { id: number };
  Settings: { user: User };
  PersonalInfo: undefined;
  FavoriteActivities: undefined;
  Evaluation: undefined;
  TeamFind: undefined;
  Notifications: undefined;
  MakeTeam: undefined;
  TeamMake: { user?: User; recruitmentId?: number };
  MatchingDetail: { id: number };
  MyRecruitments: undefined;
  MyApplications: undefined;
  Awards: undefined;
  DeveloperFeedback: undefined;
  SchoolEmailVerification: undefined;
  Friends: undefined;
  FriendAdd: undefined;
  MessageThread: { friendUserId: number; friendName: string };
  ApplicationDetail: { applicationId: number };
  ApplicationTemplates: undefined;
  MyPage2: { user: User };
  MyPage3: {
    user: User;
    selectedMember: {
      id: number;
      name: string;
      department: string;
      activity_id: number;
      activity_title: string;
    };
  };
  MyPage4: { user: User };

  // Activity 관련
  ActivityScreen: undefined;
  ActivitySettingScreen: { teamId?: number; isLeader?: boolean; teamName?: string };
  MyActivityScreen: undefined;
  MiniPortfolioScreen: { portfolioId: number };
  MiniPortfolioEditScreen: { portfolioId: number };
  AdminScreen: undefined;
  TodoScreen: { openActivityEdit?: boolean; teamId?: number } | undefined;
  TodoTeamScreen: { teamId: number };
};
