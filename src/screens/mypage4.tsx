import React, { useState, useEffect, JSX } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  ScrollView, 
  Image
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

interface EvaluationData {
  review_low: number;
  review_medium: number;
  review_high: number;
}

interface ActivityItem {
  id: number;
  title: string;
  comment: string;
}

interface User {
  user_id: number;
  email: string;
  name: string;
  department?: string;
  student_number?: string;
  birth_date?: string;
  profile_picture?: string;
}

// 네비게이션 타입 정의
type RootStackParamList = {
  MyPage4: { user: User };
  MainTabs: { screen?: string };
};

type MyPage4NavigationProp = StackNavigationProp<RootStackParamList, 'MyPage4'>;
type MyPage4RouteProp = RouteProp<RootStackParamList, 'MyPage4'>;

const MyPage4: React.FC = () => {
  const navigation = useNavigation<MyPage4NavigationProp>();
  const route = useRoute<MyPage4RouteProp>();
  const { user } = route.params;

  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationData>({
    review_low: 0,
    review_medium: 0,
    review_high: 0
  });
  
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // API에서 사용자의 평가 데이터 가져오기
  const fetchUserEvaluations = async (): Promise<void> => {
    try {
      console.log(`=== 평가 데이터 요청 시작 ===`);
      console.log(`요청 URL: http://10.0.2.2:3000/api/user/${user.user_id}/evaluations`);
      
      const response = await fetch(`http://10.0.2.2:3000/api/user/${user.user_id}/evaluations`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      console.log('=== 서버 응답 ===');
      console.log('전체 응답:', JSON.stringify(data, null, 2));
      
      if (data.success && data.evaluations) {
        const evaluations = {
          review_low: parseInt(data.evaluations.review_low) || 0,
          review_medium: parseInt(data.evaluations.review_medium) || 0,
          review_high: parseInt(data.evaluations.review_high) || 0
        };
        
        console.log('=== 설정할 평가 데이터 ===');
        console.log('별로예요 (review_low):', evaluations.review_low);
        console.log('좋아요 (review_medium):', evaluations.review_medium);
        console.log('최고예요 (review_high):', evaluations.review_high);
        console.log('총 평가 개수:', evaluations.review_low + evaluations.review_medium + evaluations.review_high);
        
        setEvaluationSummary(evaluations);
        
        if (data.debug) {
          console.log('디버그 정보:', data.debug);
        }
      } else {
        console.log('⚠ 응답 구조가 예상과 다름:', data);
      }
    } catch (error) {
      console.error('⚠ 평가 데이터 가져오기 오류:', error);
      // 오류 발생 시 기본값 유지
    }
  };

  // API에서 사용자의 활동 이력 가져오기
  const fetchUserActivities = async (): Promise<void> => {
    try {
      console.log(`활동 이력 요청: 사용자 ID ${user.user_id}`);
      const response = await fetch(`http://10.0.2.2:3000/api/user/${user.user_id}/activities`);
      const data = await response.json();
      
      console.log('활동 이력 응답:', data);
      
      if (data.success && data.activities) {
        setActivities(data.activities || []);
        console.log('설정된 활동 목록:', data.activities);
      }
    } catch (error) {
      console.error('활동 이력 가져오기 오류:', error);
      // 오류 발생 시 빈 배열 유지
    }
  };

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      setIsLoading(true);
      await Promise.all([fetchUserEvaluations(), fetchUserActivities()]);
      setIsLoading(false);
    };
    
    loadData();
  }, [user.user_id]);

  const renderEvaluationIcon = (type: 'review_low' | 'review_medium' | 'review_high'): JSX.Element => {
    const icons = {
      review_low: <Image source={require('../assets/face-frown.png')}/>,
      review_medium: <Image source={require('../assets/face-smile.png')}/>,
      review_high: <Image source={require('../assets/face-happy.png')}/>
    };
    
    const labels = {
      review_low: '별로예요',
      review_medium: '좋아요!',
      review_high: '최고예요'
    };

    const counts = {
      review_low: evaluationSummary.review_low,
      review_medium: evaluationSummary.review_medium,
      review_high: evaluationSummary.review_high
    };

    return (
      <View style={styles.evaluationItem}>
        <Text style={styles.evaluationIcon}>{icons[type]}</Text>
        <Text style={styles.evaluationLabel}>{labels[type]}</Text>
        <Text style={styles.evaluationCount}>{counts[type]}개</Text>
      </View>
    );
  };

  const renderActivityItem = (item: ActivityItem): JSX.Element => (
    <View key={item.id} style={styles.activityItem}>
      <Text style={styles.activityTitle}>{item.title}</Text>
      <Text style={styles.activityComment}>
        {item.comment && item.comment !== '아직 평가가 없습니다.' 
          ? item.comment 
          : '아직 받은 평가 코멘트가 없습니다.'
        }
      </Text>
    </View>
  );

  // 로딩 화면
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>나의 평가</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>평가 정보를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>나의 평가</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Evaluation Summary */}
        <View style={styles.evaluationSummary}>
          {renderEvaluationIcon('review_low')}
          {renderEvaluationIcon('review_medium')}
          {renderEvaluationIcon('review_high')}
        </View>

        {/* Activities List */}
        <View style={styles.activitiesList}>
          {activities.length > 0 ? (
            activities.map(renderActivityItem)
          ) : (
            <View style={styles.noActivitiesContainer}>
              <Text style={styles.noActivitiesText}>참여한 활동이나 받은 평가가 없습니다.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 100, // 네비게이션 공간 확보
  },
  evaluationSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 24,
  },
  evaluationItem: {
    alignItems: 'center',
  },
  evaluationIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  evaluationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  evaluationCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  activitiesList: {
    gap: 16,
  },
  activityItem: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textDecorationLine: 'underline',
  },
  activityComment: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  noActivitiesContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noActivitiesText: {
    fontSize: 16,
    color: '#999',
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
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
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
});

export default MyPage4;