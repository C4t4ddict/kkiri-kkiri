import type { Application } from '../../shared/types/domain';

export function getApplicationStatusLabel(application: Application) {
  return application.offer_status === 'PENDING'
    ? '합류 제안'
    : application.offer_status === 'ACCEPTED'
      ? '합류 완료'
      : application.offer_status === 'REJECTED'
        ? '제안 거절'
        : application.offer_status === 'CANCELED'
          ? '제안 취소'
    : application.application_status === 'APPROVED'
      ? '승인 완료'
      : application.application_status === 'REJECTED'
        ? '지원 반려'
        : application.application_status === 'CANCELED'
          ? '지원 취소'
          : '검토 중';
}

export function StatusPill({ application }: { application: Application }) {
  const label = getApplicationStatusLabel(application);
  return <span className={`status-pill ${application.application_status.toLowerCase()}`}>{label}</span>;
}
