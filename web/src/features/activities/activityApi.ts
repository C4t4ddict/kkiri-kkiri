import { api } from '../../shared/api/client';
import type { ActivityItem } from '../../shared/types/domain';

type ActivityPage = {
  items: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export async function fetchAllActivities() {
  const activities: ActivityItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await api<ActivityPage>(`/api/activities?page=${page}&limit=${PAGE_SIZE}`);
    activities.push(...response.items);
    if (page >= response.pagination.totalPages) break;
  }
  return activities;
}
