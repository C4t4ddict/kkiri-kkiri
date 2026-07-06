const express = require('express');

module.exports = ({ db }) => {
  const router = express.Router();

  // 회원가입 API
  router.post('/register', (req, res) => {
    const { email, password, name, department, student_number, birth } = req.body;
  
    // 필수값 확인
    if (!email || !password || !name) {
      return res.status(400).json({ message: '필수 항목이 누락되었습니다.' });
    }
  
    const sql = `INSERT INTO users (email, password, name, department, student_number, birth)
                 VALUES (?, ?, ?, ?, ?, ?)`;
  
    const values = [email, password, name, department, student_number, birth];
  
    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('회원가입 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
      return res.status(201).json({ message: '회원가입 성공' });
    });
  });
  
  // 로그인 API
  router.post('/login', (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ message: '이메일과 비밀번호를 입력해주세요.' });
    }
  
    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
    db.query(sql, [email, password], (err, results) => {
      if (err) {
        console.error('로그인 오류:', err);
        return res.status(500).json({ message: '서버 오류' });
      }
  
      if (results.length === 0) {
        return res.status(401).json({ message: '이메일 또는 비밀번호가 일치하지 않습니다.' });
      }
  
      const user = results[0];
      return res.status(200).json({
        message: '로그인 성공',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          department: user.department,
          studentId: user.student_number, // 데이터베이스 student_number를 studentId로 반환
          birth: user.birth,
        }
      });
    });
  });

  return router;
};
