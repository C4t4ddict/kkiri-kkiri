CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 1,
  account_type VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
  school_domain VARCHAR(255) NULL,
  school_name VARCHAR(255) NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  department VARCHAR(120) NULL,
  student_number VARCHAR(50) NULL,
  birth DATE NULL,
  profile_picture VARCHAR(1000) NULL,
  self_intro TEXT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activitys (
  activity_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  target_audience VARCHAR(500) NULL,
  organizer VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  operation_period_start DATE NULL,
  operation_period_end DATE NULL,
  application_period_start DATETIME NULL,
  application_period_end DATETIME NULL,
  points VARCHAR(255) NULL,
  prize_details TEXT NULL,
  contact VARCHAR(500) NULL,
  details LONGTEXT NULL,
  category VARCHAR(100) NULL,
  topic_category VARCHAR(100) NULL,
  main_image_url VARCHAR(1000) NULL,
  source_name VARCHAR(50) NULL,
  source_item_id VARCHAR(100) NULL,
  source_url VARCHAR(1000) NULL,
  official_url VARCHAR(1000) NULL,
  source_categories TEXT NULL,
  last_crawled_at DATETIME NULL,
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activity_source (source_name, source_item_id),
  INDEX idx_activitys_hidden_updated (is_hidden, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_view_events (
  activity_id INT NOT NULL,
  user_id INT NOT NULL,
  view_date DATE NOT NULL,
  view_count INT NOT NULL DEFAULT 1,
  first_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (activity_id, user_id, view_date),
  INDEX idx_activity_views_recent (view_date, activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_recruitments (
  recruitment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT NOT NULL,
  team_id INT NULL,
  activity_id INT NULL,
  curriculum_id INT NULL,
  post_name VARCHAR(255) NOT NULL,
  activity_name VARCHAR(255) NULL,
  activity_type VARCHAR(100) NULL,
  qualification_department VARCHAR(255) NULL,
  qualification_student_number VARCHAR(100) NULL,
  qualification_age VARCHAR(100) NULL,
  required_members INT NOT NULL DEFAULT 2,
  activity_start_date DATE NULL,
  activity_end_date DATE NULL,
  activity_period VARCHAR(100) NULL,
  meeting_type VARCHAR(30) NULL,
  recruitment_scope VARCHAR(20) NOT NULL DEFAULT 'NATIONWIDE',
  school_domain VARCHAR(255) NULL,
  memo TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_recruitments_activity_status (activity_id, status),
  INDEX idx_team_recruitments_curriculum_status (curriculum_id, status),
  INDEX idx_team_recruitments_owner_deleted (owner_user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teams (
  team_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recruitment_id INT NULL,
  team_name VARCHAR(255) NOT NULL,
  leader_user_id INT NOT NULL,
  required_members INT NOT NULL DEFAULT 2,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  due_date DATE NULL,
  activity_status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  source_type VARCHAR(32) NOT NULL DEFAULT 'COMPETITION',
  source_id INT NULL,
  source_version_id INT NULL,
  participation_mode VARCHAR(16) NOT NULL DEFAULT 'TEAM',
  visibility VARCHAR(16) NOT NULL DEFAULT 'CLOSED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teams_source (source_type, source_id, activity_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
  part VARCHAR(120) NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  INDEX idx_team_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS applications (
  application_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recruitment_id INT NOT NULL,
  applicant_id INT NOT NULL,
  template_id INT NULL,
  memo TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_applications_recruitment_applicant (recruitment_id, applicant_id),
  INDEX idx_applications_applicant_created (applicant_id, created_at),
  INDEX idx_applications_recruitment_status (recruitment_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todos (
  todo_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  assigned_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '미진행',
  scope_type VARCHAR(20) NOT NULL DEFAULT '전체',
  scope_start_date DATE NOT NULL,
  scope_end_date DATE NOT NULL,
  completed_at DATETIME NULL,
  range_group_id VARCHAR(36) NULL,
  range_start_date DATE NULL,
  range_end_date DATE NULL,
  range_color VARCHAR(7) NULL,
  curriculum_enrollment_id INT NULL,
  curriculum_node_id INT NULL,
  source_stable_key VARCHAR(120) NULL,
  assignment_mode VARCHAR(24) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_todos_team_assignee (team_id, assigned_user_id),
  INDEX idx_todos_calendar_range (team_id, assigned_user_id, scope_start_date, scope_end_date),
  INDEX idx_todos_curriculum_member (curriculum_enrollment_id, assigned_user_id, curriculum_node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reviews (
  review_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  related_team_id INT NOT NULL,
  review_high INT NOT NULL DEFAULT 0,
  review_medium INT NOT NULL DEFAULT 0,
  review_low INT NOT NULL DEFAULT 0,
  comment TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reviews_participants_team (reviewer_id, reviewee_id, related_team_id),
  INDEX idx_reviews_reviewee_created (reviewee_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_favorite_activities (
  user_id INT NOT NULL,
  activity_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, activity_id),
  INDEX idx_favorite_activities_user_created (user_id, created_at),
  INDEX idx_favorite_activities_activity (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_notices (
  notice_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  author_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_notices_team_created (team_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notice_comments (
  comment_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notice_id INT NOT NULL,
  author_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notice_comments_notice_created (notice_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_issues (
  issue_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  reporter_id INT NOT NULL,
  assignee_id INT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  due_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_issues_team_status (team_id, status, updated_at),
  INDEX idx_team_issues_assignee (assignee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_notifications (
  notification_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  team_id INT NULL,
  notice_id INT NULL,
  offer_id INT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(160) NOT NULL,
  content VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_notifications_user_created (user_id, created_at),
  INDEX idx_user_notifications_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_friendships (
  friendship_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_low_id INT NOT NULL,
  user_high_id INT NOT NULL,
  requester_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_friendships_pair (user_low_id, user_high_id),
  INDEX idx_user_friendships_low_status (user_low_id, status),
  INDEX idx_user_friendships_high_status (user_high_id, status),
  INDEX idx_user_friendships_requester_status (requester_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS direct_messages (
  message_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  content TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_direct_messages_conversation (sender_id, recipient_id, created_at),
  INDEX idx_direct_messages_recipient_read (recipient_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_templates (
  template_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_application_templates_user_updated (user_id, updated_at),
  INDEX idx_application_templates_user_default (user_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_status_events (
  event_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  status VARCHAR(24) NOT NULL,
  actor_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_application_events_application_created (application_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_activity_participations (
  participation_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  team_id INT NOT NULL,
  participated_at VARCHAR(50) NULL,
  participated_with JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_participation_user_team (user_id, team_id),
  INDEX idx_participations_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
