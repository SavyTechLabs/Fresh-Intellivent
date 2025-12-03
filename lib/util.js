module.exports = {
  validatedRPM(value) {
    if (value < 800) return 800;
    if (value > 2400) return 2400;
    return value;
  },

  validatedDetection(value) {
    if (value < 0) return 0;
    if (value > 3) return 3;
    return parseInt(value, 10);
  },

  validatedMinutes(value) {
    if (value < 0) return 0;
    return parseInt(value, 10);
  }
};
