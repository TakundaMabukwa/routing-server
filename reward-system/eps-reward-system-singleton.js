const EPSRewardSystem = require('./eps-reward-system');

if (!global.__epsRewardSystemInstance) {
  global.__epsRewardSystemInstance = new EPSRewardSystem();
}

module.exports = global.__epsRewardSystemInstance;
