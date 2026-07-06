const authRoutes = require('./authRoutes');
const activityRoutes = require('./activityRoutes');
const healthRoutes = require('./healthRoutes');
const uploadRoutes = require('./uploadRoutes');
const userRoutes = require('./userRoutes');
const reviewRoutes = require('./reviewRoutes');
const teamRecruitmentRoutes = require('./teamRecruitmentRoutes');
const todoRoutes = require('./todoRoutes');

function registerRoutes(app, dependencies) {
  app.use(authRoutes(dependencies));
  app.use(activityRoutes(dependencies));
  app.use(healthRoutes(dependencies));
  app.use(uploadRoutes(dependencies));
  app.use(userRoutes(dependencies));
  app.use(reviewRoutes(dependencies));
  app.use(teamRecruitmentRoutes(dependencies));
  app.use(todoRoutes(dependencies));
}

module.exports = registerRoutes;
