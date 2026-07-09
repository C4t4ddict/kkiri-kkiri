import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ScrollView } from 'react-native';

interface User {
  user_id: number;
  email: string;
  name: string;
  department?: string;
  student_number?: string;
  birth_date?: string;
  profile_picture?: string;
}

interface MyPage2Props {
  user: User;
  onBack: () => void;
  onNavigateToEvaluation?: (selectedMember: any) => void; // 평가 페이지로 이동하는 함수
}

interface TeamMember {
  id: number;
  name: string;
  department: string;
  selected?: boolean;
}

interface TeamGroup {
  id: number;
  title: string;
  members: TeamMember[];
}

interface ActivityParticipation {
  participation_id: number;
  activity_id: number;
  activity_title?: string;
  participated_with: number[];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#000',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  scrollContent: {
    flex: 1,
    paddingBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 32,
  },
  groupContainer: {
    marginBottom: 32,
  },
  groupTitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 12,
    fontWeight: '500',
  },
  memberButton: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedMemberButton: {
    backgroundColor: '#e8d5ff',
    borderColor: '#7c4dff',
  },
  memberText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  selectedMemberText: {
    color: '#7c4dff',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#7c4dff',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    position: 'absolute',
    bottom: 80, // 하단 네비게이션 위에 고정
    left: 0,
    right: 0,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 20,
    color: '#666',
    marginBottom: 2,
  },
  navText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
  debugContainer: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    margin: 10,
    borderRadius: 5,
    maxHeight: 200,
  },
  debugText: {
    fontSize: 10,
    color: '#666',
    lineHeight: 14,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 15,
    margin: 10,
    borderRadius: 5,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    fontWeight: '500',
  },
});

