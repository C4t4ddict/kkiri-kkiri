import { User } from '../types';

export const hasSchoolAccess = (user?: User | null) => Boolean(
  user?.schoolAccessEnabled
  ?? user?.school_access_enabled
  ?? ((user?.schoolEmailVerified ?? user?.school_email_verified) && (user?.schoolDomain ?? user?.school_domain)),
);