const MyPage2: React.FC<MyPage2Props> = ({ user, onBack, onNavigateToEvaluation }) => {
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [error, setError] = useState<string>('');

  // API에서 사용자의 활동 참여 정보 가져오기
  const fetchUserActivities = async () => {
    try {
      setIsLoading(true);
      setError('');
      setDebugInfo(`사용자 ID: ${user.user_id}로 활동 정보 조회 시작`);
      
      // 1. 사용자의 참여 정보 가져오기
      const participationResponse = await fetch(`http://10.0.2.2:3000/api/participations/user/${user.user_id}`);
      
      if (!participationResponse.ok) {
        throw new Error(`참여 정보 조회 실패: ${participationResponse.status}`);
      }
      
      const participationData = await participationResponse.json();
      
      setDebugInfo(prev => prev + `\n참여 정보 조회 성공: ${participationData.participations?.length || 0}개 활동`);
      
      if (!participationData.success || !participationData.participations || participationData.participations.length === 0) {
        setDebugInfo(prev => prev + '\n참여한 활동이 없습니다.');
        setTeamGroups([]);
        return;
      }

      const groups: TeamGroup[] = [];
      const addedActivities = new Set<number>(); // 중복 방지용

      // 2. 각 참여 활동에 대해 처리
      for (const participation of participationData.participations) {
        try {
          // 이미 추가된 활동인지 확인
          if (addedActivities.has(participation.activity_id)) {
            setDebugInfo(prev => prev + `\n활동 ${participation.activity_id} 이미 처리됨, 건너뜀`);
            continue;
          }

          setDebugInfo(prev => prev + `\n활동 ${participation.activity_id} 처리 중...`);
          
          // 활동 정보 가져오기
          const activityResponse = await fetch(`http://10.0.2.2:3000/api/activities/${participation.activity_id}`);
          
          if (!activityResponse.ok) {
            setDebugInfo(prev => prev + `\n활동 ${participation.activity_id} 정보 조회 실패`);
            continue;
          }
          
          const activityData = await activityResponse.json();
          const activityTitle = activityData.success && activityData.activity ? 
            activityData.activity.title : `활동 ${participation.activity_id}`;
          
          // participated_with에서 본인 제외
          let participatedWith: number[] = [];
          
          try {
            if (Array.isArray(participation.participated_with)) {
              participatedWith = participation.participated_with;
            } else if (typeof participation.participated_with === 'string') {
              participatedWith = JSON.parse(participation.participated_with);
            } else {
              setDebugInfo(prev => prev + `\n활동 ${participation.activity_id}: participated_with 형식 오류`);
              continue;
            }
          } catch (parseError) {
            setDebugInfo(prev => prev + `\n활동 ${participation.activity_id}: JSON 파싱 오류`);
            continue;
          }
          
          // 본인 ID를 숫자로 변환하여 제외
          const memberIds = participatedWith.filter(id => Number(id) !== Number(user.user_id));
          
          setDebugInfo(prev => prev + `\n활동 ${participation.activity_id}: 팀원 ${memberIds.length}명 발견`);
          
          if (memberIds.length > 0) {
            // 멤버 정보 가져오기
            const membersResponse = await fetch(`http://10.0.2.2:3000/api/users/batch`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ user_ids: memberIds }),
            });
            
            if (!membersResponse.ok) {
              setDebugInfo(prev => prev + `\n활동 ${participation.activity_id}: 멤버 정보 조회 실패`);
              continue;
            }
            
            const membersData = await membersResponse.json();
            
            if (membersData.success && membersData.users && Array.isArray(membersData.users)) {
              const members = membersData.users.map((member: User) => ({
                id: member.user_id,
                name: member.name || '이름 없음',
                department: member.department || '소속 미정',
                selected: false
              }));
              
              if (members.length > 0) {
                groups.push({
                  id: participation.activity_id,
                  title: activityTitle,
                  members: members
                });
                
                addedActivities.add(participation.activity_id); // 추가된 활동 기록
                setDebugInfo(prev => prev + `\n활동 "${activityTitle}": ${members.length}명 추가`);
              }
            } else {
              setDebugInfo(prev => prev + `\n활동 ${participation.activity_id}: 멤버 데이터 형식 오류`);
            }
          }
        } catch (activityError) {
          console.error(`활동 ${participation.activity_id} 처리 중 오류:`, activityError);
          setDebugInfo(prev => prev + `\n활동 ${participation.activity_id} 오류: ${activityError instanceof Error ? activityError.message : '알 수 없는 오류'}`);
        }
      }
      
      setTeamGroups(groups);
      setDebugInfo(prev => prev + `\n최종 결과: ${groups.length}개 활동, ${groups.reduce((sum, g) => sum + g.members.length, 0)}명 팀원`);
      
    } catch (error) {
      console.error('활동 정보 가져오기 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다';
      setError(errorMessage);
      setDebugInfo(prev => prev + `\n전체 오류: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.user_id) {
      fetchUserActivities();
    } else {
      setError('사용자 정보가 올바르지 않습니다');
      setIsLoading(false);
    }
  }, [user.user_id]);

  const handleMemberSelect = (groupId: number, memberId: number) => {
    setTeamGroups(prevGroups => 
      prevGroups.map(group => 
        group.id === groupId 
          ? {
              ...group,
              members: group.members.map(member => 
                member.id === memberId 
                  ? { ...member, selected: !member.selected }
                  : { ...member, selected: false } // 같은 그룹 내에서는 하나만 선택
              )
            }
          : {
              ...group,
              members: group.members.map(member => ({ ...member, selected: false })) // 다른 그룹은 모두 해제
            }
      )
    );
  };

  const handleConfirm = () => {
    console.log('handleConfirm 함수 호출됨');
    console.log('onNavigateToEvaluation 함수 존재 여부:', !!onNavigateToEvaluation);
    
    const selectedMembers = teamGroups.flatMap(group => 
      group.members.filter(member => member.selected).map(member => ({
        ...member,
        activity_id: group.id,
        activity_title: group.title
      }))
    );
    
    console.log('선택된 멤버들:', selectedMembers);
    
    if (selectedMembers.length > 0) {
      const selectedMember = selectedMembers[0];
      console.log('최종 선택된 멤버:', selectedMember);
      
      if (onNavigateToEvaluation) {
        console.log('MyPage3로 이동 시도 중...');
        // ✅ 이 부분이 MyPage3로 이동하는 핵심 코드
        onNavigateToEvaluation(selectedMember);
      } else {
        console.log('onNavigateToEvaluation 함수가 없음 - 기본 알림 표시');
        // ❌ 이 부분은 함수가 전달되지 않았을 때만 실행됨
        Alert.alert(
          '평가 확인', 
          `${selectedMember.name}님 (${selectedMember.department})을 평가하시겠습니까?`,
          [
            { text: '취소', style: 'cancel' },
            { text: '확인', onPress: () => {
              console.log('평가 페이지로 이동:', selectedMember);
            }}
          ]
        );
      }
    } else {
      console.log('선택된 멤버가 없음');
      Alert.alert('알림', '평가할 팀원을 선택해주세요.');
    }
  };

  const handleRetry = () => {
    fetchUserActivities();
  };

  const renderTeamGroup = (group: TeamGroup) => (
    <View key={group.id} style={styles.groupContainer}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      
      {group.members.map((member) => (
        <TouchableOpacity
          key={member.id}
          style={[
            styles.memberButton,
            member.selected && styles.selectedMemberButton
          ]}
          onPress={() => handleMemberSelect(group.id, member.id)}
        >
          <Text style={[
            styles.memberText,
            member.selected && styles.selectedMemberText
          ]}>
            {member.department} {member.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>팀원평가</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>활동 정보를 불러오는 중...</Text>
        </View>
        {debugInfo ? (
          <View style={styles.debugContainer}>
            <Text style={styles.debugText}>{debugInfo}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>팀원평가</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>평가하실 팀원을 선택해 주세요</Text>
        
        {/* 에러 메시지 표시 */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={handleRetry} style={{ marginTop: 10 }}>
              <Text style={[styles.errorText, { textDecorationLine: 'underline' }]}>
                다시 시도
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        
        <ScrollView 
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }} // 확인 버튼 공간 확보
        >
          {teamGroups.length > 0 ? (
            teamGroups.map(renderTeamGroup)
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {error ? '오류가 발생했습니다' : '참여한 활동이 없거나 평가할 팀원이 없습니다.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* 확인 버튼 - 고정 위치 */}
      {teamGroups.length > 0 && (
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <Text style={styles.confirmButtonText}>확인</Text>
        </TouchableOpacity>
      )}

      {/* Bottom Navigation - 고정 위치 */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={styles.navText}>홈</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>📄</Text>
          <Text style={styles.navText}>정보</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>✏️</Text>
          <Text style={styles.navText}>활동</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navIcon}>📦</Text>
          <Text style={styles.navText}>매칭</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={[styles.navIcon, { color: '#7c4dff' }]}>👤</Text>
          <Text style={[styles.navText, { color: '#7c4dff' }]}>마이페이지</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default MyPage2;